from sqlalchemy import create_engine, Column, String, Integer, Float, JSON, DateTime, Text, Enum as SAEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import enum
import os

_BASE = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_BASE}/storage/videoeditor.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class JobStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Upload(Base):
    __tablename__ = "uploads"
    id = Column(String, primary_key=True)
    original_name = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    size = Column(Integer)
    duration = Column(Float)
    width = Column(Integer)
    height = Column(Integer)
    fps = Column(Float)
    has_audio = Column(Integer, default=1)
    thumbnail = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    clips = Column(JSON, default=list)
    settings = Column(JSON, default=dict)
    subtitles = Column(JSON, default=list)
    status = Column(SAEnum(JobStatus), default=JobStatus.pending)
    progress = Column(Integer, default=0)
    progress_message = Column(String, default="")
    output_path = Column(String)
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
