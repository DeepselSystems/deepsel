"""Tests for deepsel/apps/core/utils/attachment_access.py: who may load an
attachment file through /attachment/serve*, signed links, and unguessable
stored names."""

import time
from types import SimpleNamespace

import pytest

import deepsel.utils  # noqa: F401  (deepsel.utils loads before deepsel.orm)
from deepsel.apps.core.utils import attachment_access as access
from deepsel.orm.types import PermissionScope


@pytest.fixture
def settings(monkeypatch):
    s = SimpleNamespace(APP_SECRET="test-secret", API_PREFIX="/api/v1")
    monkeypatch.setattr("deepsel.deps.settings", s)
    return s


class _Model:
    """Stands in for AttachmentModel: a fixed permission answer."""

    def __init__(self, allowed=True, scope=PermissionScope.org):
        self.answer = (allowed, scope)

    def _check_has_permission(self, action, user):
        return self.answer


def _user(user_id=7, orgs=(1,), current=None):
    return SimpleNamespace(
        id=user_id, current_organization_id=current, get_org_ids=lambda: list(orgs)
    )


def _att(org=1, owner=7, public=None):
    return SimpleNamespace(organization_id=org, owner_id=owner, public=public)


class TestSettings:
    def test_private_by_default(self, settings):
        assert access.default_visibility() == "private"
        assert access.random_names_enabled() is True
        assert access.signed_url_ttl() == access.DEFAULT_SIGNED_URL_TTL

    def test_no_settings_module_is_private(self, monkeypatch):
        monkeypatch.setattr("deepsel.deps.settings", None)
        assert access.default_visibility() == "private"

    @pytest.mark.parametrize("value", ["public", "PUBLIC", " Public "])
    def test_public_policy(self, settings, value):
        settings.ATTACHMENT_DEFAULT_VISIBILITY = value
        assert access.default_visibility() == "public"

    def test_unknown_value_is_private(self, settings):
        settings.ATTACHMENT_DEFAULT_VISIBILITY = "everyone"
        assert access.default_visibility() == "private"

    @pytest.mark.parametrize(
        "value,expected",
        [(False, False), ("false", False), ("0", False), ("true", True), (True, True)],
    )
    def test_random_names_setting(self, settings, value, expected):
        settings.ATTACHMENT_RANDOM_NAMES = value
        assert access.random_names_enabled() is expected

    def test_bad_ttl_falls_back(self, settings):
        settings.ATTACHMENT_SIGNED_URL_TTL = "soon"
        assert access.signed_url_ttl() == access.DEFAULT_SIGNED_URL_TTL


class TestIsPublic:
    def test_flag_wins_over_policy(self, settings):
        settings.ATTACHMENT_DEFAULT_VISIBILITY = "public"
        assert access.is_public(_att(public=False)) is False
        settings.ATTACHMENT_DEFAULT_VISIBILITY = "private"
        assert access.is_public(_att(public=True)) is True

    def test_null_follows_policy(self, settings):
        assert access.is_public(_att(public=None)) is False
        settings.ATTACHMENT_DEFAULT_VISIBILITY = "public"
        assert access.is_public(_att(public=None)) is True


class TestRandomNames:
    def test_suffix_keeps_extension_and_is_random(self):
        a = access.with_random_suffix("Supplier quote.pdf")
        b = access.with_random_suffix("Supplier quote.pdf")
        assert a.startswith("Supplier quote-") and a.endswith(".pdf")
        assert len(a) == len("Supplier quote-.pdf") + 16
        assert a != b

    def test_no_extension_or_name(self):
        assert access.with_random_suffix("README").startswith("README-")
        assert access.with_random_suffix("").startswith("file-")


class TestSignedLinks:
    def _parts(self, url):
        path, _, query = url.partition("?")
        params = dict(p.split("=", 1) for p in query.split("&"))
        return path, params["exp"], params["sig"]

    def test_round_trip(self, settings):
        url = access.sign_serve_url("plan-abc.pdf")
        path, exp, sig = self._parts(url)
        assert path == "/api/v1/attachment/serve/plan-abc.pdf"
        assert int(exp) > time.time()
        assert access.verify_signature("plan-abc.pdf", exp, sig)

    def test_other_file_tampered_or_missing_fails(self, settings):
        _, exp, sig = self._parts(access.sign_serve_url("plan-abc.pdf"))
        assert not access.verify_signature("other.pdf", exp, sig)
        assert not access.verify_signature("plan-abc.pdf", str(int(exp) + 60), sig)
        assert not access.verify_signature("plan-abc.pdf", exp, sig[:-2] + "xx")
        assert not access.verify_signature("plan-abc.pdf", None, sig)
        assert not access.verify_signature("plan-abc.pdf", "soon", sig)

    def test_expired(self, settings):
        _, exp, sig = self._parts(access.sign_serve_url("plan-abc.pdf", expires_in=-10))
        assert not access.verify_signature("plan-abc.pdf", exp, sig)

    def test_never_expires(self, settings):
        _, exp, sig = self._parts(access.sign_serve_url("logo.png", expires_in=None))
        assert exp == "0"
        assert access.verify_signature("logo.png", exp, sig)

    def test_route_bound(self, settings):
        url = access.sign_serve_url("logo", by_name=True)
        path, exp, sig = self._parts(url)
        assert path == "/api/v1/attachment/serve-by-name/logo"
        assert access.verify_signature("logo", exp, sig, by_name=True)
        assert not access.verify_signature("logo", exp, sig, by_name=False)

    def test_secret_change_invalidates(self, settings):
        _, exp, sig = self._parts(access.sign_serve_url("plan.pdf"))
        settings.APP_SECRET = "rotated"
        assert not access.verify_signature("plan.pdf", exp, sig)

    def test_no_secret(self, settings):
        settings.APP_SECRET = ""
        with pytest.raises(RuntimeError):
            access.sign_serve_url("plan.pdf")
        assert not access.verify_signature("plan.pdf", "0", "abc")

    def test_ttl_setting(self, settings):
        settings.ATTACHMENT_SIGNED_URL_TTL = 60
        _, exp, _ = self._parts(access.sign_serve_url("plan.pdf"))
        assert int(exp) - time.time() <= 61


class TestCanView:
    def test_nobody(self):
        assert not access.can_view(None, _att(), _Model())

    def test_no_permission(self):
        assert not access.can_view(_user(), _att(), _Model(allowed=False))

    def test_all_scope_any_org(self):
        assert access.can_view(
            _user(orgs=(9,)), _att(org=1), _Model(scope=PermissionScope.all)
        )

    def test_org_scope_membership(self):
        model = _Model(scope=PermissionScope.org)
        assert access.can_view(_user(orgs=(1, 2)), _att(org=2), model)
        assert not access.can_view(_user(orgs=(1,)), _att(org=2), model)

    def test_org_scope_narrowed_to_current_org(self):
        model = _Model(scope=PermissionScope.org)
        assert not access.can_view(_user(orgs=(1, 2), current=1), _att(org=2), model)
        assert access.can_view(_user(orgs=(1, 2), current=2), _att(org=2), model)

    def test_org_scope_fails_closed_without_org(self):
        assert not access.can_view(
            _user(), _att(org=None), _Model(scope=PermissionScope.org)
        )

    def test_own_scope(self):
        model = _Model(scope=PermissionScope.own)
        assert access.can_view(_user(user_id=7), _att(owner=7), model)
        assert not access.can_view(_user(user_id=8), _att(owner=7), model)


def test_mixin_keeps_uploaded_names_by_default():
    from deepsel.orm.attachment_mixin import AttachmentMixin

    assert AttachmentMixin._new_storage_name("plan.pdf") == "plan.pdf"
