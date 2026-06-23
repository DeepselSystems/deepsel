import logging
from typing import Optional
from sqlalchemy.orm import Session
from deepsel.utils.models_pool import models_pool

logger = logging.getLogger(__name__)


UserModel = models_pool["user"]


async def send_form_submission_notification(
    db: Session,
    form_submission_id: int,
    organization_id: int,
    user: Optional[UserModel] = None,
):
    """
    Send email notification to configured addresses when a new form submission is received.

    Args:
        db: Database session
        form_submission_id: ID of the form submission
        organization_id: ID of the organization
        user: User - submitter user
    """
    try:
        # Get models from pool
        FormSubmissionModel = models_pool["form_submission"]
        OrganizationModel = models_pool["organization"]
        EmailTemplateModel = models_pool["email_template"]

        # Get organization
        organization = (
            db.query(OrganizationModel)
            .filter(OrganizationModel.id == organization_id)
            .first()
        )
        if not organization:
            logger.error(f"Organization {organization_id} not found")
            return False

        # Get form submission with related data
        form_submission = (
            db.query(FormSubmissionModel)
            .filter(FormSubmissionModel.id == form_submission_id)
            .first()
        )
        if not form_submission:
            logger.error(f"Form submission {form_submission_id} not found")
            return

        # Get form content
        form_content = form_submission.form_content

        # Get frontend URL
        from deepsel.deps import settings

        frontend_url = settings.PUBLIC_URL

        # Remove trailing slash if present
        if frontend_url.endswith("/"):
            frontend_url = frontend_url.rstrip("/")

        # Get view submission URL
        view_submission_url = (
            f"{frontend_url}/admin/form-submissions/{form_submission.id}"
        )

        # Get locale information from form content
        form_locale = getattr(form_content, "locale", None)
        locale_name = (
            getattr(form_locale, "name", "Unknown") if form_locale else "Unknown"
        )

        # Get form title for specific locale (content)
        form_title = getattr(form_content, "title", "Unknown Form")

        # Generate base context for email templates
        based_context = {
            "form_title": form_title,
            "submitted_at": form_submission.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "submission_data": form_submission.submission_data,
            "organization_name": organization.name,
            "locale_name": locale_name,
            "view_submission_url": view_submission_url,
        }

        # Send email notification to submitter user
        if form_content.enable_submitter_email_notifications and user and user.email:
            # Get email template for submitter, there is only one template and can be used for any organization
            email_template_to_submitter = (
                db.query(EmailTemplateModel)
                .filter(
                    EmailTemplateModel.string_id == "forms_notification_to_submitter"
                )
                .first()
            )
            if email_template_to_submitter:
                # Prepare context for email template
                context = {**based_context}

                # Send email notification
                success = await email_template_to_submitter.send(
                    db=db,
                    to=[user.email],
                    context=context,
                    subject="Your submission has been received",
                )
                if success:
                    logger.info(
                        f"Form submission(id={form_submission_id}) notification sent to submitter user {user.email}"
                    )
                else:
                    logger.error(
                        f"Failed to send form submission notification(id={form_submission_id}) to submitter user {user.email}"
                    )
            else:
                logger.warning(
                    "Email template 'forms_notification_to_submitter' not found."
                )
        else:
            logger.info(
                f"Form submission(id={form_submission_id}) notification not sent. Submitter user not found."
            )

        # Get organization with notification emails
        notification_emails = form_content.notification_admin_emails

        # Send email notification if enabled
        if form_content.enable_admin_email_notifications and notification_emails:
            # Get email template for admin, there is only one template and can be used for any organization
            email_template_to_admin = (
                db.query(EmailTemplateModel)
                .filter(
                    EmailTemplateModel.string_id == "notify_form_submission_to_admin"
                )
                .first()
            )
            if email_template_to_admin:
                # Prepare context for email template
                context = {**based_context}

                # Send email notification
                success = await email_template_to_admin.send(
                    db=db,
                    to=notification_emails,
                    context=context,
                    subject="Submission received for " + form_title,
                )
                if success:
                    logger.info(
                        f"Form submission(id={form_submission_id}) notification sent to admin {notification_emails}"
                    )
                else:
                    logger.error(
                        f"Failed to send form submission(id={form_submission_id}) notification to admin"
                    )
            else:
                logger.warning(
                    "Email template 'notify_form_submission_to_admin' not found."
                )
        else:
            logger.info(
                f"Form submission notification not enabled for form {form_submission.form_id}"
            )

    except Exception as e:
        logger.error(f"Error sending form submission notification: {str(e)}")


def get_lasted_user_submission(db: Session, user: UserModel, form_content_id: int):
    # Get models from models pool
    FormSubmissionModel = models_pool["form_submission"]

    # Check if user is public user
    if (form_content_id is None) or (user is None) or (user.string_id == "public_user"):
        return None

    # Get latest user submission
    return (
        db.query(FormSubmissionModel)
        .filter_by(
            form_content_id=form_content_id,
            submitter_user_id=user.id,
        )
        .order_by(FormSubmissionModel.created_at.desc())
        .first()
    )
