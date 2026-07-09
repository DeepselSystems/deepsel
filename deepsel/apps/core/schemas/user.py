from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


class UserAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    string_id: Optional[str] = None
    content_type: Optional[str] = None


class UserOrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    string_id: Optional[str] = None


class UserRoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    string_id: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[Any] = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    string_id: Optional[str] = None
    username: Optional[str] = None
    email: str

    # profile
    name: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    company_name: Optional[str] = None

    # address
    street: Optional[str] = None
    street2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None

    # flags
    signed_up: Optional[bool] = False
    internal: Optional[bool] = False
    is_use_2fa: Optional[bool] = False
    active: Optional[bool] = True

    # relationships
    image_id: Optional[int] = None
    image: Optional[UserAttachmentRead] = None
    cv_attachment_id: Optional[int] = None
    cv: Optional[UserAttachmentRead] = None
    organizations: list[UserOrganizationRead] = []
    roles: list[UserRoleRead] = []

    # misc
    preferences: Optional[Any] = None
    owner_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserSearch(BaseModel):
    total: int
    data: list[UserRead]


class UserCreate(BaseModel):
    username: Optional[str] = None
    email: str
    password: Optional[str] = None
    name: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    company_name: Optional[str] = None
    street: Optional[str] = None
    street2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None
    signed_up: Optional[bool] = True
    internal: Optional[bool] = True
    image_id: Optional[int] = None
    cv_attachment_id: Optional[int] = None
    roles: Optional[list] = None
    organizations: Optional[list] = None
    preferences: Optional[Any] = None
    # When no password is given a set-password email is normally sent; set False
    # for accounts that authenticate another way (e.g. pre-created SSO users).
    send_password_email: Optional[bool] = True


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    company_name: Optional[str] = None
    street: Optional[str] = None
    street2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None
    signed_up: Optional[bool] = None
    internal: Optional[bool] = None
    image_id: Optional[int] = None
    cv_attachment_id: Optional[int] = None
    roles: Optional[list] = None
    organizations: Optional[list] = None
    preferences: Optional[Any] = None


class CurrentUser(UserRead):
    permissions: Optional[List[str]]
    all_roles: Optional[List[UserRoleRead]]


class Info2Fa(BaseModel):
    is_use_2fa: bool = False
    totp_uri: str = ""
    recovery_codes: list[str] = []
