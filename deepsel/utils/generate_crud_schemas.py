import random
import string
from typing import Optional
from uuid import UUID
from pydantic import BaseModel as PydanticModel
from pydantic import create_model, ConfigDict
from deepsel.orm.types import CRUDSchema
from deepsel.utils.get_relationships import get_relationships, FieldInfo
from deepsel.utils.models_pool import models_pool


def random_string() -> str:
    return "".join(
        random.choices(string.ascii_lowercase + string.digits, k=16)  # nosec B311
    )


def generate_create_schema(
    model, model_names_tree: [str] = [], exclude: [str] = None
) -> [PydanticModel]:
    schema_name = model.__name__.replace("Model", "Create") + "-" + random_string()
    # exclude technical fields
    technical_fields = [
        "id",
        "string_id",
        "owner_id",
        "created_at",
        "updated_at",
        # "organization_id",
        "hashed_password",
        "secret_key_2fa",
        "recovery_codes",
    ]

    if exclude is None:
        exclude = technical_fields
    else:
        exclude += technical_fields

    fields = _get_fields(
        model,
        exclude=exclude,
    )
    # we need to prevent infinite recursion
    # by recording the model names we have already visited
    # and not expanding them again
    new_tree = model_names_tree.copy()
    if model.__name__ not in model_names_tree:
        new_tree += [model.__name__]

    relationships_info = get_relationships(model)
    relationships_class_map = _get_relationships_class_map(model)

    # we allow to create linking many2many records by passing the id
    for rel in relationships_info.many2many:
        related_model = relationships_class_map[rel.name]
        linked_record_schema = create_model(
            related_model.__name__.replace("Model", "Read") + "-" + random_string(),
            id=(int, ...),
        )
        # Include an array of the ReadSchema for the related model
        fields[rel.name] = (Optional[list[linked_record_schema]], [])

    # allow creation of one2many records by passing their create schema
    for rel in relationships_info.one2many:
        related_model = relationships_class_map[rel.name]
        if rel.class_name in new_tree:
            # model already exists in the tree, we need to prevent infinite recursion
            # do not expand this particular relationship into detail
            # just an unspecified array so that records can still be created
            fields[rel.name] = (Optional[list[dict]], [])
        else:
            parent_key_field: FieldInfo = rel.foreign_key_field
            # Include an array of the CreateSchema for the related model
            create_record_schema = generate_create_schema(
                related_model, new_tree, exclude=[parent_key_field.name]
            )

            # it may include the id, if it is an existing record
            class RelatedCreateSchema(create_record_schema):
                id: Optional[int] = None

            fields[rel.name] = (Optional[list[RelatedCreateSchema]], [])

    return create_model(schema_name, **fields)


def generate_read_schema(model, model_names_tree: [str] = []) -> [PydanticModel]:
    # we need unique name for each schema model, if we have multiple read schemas for the same model
    # fastapi will throw error about duplicate models
    schema_name = model.__name__.replace("Model", "Read") + "-" + random_string()
    # exclude technical fields
    fields = _get_fields(
        model, exclude=["hashed_password", "secret_key_2fa", "recovery_codes"]
    )

    # we need to prevent infinite recursion
    # by recording the model names we have already visited
    # and not expanding them again
    new_tree = model_names_tree.copy()
    if model.__name__ not in model_names_tree:
        new_tree += [model.__name__]

    relationships_info = get_relationships(model)
    relationships_class_map = _get_relationships_class_map(model)

    for rel in relationships_info.many2one:
        if rel.class_name in new_tree:
            # model exists in the tree, we need to prevent infinite recursion
            # do not expand this particular relationship
            continue
        new_tree += [model.__name__]

        read_schema = generate_read_schema(relationships_class_map[rel.name], new_tree)
        fields[rel.name] = (Optional[read_schema], None)

    for rel in relationships_info.one2many:
        if rel.class_name in new_tree:
            # model exists in the tree, we need to prevent infinite recursion
            # do not expand this particular relationship
            continue
        new_tree += [model.__name__]

        read_schema = generate_read_schema(relationships_class_map[rel.name], new_tree)
        fields[rel.name] = (list[read_schema], None)

    for rel in relationships_info.many2many:
        if rel.class_name in new_tree:
            # model exists in the tree, we need to prevent infinite recursion
            # do not expand this particular relationship
            continue
        new_tree += [model.__name__]

        read_schema = generate_read_schema(relationships_class_map[rel.name], new_tree)
        fields[rel.name] = (list[read_schema], None)

    return create_model(
        schema_name, **fields, __config__=ConfigDict(from_attributes=True)
    )


def generate_search_schema(
    model, read_schema: [PydanticModel] = None
) -> [PydanticModel]:
    schema_name = model.__name__.replace("Model", "Search") + "-" + random_string()
    if not read_schema:
        read_schema = generate_read_schema(model)

    schema = create_model(
        schema_name,
        total=(int, ...),
        data=(list[read_schema], ...),
        __config__=ConfigDict(from_attributes=True),
    )
    return schema


def generate_update_schema(model, model_names_tree: [str] = []) -> [PydanticModel]:
    schema_name = model.__name__.replace("Model", "Update") + "-" + random_string()
    # exclude id and owner_id
    fields = _get_fields(
        model,
        exclude=[
            "id",
            "owner_id",
            "created_at",
            "updated_at",
            "organization_id",
            "hashed_password",
            "secret_key_2fa",
            "recovery_codes",
        ],
    )

    relationships_info = get_relationships(model)
    relationships_class_map = _get_relationships_class_map(model)

    # we allow to update many2many links by passing the id
    for rel in relationships_info.many2many:
        related_model = relationships_class_map[rel.name]
        linked_record_schema = create_model(
            related_model.__name__.replace("Model", "Read") + "-" + random_string(),
            id=(int, ...),
        )
        # Include an array of the ReadSchema for the related model
        fields[rel.name] = (Optional[list[linked_record_schema]], None)

    # Include one2many records similar to create schema
    new_tree = model_names_tree.copy()
    if model.__name__ not in model_names_tree:
        new_tree += [model.__name__]

    for rel in relationships_info.one2many:
        related_model = relationships_class_map[rel.name]
        if rel.class_name in new_tree:
            # model already exists in the tree, prevent infinite recursion
            fields[rel.name] = (Optional[list[dict]], None)
        else:
            new_tree += [rel.class_name]
            create_record_schema = generate_create_schema(
                related_model, new_tree, exclude=[rel.foreign_key_field.name]
            )

            # it may include the id, if it is an existing record
            class RelatedCreateSchema(create_record_schema):
                id: Optional[int] = None

            fields[rel.name] = (Optional[list[RelatedCreateSchema]], None)

    return create_model(schema_name, **fields)


def _get_fields(model, exclude: [str] = None) -> dict:
    fields = {}

    for column in model.__table__.columns:
        if exclude and column.name in exclude:
            continue

        col_type = column.type.python_type
        is_foreign_key = column.foreign_keys
        if is_foreign_key:
            # can be UUID, int or string (so we can pass string_id)
            col_type = int | str | UUID

        if (
            column.nullable or column.name == "organization_id"
        ):  # organization_id will be set by the system, so optional
            col_type = Optional[col_type]
            default = None
        else:
            default = ...

        # json type can be both object and list
        if str(column.type) == "JSON":
            if column.nullable:
                col_type = Optional[dict | list]
            else:
                col_type = dict | list

        fields[column.name] = (col_type, default)

    return fields


def _get_relationships_class_map(model) -> dict:
    relationships = {}

    for relationship in model.__mapper__.relationships:
        relationships[relationship.key] = relationship.mapper.class_

    return relationships


def generate_CRUD_schemas(table_name: str) -> CRUDSchema:
    model = models_pool[table_name]
    create_schema = generate_create_schema(model)
    read_schema = generate_read_schema(model)
    update_schema = generate_update_schema(model)
    search_schema = generate_search_schema(model, read_schema)

    return CRUDSchema(
        Create=create_schema,
        Read=read_schema,
        Update=update_schema,
        Search=search_schema,
    )
