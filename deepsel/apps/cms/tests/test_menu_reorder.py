from sqlalchemy.orm import Session

from deepsel.apps.cms.routers.menu import (
    _renormalize_level_if_needed,
    _would_create_cycle,
    POSITION_STEP,
)
from deepsel.utils.models_pool import models_pool

MenuModel = models_pool["menu"]
OrganizationModel = models_pool["organization"]


class MockUser:
    """Minimal stand-in satisfying the permission checks that
    ORMBaseMixin.update() runs on every sibling write."""

    def __init__(self, id=1, org_id=1):
        self.id = id
        self.current_organization_id = org_id

    def get_user_permissions(self):
        return ["menu:*:*"]

    def get_org_ids(self):
        return [self.current_organization_id]


def _admin_user(org_id=1):
    return MockUser(org_id=org_id)


def _make_org(db: Session):
    org = OrganizationModel(name="Test Org")
    db.add(org)
    db.commit()
    return org


def _make_menu(db: Session, org, parent_id=None, position=0):
    item = MenuModel(organization_id=org.id, parent_id=parent_id, position=position)
    db.add(item)
    db.commit()
    return item


def test_would_create_cycle_detects_self_reference(db: Session):
    org = _make_org(db)
    a = _make_menu(db, org, position=1000)
    assert _would_create_cycle(db, MenuModel, a.id, a.id) is True  # nosec B101


def test_would_create_cycle_detects_deep_cycle(db: Session):
    org = _make_org(db)
    a = _make_menu(db, org, position=1000)
    b = _make_menu(db, org, parent_id=a.id, position=1000)
    c = _make_menu(db, org, parent_id=b.id, position=1000)
    # Reparenting A under C (a descendant of A) would create a cycle
    assert _would_create_cycle(db, MenuModel, a.id, c.id) is True  # nosec B101


def test_would_create_cycle_allows_unrelated_reparent(db: Session):
    org = _make_org(db)
    a = _make_menu(db, org, position=1000)
    b = _make_menu(db, org, position=2000)
    assert _would_create_cycle(db, MenuModel, a.id, b.id) is False  # nosec B101


def test_would_create_cycle_allows_root(db: Session):
    org = _make_org(db)
    a = _make_menu(db, org, parent_id=None, position=1000)
    b = _make_menu(db, org, position=2000)
    _ = b
    assert _would_create_cycle(db, MenuModel, a.id, None) is False  # nosec B101


def test_renormalize_skips_level_with_enough_room(db: Session):
    org = _make_org(db)
    a = _make_menu(db, org, position=1000)
    b = _make_menu(db, org, position=2000)

    _renormalize_level_if_needed(db, MenuModel, None, org.id, _admin_user(org.id))
    db.commit()
    db.refresh(a)
    db.refresh(b)

    assert a.position == 1000  # nosec B101
    assert b.position == 2000  # nosec B101


def test_renormalize_respaces_level_with_no_room_left(db: Session):
    org = _make_org(db)
    a = _make_menu(db, org, position=1)
    b = _make_menu(db, org, position=2)
    c = _make_menu(db, org, position=3)

    _renormalize_level_if_needed(db, MenuModel, None, org.id, _admin_user(org.id))
    db.commit()
    db.refresh(a)
    db.refresh(b)
    db.refresh(c)

    assert [a.position, b.position, c.position] == [  # nosec B101
        POSITION_STEP,
        2 * POSITION_STEP,
        3 * POSITION_STEP,
    ]


def test_renormalize_only_touches_the_affected_level(db: Session):
    org = _make_org(db)
    parent = _make_menu(db, org, position=1000)
    child_a = _make_menu(db, org, parent_id=parent.id, position=1)
    child_b = _make_menu(db, org, parent_id=parent.id, position=2)
    root_sibling = _make_menu(db, org, position=2000)

    _renormalize_level_if_needed(
        db, MenuModel, parent.id, org.id, _admin_user(org.id)
    )
    db.commit()
    db.refresh(child_a)
    db.refresh(child_b)
    db.refresh(root_sibling)

    assert [child_a.position, child_b.position] == [  # nosec B101
        POSITION_STEP,
        2 * POSITION_STEP,
    ]
    # Root level wasn't touched by renormalizing the child level
    assert root_sibling.position == 2000  # nosec B101
