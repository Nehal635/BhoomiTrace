from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///C:/Users/NEHAL/BhoomiTrace/bhoomitrace.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class ParcelModel(Base):
    __tablename__ = "parcels"
    parcel_id = Column(String, primary_key=True, index=True)
    owner_name = Column(String)
    status = Column(String, default="PENDING_REVIEW")
    confidence_score = Column(Float, default=0.6)
    conflict_type = Column(String, default="NONE")
    details = Column(String, default="")
    geometry_json = Column(Text)

class AuditLogModel(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    parcel_id = Column(String, index=True)
    approved_owner = Column(String)
    resolution_action = Column(String)
    audit_notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
