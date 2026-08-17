from sqlalchemy import Column, Integer, String

from deepsel.deps import Base
from deepsel.orm import ORMBaseMixin


# Models are plain module-level classes with a `__tablename__` — that is what
# scan_and_register_models() picks up and registers in models_pool.
# `Base` comes from deepsel.deps, configured by the consumer's configure_deps().
class ExampleItemModel(Base, ORMBaseMixin):
    __tablename__ = "example_item"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200))
    description = Column(String(500), nullable=True)
