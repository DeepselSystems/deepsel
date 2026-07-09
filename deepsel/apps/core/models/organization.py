import logging

from sqlalchemy import Boolean, Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from deepsel.deps import Base
from deepsel.apps.core.mixins.orm import ORMBaseMixin
from deepsel.orm.organization_mixin import OrganizationMixin
from settings import APP_SECRET
from deepsel.utils.crypto import encrypt as _encrypt, decrypt as _decrypt

_logger = logging.getLogger(__name__)


class OrganizationModel(Base, OrganizationMixin, ORMBaseMixin):
    __tablename__ = "organization"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)

    # address fields
    street = Column(String)
    street2 = Column(String)
    city = Column(String)
    state = Column(String)
    zip = Column(String)
    country = Column(String)

    image_attachment_id = Column(Integer, ForeignKey("attachment.id"))
    image = relationship("AttachmentModel", foreign_keys=[image_attachment_id])

    # internal settings — encrypted fields
    mail_username = Column(String)
    _mail_password = Column("mail_password", String)
    mail_timeout = Column(Integer, default=60)
    mail_from = Column(String)
    mail_port = Column(String)
    mail_server = Column(String)
    mail_from_name = Column(String)
    mail_validate_certs = Column(Boolean, nullable=False, default=False)
    mail_use_credentials = Column(Boolean, nullable=False, default=True)
    mail_ssl_tls = Column(Boolean, nullable=False, default=False)
    mail_starttls = Column(Boolean, nullable=False, default=False)
    mail_send_rate_limit_per_hour = Column(Integer, default=200)

    # public settings
    access_token_expire_minutes = Column(Integer, default=1440)
    require_2fa_all_users = Column(Boolean, default=False)
    allow_public_signup = Column(Boolean, default=True)

    enable_auth = Column(Boolean, default=False)

    current_version = Column(String)

    # --- Encrypted property accessors ---

    @property
    def mail_password(self):
        if self._mail_password:
            try:
                return _decrypt(self._mail_password, APP_SECRET).decode("utf-8")
            except Exception:
                return self._mail_password  # legacy unencrypted value
        return None

    @mail_password.setter
    def mail_password(self, value):
        if value:
            self._mail_password = _encrypt(value, APP_SECRET)
        else:
            self._mail_password = None

    @property
    def is_smtp_configured(self):
        return bool(self.mail_server and self.mail_from)

    @property
    def is_enabled_oidc(self):
        """True if this org has at least one enabled OIDC provider.

        Drives the "Sign in with SSO" button on the login page. Resolved lazily
        via the models pool so core stays decoupled from the (optional) oidc app
        — if the app is not installed, this is simply False.
        """
        from sqlalchemy.orm import object_session
        from deepsel.utils.models_pool import models_pool

        ProviderModel = models_pool.get("oidc_provider")
        session = object_session(self)
        if ProviderModel is None or session is None:
            return False
        return (
            session.query(ProviderModel)
            .filter(
                ProviderModel.organization_id == self.id,
                ProviderModel.enabled.is_(True),
            )
            .first()
            is not None
        )

    # --- OrganizationMixin settings ---

    @classmethod
    def _get_default_org_id(cls):
        from settings import DEFAULT_ORG_ID

        return DEFAULT_ORG_ID

    @classmethod
    def _get_is_authless(cls):
        from settings import AUTHLESS

        return AUTHLESS

    @classmethod
    def _get_public_settings_fields(cls):
        return [
            "id",
            "name",
            "access_token_expire_minutes",
            "require_2fa_all_users",
            "allow_public_signup",
            "is_smtp_configured",
            "is_enabled_oidc",
        ]

    @classmethod
    def _get_protected_api_key_fields(cls):
        return ["openrouter_api_key"]

    @classmethod
    def _get_admin_role_string_ids(cls):
        return ["admin_role", "website_admin_role"]

    @classmethod
    def create(
        cls, db, user, values, commit=True, bypass_permission=False, *args, **kwargs
    ):
        instance = super().create(
            db,
            user,
            values,
            commit=commit,
            bypass_permission=bypass_permission,
            *args,
            **kwargs,
        )
        if user and getattr(user, "id", None):
            from deepsel.apps.core.models.user_organization import UserOrganizationModel

            existing = (
                db.query(UserOrganizationModel)
                .filter_by(user_id=user.id, organization_id=instance.id)
                .first()
            )
            if not existing:
                db.add(
                    UserOrganizationModel(user_id=user.id, organization_id=instance.id)
                )
                if commit:
                    db.commit()
        return instance
