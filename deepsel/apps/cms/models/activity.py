import logging
from datetime import datetime, UTC
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Integer,
    String,
    ForeignKey,
    JSON,
)
from sqlalchemy.orm import relationship
from deepsel.deps import Base
from deepsel.orm import ORMBaseMixin
from deepsel.apps.cms.types.activity import ActivityType

logger = logging.getLogger(__name__)


class ActivityModel(Base, ORMBaseMixin):
    __tablename__ = "activity"

    id = Column(Integer, primary_key=True)
    type = Column(Enum(ActivityType))
    is_internal = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda x: datetime.now(UTC))

    user_id = Column(Integer, ForeignKey("user.id"))
    user = relationship("UserModel")
    external_username = Column(String)

    content = Column(String)
    changes = Column(JSON)

    target_id = Column(Integer)
    target_model = Column(String)
