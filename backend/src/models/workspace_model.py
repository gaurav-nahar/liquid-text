from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from src.db.db import Base

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    pdf_id = Column(Integer, ForeignKey("pdf_files.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, index=True, nullable=False) # Mandatory for user isolation
    name = Column(String, nullable=False, default="Initial Workspace")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    pdf = relationship("PDFFile", back_populates="workspaces")
    snippets = relationship("Snippet", back_populates="workspace", cascade="all, delete-orphan")
    boxes = relationship("Box", back_populates="workspace", cascade="all, delete-orphan")
    lines = relationship("Line", back_populates="workspace", cascade="all, delete-orphan")
    connections = relationship("Connection", back_populates="workspace", cascade="all, delete-orphan")