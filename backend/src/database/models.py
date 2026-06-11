from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .connection import Base

class User(Base):
    """
    User model representing registered app users via Google Sign-In.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    picture_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # One-to-many relationship to user documents
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")

class Document(Base):
    """
    Document model tracking uploaded files and processing statuses.
    """
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    upload_timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status = Column(String, default="processing", nullable=False)  # Status: processing, active, error

    # Many-to-one relationship to the owner User
    user = relationship("User", back_populates="documents")
