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
    inspect,
    or_,
    func,
    UUID,
    PickleType,
    LargeBinary,
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
        """Resolve organization_id on create. Override for custom role/table logic."""
        if hasattr(cls, "organization_id"):
            if not values.get("organization_id"):
                values["organization_id"] = getattr(user, "organization_id", None)
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
                if self.organization_id:
                    resource_org_ids.append(self.organization_id)

                if any(org_id in user_org_ids for org_id in resource_org_ids):
                    return True

            return False

        elif scope == PermissionScope.own_org:
            if hasattr(self, "owner_id") and self.owner_id == user.id:
                return True
            if self.__tablename__ == "user" and self.id == user.id:
                return True

            if hasattr(self, "organization_id") and self.organization_id is not None:
                if self.organization_id in user_org_ids:
                    return True

            if self.__tablename__ == "organization":
                resource_id = getattr(self, "id", None)
                if resource_id in user_org_ids:
                    return True

            if self.__tablename__ == "user":
                org_ids = self.get_org_ids()
                if any(org_id in user_org_ids for org_id in org_ids):
                    return True

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

            many2many_records_to_update: list[RelationshipRecordCollection] = []
            one2many_records_to_update: list[RelationshipRecordCollection] = []

            # pop many2many relationship lists from values
            for relationship in relationships.many2many:
                if relationship.name in values:
                    linked_records = values.pop(relationship.name, None)
                    if linked_records == []:
                        # if just empty list, simply remove all many2many records in this relationship
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

        # if highest scope is own, only allow users to delete their own resources
        if scope == PermissionScope.own:
            # if model has owner_id, only allow users delete their own resources
            if hasattr(self, "owner_id"):
                if self.owner_id != user.id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have permission to delete this resource",
                    )
            # else if model is User, only allow users to delete themselves
            elif self.__tablename__ == "user":
                if self.id != user.id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have permission to delete this resource",
                    )

        # if highest scope is org, only allow users to delete resources in their organization
        elif scope == PermissionScope.org:
            # if model has organization_id, only allow users to delete resources in their organization
            if hasattr(self, "organization_id"):
                if self.organization_id not in user.get_org_ids():
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have permission to delete this resource",
                    )
            # else if model is User, only allow users to delete resources in their organization
            elif self.__tablename__ == "user":
                org_ids = self.get_org_ids()
                if not any(org_id in user.get_org_ids() for org_id in org_ids):
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

        query = db.query(cls)

        # if highest scope is own, only allow users to read their own resources
        if scope == PermissionScope.own:
            # if model has owner_id, only allow users read their own resources
            if hasattr(cls, "owner_id"):
                query.filter_by(id=item_id, owner_id=user.id)
            # else if model is User, only allow users to read themselves
            elif cls.__tablename__ == "user":
                if item_id != user.id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have permission to read this resource",
                    )
            # else if model is Organization, only allow users to read their organization
            elif cls.__tablename__ == "organization":
                if item_id != user.organization_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have permission to read this resource",
                    )

        # if highest scope is org, only allow users to read resources in their organization
        elif scope == PermissionScope.org:
            # if model has organization_id, only allow users to read resources in their organization
            if hasattr(cls, "organization_id"):
                query.filter(cls.organization_id.in_(user.get_org_ids()))
            # else if model is Organization, only allow users to read their organization
            elif cls.__tablename__ == "organization":
                if item_id not in user.get_org_ids():
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have permission to read this resource",
                    )

        return db.query(cls).get(item_id)

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

        # build query based on permission scope, paginate, and return
        if scope == PermissionScope.own:
            if hasattr(cls, "owner_id"):
                query = query.filter_by(owner_id=user.id)
            elif cls.__tablename__ == "user":
                query = query.filter_by(id=user.id)
        elif (
            scope == PermissionScope.org
            and hasattr(cls, "organization_id")
            and user.organization_id is not None
        ):
            query = query.filter(cls.organization_id.in_(user.get_org_ids()))

        # filter by active=True
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
            a string with the highest scope (e.g., 'own', 'org', 'own_org', '*').
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

        # get the highest scope, * > own_org > org > own
        if PermissionScope.all in scopes:
            return True, PermissionScope.all
        if PermissionScope.own_org in scopes:
            return True, PermissionScope.own_org
        if PermissionScope.org in scopes:
            return True, PermissionScope.org
        if PermissionScope.own in scopes:
            return True, PermissionScope.own
        return True, PermissionScope.none

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
        if user.organization_id:
            OrganizationModel = models_pool["organization"]
            organization = db.query(OrganizationModel).get(user.organization_id)
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
            if user.organization_id:
                OrganizationModel = models_pool["organization"]
                organization = db.query(OrganizationModel).get(user.organization_id)
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
                        query = query.filter_by(organization_id=user.organization_id)
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

                datetime_fields = list(
                    filter(
                        lambda x: x.type.python_type == datetime,
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
        Build query based on permission scope and other conditions.

        @param query: The query object.
        @param user: The user performing the action.
        @param scope: The permission scope.
        @return: The modified query object.
        """
        if scope == PermissionScope.own:
            if hasattr(model, "owner_id"):
                query = query.filter_by(owner_id=user.id)
            elif model.__tablename__ == "user":
                query = query.filter_by(id=user.id)
        elif scope == PermissionScope.org and hasattr(model, "organization_id"):
            user_org_ids = user.get_org_ids()
            if user_org_ids:
                if model.__tablename__ == "user":
                    OrganizationModel = models_pool["organization"]
                    query = query.filter(
                        or_(
                            model.organization_id.in_(user_org_ids),
                            model.organizations.any(
                                OrganizationModel.id.in_(user_org_ids)
                            ),
                        )
                    )
                else:
                    query = query.filter(model.organization_id.in_(user_org_ids))
        return query

    @classmethod
    def install_csv_data(
        cls,
        file_name: str,
        db: Session,
        demo_data: bool = False,
        organization_id: int = 1,
        base_dir: str = None,
        force_update: bool = False,
        auto_commit: bool = True,
    ):
        """
        Import developer-defined CSV files, called during install_apps()

        @param file_name: The name of the file to import
        @param db: The database session
        @param demo_data: Whether the data is demo data. Demo data will not check for existing records, insert regardless
        @param organization_id: The organization ID, this will be assigned to records
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
            for key in list(row.keys()):
                if "/" in key and key.count("/") == 1:
                    # this means a string_id from a table was passed, we need to find the ID of the record
                    cls._install_related_column(key, row, db, organization_id)

                # pop all columns with format of <source_type>:<field_name>
                elif ":" in key and key.count(":") == 1:
                    source_type, field_name = key.split(":")
                    if source_type == "file":
                        cls._install_file_column(key, row)

                    if source_type == "attachment":
                        cls._install_attachment_column(key, row, db)

                    elif source_type == "json":
                        cls._install_json_column(key, row, db, organization_id)

            if not demo_data:
                # check if record already exists
                string_id = row["string_id"]
                query = db.query(cls).filter_by(string_id=string_id)
                # Always filter by organization_id if the model has it
                if hasattr(cls, "organization_id"):
                    query = query.filter_by(organization_id=organization_id)
                record = query.first()

                if record:
                    record._install_update_existing_record(row, db, force_update)
                else:
                    # object does not exist, create it now
                    record = cls(**row)
                    db.add(record)
                    logger.debug(f"Added {record}")

            else:
                # this is demo data, we don't care if object exists or not
                # create record regardless of existing record
                record = cls(**row)
                db.add(record)
                logger.debug(f"Added {record}")

        # Commit once after all rows if auto_commit is True
        if auto_commit:
            db.commit()

    @classmethod
    def _prepare_csv_data_install(
        cls, file_name: str, organization_id: int, demo_data: bool
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
        cls, csv_reader: csv.DictReader, organization_id: int
    ):
        """
        Prepare default owner and organization values.
        """

        # assign default values to owner_id and organization_id
        owner_value_overwrite = None
        organization_value_overwrite = None

        # assign default values to owner_id and organization_id
        if hasattr(cls, "owner_id") and (
            "user/owner_id" not in csv_reader.fieldnames
            or "owner_id" not in csv_reader.fieldnames
        ):
            owner_value_overwrite = "super_user"
        if hasattr(cls, "organization_id") and (
            "organization/organization_id" not in csv_reader.fieldnames
            or "organization_id" not in csv_reader.fieldnames
        ):
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
            # get object from table
            query = db.query(table_model).filter_by(string_id=value)
            if hasattr(table_model, "organization_id"):
                query = query.filter_by(organization_id=organization_id)
            obj = query.first()
            if obj:
                # add real column name with the record id
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
    def _install_attachment_column(cls, key: str, row: dict, db: Session):
        """
        Install attachment column for the model.
        """
        AttachmentModel = models_pool["attachment"]
        _, field_name = key.split(":")
        file_path = row.pop(key)
        file_name = os.path.basename(file_path)
        file_ext = os.path.splitext(file_name)[1]
        file_name_part = os.path.splitext(file_name)[0]
        attachment_obj = (
            db.query(AttachmentModel)
            .filter(AttachmentModel.name.like(f"{file_name_part}-%{file_ext}"))
            .first()
        )
        if not attachment_obj:
            with open(file_path, "rb") as file:
                file_data = file.read()
                upload_file = UploadFile(
                    file=BytesIO(file_data),
                    filename=file_name,
                    size=len(file_data),
                )
                super_user = (
                    db.query(models_pool["user"])
                    .filter_by(string_id="super_user")
                    .first()
                )
                attachment_obj = AttachmentModel().create(
                    db=db,
                    user=super_user,
                    file=upload_file,
                )
                db.commit()
                logger.debug(f"Added {file_path} as attachment ID={attachment_obj.id}")
        if attachment_obj:
            logger.debug(
                f"Set {field_name} with value attachment ID={attachment_obj.id}"
            )
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
                        query = db.query(table_model).filter_by(string_id=value)
                        if hasattr(table_model, "organization_id"):
                            query = query.filter_by(organization_id=organization_id)
                        foreign_obj = query.first()
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
