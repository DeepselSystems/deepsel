from fastapi import Depends
from sqlalchemy.orm import Session
from deepsel.deps import get_db
from deepsel.auth.get_current_user import get_current_user


def get_graphql_context(
    db: Session = Depends(get_db), user=Depends(get_current_user)
) -> dict:
    """Return GraphQL context as dictionary"""
    return {"db": db, "user": user}
