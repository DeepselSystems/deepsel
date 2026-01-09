import logging
from sqlalchemy import Enum, Table, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session
from db import Base, get_db_context
from deepsel.utils.models_pool import models_pool
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)


def reflect_database_schema(db: Session):
    engine = db.bind
    inspector = inspect(engine)
    existing_schema = {}
    for table_name in inspector.get_table_names():
        existing_schema[table_name] = {
            col["name"]: col for col in inspector.get_columns(table_name)
        }
    return existing_schema


def update_table_schema(
    db: Session,
    model_table: Table,
    existing_table_schema: dict,
    connection: Connection,
    deferred_foreign_keys=None,
):
    if deferred_foreign_keys is None:
        deferred_foreign_keys = []
    model_columns = {c.name: c for c in model_table.columns}
    existing_columns = existing_table_schema
    engine = db.bind
    inspector = inspect(engine)

    unique_constraints = inspector.get_unique_constraints(model_table.name)
    indexes = [
        index
        for index in inspector.get_indexes(model_table.name)
        if not index["unique"]
    ]
    enums = inspector.get_enums()
    foreign_key_constraints = inspector.get_foreign_keys(model_table.name)
    existing_foreign_keys = [
        column
        for constraint in foreign_key_constraints
        for column in constraint["constrained_columns"]
    ]

    # Modify primary key
    existing_pk_constraint = inspector.get_pk_constraint(model_table.name)
    existing_primary_keys = existing_pk_constraint["constrained_columns"] or []
    model_primary_keys = [col.name for col in model_table.primary_key.columns]
    is_composite_primary_key = len(model_primary_keys) > 1
    is_existing_pk_removed = False
    if existing_primary_keys != model_primary_keys:
        if existing_primary_keys:
            # Remove primary key constraint, it will be added back later.
            command = text(
                f'ALTER TABLE "{model_table.name}" DROP CONSTRAINT {existing_pk_constraint["name"]};'
            )
            connection.execute(command)
            is_existing_pk_removed = True

    # Modify existing columns
    for col_name, existing_column in existing_columns.items():
        if col_name in model_columns:
            model_column = model_columns[col_name]
            changes = []
            nullable = model_column.nullable
            has_unique_constraint = None
            has_index = None

            for constraint in unique_constraints:
                if col_name == constraint["column_names"][0]:
                    has_unique_constraint = True

            for index in indexes:
                if col_name in index["column_names"]:
                    has_index = True

            # Check for change in foreign key
            if model_column.foreign_keys:
                # this column is now a foreign key
                # check if foreign key exists
                if col_name not in existing_foreign_keys:
                    for foreign_key in model_column.foreign_keys:
                        deferred_foreign_keys.append(
                            {
                                "table": model_table.name,
                                "column": col_name,
                                "foreign_key": foreign_key,
                            }
                        )
                else:
                    # check if foreign key has changed
                    foreign_key = None
                    for fk in model_column.foreign_keys:
                        foreign_key = fk

                    existing_foreign_key_constraint = [
                        constraint
                        for constraint in foreign_key_constraints
                        if col_name in constraint["constrained_columns"]
                    ][0]
                    existing_referred_table = existing_foreign_key_constraint[
                        "referred_table"
                    ]
                    existing_referred_column = existing_foreign_key_constraint[
                        "referred_columns"
                    ][0]
                    new_referred_table = foreign_key.column.table.name
                    new_referred_column = foreign_key.column.name
                    if (
                        existing_referred_table != new_referred_table
                        or existing_referred_column != new_referred_column
                    ):
                        # drop the existing foreign key
                        command = text(
                            f'ALTER TABLE "{model_table.name}" DROP CONSTRAINT {existing_foreign_key_constraint["name"]};'
                        )
                        logger.info(
                            f'Removing foreign key for column "{col_name}" in table "{model_table.name}"... {command}'
                        )
                        connection.execute(command)
                        # add the new foreign key
                        command = text(
                            f'ALTER TABLE "{model_table.name}" ADD FOREIGN KEY ("{col_name}") REFERENCES "{new_referred_table}" ("{new_referred_column}");'
                        )
                        logger.info(
                            f'Adding foreign key for column "{col_name}" in table "{model_table.name}"... {command}'
                        )
                        connection.execute(command)
            else:
                if col_name in existing_foreign_keys:
                    # column is no longer a foreign key but was has an existing foreign key constraint in db
                    # remove foreign key
                    foreign_key_constraint_name = [
                        constraint["name"]
                        for constraint in foreign_key_constraints
                        if col_name in constraint["constrained_columns"]
                    ][0]
                    command = text(
                        f'ALTER TABLE "{model_table.name}" DROP CONSTRAINT {foreign_key_constraint_name};'
                    )
                    logger.info(
                        f'Removing foreign key for column "{col_name}" in table "{model_table.name}"... {command}'
                    )
                    connection.execute(command)

            # Check for change in type
            old_type = existing_column["type"].compile(engine.dialect)
            new_type = model_column.type.compile(engine.dialect)

            # if model_column.type.Comparator != existing_column['type'].Comparator:
            if old_type != new_type:
                # handle special case of Float
                if old_type == "DOUBLE PRECISION" and new_type == "FLOAT":
                    # this is actually the same type
                    pass
                # # handle enum case
                # elif hasattr(model_column.type, 'enums'):
                #     changes.append("ENUM")
                else:
                    changes.append("TYPE")
            # Check for change in nullable
            if model_column.nullable != existing_column.get("nullable", True):
                changes.append("NULLABLE")
            # Check for change in unique
            if model_column.unique != has_unique_constraint:
                changes.append("UNIQUE")
            # Check for change in index
            if model_column.index != has_index:
                changes.append("INDEX")
            # Check for change in enum values
            if hasattr(model_column.type, "enums") and isinstance(
                existing_column["type"], Enum
            ):
                if model_column.type.enums != existing_column["type"].enums:
                    changes.append("ENUM")

            # Defaults are handled bySQLAlchemy, so we don't need to check for changes

            if "TYPE" in changes:
                if not nullable and model_column.default is None:
                    logger.info(
                        f'Column "{col_name}" in table "{model_table.name}" has nullable=False, and cannot change type without a default value.'
                    )
                else:
                    # drop the column, it will be added back later
                    logger.info(
                        f'Column "{col_name}" in table "{model_table.name}" has changed type, dropping old column...',
                    )
                    command = text(
                        f'ALTER TABLE "{model_table.name}" DROP COLUMN "{col_name}";'
                    )
                    connection.execute(command)
                    # mark it as dropped
                    existing_columns[col_name]["dropped"] = True
                    # skip the rest of the loop, as the column will be added back later
                    continue

            if "NULLABLE" in changes:
                if not model_column.nullable:
                    # check if default is provided
                    if model_column.default is None:
                        # if not, attempt anyway, but it may fail in the case that the column has existing NULL values
                        # if failed, log a warning
                        try:
                            command = text(
                                f'ALTER TABLE "{model_table.name}" ALTER COLUMN "{col_name}" SET NOT NULL;'
                            )
                            logger.info(
                                f'Column "{col_name}" in table "{model_table.name}" has changed to NOT NULL without default value, attempting... {command}'
                            )
                            connection.execute(command)
                        except Exception as e:
                            logger.warning(
                                f'Column "{col_name}" in table "{model_table.name}" cannot be set to NOT NULL without a default value.'
                            )
                            logger.debug(e)
                    else:
                        # if yes, set default to the provided value
                        if isinstance(model_column.default.arg, str):
                            default = f"'{model_column.default.arg}'"
                        # if enum
                        elif hasattr(model_column.type, "enums") and hasattr(
                            model_column.default.arg, "name"
                        ):
                            default = f"'{model_column.default.arg.name}'"
                        else:
                            default = model_column.default.arg

                        command = text(
                            f"""
                            ALTER TABLE "{model_table.name}"
                            ALTER COLUMN "{col_name}" TYPE {model_column.type.compile(engine.dialect)} USING (COALESCE("{col_name}", {default})),
                            ALTER COLUMN "{col_name}" SET DEFAULT {default},
                            ALTER COLUMN "{col_name}" SET NOT NULL;
                            """
                        )
                        logger.info(
                            f'Column "{col_name}" in table "{model_table.name}" has changed to NOT NULL, setting default value... {command}'
                        )
                        connection.execute(command)
                else:
                    command = text(
                        f'ALTER TABLE "{model_table.name}" ALTER COLUMN "{col_name}" DROP NOT NULL;'
                    )
                    logger.info(
                        f'Column "{col_name}" in table "{model_table.name}" has changed to NULL, dropping NOT NULL... {command}'
                    )
                    connection.execute(command)

            if "UNIQUE" in changes:
                _update_existing_column_unique_constraints(
                    model_table,
                    unique_constraints,
                    connection,
                    model_columns,
                    col_name,
                    model_column,
                )

            if "INDEX" in changes:
                if model_column.index:
                    command = text(
                        f'CREATE INDEX {model_table.name}_{col_name}_index ON {model_table.name} ("{col_name}");'
                    )
                    logger.info(
                        f'Column "{col_name}" in table "{model_table.name}" has added index, adding... {command}'
                    )
                    connection.execute(command)
                else:
                    command = text(f"DROP INDEX {model_table.name}_{col_name}_index;")
                    logger.info(
                        f'Column "{col_name}" in table "{model_table.name}" has dropped index, dropping... {command}'
                    )
                    connection.execute(command)

            if "ENUM" in changes:
                # update enum values
                existing_enum_type = existing_column["type"].compile(engine.dialect)
                command = ""
                for value in model_column.type.enums:
                    if value not in existing_column["type"].enums:
                        command += (
                            f"ALTER TYPE {existing_enum_type} ADD VALUE '{value}';"
                        )
                if command:
                    logger.info(
                        f'Updating enum type for column "{col_name}" in table "{model_table.name}": {command}'
                    )
                    connection.execute(text(command))
                # update enum type name
                if existing_enum_type != model_column.type.compile(engine.dialect):
                    # rename the type
                    command = text(
                        f"ALTER TYPE {existing_enum_type} RENAME TO {model_column.type.compile(engine.dialect)};"
                    )
                    logger.info(
                        f'Renaming enum type for column "{col_name}" in table "{model_table.name}": {command}'
                    )
                    connection.execute(command)

    # Add new columns
    new_columns = []
    for col_name, model_column in model_columns.items():
        if col_name not in existing_columns or existing_columns[col_name].get(
            "dropped", False
        ):
            col_type = model_column.type.compile(engine.dialect)
            nullable = "NULL" if model_column.nullable else "NOT NULL"
            unique = "UNIQUE" if model_column.unique else ""
            default = ""
            autoincrement = ""
            # If there is a composite primary key, do not add a primary key to a single column.
            if not is_composite_primary_key:
                col_type = (
                    "SERIAL PRIMARY KEY"
                    if model_column.primary_key and col_type == "INTEGER"
                    else col_type
                )

            is_enum = hasattr(model_column.type, "enums")
            if is_enum:
                # check if enum type exists
                if col_type not in [enum["name"] for enum in enums]:
                    # create enum type
                    command = text(
                        f"CREATE TYPE {col_type} AS ENUM {tuple(model_column.type.enums)};"
                    )
                    logger.info(
                        f'Creating enum type for column "{col_name}" in table "{model_table.name}": {command}'
                    )
                    connection.execute(command)
                    # update the enum list
                    enums.append({"name": col_type, "labels": model_column.type.enums})
                else:
                    # update enum values
                    command = ""
                    existing_enum_type = [
                        enum for enum in enums if enum["name"] == col_type
                    ][0]
                    existing_enum_values = existing_enum_type["labels"]
                    for value in model_column.type.enums:
                        if value not in existing_enum_values:
                            command += f"ALTER TYPE {col_type} ADD VALUE '{value}';"
                    if command:
                        logger.info(
                            f'Updating enum type for column "{col_name}" in table "{model_table.name}": {command}'
                        )
                        connection.execute(text(command))

            if model_column.default is not None:
                default_val_type = type(model_column.default.arg)
                if default_val_type == str:
                    default = f"DEFAULT '{model_column.default.arg}'"
                elif (
                    default_val_type == int
                    or default_val_type == float
                    or default_val_type == bool
                ):
                    default = f"DEFAULT {model_column.default.arg}"
                elif is_enum:
                    default = f"DEFAULT '{model_column.default.arg.name}'"
                # case json column, default value is a dict or list
                elif default_val_type == dict or default_val_type == list:
                    default = f"DEFAULT '{model_column.default.arg}'"
                else:
                    # disregard functions like now(), these are handled by SQLAlchemy, not db level
                    pass

            # for BIGINT primary keys, autoincrement is not automatically handled by Postgres
            if model_column.primary_key and col_type == "BIGINT":
                autoincrement = "GENERATED ALWAYS AS IDENTITY"
                # when using GENERATED ALWAYS AS IDENTITY,
                # Postgres automatically assigns nullable, and we must not specify NULL or NOT NULL explicitly.
                nullable = ""

            command = text(
                f'ALTER TABLE "{model_table.name}" ADD COLUMN "{col_name}" {col_type} {nullable} {unique} {default} {autoincrement};'
            )
            logger.info(
                f'Adding column "{col_name}" to table "{model_table.name}": {command}'
            )
            new_columns.append(col_name)
            connection.execute(command)

            # create index
            if model_column.index:
                command = text(
                    f'CREATE INDEX {model_table.name}_{col_name}_index ON {model_table.name} ("{col_name}");'
                )
                logger.info(
                    f'Adding index for column "{col_name}" in table "{model_table.name}": {command}'
                )
                connection.execute(command)

            # create singular unique constraints
            if model_column.unique and "organization_id" not in model_columns:
                # This condition checks if the column is intended to be unique and if the "organization_id" is not part of the model columns.
                # This indicates that only a single-column unique constraint should be applied.

                single_unique_constraint = f"{model_table.name}_{col_name}_unique"
                command = text(
                    f'ALTER TABLE "{model_table.name}" ADD CONSTRAINT {single_unique_constraint} UNIQUE ("{col_name}");'
                )
                logger.info(
                    f'Adding unique constraint for column "{col_name}" in table "{model_table.name}"... {command}'
                )
                connection.execute(command)

            # create foreign key
            if model_column.foreign_keys:
                for foreign_key in model_column.foreign_keys:
                    deferred_foreign_keys.append(
                        {
                            "table": model_table.name,
                            "column": col_name,
                            "foreign_key": foreign_key,
                        }
                    )

    # Check for composite primary key
    # if primary key removed or not existed yet then create primary key
    # If not a composite case, the primary key is already added when adding a new column (above)
    if is_composite_primary_key and (
        not existing_primary_keys or is_existing_pk_removed
    ):
        key_columns = ", ".join(model_primary_keys)
        command = text(
            f"ALTER TABLE {model_table.name} ADD PRIMARY KEY ({key_columns});"
        )
        logger.info(
            f'Adding composite primary key for columns "{key_columns}" in table "{model_table.name}"... {command}'
        )
        connection.execute(command)

    # create composite unique constraints
    # we wait until all columns are added to create composite unique constraints
    # in case of composite unique constraints eg. (col1, col2), typically organization_id is the col2
    # where we want columns to be unique within the organization
    _create_table_composite_unique_constrains(
        model_table, existing_table_schema, connection, model_columns, new_columns
    )

    # Drop columns not in the model
    for col_name in existing_columns:
        if col_name not in model_columns:
            command = text(
                f'ALTER TABLE "{model_table.name}" DROP COLUMN "{col_name}";'
            )
            logger.info(
                f"Detected removed column {col_name} in table {model_table.name}: {command}",
            )
            connection.execute(command)


def _create_table_composite_unique_constrains(
    model_table, existing_table_schema, connection, model_columns, new_columns
):
    if "organization_id" not in model_columns:
        return
    for col_name, model_column in model_columns.items():
        if col_name == "organization_id":
            continue
        if not model_column.unique:
            continue

        # remove unique constraint
        single_unique_constraint = f"{model_table.name}_{col_name}_unique"
        if single_unique_constraint in existing_table_schema:
            # case composite unique constraint
            command = text(
                f'ALTER TABLE "{model_table.name}" DROP CONSTRAINT {model_table.name}_{col_name}_unique;'
            )
            logger.info(
                f'Column "{col_name}" in table "{model_table.name}" has changed to NOT UNIQUE, dropping unique constraint... {command}'
            )
            connection.execute(command)

        composite_unique_constraint_name = (
            f"{model_table.name}_{col_name}_organization_id_unique"
        )
        if col_name not in new_columns:
            return
        command = text(
            f'ALTER TABLE "{model_table.name}" ADD CONSTRAINT {composite_unique_constraint_name} UNIQUE ("{col_name}", organization_id);'
        )
        logger.info(
            f'Adding composite unique constraint for columns "{col_name}" and "organization_id" in table "{model_table.name}"... {command}'
        )
        connection.execute(command)


def _update_existing_column_unique_constraints(
    model_table: Table,
    existing_unique_constraints: list[dict],
    connection: Connection,
    model_columns: dict,
    col_name: str,
    model_column,
):
    """
    Updates the unique constraints for a specified column in a database table based on the column's current schema definition.

    This function handles both the addition and removal of unique constraints. If the column is intended to be unique and
    it's part of a composite unique key (involving `organization_id`), it adds or removes a composite constraint. Otherwise,
    it manages a single-column unique constraint.
    """

    if model_column.unique:
        # add unique constraint
        if "organization_id" in model_columns:
            # case composite unique constraint
            constraint_name = f"{model_table.name}_{col_name}_organization_id_unique"
            command = text(
                f'ALTER TABLE "{model_table.name}" ADD CONSTRAINT {constraint_name} UNIQUE ("{col_name}", organization_id);'
            )
        else:
            # case single unique constraint
            constraint_name = f"{model_table.name}_{col_name}_unique"
            command = text(
                f'ALTER TABLE "{model_table.name}" ADD CONSTRAINT {constraint_name} UNIQUE ("{col_name}");'
            )

        logger.info(
            f'Column "{col_name}" in table "{model_table.name}" has changed to UNIQUE, attempting to add unique constraint... {command}'
        )
        try:
            connection.execute(command)
        except IntegrityError as e:
            logger.warning(
                f'Column "{col_name}" in table "{model_table.name}" cannot be set to UNIQUE, it may contain duplicate values.'
            )
            message = str(e.orig)
            detail = message.split("DETAIL:  ")[1]
            logger.warning(detail)

    else:
        # remove unique constraint
        for constraint in existing_unique_constraints:
            if col_name in constraint["column_names"]:
                unique_constraint_name = constraint["name"]
                command = text(
                    f'ALTER TABLE "{model_table.name}" DROP CONSTRAINT {unique_constraint_name};'
                )
                logger.info(
                    f'Column "{col_name}" in table "{model_table.name}" has changed to NOT UNIQUE, dropping unique constraint... {command}'
                )
                connection.execute(command)


def compare_and_update_schema(db: Session):
    existing_schema: dict = reflect_database_schema(db)
    model_tables: list[str] = list(models_pool.keys())
    deferred_foreign_keys = (
        []
    )  # this is used to store foreign keys that referenced tables may not yet be created
    engine = db.bind
    with engine.connect() as connection:
        for table_name in model_tables:
            if table_name not in existing_schema:
                command = text(f'CREATE TABLE "{table_name}" ();')
                logger.info(f"Detected new table {table_name}, creating... {command}")
                connection.execute(command)
                connection.commit()
                table: Table = Table(table_name, Base.metadata)
                update_table_schema(db, table, {}, connection, deferred_foreign_keys)
            else:
                # model = models_pool[table_name]
                table: Table = Table(table_name, Base.metadata)
                update_table_schema(
                    db,
                    table,
                    existing_schema[table_name],
                    connection,
                    deferred_foreign_keys,
                )

        for table_name in existing_schema:
            if table_name not in model_tables and table_name != "alembic_version":
                command = text(f'DROP TABLE "{table_name}" CASCADE;')
                logger.info(f"Detected removed table {table_name}: {command}")
                connection.execute(command)

        # create deferred foreign keys
        for foreign_key in deferred_foreign_keys:
            table = foreign_key["table"]
            column = foreign_key["column"]
            referenced_table = foreign_key["foreign_key"].column.table.name
            referenced_column = foreign_key["foreign_key"].column.name
            command = text(
                f'ALTER TABLE "{table}" ADD FOREIGN KEY ("{column}") REFERENCES "{referenced_table}" ("{referenced_column}");'
            )
            logger.info(
                f'Adding foreign key for column "{column}" in table "{table}"... {command}'
            )
            connection.execute(command)

        logger.info("Database schema updated.")
        connection.commit()


def startup_database_update():
    logger.info("Database migration started...")
    try:
        with get_db_context() as db:
            compare_and_update_schema(db)
        logger.info("Database migration completed successfully")
    except Exception as e:
        logger.error(f"Database migration failed: {e}", exc_info=True)
        raise
