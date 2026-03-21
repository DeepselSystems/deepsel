from sqlalchemy.orm.query import Query as SQLAlchemyQuery
from deepsel.utils.models_pool import models_pool


class Query(SQLAlchemyQuery):
    def _set_entities(self, entities) -> None:
        chained_entities = [
            (
                models_pool.get(entity.__tablename__, entity)
                if hasattr(entity, "__tablename__")
                else entity
            )
            for entity in entities
        ]
        super()._set_entities(chained_entities)
