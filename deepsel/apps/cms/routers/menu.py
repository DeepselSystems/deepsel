from deepsel.utils.crud_router import CRUDRouter
from ..schemas.menu import (
    MenuCreate,
    MenuRead,
    MenuReorderRequest,
    MenuSearch,
    MenuUpdate,
)
from deepsel.auth.get_current_user import get_current_user
from deepsel.deps import get_db
from deepsel.utils.models_pool import models_pool
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

table_name = "menu"

router = CRUDRouter(
    read_schema=MenuRead,
    search_schema=MenuSearch,
    create_schema=MenuCreate,
    update_schema=MenuUpdate,
    table_name=table_name,
    dependencies=[Depends(get_current_user)],
)

# Positions are assigned with gaps (see reorder_menu_items) so inserting an
# item between two siblings only touches that one row instead of renumbering
# the whole level. Once two adjacent positions are this close there's no more
# room to insert between them, so the level gets renumbered back out to
# POSITION_STEP-sized gaps.
MIN_POSITION_GAP = 2
POSITION_STEP = 1000


def _would_create_cycle(db: Session, MenuModel, item_id: int, new_parent_id) -> bool:
    """Check whether re-parenting item_id under new_parent_id would make
    item_id an ancestor of itself (a cycle in the parent/child tree).

    Walks up the parent chain starting at new_parent_id (new_parent_id's
    parent, grandparent, ...). If item_id is found anywhere on that path,
    item_id would end up both an ancestor and a descendant of new_parent_id
    once the change is applied — a cycle.

    Args:
        item_id: the menu item being re-parented.
        new_parent_id: the parent_id it would be assigned.

    Returns:
        True if applying this change would create a cycle.
    """
    current_id = new_parent_id
    seen: set[int] = set()
    while current_id is not None:
        if current_id == item_id:
            return True
        if current_id in seen:
            return False
        seen.add(current_id)
        row = db.query(MenuModel.parent_id).filter(MenuModel.id == current_id).first()
        current_id = row[0] if row else None
    return False


def _renormalize_level_if_needed(
    db: Session, MenuModel, parent_id, organization_id: int
) -> None:
    """Re-space a level's positions back out to POSITION_STEP-sized gaps, but
    only if two adjacent siblings are currently too close to insert between.

    Scoped to a single organization so that renormalization never reads or
    mutates another tenant's rows."""
    siblings = (
        db.query(MenuModel)
        .filter(
            MenuModel.parent_id == parent_id,
            MenuModel.organization_id == organization_id,
        )
        .order_by(MenuModel.position)
        .all()
    )
    gaps_too_tight = any(
        b.position - a.position < MIN_POSITION_GAP
        for a, b in zip(siblings, siblings[1:])
    )
    if gaps_too_tight:
        for index, sibling in enumerate(siblings):
            sibling.position = (index + 1) * POSITION_STEP


@router.post("/reorder", response_model=list[MenuRead])
def reorder_menu_items(
    payload: MenuReorderRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Bulk-update position/parent_id for the menu items that moved, in one
    transaction. A swap of two siblings sends 2 items; a single drag into a
    gap between two others sends 1; a full reorder of a level sends as many
    as changed — same endpoint either way."""
    if not payload.items:
        return []

    MenuModel = models_pool["menu"]

    organization_id: int = getattr(user, "current_organization_id", None)
    if organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header is required to reorder menu items",
        )

    ids = [item.id for item in payload.items]
    menu_items = (
        db.query(MenuModel)
        .filter(
            MenuModel.id.in_(ids),
            MenuModel.organization_id == organization_id,
        )
        .all()
    )
    by_id = {m.id: m for m in menu_items}

    missing_ids = set(ids) - set(by_id)
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item(s) not found: {sorted(missing_ids)}",
        )

    parent_ids_to_validate = {
        change.parent_id for change in payload.items if change.parent_id is not None
    }
    if parent_ids_to_validate:
        valid_parent_count = (
            db.query(MenuModel.id)
            .filter(
                MenuModel.id.in_(parent_ids_to_validate),
                MenuModel.organization_id == organization_id,
            )
            .count()
        )
        if valid_parent_count != len(parent_ids_to_validate):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="One or more parent_id values do not belong to the current organization",
            )

    try:
        for change in payload.items:
            by_id[change.id].update(
                db,
                user,
                {"parent_id": change.parent_id, "position": change.position},
                commit=False,
            )

        db.flush()

        for change in payload.items:
            if _would_create_cycle(db, MenuModel, change.id, change.parent_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot set parent of menu item {change.id}: would create a cycle",
                )

        touched_parent_ids = {change.parent_id for change in payload.items}
        for parent_id in touched_parent_ids:
            _renormalize_level_if_needed(db, MenuModel, parent_id, organization_id)

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    for menu_item in menu_items:
        db.refresh(menu_item)

    return [MenuRead.model_validate(m) for m in menu_items]
