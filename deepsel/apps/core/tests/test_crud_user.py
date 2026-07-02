from deepsel.utils.models_pool import models_pool
from sqlalchemy.orm import Session

UserModel = models_pool["user"]


def test_create_user(db: Session):
    user = UserModel(username="Test User", email="test@test.com")
    db.add(user)
    db.commit()
    assert user.username == "Test User"  # nosec B101
    assert user.email == "test@test.com"  # nosec B101
    assert user.id is not None  # nosec B101


def test_create_user_without_username(db: Session):
    user = UserModel(email="missingusername@test.com")
    db.add(user)
    db.commit()
    assert user.id is not None  # nosec B101
    assert user.username is None  # nosec B101


def test_create_user_with_missing_email(db: Session):
    user = UserModel(username="Missing Email")
    db.add(user)
    try:
        db.commit()
        assert False, "Commit should have failed due to missing email"  # nosec B101
    except Exception:
        db.rollback()


def test_delete_user(db: Session):
    user = UserModel(username="Delete User", email="delete@test.com")
    db.add(user)
    db.commit()
    user_id = user.id
    db.delete(user)
    db.commit()
    deleted_user = db.query(UserModel).get(user_id)
    assert deleted_user is None  # nosec B101


def test_update_user(db: Session):
    user = UserModel(username="Update User", email="update@test.com")
    db.add(user)
    db.commit()
    user.username = "Updated User"
    user.email = "updated@test.com"
    db.commit()
    updated_user = db.query(UserModel).get(user.id)
    assert updated_user.username == "Updated User"  # nosec B101
    assert updated_user.email == "updated@test.com"  # nosec B101
