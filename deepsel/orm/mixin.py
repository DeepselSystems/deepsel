import codecs
import csv
import enum
import json
import logging
import traceback
import os
from datetime import UTC, datetime
from io import StringIO, BytesIO
from typing import Any, Optional

from dateutil.parser import parse as parse_date
from fastapi import File, HTTPException, status, UploadFile
from pydantic import BaseModel as PydanticModel
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    Integer,
    String,
    and_,
    false,
    inspect,
    or_,
    func,
    UUID,
    PickleType,
    LargeBinary,
    MetaData,
    Table,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.orm import Query, Session, RelationshipProperty

from deepsel.orm.types import (
    RelationshipRecordCollection,
    Operator,
    SearchCriteria,
    SearchQuery,
    OrderDirection,
    OrderByCriteria,
    PermissionScope,
    PermissionAction,
    DeleteResponse,
    BulkDeleteResponse,
    PAGINATION,
)
from deepsel.utils.check_delete_cascade import (
    AffectedRecordResult,
    get_delete_cascade_records_recursively,
)
from deepsel.utils.get_field_info import FieldInfo
from deepsel.utils.get_relationships import (
    get_one2many_parent_id,
    get_relationships,
)
from deepsel.utils.models_pool import models_pool

logger = logging.getLogger(__name__)


def _get_relationships_class_map(model) -> dict:
    """Get a map of relationship name -> related model class."""
    relationships = {}
    for relationship in model.__mapper__.relationships:
        relationships[relationship.key] = relationship.mapper.class_
    return relationships


def _check_m2m_permission(
    user,
    relationship,
    linked_records: list,
    action: "PermissionAction",
    parent_instance=None,
) -> None:
    """
    Gate many-to-many attach/detach by checking the secondary (join) table's
    permission. Skips the check when the join table has no ORM model registered
    in models_pool (preserves prior behavior for raw `secondary` Tables).

    Scope semantics:
      - `*`: allow.
      - `org`: if the M2M target is `organization`, each linked org id must be
        in the user's org list. Else if the parent record carries
        `organization_id`, that must be in the user's org list. Else (neither
        side carries org context, e.g. user_role) the check is permissive.
      - `own`: each linked record must reference the actor (user.id).
      - `none` / any other scope: deny.
    """
    secondary_table = getattr(relationship, "secondary", None)
    if not secondary_table:
        return
    JoinModel = models_pool.get(secondary_table)
    if JoinModel is None or not hasattr(JoinModel, "_check_has_permission"):
        return

    [allowed, scope] = JoinModel._check_has_permission(action, user)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"You do not have permission to {action.value} "
                f"{secondary_table} records"
            ),
        )

    if scope == PermissionScope.all:
        return

    if scope not in (PermissionScope.org, PermissionScope.own):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"You do not have permission to {action.value} "
                f"{secondary_table} records"
            ),
        )

    user_org_ids = user.get_org_ids()

    if scope == PermissionScope.org:
        if relationship.table_name == "organization":
            for record in linked_records:
                target_id = record.get("id")
                if target_id not in user_org_ids:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=(
                            f"You do not have permission to link "
                            f"organization {target_id}"
                        ),
                    )
            return
        if parent_instance is not None and hasattr(parent_instance, "organization_id"):
            parent_org_id = getattr(parent_instance, "organization_id", None)
            if parent_org_id is not None and parent_org_id not in user_org_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        f"You do not have permission to modify "
                        f"{secondary_table} for organization {parent_org_id}"
                    ),
                )
            return
        return

    if scope == PermissionScope.own:
        for record in linked_records:
            if record.get("id") != getattr(user, "id", None):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        f"You can only link your own {relationship.table_name} "
                        f"records"
                    ),
                )
        return


class ORMBaseMixin(object):
    __mapper__ = None

    @declared_attr
    def __tablename__(cls):
        return cls.__name__.lower()

    created_at = Column(DateTime, default=lambda x: datetime.now(UTC))
    updated_at = Column(
        DateTime,
        default=lambda x: datetime.now(UTC),
        onupdate=lambda x: datetime.now(UTC),
    )
    string_id = Column(String, unique=True)
    system = Column(Boolean, default=False)
    active = Column(Boolean, default=True)

    def __repr__(self):
        identifier = None
        for key in ["name", "display_name", "title", "username", "email", "string_id"]:
            if hasattr(self, key) and getattr(self, key) is not None:
                identifier = getattr(self, key, None)
                break

        cls_name = self.__class__.__name__.replace("Model", "")

        return f"<{cls_name}{': ' + identifier if identifier else ''} {' (id ' + str(self.id) + ')' if hasattr(self, 'id') else ''}>"

    def __str__(self):
        return self.__repr__()

    def to_dict(self):
        return {c.key: getattr(self, c.key) for c in inspect(self).mapper.column_attrs}

    # =========================================================================
    # Hook methods — override in subclasses for app-specific behavior
    # =========================================================================

    @classmethod
    def _resolve_organization_on_create(cls, db: Session, user, values: dict) -> dict:
        """Resolve organization_id on create. Override for custom role/table logic.

        Reads `user.current_organization_id` (populated by the consumer's
        get_current_user dependency from the X-Organization-Id header).
        Raises 400 if no explicit value is provided and the header was absent.
        """
        if hasattr(cls, "organization_id"):
            if not values.get("organization_id"):
                current_org_id = getattr(user, "current_organization_id", None)
                if current_org_id is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            "X-Organization-Id header required to create "
                            f"{cls.__tablename__}"
                        ),
                    )
                values["organization_id"] = current_org_id
        return values

    @classmethod
    def _check_model_write_permission(cls, instance, user) -> None:
        """Additional write/delete permission check. Override for model-specific logic."""
        pass

    @classmethod
    def create(
        cls,
        db: Session,
        user,
        values: dict,
        commit: Optional[bool] = True,
        bypass_permission: Optional[bool] = False,
        *args,
        **kwargs,
    ) -> "[ORMBaseMixin]":
        model = models_pool[cls.__tablename__]
        [allowed, scope] = model._check_has_permission(PermissionAction.create, user)
        if not bypass_permission and not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have permission to create this resource type: {model.__tablename__}",
            )

        # if model has owner_id, only allow users to assign ownership to themselves
        if hasattr(model, "owner_id"):
            values["owner_id"] = user.id

        # delegate organization resolution to hook
        values = cls._resolve_organization_on_create(db, user, values)

        # for every value in the format of <table_name>/<string_id>, get the record instance
        for key, value in values.items():
            if isinstance(value, str) and value.count("/") == 1:
                table_name, string_id = value.split("/")
                RelatedModel = models_pool.get(table_name)
                if RelatedModel:
                    record = (
                        db.query(RelatedModel).filter_by(string_id=string_id).first()
                    )
                    if record:
                        values[key] = record.id
                    else:
                        logger.error(f"Error finding record with string_id: {value}")

        relationships = get_relationships(model)
        relationship_classes = _get_relationships_class_map(model)
        m2m_by_name = {r.name: r for r in relationships.many2many}

        many2many_records_to_link: list[RelationshipRecordCollection] = []
        one2many_records_to_create: list[RelationshipRecordCollection] = []

        # pop many2many relationship lists from values
        for relationship in relationships.many2many:
            if relationship.name in values:
                linked_records = values.pop(relationship.name)
                if linked_records:
                    many2many_records_to_link.append(
                        RelationshipRecordCollection(
                            relationship_name=relationship.name,
                            linked_records=linked_records,
                            linked_model_class=relationship_classes[relationship.name],
                        )
                    )

        # set attr for one2many relationships
        for relationship in relationships.one2many:
            if relationship.name in values:
                linked_records = values.pop(relationship.name)
                if linked_records:
                    one2many_records_to_create.append(
                        RelationshipRecordCollection(
                            relationship_name=relationship.name,
                            linked_records=linked_records,
                            linked_model_class=relationship_classes[relationship.name],
                        )
                    )

        try:
            # check if field is defined in class, if not pop it
            to_pop = []
            for key, value in values.items():
                if not hasattr(model, key):
                    to_pop.append(key)
            for key in to_pop:
                values.pop(key)

            instance = model(**values)
            db.add(instance)

            # now link many2many records
            if many2many_records_to_link:
                for collection in many2many_records_to_link:
                    if not bypass_permission:
                        _check_m2m_permission(
                            user,
                            m2m_by_name[collection.relationship_name],
                            collection.linked_records,
                            PermissionAction.create,
                            parent_instance=instance,
                        )
                    LinkedModel = collection.linked_model_class
                    ids = [record["id"] for record in collection.linked_records]
                    record_instances = (
                        db.query(LinkedModel).filter(LinkedModel.id.in_(ids)).all()
                    )
                    setattr(instance, collection.relationship_name, record_instances)

            if commit:
                db.commit()
                db.refresh(instance)

                # now create the one2many records
                # since now we have the instance id after commit
                if one2many_records_to_create:
                    for collection in one2many_records_to_create:
                        LinkedModel = collection.linked_model_class
                        parent_key_field = get_one2many_parent_id(
                            LinkedModel, model.__tablename__
                        )
                        if parent_key_field:
                            for record_values in collection.linked_records:
                                record_values[parent_key_field.name] = instance.id
                                record_instance = LinkedModel.create(
                                    db,
                                    user,
                                    record_values,
                                    bypass_permission=bypass_permission,
                                )
                                db.add(record_instance)
                    db.commit()

            return instance
        # catch unique constraint violation
        except IntegrityError as e:
            db.rollback()
            message = str(e.orig)
            detail = message.split("DETAIL:  ")[1]
            logger.error(
                f"Error creating record: {detail}\nFull traceback: {traceback.format_exc()}"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error creating record: {detail}",
            )
        # catch permissions error
        except HTTPException as e:
            db.rollback()
            raise e
        except Exception:
            db.rollback()
            logger.error(f"Error creating record: {traceback.format_exc()}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An error occurred!",
            )

    def _can_process_with_scope(self, scope, user):
        if scope == PermissionScope.all:
            return True

        user_org_ids = user.get_org_ids()

        if scope == PermissionScope.own:
            if hasattr(self, "owner_id") and self.owner_id == user.id:
                return True
            elif self.__tablename__ == "user" and self.id == user.id:
                return True
            elif self.__tablename__ == "organization":
                resource_id = getattr(self, "id", None)
                if resource_id in user_org_ids:
                    return True

        elif scope == PermissionScope.org:
            if hasattr(self, "organization_id") and self.organization_id is not None:
                if self.organization_id in user_org_ids:
                    return True

            if self.__tablename__ == "organization":
                resource_id = getattr(self, "id", None)
                if resource_id in user_org_ids:
                    return True

            if self.__tablename__ == "user":
                resource_org_ids = [org.id for org in self.organizations]
                if any(org_id in user_org_ids for org_id in resource_org_ids):
                    return True

            return False

        return False

    def update(
        self,
        db: Session,
        user,
        values: dict,
        commit: Optional[bool] = True,
        bypass_permission: Optional[bool] = False,
        *args,
        **kwargs,
    ) -> "[ORMBaseMixin]":
        # check if system record
        if self.system:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="System records cannot be modified.",
            )

        [allowed, scope] = self._check_has_permission(PermissionAction.write, user)
        if not bypass_permission and not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have permission to update this resource type: {self.__tablename__}",
            )
        can_update = self._can_process_with_scope(scope=scope, user=user)
        if not can_update:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have permission to update this resource type: {self.__tablename__}",
            )
        # delegate model-specific write permission check to hook
        self._check_model_write_permission(self, user)

        try:
            relationships = get_relationships(self.get_class())
            relationship_classes = _get_relationships_class_map(self.get_class())
            m2m_by_name = {r.name: r for r in relationships.many2many}

            many2many_records_to_update: list[RelationshipRecordCollection] = []
            one2many_records_to_update: list[RelationshipRecordCollection] = []

            # pop many2many relationship lists from values
            for relationship in relationships.many2many:
                if relationship.name in values:
                    linked_records = values.pop(relationship.name, None)
                    if linked_records is None:
                        continue
                    if linked_records == []:
                        # if just empty list, simply remove all many2many records in this relationship
                        if not bypass_permission:
                            _check_m2m_permission(
                                user,
                                relationship,
                                [],
                                PermissionAction.delete,
                                parent_instance=self,
                            )
                        setattr(self, relationship.name, [])
                    else:
                        # if not empty list, update the many2many records
                        many2many_records_to_update.append(
                            RelationshipRecordCollection(
                                relationship_name=relationship.name,
                                linked_records=linked_records,
                                linked_model_class=relationship_classes[
                                    relationship.name
                                ],
                            )
                        )

            # pop one2many relationship lists from values
            for relationship in relationships.one2many:
                if relationship.name in values:
                    values_to_update = values.pop(relationship.name)
                    if values_to_update is not None:
                        one2many_records_to_update.append(
                            RelationshipRecordCollection(
                                relationship_name=relationship.name,
                                linked_records=values_to_update,
                                linked_model_class=relationship_classes[
                                    relationship.name
                                ],
                            )
                        )

            # update all values
            for field, value in values.items():
                if hasattr(self, field):
                    setattr(self, field, value)

            # now update many2many records
            for collection in many2many_records_to_update:
                if not bypass_permission:
                    _check_m2m_permission(
                        user,
                        m2m_by_name[collection.relationship_name],
                        collection.linked_records,
                        PermissionAction.write,
                        parent_instance=self,
                    )
                LinkedModel = collection.linked_model_class
                ids = [record["id"] for record in collection.linked_records]
                record_instances = (
                    db.query(LinkedModel).filter(LinkedModel.id.in_(ids)).all()
                )
                setattr(self, collection.relationship_name, record_instances)

            # now update one2many records
            for collection in one2many_records_to_update:
                LinkedModel = collection.linked_model_class
                parent_key_field: FieldInfo = get_one2many_parent_id(
                    LinkedModel, self.__tablename__
                )

                if parent_key_field:
                    existing_records = getattr(self, collection.relationship_name)

                    for record_values in collection.linked_records:
                        # add new records
                        if not record_values.get("id"):
                            record_values[parent_key_field.name] = self.id
                            record_instance = LinkedModel.create(
                                db,
                                user,
                                record_values,
                                bypass_permission=bypass_permission,
                            )
                            db.add(record_instance)
                        # update existing records
                        else:
                            record_id = record_values.get("id")
                            record_instance = db.query(LinkedModel).get(record_id)
                            if record_instance is None:
                                logger.warning(
                                    f"Record with ID {record_id} not found in {LinkedModel.__name__}, treating as new record"
                                )
                                record_values.pop("id", None)
                                if parent_key_field:
                                    record_values[parent_key_field.name] = self.id
                                record_instance = LinkedModel.create(
                                    db,
                                    user,
                                    record_values,
                                    bypass_permission=bypass_permission,
                                )
                                db.add(record_instance)
                            else:
                                record_instance.update(
                                    db,
                                    user,
                                    record_values,
                                    commit=False,
                                    bypass_permission=bypass_permission,
                                )

                    # delete or unlink records that are not in the new list
                    for existing_record in existing_records:
                        new_list_record_ids = [
                            record["id"]
                            for record in list(
                                filter(lambda x: x.get("id"), collection.linked_records)
                            )
                        ]
                        if existing_record.id not in new_list_record_ids:
                            parent_key_column: Column = getattr(
                                LinkedModel, parent_key_field.name
                            )
                            if parent_key_column.nullable:
                                existing_record.update(
                                    db,
                                    user,
                                    {parent_key_field.name: None},
                                    commit=False,
                                    bypass_permission=bypass_permission,
                                )
                            else:
                                existing_record.delete(
                                    db,
                                    user,
                                    commit=False,
                                    force=True,
                                    bypass_permission=bypass_permission,
                                )

            if commit:
                db.commit()
                db.refresh(self)

            return self
        # catch unique constraint violation
        except IntegrityError as e:
            if commit:
                db.rollback()
            message = str(e.orig)
            detail = message.split("DETAIL:  ")[1]
            logger.error(f"IntegrityError updating record: {traceback.format_exc()}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error updating record: {detail}",
            )
        except Exception:
            if commit:
                db.rollback()
            logger.error(f"Error updating record: {traceback.format_exc()}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An error occurred!",
            )

    def delete(
        self,
        db: Session,
        user,
        force: Optional[bool] = False,
        commit: Optional[bool] = True,
        bypass_permission: Optional[bool] = False,
        *args,
        **kwargs,
    ) -> [DeleteResponse]:
        # check if system record
        if self.system:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="System records cannot be modified.",
            )

        [allowed, scope] = self._check_has_permission(PermissionAction.delete, user)
        if not bypass_permission and not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this resource type",
            )
        # delegate model-specific write permission check to hook
        self._check_model_write_permission(self, user)

        if not bypass_permission and not self._can_process_with_scope(scope, user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this resource",
            )

        affected_records: AffectedRecordResult = get_delete_cascade_records_recursively(
            db, [self]
        )
        if (
            affected_records.to_delete.keys() or affected_records.to_set_null.keys()
        ) and not force:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This record has dependencies.",
            )

        try:
            # Delete affected records
            self._delete_affected_records(db, affected_records)

            db.delete(self)
            if commit:
                db.commit()
            return {"success": True}

        except IntegrityError as e:
            if commit:
                db.rollback()
            message = str(e.orig)
            logger.error(
                f"IntegrityError deleting {self.__tablename__} id={self.id}: {message}"
            )
            detail = message.split("DETAIL:  ")[1]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error deleting record: {detail}",
            )
        except Exception:
            if commit:
                db.rollback()
            logger.error(f"Error deleting record: {traceback.format_exc()}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An error occurred!",
            )

    @classmethod
    def get_one(
        cls,
        db: Session,
        user,
        item_id: int,
        bypass_permission: Optional[bool] = False,
        *args,
        **kwargs,
    ) -> "[ORMBaseMixin]":
        [allowed, scope] = cls._check_has_permission(PermissionAction.read, user)
        if not bypass_permission and not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to read this resource type",
            )

        query = db.query(cls).filter(cls.id == item_id)
        query = cls._build_query_based_on_scope(query, user, scope, cls)

        instance = query.first()
        if instance is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to read this resource",
            )
        return instance

    @classmethod
    def get_all(
        cls, db: Session, user, pagination: PAGINATION, *args, **kwargs
    ) -> list["[ORMBaseMixin]"]:
        [allowed, scope] = cls._check_has_permission(PermissionAction.read, user)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to read this resource type",
            )

        skip, limit = pagination.get("skip"), pagination.get("limit")
        query = db.query(cls)
        query = cls._build_query_based_on_scope(query, user, scope, cls)
        query = query.filter_by(active=True)

        return query.offset(skip).limit(limit).all()

    @classmethod
    def search(
        cls,
        db: Session,
        user,
        pagination: PAGINATION,
        search: Optional[SearchQuery] = None,
        order_by: Optional[OrderByCriteria] = None,
        bypass_permission: Optional[bool] = False,
        *args,
        **kwargs,
    ):
        model = models_pool[cls.__tablename__]
        [allowed, scope] = model._check_has_permission(PermissionAction.read, user)
        if not bypass_permission and not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to read this resource type",
            )

        skip, limit = pagination.get("skip"), pagination.get("limit")
        query = db.query(model)

        if search:
            query = cls._apply_search_conditions(query, search, model)

        if order_by and order_by.field:
            query = cls.__apply_order_by(model, query, order_by)

        # build query based on permission scope, paginate, and return
        query = cls._build_query_based_on_scope(query, user, scope, model)

        return {"total": query.count(), "data": query.offset(skip).limit(limit).all()}

    @classmethod
    def bulk_delete(
        cls,
        db: Session,
        user,
        search: SearchQuery,
        force: Optional[bool] = False,
        bypass_permission: Optional[bool] = False,
        *args,
        **kwargs,
    ) -> BulkDeleteResponse:
        """
        Bulk delete with search query

        @param db: The database session.
        @param user: The user performing the action.
        @param search: The search query.
        @param force: Allow to delete referenced records
        @param bypass_permission: Bypass permission
        @param args:
        @param kwargs:
        @return: BulkDeleteResponse
        """
        [allowed, scope] = cls._check_has_permission(PermissionAction.delete, user)
        if not bypass_permission and not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this resource type",
            )
        # delegate model-specific write permission check to hook
        cls._check_model_write_permission(None, user)

        # Start a transaction
        try:
            # Get model
            model = models_pool[cls.__tablename__]

            # Get query
            query = db.query(cls)

            # apply search conditions to find deleting record
            query = cls._apply_search_conditions(query, search, model)

            # Build query based on permission scope, paginate, and return
            query = cls._build_query_based_on_scope(query, user, scope, model)

            # Get the records to be deleted
            records_to_delete = query.all()

            # Delete referenced/effected records if force param is True
            if force:
                # Get affected records
                affected_records: AffectedRecordResult = (
                    get_delete_cascade_records_recursively(
                        db, records=records_to_delete
                    )
                )

                # Delete affected records
                cls._delete_affected_records(db, affected_records)

            # Delete main records
            for record in records_to_delete:
                db.delete(record)
            db.commit()

            # Return the result
            return BulkDeleteResponse(
                success=True, deleted_count=len(records_to_delete)
            )

        except IntegrityError as e:
            db.rollback()
            message = str(e.orig)
            detail = message.split("DETAIL:  ")[1]
            logger.error(
                f"Error bulk deleting: {detail}\nFull traceback: {traceback.format_exc()}"
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete records because they are referenced by other records (or due to other integrity "
                "errors).",
            )
        except Exception as e:
            db.rollback()
            logger.error(f"Error bulk deleting record: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"An error occurred while deleting records: {str(e)}",
            )

    @classmethod
    def _delete_affected_records(
        cls, db: Session, affected_records: AffectedRecordResult
    ):
        """
        Delete referenced/affected records.

        @param db: The database session.
        @param affected_records: The affected records these will be deleted.
        @return: None
        """

        # Delete affected records
        for table, items in affected_records.to_delete.items():
            for item in items:
                db.delete(item.record)
        db.flush()

        # Set affected records to null
        for table, items in affected_records.to_set_null.items():
            for item in items:
                setattr(item.record, item.affected_field, None)
        db.flush()

        # Delete rows in junction (M2M) tables that the ORM cascade can't see
        # because the join table has no `id` column / no registered model.
        if affected_records.junction_deletes:
            metadata = MetaData()
            for jd in affected_records.junction_deletes:
                if not jd.ids:
                    continue
                table = Table(jd.table_name, metadata, autoload_with=db.bind)
                db.execute(table.delete().where(table.c[jd.column].in_(jd.ids)))
            db.flush()

    @classmethod
    def _filter_permission(cls, permission: str) -> bool:
        table = permission.split(":")[0]
        return table == cls.__tablename__

    @classmethod
    def _filter_action(cls, permission: str, action: PermissionAction) -> bool:
        allowed_action = permission.split(":")[1]
        return allowed_action == action or allowed_action == PermissionAction.all

    @classmethod
    def _check_has_permission(
        cls,
        action: PermissionAction,
        user,
    ) -> [bool, PermissionScope]:
        """
        Check if the user has the required permissions for the given action.

        Args:
            action (str): The action to check permissions for (e.g., 'read', 'write', '').
            user: The user to check permissions for.

        Returns:
            [bool, str]: A tuple containing a boolean indicating permission status and
            a string with the highest scope (e.g., 'own', 'org', '*').
        """
        all_permissions = user.get_user_permissions()

        # filter permissions by this table name or '*'
        table_permissions = list(filter(cls._filter_permission, all_permissions))
        if len(table_permissions) == 0:
            return False, PermissionScope.none

        # check if can do this action on table
        action_permissions = list(
            filter(lambda p: cls._filter_action(p, action), table_permissions)
        )
        if len(action_permissions) == 0:
            return False, PermissionScope.none

        # gather all scopes
        scopes = list(map(lambda x: x.split(":")[2], action_permissions))

        # get the highest scope, * > org > own
        if PermissionScope.all in scopes:
            return True, PermissionScope.all
        if PermissionScope.org in scopes:
            return True, PermissionScope.org
        if PermissionScope.own in scopes:
            return True, PermissionScope.own
        return False, PermissionScope.none

    @classmethod
    def export(
        cls,
        db: Session,
        user,
        pagination: PAGINATION,
        search: Optional[SearchQuery] = None,
        order_by: Optional[OrderByCriteria] = None,
        *args,
        **kwargs,
    ):
        search_result = cls.search(
            db=db,
            user=user,
            pagination=pagination,
            search=search,
            order_by=order_by,
            *args,
            **kwargs,
        )
        records = search_result["data"]
        csv_string = StringIO()
        model = models_pool[cls.__tablename__]

        if len(records) == 0:
            return csv_string

        # Convert the records to a list of dictionaries
        records = [rec.serialize() for rec in records]

        for record in records:
            record.pop("_sa_instance_state", None)

        column_names = [column.name for column in model.__table__.columns]
        csv_separator = ";"
        current_org_id = getattr(user, "current_organization_id", None)
        if current_org_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Organization-Id header required for CSV export",
            )
        OrganizationModel = models_pool["organization"]
        organization = db.query(OrganizationModel).get(current_org_id)
        if organization:
            csv_separator = ";" if organization.csv_separator == "semicolon" else ","

        csv_writer = csv.DictWriter(
            csv_string, fieldnames=column_names, delimiter=csv_separator
        )
        csv_writer.writeheader()
        csv_writer.writerows(records)

        return csv_string

    @classmethod
    def import_records(
        cls,
        db: Session,
        user,
        csvfile: File,
        current_organization_id: Optional[int] = None,
        *args,
        **kwargs,
    ):
        buffer = None
        try:
            contents = csvfile.file.read()
            if contents[:3] == codecs.BOM_UTF8:
                decoded_contents = contents.decode("utf-8-sig")
            else:
                decoded_contents = contents.decode("utf-8")

            buffer = StringIO(decoded_contents)

            csv_separator = ";"
            current_org_id = getattr(user, "current_organization_id", None)
            if current_org_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="X-Organization-Id header required for CSV import",
                )
            OrganizationModel = models_pool["organization"]
            organization = db.query(OrganizationModel).get(current_org_id)
            if organization:
                csv_separator = (
                    ";" if organization.csv_separator == "semicolon" else ","
                )

            csv_reader = csv.DictReader(buffer, delimiter=csv_separator)

            data: list[dict] = list(csv_reader)
            model = models_pool[cls.__tablename__]

            for row in data:
                row_data: dict = model._convert_csv_row(row)
                instance = None

                if row_data.get("id"):
                    instance = db.query(model).get(row_data.pop("id"))
                elif row_data.get("string_id"):
                    query = db.query(model).filter_by(
                        string_id=row_data.get("string_id")
                    )
                    if hasattr(model, "organization_id"):
                        query = query.filter_by(organization_id=current_org_id)
                    instance = query.first()

                if instance:
                    instance.update(db, user, row_data, commit=False)
                else:
                    model.create(db, user, row_data, commit=False)

            db.commit()

        except IntegrityError as e:
            db.rollback()
            message = str(e.orig)
            detail = message.split("DETAIL:  ")[1]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error importing records: {detail}",
            )
        except ValueError as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid CSV field input: {e}",
            )
        except Exception:
            db.rollback()
            logger.error(
                f"Error importing record: \nFull traceback: {traceback.format_exc()}"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An error occurred!",
            )
        finally:
            if buffer:
                buffer.close()
            csvfile.file.close()

        return {"success": True}

    def serialize(self) -> dict:
        result = self.__dict__.copy()
        # Convert Enum values to their actual string values
        # instead of the Enum object key
        for key, value in self.__dict__.items():
            if isinstance(value, enum.Enum):
                result[key] = value.value
        # Remove the SQLAlchemy internal state from the records
        result.pop("_sa_instance_state", None)
        return result

    @classmethod
    def _convert_csv_field_value(cls, value: Any, column: Column) -> Any:
        column_type = type(column.type)
        if value == "":
            return None
        elif column_type == Boolean:
            return value.lower() in ["true", "1", "t", "y", "yes"]
        elif column_type == Integer:
            return int(value)
        elif column_type == DateTime:
            return datetime.fromisoformat(value)
        elif column_type == Enum:
            return column.type.python_type(value)
        return value

    @classmethod
    def _convert_csv_row(cls, row: dict) -> dict:
        result = {}
        model = models_pool[cls.__tablename__]
        for column in model.__table__.columns:
            field_name = column.name
            if field_name in row and row[field_name] is not None:
                result[field_name] = model._convert_csv_field_value(
                    row[field_name], column
                )
        return result

    @classmethod
    def get_class(cls):
        return cls

    @classmethod
    def _apply_search_conditions(cls, query: Query, search: SearchQuery, model):
        """
        Apply search conditions to the query.
        Modify query object with the search conditions.

        @param query: The query object.
        @param search: The search query.
        @return The modified query object.
        """
        for logical_operator, conditions in search.model_dump().items():
            criteria_filters = []

            for condition in conditions:
                field, operator, value = (
                    condition["field"],
                    condition["operator"],
                    condition["value"],
                )

                ReferencedModel = model
                # check for case field is attr1.attr2
                is_relationship = "." in field

                if is_relationship:
                    fields = field.split(".")
                    if not hasattr(model, fields[0]):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f'Relation "{fields[0]}" does not exist on this resource type',
                        )
                    relation = getattr(model, fields[0])

                    # re-assign the ReferencedModel
                    ReferencedModel = models_pool[relation.property.target.name]
                    field = fields[1]
                    if not hasattr(ReferencedModel, fields[1]):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f'Field "{field}" does not exist on this resource type 1 ',
                        )

                elif not hasattr(ReferencedModel, field):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f'Field "{field}" does not exist on this resource type 2',
                    )

                def _is_datetime_col(col):
                    try:
                        return col.type.python_type == datetime
                    except NotImplementedError:
                        return False

                datetime_fields = list(
                    filter(
                        _is_datetime_col,
                        model.__table__.columns,
                    )
                )
                is_datetime = field in [col.name for col in datetime_fields]

                if is_datetime and value is not None:
                    value = parse_date(value)

                # check if field is enum, if yes the value should be the enum value
                if field in ReferencedModel.__table__.columns:
                    column_type = ReferencedModel.__table__.columns[field].type
                    if column_type.__class__.__name__ == "Enum":
                        # check if list of enum values
                        if isinstance(value, list):
                            value = [column_type.python_type(v) for v in value]
                        else:
                            value = column_type.python_type(value)
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f'Field "{field}" does not exist on this resource type',
                    )

                condition_expr = None
                match operator:
                    case "=":
                        condition_expr = getattr(ReferencedModel, field) == value
                    case "!=":
                        condition_expr = getattr(ReferencedModel, field) != value
                    case "in":
                        if isinstance(value, list):
                            condition_expr = getattr(ReferencedModel, field).in_(value)
                    case "not_in":
                        if isinstance(value, list):
                            condition_expr = getattr(ReferencedModel, field).not_in(
                                value
                            )
                    case "between":
                        if isinstance(value, list) and len(value) == 2:
                            condition_expr = getattr(ReferencedModel, field).between(
                                value[0], value[1]
                            )
                    case "contains":
                        condition_expr = getattr(ReferencedModel, field).contains(value)
                    case ">":
                        condition_expr = getattr(ReferencedModel, field) > value
                    case ">=":
                        condition_expr = getattr(ReferencedModel, field) >= value
                    case "<":
                        condition_expr = getattr(ReferencedModel, field) < value
                    case "<=":
                        condition_expr = getattr(ReferencedModel, field) <= value
                    case "like":
                        condition_expr = getattr(ReferencedModel, field).like(
                            f"%{value}%"
                        )
                    case "ilike":
                        condition_expr = getattr(ReferencedModel, field).ilike(
                            f"%{value}%"
                        )
                    case _:
                        # Handle unsupported operators or other cases here
                        pass

                if condition_expr is not None:
                    criteria_filters.append(condition_expr)
                    if is_relationship:
                        query = query.join(relation)

            if criteria_filters:
                if logical_operator.lower() == "or":
                    query = query.filter(or_(*criteria_filters))
                elif logical_operator.lower() == "and":
                    query = query.filter(and_(*criteria_filters))

            # check if any condition for "active" field, if not we filter by active=True
            if not any([condition["field"] == "active" for condition in conditions]):
                query = query.filter_by(active=True)

        return query

    @classmethod
    def _build_query_based_on_scope(
        cls, query: Query, user, scope: PermissionScope, model
    ) -> Query:
        """
        Restrict `query` to records the user can access under `scope`.

        Fails closed: when scope is `own` or `org` but no recognized
        ownership / org-membership column exists on the model — or the user
        has no org memberships under `org` scope — the returned query
        matches nothing.

        Scope `all` and `none` return the query unchanged. `none` is only
        reached via `bypass_permission` callers that have already opted out
        of scope enforcement; without bypass, `_check_has_permission`
        denies before this helper runs.
        """
        if scope == PermissionScope.all or scope == PermissionScope.none:
            # `all` allows everything; `none` is only reachable via
            # bypass_permission callers that have already opted out of
            # scope enforcement.
            return query

        if scope == PermissionScope.own:
            if hasattr(model, "owner_id"):
                return query.filter_by(owner_id=user.id)
            if model.__tablename__ == "user":
                return query.filter_by(id=user.id)
            if model.__tablename__ == "organization":
                return query.filter(model.id.in_(user.get_org_ids()))
            return query.filter(false())

        if scope == PermissionScope.org:
            user_org_ids = user.get_org_ids()
            if not user_org_ids:
                return query.filter(false())
            if model.__tablename__ == "user":
                OrganizationModel = models_pool["organization"]
                return query.filter(
                    model.organizations.any(OrganizationModel.id.in_(user_org_ids))
                )
            if model.__tablename__ == "organization":
                return query.filter(model.id.in_(user_org_ids))
            if hasattr(model, "organization_id"):
                return query.filter(model.organization_id.in_(user_org_ids))
            return query.filter(false())

        return query.filter(false())

    @classmethod
    def install_csv_data(
        cls,
        file_name: str,
        db: Session,
        demo_data: bool = False,
        organization_id: Optional[int] = None,
        base_dir: str = None,
        force_update: bool = False,
        auto_commit: bool = True,
    ):
        """
        Import developer-defined CSV files, called during install_apps()

        @param file_name: The name of the file to import
        @param db: The database session
        @param demo_data: Whether the data is demo data. Demo data will not check for existing records, insert regardless
        @param organization_id: The organization ID assigned to records when the CSV omits it. Required for tenant-scoped models; callers that want multi-org install should go through install_apps.import_csv_data().
        @param base_dir: Base directory for resolving relative file paths
        @param force_update: Whether to force update existing records
        @param auto_commit: Whether to automatically commit after processing all rows. Set to False to manage transactions externally.
        @return: None
        """

        data: list[dict] = cls._prepare_csv_data_install(
            file_name, organization_id, demo_data
        )

        # loop through rows
        for row in data:
            # Resolve slash-form relational keys first so that
            # `organization/organization_id` becomes a concrete `organization_id`
            # value on the row before we run the existence check. Otherwise the
            # check would fall back to the caller's `organization_id` arg and
            # miss rows whose CSV pins them to a different org.
            for key in list(row.keys()):
                if "/" in key and key.count("/") == 1:
                    cls._install_related_column(key, row, db, organization_id)

            # check if record exists in db
            existing_record = None
            string_id = row.get("string_id", None)
            if string_id:
                query = db.query(cls).filter_by(string_id=string_id)
                if hasattr(cls, "organization_id"):
                    # Prefer the row's own org_id (set by the CSV or by the
                    # slash-key resolution above) over the function arg, so the
                    # lookup matches the row's true destination. CSV values
                    # arrive as strings; coerce to int before filtering against
                    # the integer column.
                    lookup_org_id = row.get("organization_id", organization_id)
                    if lookup_org_id is not None:
                        query = query.filter_by(organization_id=int(lookup_org_id))

                existing_record = query.first()

            # process remaining special field name formats (file/attachment/json)
            for key in list(row.keys()):
                if ":" in key and key.count(":") == 1:
                    source_type, field_name = key.split(":")
                    if source_type == "file":
                        cls._install_file_column(key, row)

                    if source_type == "attachment":
                        cls._install_attachment_column(key, row, db, organization_id)

                    elif source_type == "json":
                        cls._install_json_column(key, row, db, organization_id)

            # Drop keys that aren't real columns on this model (e.g. seed CSVs
            # carrying organization_id for tables that no longer have it).
            for key in list(row.keys()):
                if not hasattr(cls, key):
                    row.pop(key)

            if existing_record:
                existing_record._install_update_existing_record(row, db, force_update)
            else:
                # object does not exist, create it now
                new_record = cls(**row)
                db.add(new_record)
                logger.debug(f"Added {new_record}")

        # Commit once after all rows if auto_commit is True
        if auto_commit:
            db.commit()

    @classmethod
    def _prepare_csv_data_install(
        cls, file_name: str, organization_id: Optional[int], demo_data: bool
    ) -> list[dict]:
        """
        Prepare data for CSV export.

        @param data: The data to prepare.
        @return: The prepared data.
        """
        # check if string_id column exists, if not throw error
        # except if we are inserting demo data

        with open(file_name, "r", encoding="utf-8") as csv_file:
            csv_reader = csv.DictReader(csv_file)

            if not demo_data and "string_id" not in csv_reader.fieldnames:
                raise Exception(
                    f'File {file_name} does not have required "string_id" column'
                )

            [owner_value_overwrite, organization_value_overwrite] = (
                cls._prepare_default_owner_and_organization_overwrite(
                    csv_reader, organization_id
                )
            )

            # convert to list of dicts
            data: list[dict] = list(csv_reader)

        # convert boolean values from string and ensure proper types
        for row in data:
            for key in list(row.keys()):
                if row[key] == "True" or row[key] == "true":
                    row[key] = True
                elif row[key] == "False" or row[key] == "false":
                    row[key] = False

            # Ensure string_id remains a string (important for numeric string_ids)
            if "string_id" in row and row["string_id"]:
                row["string_id"] = str(row["string_id"])

        # if overwrite values are not None, we need to add these columns to the data
        if owner_value_overwrite or organization_value_overwrite:
            for row in data:
                if owner_value_overwrite:
                    row["user/owner_id"] = owner_value_overwrite
                if organization_value_overwrite:
                    row["organization_id"] = int(organization_value_overwrite)

        return data

    @classmethod
    def _prepare_default_owner_and_organization_overwrite(
        cls, csv_reader: csv.DictReader, organization_id: Optional[int]
    ):
        """
        Prepare default owner and organization values.
        """

        # assign default values to owner_id and organization_id
        owner_value_overwrite = None
        organization_value_overwrite = None

        # Only overwrite when NEITHER form of the column is present in the
        # CSV. The previous `or` clause triggered the overwrite whenever
        # either form was missing — which is essentially always, since CSVs
        # use one form at a time — and silently clobbered the CSV's explicit
        # value.
        if hasattr(cls, "owner_id") and (
            "user/owner_id" not in csv_reader.fieldnames
            and "owner_id" not in csv_reader.fieldnames
        ):
            owner_value_overwrite = "system"
        if hasattr(cls, "organization_id") and (
            "organization/organization_id" not in csv_reader.fieldnames
            and "organization_id" not in csv_reader.fieldnames
        ):
            if organization_id is None:
                raise ValueError(
                    f"{cls.__name__} is tenant-scoped but install_csv_data was "
                    f"called without organization_id and the CSV does not "
                    f"provide one. Use install_apps.import_csv_data() to "
                    f"install across all orgs, or pass an explicit "
                    f"organization_id."
                )
            organization_value_overwrite = str(organization_id)

        return owner_value_overwrite, organization_value_overwrite

    @classmethod
    def _install_related_column(
        cls, key: str, row: dict, db: Session, organization_id: int
    ):
        """
        Install related rows for the model.
        """
        table_name, column_name = key.split("/")
        # we need to remove the key anyway, this is not a real column name
        value = row.pop(key)
        if not value:
            return
        # get model from table name
        table_model = models_pool.get(table_name, None)
        if table_model:
            obj = None
            if hasattr(table_model, "organization_id"):
                obj = (
                    db.query(table_model)
                    .filter_by(string_id=value, organization_id=organization_id)
                    .first()
                )
            if obj is None:
                # Fall back to an unscoped lookup so global records like the
                # `system` user or super-org email templates can still resolve.
                obj = db.query(table_model).filter_by(string_id=value).first()
            if obj:
                row[column_name] = getattr(obj, "id")
            else:
                logger.error(
                    f"Object {table_name} with string_id {value} not found for org {organization_id}"
                )

    @classmethod
    def _install_file_column(cls, key: str, row: dict):
        """
        Install file column for the model.
        """
        column_name = key.split(":")[1]
        file_path = row.pop(key)
        if not file_path or file_path == "null":
            return

        try:
            with open(file_path, "r", encoding="utf-8") as file:
                row[column_name] = file.read()
                # check if field is JSON, if yes we load the json string
                if (
                    hasattr(cls, column_name)
                    and str(getattr(cls, column_name).type) == "JSON"
                ):
                    row[column_name] = json.loads(row[column_name])
        except Exception:
            logger.error(
                f"Error installing file column {key} with path {file_path}: {traceback.format_exc()}"
            )

    @classmethod
    def _install_attachment_column(
        cls, key: str, row: dict, db: Session, organization_id: int
    ):
        """
        Install attachment column for the model.

        Supports two structures:
        - Legacy: AttachmentModel carries AttachmentMixin (single table, file stored on create).
        - Multi-locale: AttachmentModel is a bare container; file + metadata live on
          AttachmentLocaleVersionModel (detected via models_pool["attachment_locale_version"]).
        """
        AttachmentModel = models_pool["attachment"]
        AttachmentLocaleVersionModel = models_pool.get("attachment_locale_version")

        _, field_name = key.split(":")
        file_path = row.pop(key)
        file_name = os.path.basename(file_path)

        # check if attachment already exists by exact name
        attachment_obj = AttachmentModel.get_by_name(db, file_name)

        if not attachment_obj:
            with open(file_path, "rb") as f:
                file_data = f.read()
            upload_file = UploadFile(
                file=BytesIO(file_data),
                filename=file_name,
                size=len(file_data),
            )
            system_user = (
                db.query(models_pool["user"]).filter_by(string_id="system").first()
            )

            if AttachmentLocaleVersionModel:
                # Multi-locale structure: create bare container, then locale version
                system_user.current_organization_id = organization_id
                attachment_obj = AttachmentModel.create(
                    db=db,
                    user=system_user,
                    values={"name": file_name, "organization_id": organization_id},
                    bypass_permission=True,
                )

                # Resolve default locale: org setting → first locale in DB
                org = (
                    db.query(models_pool["organization"])
                    .filter_by(id=organization_id)
                    .first()
                )
                locale_id = getattr(org, "default_language_id", None)
                if locale_id is None:
                    LocaleModel = models_pool.get("locale")
                    if LocaleModel:
                        first_locale = db.query(LocaleModel).first()
                        locale_id = first_locale.id if first_locale else None

                if locale_id:
                    system_user.current_organization_id = organization_id
                    AttachmentLocaleVersionModel().create(
                        db=db,
                        user=system_user,
                        file=upload_file,
                        attachment_id=attachment_obj.id,
                        locale_id=locale_id,
                        organization_id=organization_id,
                        bypass_permission=True,
                    )
                else:
                    logger.warning(
                        f"No locale found for org {organization_id} — "
                        f"attachment '{file_name}' created without locale version"
                    )
            else:
                # Legacy structure: AttachmentModel handles file upload directly
                logger.warning(
                    "Can not find attachment_locale_version model, using legacy attachment structure"
                )
                attachment_obj = AttachmentModel().create(
                    db=db,
                    user=system_user,
                    file=upload_file,
                    bypass_permission=True,
                    organization_id=organization_id,
                )

            db.commit()
            logger.debug(f"Added {file_path} as attachment ID={attachment_obj.id}")

        row[field_name] = attachment_obj.id

    @classmethod
    def _install_json_column(
        cls, key: str, row: dict, db: Session, organization_id: int
    ):
        """
        Install json column for the model.
        """
        column_name = key.split(":")[1]
        json_str = row.pop(key)
        row[column_name] = json_str
        if hasattr(cls, column_name) and str(getattr(cls, column_name).type) == "JSON":
            json_obj = json.loads(json_str)
            processed_json = cls._resolve_json_foreign_keys(
                json_obj, db, organization_id
            )
            row[column_name] = processed_json

    @classmethod
    def _resolve_json_foreign_keys(cls, obj, db: Session, organization_id: int):
        """
        Recursively process a JSON object/array to resolve foreign key references.
        Converts {table_name/column_name: string_id} to {column_name: actual_id}
        """
        if isinstance(obj, dict):
            result = {}
            for key, value in obj.items():
                if "/" in key and key.count("/") == 1:
                    table_name, column_name = key.split("/")
                    table_model = models_pool.get(table_name, None)
                    if table_model and value:
                        foreign_obj = None
                        if hasattr(table_model, "organization_id"):
                            foreign_obj = (
                                db.query(table_model)
                                .filter_by(
                                    string_id=value, organization_id=organization_id
                                )
                                .first()
                            )
                        if foreign_obj is None:
                            foreign_obj = (
                                db.query(table_model).filter_by(string_id=value).first()
                            )
                        if foreign_obj:
                            result[column_name] = getattr(foreign_obj, "id")
                        else:
                            logger.error(
                                f"Object {table_name} with string_id {value} not found for org {organization_id}"
                            )
                            result[key] = value
                    else:
                        result[key] = value
                else:
                    result[key] = cls._resolve_json_foreign_keys(
                        value, db, organization_id
                    )
            return result
        elif isinstance(obj, list):
            return [
                cls._resolve_json_foreign_keys(item, db, organization_id)
                for item in obj
            ]
        else:
            return obj

    def _install_update_existing_record(
        self, row: dict, db: Session, force_update: bool = False
    ):
        """
        Update existing record with new data.
        """
        if force_update or ("system" in row and row["system"] == True) or self.system:
            for key, value in row.items():
                setattr(self, key, value)

            db.flush()
            logger.debug(f"Updated {self}")

    @classmethod
    def __apply_order_by(cls, root_model, query, order_by):
        """
        Apply ordering to a SQLAlchemy query based on the specified field and direction.
        """
        if not order_by or not order_by.field:
            return query

        field_parts = order_by.field.split(".")
        current_alias = root_model

        for part in field_parts[:-1]:
            if not hasattr(current_alias, part):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Model {current_alias.__name__} does not have {part}",
                )

            related_model = getattr(current_alias, part)
            if isinstance(related_model.property, RelationshipProperty):
                onclause = related_model.property.primaryjoin
                current_alias = models_pool.get(part, related_model.mapper.class_)
                query = query.outerjoin(current_alias, onclause)
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{part} is not a valid relationship in model {current_alias.__name__}",
                )

        last_field = field_parts[-1]
        if not hasattr(current_alias, last_field):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Model {current_alias.__name__} does not have {last_field}",
            )
        column_to_order = getattr(current_alias, last_field)

        skip_lower_trim_types = (Enum, JSON, UUID, LargeBinary, PickleType)

        if isinstance(column_to_order.type, skip_lower_trim_types):
            pass

        elif isinstance(column_to_order.type, String):
            column_to_order = func.trim(column_to_order)

        if order_by.direction == "asc":
            query = query.order_by(column_to_order.asc())
        else:
            query = query.order_by(column_to_order.desc())

        return query
