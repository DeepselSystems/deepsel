from pydantic import BaseModel as PydanticModel
from sqlalchemy import Table, inspect, text
from sqlalchemy.orm import Session
from deepsel.utils.models_pool import models_pool
from typing import Any


class AffectedRecord(PydanticModel):
    record: Any
    affected_field: str

    def __hash__(self):
        return hash((self.record.id, self.affected_field))

    def __eq__(self, other):
        if not isinstance(other, AffectedRecord):
            return False
        return (
            self.record.id == other.record.id
            and self.affected_field == other.affected_field
        )


class AffectedRecordResult(PydanticModel):
    to_delete: dict[str, set[AffectedRecord]]  # dict keys are table names
    to_set_null: dict[str, set[AffectedRecord]]  # dict keys are table names


def get_delete_cascade_records_recursively(
    db: Session,
    records: list[Any],
    affected_records: AffectedRecordResult = None,
    declarative_base=None,
) -> AffectedRecordResult:
    if affected_records is None:
        affected_records = AffectedRecordResult(to_delete={}, to_set_null={})

    if len(records) == 0:
        return affected_records

    engine = db.bind
    inspector = inspect(engine)
    table_name = records[0].__tablename__
    command = text("""
        SELECT DISTINCT
            conrelid::regclass AS table_name
        FROM
            pg_constraint AS con
        WHERE
            confrelid = :table_name ::regclass;
    """).bindparams(table_name=table_name)
    tables_with_foreign_keys_to_this_table = db.execute(command)
    for row in tables_with_foreign_keys_to_this_table:
        table_name = row[0].replace('"', "")
        ReferringModel = models_pool.get(table_name, None)

        # if this model doesn't have "id" column, skip it
        # it is a junction many2many table
        if not ReferringModel or not hasattr(ReferringModel, "id"):
            continue

        # get a list of foreign key columns that refer to the table being deleted
        referring_foreign_key_constraints = [
            constraint
            for constraint in inspector.get_foreign_keys(table_name)
            if constraint["referred_table"] == records[0].__tablename__
        ]
        referring_foreign_key_columns = [
            column
            for constraint in referring_foreign_key_constraints
            for column in constraint["constrained_columns"]
        ]
        # get list of not null columns, so we can decide whether to delete or set to null
        # if the column is not nullable, we will need to delete the referring records
        if declarative_base is not None:
            referring_table = Table(
                table_name, declarative_base.metadata, autoload_with=engine
            )
        else:
            referring_table = Table(table_name, autoload_with=engine)
        not_null_columns = [
            column.name for column in referring_table.columns if not column.nullable
        ]

        # now from the foreign key columns, get all records that refer to the records being deleted
        for column in referring_foreign_key_columns:
            referring_records = (
                db.query(ReferringModel)
                .filter(
                    getattr(ReferringModel, column).in_([rec.id for rec in records])
                )
                .all()
            )

            if not referring_records:
                continue

            referring_records_results: list[AffectedRecord] = [
                AffectedRecord(record=rec, affected_field=column)
                for rec in referring_records
            ]

            # add to result's to_delete list
            if column in not_null_columns:
                if table_name not in affected_records.to_delete:
                    affected_records.to_delete[table_name] = set()
                affected_records.to_delete[table_name].update(referring_records_results)

                # recursively get records that refer to the records being deleted
                get_delete_cascade_records_recursively(
                    db,
                    referring_records,
                    affected_records,
                    declarative_base,
                )

            # add to result's to_set_null list
            else:
                if table_name not in affected_records.to_set_null:
                    affected_records.to_set_null[table_name] = set()
                affected_records.to_set_null[table_name].update(
                    referring_records_results
                )

    return affected_records
