import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Read the connection string from environment
raw_db_url = os.getenv("DATABASE_URL")
if not raw_db_url:
    # Fail early if database is not configured
    raise RuntimeError("DATABASE_URL environment variable is not set.")

# Convert postgresql:// to postgresql+psycopg:// to use psycopg v3
if raw_db_url and raw_db_url.startswith("postgresql://"):
    DATABASE_URL = raw_db_url.replace("postgresql://", "postgresql+psycopg://", 1)
else:
    DATABASE_URL = raw_db_url

# Initialize engine and sessionmaker
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """
    FastAPI dependency that yields a database session and ensures
    it is closed after the request is finished.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
