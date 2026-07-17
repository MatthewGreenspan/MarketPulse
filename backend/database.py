from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)     # Create a new database session
Base = declarative_base()                                                       # Create the base class for ORM models

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()