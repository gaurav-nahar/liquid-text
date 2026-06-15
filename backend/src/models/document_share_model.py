from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.orm import relationship
from src.db.db import Base


class DocumentShare(Base):
    __tablename__ = "document_shares"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    doc_id      = Column(String, ForeignKey("documentation_pages.id", ondelete="CASCADE"), nullable=False, index=True)
    shared_by   = Column(String, nullable=False)
    shared_with = Column(String, nullable=False, index=True)
    permission  = Column(String, nullable=False, default="edit")
    created_at  = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("doc_id", "shared_with", name="uq_document_shares_doc_user"),
    )

    page = relationship("DocumentationPage", back_populates="shares")
