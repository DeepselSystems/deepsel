from deepsel.utils.text_cases import (
    pascal_to_snake,
    snake_to_camel,
    snake_to_pascal,
    snake_to_capitalized,
)
from deepsel.utils.get_field_info import get_field_info, FieldInfo
from sqlalchemy.ext.declarative import DeclarativeMeta
from pydantic import BaseModel as PydanticModel
from deepsel.utils.models_pool import models_pool
from typing import Any, Optional

technical_relationships = [
    "organization",
]


class RelationshipInfo(PydanticModel):
    name: str
    camel_name: str
    pascal_name: str
    human_name: str
    type: str
    table_name: str
    class_name: str
    foreign_key_field: Optional[FieldInfo] = None
    secondary: Optional[str] = None
    back_populates: Optional[str] = None
    related_class_info: Optional[Any] = None


class RelationshipInfoResult(PydanticModel):
    one2many: list[RelationshipInfo] = []
    many2many: list[RelationshipInfo] = []
    many2one: list[RelationshipInfo] = []


def get_relationships(cls: [DeclarativeMeta]) -> RelationshipInfoResult:
    result = RelationshipInfoResult()
    fields: dict[str:FieldInfo] = {
        m.key: get_field_info(m) for m in cls.__table__.columns
    }
    foreign_key_fields: list[FieldInfo] = [
        field for field in fields.values() if field.is_foreign_key
    ]
    foreign_key_models: list[str] = [
        field.related_table for field in foreign_key_fields
    ]

    for name, value in vars(cls).items():
        if name in technical_relationships:
            continue
        if (
            hasattr(value, "prop")
            and hasattr(value.prop, "argument")
            and value.prop.argument
        ):
            model_value = value.prop.argument
            # check if string or lambda func, otherwise it is a relationship from backref which we dont support
            if not isinstance(model_value, str) and not callable(model_value):
                continue

            if isinstance(model_value, str):  # is string name of a model class
                table_name = value.prop.entity.local_table.name
                model_class = models_pool[table_name]
                model_class_name = model_class.__name__
            else:  # is a lambda function, lets call it
                model_class = model_value()
                table_name = model_class.__table__.name
                model_class_name = model_class.__name__

            if value.prop._init_args.secondary.argument:
                # secondary table is defined, this is a many2many relationship
                rel_info = RelationshipInfo(
                    name=name,
                    camel_name=snake_to_camel(name),
                    pascal_name=snake_to_pascal(name),
                    human_name=snake_to_capitalized(name),
                    type="many2many",
                    table_name=table_name,
                    class_name=model_class_name,
                    secondary=value.prop._init_args.secondary.argument,
                    back_populates=value.prop.back_populates,
                )

                result.many2many.append(rel_info)

            # check if there is a foreign key field with the same model name
            elif table_name in foreign_key_models:
                #  this is a many2one relationship
                foreign_key_field: FieldInfo = [
                    field
                    for field in foreign_key_fields
                    if field.related_table == table_name
                ][0]
                rel_info = RelationshipInfo(
                    name=name,
                    camel_name=snake_to_camel(name),
                    pascal_name=snake_to_pascal(name),
                    human_name=snake_to_capitalized(name),
                    type="many2one",
                    table_name=table_name,
                    class_name=model_class_name,
                    foreign_key_field=foreign_key_field,
                )

                result.many2one.append(rel_info)
            else:
                # most likely this is a one2many relationship
                parent_key_field: FieldInfo = get_one2many_parent_id(
                    model_class, cls.__table__.name
                )
                rel_info = RelationshipInfo(
                    name=name,
                    camel_name=snake_to_camel(name),
                    pascal_name=snake_to_pascal(name),
                    human_name=snake_to_capitalized(name),
                    type="one2many",
                    table_name=table_name,
                    class_name=model_class_name,
                    foreign_key_field=parent_key_field,
                    back_populates=value.prop.back_populates,
                )

                result.one2many.append(rel_info)
    return result


def get_one2many_parent_id(
    child_model_class: [DeclarativeMeta], parent_table_name: str
) -> FieldInfo | None:
    for column in child_model_class.__table__.columns:
        col_info = get_field_info(column)
        if col_info.is_foreign_key:
            if col_info.related_table == parent_table_name:
                return col_info
    return None
