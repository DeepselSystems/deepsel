from deepsel.utils.get_field_info import get_field_info, FieldInfo
from deepsel.utils.get_relationships import (
    get_relationships,
    RelationshipInfoResult,
    RelationshipInfo,
)
from deepsel.utils.models_pool import models_pool
from sqlalchemy.ext.declarative import DeclarativeMeta
from pydantic import BaseModel as PydanticModel


class ClassInfo(PydanticModel):
    name: str
    table_name: str
    fields: dict[str, "FieldInfoExpanded"] = {}
    relationships: RelationshipInfoResult = None


class FieldInfoExpanded(FieldInfo):
    related_class_info: ClassInfo = None
    is_parent_id: bool = False


def get_class_info(
    cls: [DeclarativeMeta],
    processed_classes: dict[str, ClassInfo | dict] = None,
    include_fields: bool = True,
    include_relationships: bool = True,
    parent_model_name: str = None,
    exclude_fields: list[str] = None,
) -> ClassInfo:
    if processed_classes is None:
        processed_classes = {}
    if exclude_fields is None:
        exclude_fields = []

    class_name = cls.__name__
    if class_name in processed_classes:
        return processed_classes[class_name]
    processed_classes[class_name] = {}
    model_name = cls.__tablename__
    data = ClassInfo(name=cls.__name__, table_name=model_name)

    if include_fields:
        data.fields = {
            f.key: FieldInfoExpanded(**get_field_info(f).dict())
            for f in cls.__table__.columns
            if f.key not in exclude_fields
        }
        # loop through foreign keys (many2one) and expand their class info recursively
        for field in data.fields.values():
            if field.is_foreign_key:
                related_table = field.related_table
                related_class = models_pool[related_table]
                related_class_info = get_class_info(
                    related_class,
                    processed_classes,
                    include_fields=False,  # do not expand fields further than one level
                    exclude_fields=exclude_fields,
                )
                data.fields[field.name].related_class_info = related_class_info

                # if the related class has one2many relationship with this class, mark this foreign key as parent id
                if (
                    hasattr(related_class_info, "relationships")
                    and related_class_info.relationships
                ):
                    if model_name in map(
                        lambda x: x.table_name,
                        related_class_info.relationships.one2many,
                    ):
                        data.fields[field.name].is_parent_id = True

                # if parent_model_name matches the related table, mark this foreign key as parent id
                if parent_model_name == related_table:
                    data.fields[field.name].is_parent_id = True

    if include_relationships:
        data.relationships = get_relationships(cls)
        # loop through one2many relationships and expand their class info
        for relationship in data.relationships.one2many:
            related_table = relationship.table_name
            related_class = models_pool[related_table]
            related_class_info = get_class_info(
                related_class,
                processed_classes,
                include_relationships=False,  # do not expand relationships further than one level
                parent_model_name=model_name,
                exclude_fields=exclude_fields,
            )
            relationship.related_class_info = related_class_info

    processed_classes.update({class_name: data})

    return data
