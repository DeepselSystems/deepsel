from sqlalchemy import JSON, Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.types import UUID
from db import Base
from deepsel.apps.core.mixins.orm import ORMBaseMixin
from deepsel.orm.user_mixin import UserMixin


class UserModel(Base, UserMixin, ORMBaseMixin):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True)
    string_id = Column(String, unique=True)

    username = Column(String, unique=True)
    email = Column(String, unique=True, nullable=False)

    # profile fields
    name = Column(String)
    last_name = Column(String)
    first_name = Column(String)
    middle_name = Column(String)
    title = Column(String)
    phone = Column(String)
    mobile = Column(String)
    website = Column(String)

    # address fields
    street = Column(String)
    street2 = Column(String)
    city = Column(String)
    state = Column(String)
    zip = Column(String)
    country = Column(String)
    hashed_password = Column(String)
    signed_up = Column(Boolean, default=False)
    internal = Column(Boolean, default=False, nullable=False)
    device_info = Column(JSON)
    company_name = Column(String)

    roles = relationship("RoleModel", secondary="user_role")
    organizations = relationship(
        "OrganizationModel", secondary="user_organization", enable_typechecks=False
    )
    image_id = Column(Integer, ForeignKey("attachment.id"))
    image = relationship("AttachmentModel", foreign_keys=[image_id])
    cv_attachment_id = Column(Integer, ForeignKey("attachment.id"))
    cv = relationship("AttachmentModel", foreign_keys=[cv_attachment_id])

    is_use_2fa = Column(Boolean, default=False)
    secret_key_2fa = Column(String)
    temp_secret_key_2fa = Column(String)
    recovery_codes = Column(JSON, nullable=True)

    google_id = Column(String)
    saml_nameid = Column(String)
    anonymous_id = Column(UUID(as_uuid=True))
    preferences = Column(JSON, default={})

    # --- UserMixin settings ---

    def is_public_user(self):
        return not self.signed_up or self.string_id == "locales_public_role"

    def is_admin(self):
        roles = self.get_user_roles()
        return any(
            [role.string_id in ["admin_role", "website_admin_role"] for role in roles]
        )

    @classmethod
    def _get_app_secret(cls):
        from settings import APP_SECRET

        return APP_SECRET

    @classmethod
    def _get_auth_algorithm(cls):
        from settings import AUTH_ALGORITHM

        return AUTH_ALGORITHM

    @classmethod
    def _get_frontend_url(cls):
        from settings import PUBLIC_URL

        return PUBLIC_URL

    @classmethod
    def _get_is_authless(cls):
        from settings import AUTHLESS

        return AUTHLESS

    @classmethod
    def _get_default_org_id(cls):
        from settings import DEFAULT_ORG_ID

        return DEFAULT_ORG_ID

    @classmethod
    def _get_password_context(cls):
        from deepsel.utils.crypto import crypt_context

        return crypt_context

    @classmethod
    def _get_admin_role_string_ids(cls):
        return ["admin_role", "website_admin_role"]

    @classmethod
    def _get_admin_user_string_id(cls):
        return "admin_user"

    @classmethod
    def _get_set_password_template_id(cls):
        return "setup_password_template"

    @classmethod
    def _get_reset_password_template_id(cls):
        return "reset_password_template"
