from sqlalchemy import Column, Integer, String
from deepsel.orm.mixin import ORMBaseMixin


def create_example_item_model(base):
    class ExampleItem(base, ORMBaseMixin):
        __tablename__ = "example_item"
        id = Column(Integer, primary_key=True, autoincrement=True)
        name = Column(String(200))
        description = Column(String(500), nullable=True)

    return ExampleItem
