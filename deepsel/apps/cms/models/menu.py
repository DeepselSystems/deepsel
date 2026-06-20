from sqlalchemy import Column, Integer, ForeignKey, Boolean, JSON
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from sqlalchemy.orm import relationship, Session
from typing import Optional
from deepsel.orm import (
    PAGINATION,
    SearchQuery,
    OrderByCriteria,
)
import logging

logger = logging.getLogger(__name__)


class MenuModel(Base, BaseModel):
    __tablename__ = "menu"

    id = Column(Integer, primary_key=True)
    position = Column(Integer, default=0)
    translations = Column(JSON, default=dict)
    open_in_new_tab = Column(Boolean, default=False)

    # Self-referential relationship for parent-child structure
    parent_id = Column(Integer, ForeignKey("menu.id"), nullable=True)
    children = relationship(
        "MenuModel",
        back_populates="parent",
        cascade="all, delete-orphan",
        lazy="joined",
        foreign_keys=[parent_id],
    )
    parent = relationship("MenuModel", back_populates="children", remote_side=[id])

    @classmethod
    def get_one(cls, db: Session, user, item_id: int, *args, **kwargs):
        res = db.query(cls).get(item_id)
        return res

    @classmethod
    def search(
        cls,
        db: Session,
        user,
        pagination: PAGINATION,
        search: Optional[SearchQuery] = None,
        order_by: Optional[OrderByCriteria] = None,
        *args,
        **kwargs,
    ):
        # Default ordering by position
        if order_by is None:
            order_by = OrderByCriteria(field="position", direction="asc")

        return super().search(db, user, pagination, search, order_by, *args, **kwargs)
