import pytest
from fastapi import HTTPException

from deepsel.auth.current_org import resolve_current_organization_id


class _FakeUser:
    def __init__(self, org_ids):
        self._org_ids = org_ids

    def get_org_ids(self):
        return self._org_ids


class TestResolveCurrentOrganizationId:
    def test_none_header_returns_none(self):
        user = _FakeUser([1, 2])
        assert resolve_current_organization_id(user, x_organization_id=None) is None

    def test_member_org_echoed(self):
        user = _FakeUser([1, 2, 3])
        assert resolve_current_organization_id(user, x_organization_id=2) == 2

    def test_non_member_raises_403(self):
        user = _FakeUser([1, 2])
        with pytest.raises(HTTPException) as exc:
            resolve_current_organization_id(user, x_organization_id=99)
        assert exc.value.status_code == 403

    def test_empty_membership_raises_for_any_header(self):
        user = _FakeUser([])
        with pytest.raises(HTTPException) as exc:
            resolve_current_organization_id(user, x_organization_id=1)
        assert exc.value.status_code == 403
