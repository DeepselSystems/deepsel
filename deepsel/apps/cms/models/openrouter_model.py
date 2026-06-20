from sqlalchemy import Column, Integer, String, JSON, Text
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
import requests
from sqlalchemy.orm import Session


class OpenRouterModelModel(Base, BaseModel):
    __tablename__ = "openrouter_model"

    id = Column(Integer, primary_key=True)
    canonical_slug = Column(String, nullable=False)
    hugging_face_id = Column(String)
    name = Column(String, nullable=False)
    description = Column(Text)
    context_length = Column(Integer)
    created = Column(Integer)  # Unix timestamp from API

    # Architecture
    architecture = Column(JSON)  # Store full architecture object

    # Pricing
    pricing = Column(JSON)  # Store full pricing object

    # Top provider info
    top_provider = Column(JSON)  # Store full top_provider object

    # Per request limits
    per_request_limits = Column(JSON)  # Can be null

    # Supported parameters
    supported_parameters = Column(JSON)  # Array of supported parameters

    def cron_fetch_openrouter_model(self, db: Session):
        cls = self if isinstance(self, type) else self.__class__
        url = "https://openrouter.ai/api/v1/models"

        try:
            response = requests.get(url, timeout=30)
            data = response.json().get("data", [])

            for model_data in data:
                model = cls(
                    string_id=model_data.get("id"),
                    canonical_slug=model_data.get("canonical_slug"),
                    hugging_face_id=model_data.get("hugging_face_id"),
                    name=model_data.get("name"),
                    description=model_data.get("description"),
                    context_length=model_data.get("context_length"),
                    created=model_data.get("created"),
                    architecture=model_data.get("architecture"),
                    pricing=model_data.get("pricing"),
                    top_provider=model_data.get("top_provider"),
                    per_request_limits=model_data.get("per_request_limits"),
                    supported_parameters=model_data.get("supported_parameters"),
                    organization_id="1",
                )

                existing = (
                    db.query(cls).filter(cls.string_id == model.string_id).first()
                )
                if existing:
                    # Map API data to model fields, handling id -> string_id mapping
                    for key, value in model_data.items():
                        if key == "id":
                            # API's "id" field maps to our "string_id" field
                            setattr(existing, "string_id", value)
                        elif hasattr(existing, key) and key != "id":
                            # Set other fields, but skip "id" to avoid overwriting primary key
                            setattr(existing, key, value)
                else:
                    db.add(model)

            db.commit()

        except Exception as e:
            db.rollback()
            raise e
