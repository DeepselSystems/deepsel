from deepsel.orm import ORMBaseMixin
from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Text, Boolean, Enum
from deepsel.apps.cms.types import FormFieldTypeEnum
from deepsel.deps import Base
from sqlalchemy.orm import relationship


class FormContentModel(Base, ORMBaseMixin):
    """
    Form content model that stores language-specific form data.
    Similar to PageContentModel, this contains the actual form content
    including title, description, and localization.
    """

    __tablename__ = "form_content"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=True)
    slug = Column(String(255), nullable=True)  # Auto-generated slug
    description = Column(Text, nullable=True)  # Form description
    closing_remarks = Column(Text, nullable=True)  # Closing remarks shown after form
    success_message = Column(
        Text,
        default="Thank you for submitting! We have received your information.",
        nullable=True,
    )  # Message shown after successful submission

    # Submission limit settings
    max_submissions = Column(
        Integer,
        nullable=True,
        default=None,
    )  # Maximum number of submissions allowed for this form. NULL means unlimited submissions.

    show_remaining_submissions = Column(
        Boolean,
        default=True,
        nullable=False,
    )  # Whether to display remaining submission count to visitors.

    # Whether to allow users to edit their submissions
    enable_edit_submission = Column(
        Boolean,
        default=False,
        nullable=False,
    )  # If True, users can edit their previous submissions. If False, submissions are final.

    # Whether to enable email notifications to submitter
    enable_submitter_email_notifications = Column(
        Boolean, default=False, nullable=False
    )

    # Whether to enable email notifications to admin
    enable_admin_email_notifications = Column(Boolean, default=False, nullable=False)

    # List of email addresses for form submission notifications
    notification_admin_emails = Column(JSON, default=lambda: [])

    # Whether to enable public statistics
    enable_public_statistics = Column(Boolean, default=False, nullable=False)

    # Number of views for this form
    views_count = Column(Integer, default=0, nullable=True)

    # Relationships
    locale_id = Column(Integer, ForeignKey("locale.id"), nullable=False)
    locale = relationship("LocaleModel")

    form_id = Column(Integer, ForeignKey("form.id"), nullable=False)
    form = relationship("FormModel", back_populates="contents")

    # Relationship with form fields
    fields = relationship(
        "FormFieldModel",
        back_populates="form_content",
        cascade="all, delete-orphan",
        order_by="FormFieldModel.sort_order",
    )

    # Custom code field
    custom_code = Column(Text, nullable=True)  # Language-specific custom code

    # Relationship with form submissions
    submissions = relationship(
        "FormSubmissionModel",
        back_populates="form_content",
        cascade="all, delete-orphan",
    )

    @property
    def submissions_count(self) -> int:
        """
        Get the current number of submissions for this form content.
        Returns the count of all submissions associated with this form content.
        """
        return len(self.submissions) if self.submissions else 0


class FormFieldModel(Base, ORMBaseMixin):
    """
    Form field model that stores individual field configurations for forms.
    Each field belongs to a specific form content (language version).
    """

    __tablename__ = "form_field"

    id = Column(Integer, primary_key=True)
    field_type = Column(
        Enum(FormFieldTypeEnum), nullable=False
    )  # Field type using FormFieldTypeEnum
    label = Column(String(500), nullable=False)  # Field label displayed to users
    description = Column(Text, nullable=True)  # Optional field description/help text
    required = Column(Boolean, default=False)  # Whether field is required
    placeholder = Column(
        String(500), nullable=True
    )  # Placeholder text for input fields
    sort_order = Column(Integer, default=0)  # Order of fields in the form

    # Field-specific configuration stored as JSON
    # Contains: options, min_value, max_value, min_length, max_length, max_files,
    # allowed_file_types, validation_pattern, validation_message, etc.
    field_config = Column(JSON, default=dict)  # Field-specific configuration

    # Relationships
    form_content_id = Column(Integer, ForeignKey("form_content.id"), nullable=False)
    form_content = relationship("FormContentModel", back_populates="fields")
