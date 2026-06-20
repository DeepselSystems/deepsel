from datetime import datetime
from deepsel.orm import ORMBaseMixin
from fastapi import HTTPException, status
from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Text
from deepsel.apps.cms.utils.form_submission import get_lasted_user_submission
from deepsel.deps import Base
from sqlalchemy.orm import relationship, Session
from deepsel.utils.models_pool import models_pool

UserModel = models_pool["user"]


class FormSubmissionModel(Base, ORMBaseMixin):
    """
    Form submission model that stores user submissions for forms.
    Each submission contains the submitted data, metadata, and tracking information.

    Intentionally extends ORMBaseMixin only (not BaseModel) — no organization_id column.
    Submissions are created by authenticated users or anonymous visitors, not scoped to an
    organization. The owning organization is derived indirectly via the form → form_content
    relationship. :org permission scope therefore fails closed on this model by design.
    """

    __tablename__ = "form_submission"

    id = Column(Integer, primary_key=True)

    # Submission data stored as JSON
    # Contains field_id -> value mappings based on the form's FormFieldModel configuration
    # Structure: {[field_id]: <Object data>}
    submission_data = Column(JSON, nullable=False, default={})

    # Stores historical versions of this submission as an array of snapshots
    # Each snapshot contains: submission_data, submitter_ip, submitter_user_agent, form_content_id,...
    # Structure: [{submission_data: {...}, submitter_ip: "...", submitter_user_agent: "...", form_content_id: 123,...}]
    submission_versions = Column(JSON, nullable=True, default=list)

    # Metadata
    submitter_ip = Column(String(45), nullable=True)  # IPv4/IPv6 address
    submitter_user_agent = Column(Text, nullable=True)  # Browser user agent

    # Relationships
    form_id = Column(Integer, ForeignKey("form.id"), nullable=False)
    form = relationship("FormModel", back_populates="submissions")

    # Reference to the specific form content version used for submission
    form_content_id = Column(Integer, ForeignKey("form_content.id"), nullable=False)
    form_content = relationship("FormContentModel", back_populates="submissions")

    # Optional reference to logged-in user who submitted
    submitter_user_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    submitter_user = relationship("UserModel")

    @classmethod
    def create(cls, db: Session, user: UserModel, values: dict, *args, **kwargs):
        """
        Create a new form submission with validation for form content and submission limits.
        """
        FormContentModel = models_pool["form_content"]
        form_content_id = values.get("form_content_id")
        form_content = (
            db.query(FormContentModel)
            .filter(FormContentModel.id == form_content_id)
            .one_or_none()
        )
        if form_content is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Form content not found",
            )

        # Get latest user submission if enable_edit_submission is True
        latest_user_submission = (
            get_lasted_user_submission(db, user, form_content_id)
            if form_content.enable_edit_submission
            else None
        )

        if latest_user_submission:
            # Backup current record to submission_versions
            current_snapshot = {
                "submission_data": latest_user_submission.submission_data,
                "submitter_ip": latest_user_submission.submitter_ip,
                "submitter_user_agent": latest_user_submission.submitter_user_agent,
                "form_id": latest_user_submission.form_id,
                "form_content_id": latest_user_submission.form_content_id,
                "submitter_user_id": latest_user_submission.submitter_user_id,
                "created_at": (
                    latest_user_submission.created_at.isoformat()
                    if latest_user_submission.created_at
                    else None
                ),
                "updated_at": (
                    latest_user_submission.updated_at.isoformat()
                    if latest_user_submission.updated_at
                    else None
                ),
                "submitted_at": (
                    latest_user_submission.updated_at.isoformat()
                    if latest_user_submission.updated_at
                    else None
                ),
                "timestamp": datetime.utcnow().isoformat(),
            }

            # Initialize submission_versions if None
            if latest_user_submission.submission_versions is None:
                latest_user_submission.submission_versions = []

            # Append current snapshot to history
            latest_user_submission.submission_versions.append(current_snapshot)

            # Update current record with new values
            latest_user_submission.submission_data = values.get(
                "submission_data", latest_user_submission.submission_data
            )
            latest_user_submission.submitter_ip = values.get(
                "submitter_ip", latest_user_submission.submitter_ip
            )
            latest_user_submission.submitter_user_agent = values.get(
                "submitter_user_agent", latest_user_submission.submitter_user_agent
            )
            latest_user_submission.form_content_id = values.get(
                "form_content_id", latest_user_submission.form_content_id
            )
            latest_user_submission.updated_at = datetime.utcnow()

            # Mark the field as modified for JSON column
            # SQLAlchemy doesn't automatically track changes in mutable objects (list/dict)
            from sqlalchemy.orm.attributes import flag_modified

            flag_modified(latest_user_submission, "submission_versions")

            # Commit
            db.commit()
            db.refresh(latest_user_submission)

            return latest_user_submission

        else:
            # Check if form has reached maximum submissions limit
            if form_content.max_submissions is not None:
                current_count = form_content.submissions_count
                if current_count >= form_content.max_submissions:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"This form has reached its submission limit of {form_content.max_submissions} submissions and is no longer accepting responses.",
                    )

            # Update form_id to make sure it is related with form_content
            values["form_id"] = form_content.form_id

            # Build instance directly to avoid ORMBaseMixin permission check,
            # which crashes when user=None (anonymous submissions are intentionally public).
            allowed_fields = {c.key for c in cls.__table__.columns}
            filtered = {k: v for k, v in values.items() if k in allowed_fields}
            filtered["submitter_user_id"] = user.id if user else None
            instance = cls(**filtered)
            db.add(instance)
            db.commit()
            db.refresh(instance)
            return instance
