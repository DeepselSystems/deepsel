from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.orm import RelationshipProperty
from sqlalchemy.sql.sqltypes import String, Integer, Boolean, DateTime, Numeric, Enum
import enum


class ActivityMixin(object):
    """A mixin class that adds activity tracking functionality to SQLAlchemy models.

    This mixin provides methods to track various activities (create, update, comment)
    performed on model instances. Activities are stored in the Activity table and include:
    - Record creation
    - Record updates (with field-level change tracking)
    - Comments

    To use this mixin:
    1. Inherit from it in your model class, before ORMBaseMixin, it is **VERY IMPORTANT**
    2. Define __tracked_fields__ to specify which fields to track changes for
    3. Implement _get_activity_model() to return (ActivityModel, ActivityType)

    Example:
    ```python
    class User(Base, ActivityMixin, ORMBaseMixin):
        __tablename__ = 'user'
        __tracked_fields__ = [
            "name",
            "email",
            "role_id:name",
            "organization_id:name"
        ]

        @classmethod
        def _get_activity_model(cls):
            from myapp.models import ActivityModel, ActivityType
            return ActivityModel, ActivityType
    ```

    For relationship fields, use the format "field_name:display_field" in __tracked_fields__
    where:
    - field_name: The name of the relationship field
    - display_field: The field from the related model to use as display value
    """

    __tracked_fields__ = []

    @classmethod
    def _get_activity_model(cls):
        """Override this to return your ActivityModel class and ActivityType enum.
        Returns: tuple of (ActivityModel, ActivityType)"""
        raise NotImplementedError(
            "Subclass must implement _get_activity_model() returning (ActivityModel, ActivityType)"
        )

    @classmethod
    def create(
        cls,
        db: Session,
        user,
        values: dict,
        commit: Optional[bool] = True,
        *args,
        **kwargs,
    ):
        ActivityModel, ActivityType = cls._get_activity_model()
        instance = super().create(db, user, values, commit=True, *args, **kwargs)
        activity = ActivityModel(
            user_id=user.id,
            target_id=instance.id,
            target_model=instance.__class__.__tablename__,
            type=ActivityType.created,
        )

        external_username = kwargs.get("external_username")
        if external_username:
            activity.external_username = external_username

        db.add(activity)

        db.commit()
        db.refresh(instance)

        return instance

    def _get_changes(self, db: Session, values: dict) -> list[dict]:
        """Get changes for tracked fields before update"""

        changes = []

        for field in self.__tracked_fields__:
            # Handle relationship fields (format: "field:display_attr")
            if ":" in field:
                field_name, display_field = field.split(":")
                if field_name not in values:
                    continue

                # Get the relationship property
                rel_prop = getattr(self.__class__, field_name).property
                if not isinstance(rel_prop, RelationshipProperty):
                    continue

                # Get related model
                related_model = rel_prop.mapper.class_

                # Get old value from current relationship
                old_related = getattr(self, field_name)
                old_value = getattr(old_related, display_field) if old_related else None

                # Get new value from related record
                new_related = db.query(related_model).get(values[field_name])
                new_value = getattr(new_related, display_field) if new_related else None

                if old_value != new_value:
                    changes.append(
                        {
                            "field": field_name,
                            "old_value": old_value,
                            "new_value": new_value,
                            "type": "relationship",
                            "display_field": display_field,
                        }
                    )

            # Handle regular fields
            else:
                if field not in values:
                    continue

                old_value = getattr(self, field)
                new_value = values[field]

                # Handle Enum values - get the value instead of enum object
                if isinstance(old_value, enum.Enum):
                    old_value = old_value.value
                if isinstance(new_value, enum.Enum):
                    new_value = new_value.value

                if old_value != new_value:
                    # Get field type
                    column = self.__class__.__table__.columns[field]
                    field_type = type(column.type)

                    type_map = {
                        String: "string",
                        Integer: "integer",
                        Boolean: "boolean",
                        DateTime: "datetime",
                        Numeric: "numeric",
                        Enum: "enum",
                    }

                    changes.append(
                        {
                            "field": field,
                            "old_value": old_value,
                            "new_value": new_value,
                            "type": type_map.get(field_type, "other"),
                        }
                    )

        return changes

    def update(
        self,
        db: Session,
        user,
        values: dict,
        commit: Optional[bool] = True,
        *args,
        **kwargs,
    ):
        ActivityModel, ActivityType = self._get_activity_model()
        # Get changes before update
        changes = self._get_changes(db, values)

        # Call parent update method to update the instance
        instance = super().update(db, user, values, commit=False, *args, **kwargs)

        if changes:
            # Create activity record for the update
            activity = ActivityModel(
                user_id=user.id,
                target_id=self.id,
                target_model=self.__class__.__tablename__,
                type=ActivityType.updated,
                changes=changes,
            )

            external_username = kwargs.get("external_username")
            if external_username:
                activity.external_username = external_username

            db.add(activity)

        if commit:
            db.commit()
            db.refresh(instance)

        return instance

    def comment(
        self, db: Session, user, content, commit: Optional[bool] = True, *args, **kwargs
    ):
        ActivityModel, ActivityType = self._get_activity_model()
        activity = ActivityModel(
            user_id=user.id,
            content=content,
            target_id=self.id,
            target_model=self.__class__.__name__,
            type=ActivityType.commented,
        )
        if kwargs.get("external_username"):
            activity.external_username = kwargs.get("external_username")

        db.add(activity)
        if commit:
            db.commit()

        return activity
