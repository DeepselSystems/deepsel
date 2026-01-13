"""
Example usage of deepsel SQLAlchemy DatabaseManager

This example demonstrates how to use the DatabaseManager to automatically
manage database schema migrations for your SQLAlchemy models.
"""

from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Session, declarative_base, relationship
from contextlib import contextmanager
import enum

from deepsel.sqlalchemy import DatabaseManager

Base = declarative_base()


class UserRole(enum.Enum):
    ADMIN = "admin"
    USER = "user"
    GUEST = "guest"


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.USER, nullable=False)
    
    posts = relationship("Post", back_populates="author")


class Post(Base):
    __tablename__ = "posts"
    
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    content = Column(String, nullable=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    author = relationship("User", back_populates="posts")


@contextmanager
def get_db_context():
    """Create a database session context manager"""
    engine = create_engine("postgresql://user:password@localhost/mydb")
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()


def main():
    models_pool = {
        "users": User,
        "posts": Post,
    }
    
    db_manager = DatabaseManager(
        sqlalchemy_declarative_base=Base,
        db_session_factory=get_db_context,
        models_pool=models_pool
    )
    
    print("Database schema migration completed!")
    
    with get_db_context() as db:
        new_user = User(
            username="john_doe",
            email="john@example.com",
            role=UserRole.ADMIN
        )
        db.add(new_user)
        db.commit()
        
        print(f"Created user: {new_user.username}")


if __name__ == "__main__":
    main()
