from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .connection import Base


class User(Base):
    """
    User model representing registered app users via Google Sign-In.
    """
    __tablename__ = "users"

    id           = Column(Integer, primary_key=True, index=True)
    email        = Column(String, unique=True, index=True, nullable=False)
    name         = Column(String, nullable=True)
    picture_url  = Column(String, nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # One user → many documents, and many chats
    documents    = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    chats        = relationship("Chat", back_populates="user", cascade="all, delete-orphan")


class Document(Base):
    """
    Document model tracking uploaded files and their processing status.
    """
    __tablename__ = "documents"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename         = Column(String, nullable=False)
    upload_timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status           = Column(String, default="processing", nullable=False)  # processing | active | error

    # Many documents → one user
    user             = relationship("User", back_populates="documents")


class Chat(Base):
    """
    Chat model representing a single conversation session for a user.
    A user can have many chats (e.g. different topics).
    """
    __tablename__ = "chats"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title      = Column(String, default="New Chat", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # One chat → many messages; one user → many chats
    user       = relationship("User", back_populates="chats")
    messages   = relationship("Message", back_populates="chat", cascade="all, delete-orphan", order_by="Message.created_at")


class Message(Base):
    """
    Message model storing individual chat turns (user questions + assistant answers).
    Sources are stored as a JSON list so the frontend can render clickable citations.

    role    : 'user' or 'assistant'
    content : the text of the message
    sources : list of citation dicts — only filled for assistant messages
              e.g. [{"filename": "x.pdf", "page": 3, "score": 0.87, "preview": "..."}]
    """
    __tablename__ = "messages"

    id         = Column(Integer, primary_key=True, index=True)
    chat_id    = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)
    role       = Column(String, nullable=False)        # 'user' or 'assistant'
    content    = Column(Text, nullable=False)
    sources    = Column(JSON, default=list)            # citations list (empty for user messages)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Many messages → one chat
    chat       = relationship("Chat", back_populates="messages")
