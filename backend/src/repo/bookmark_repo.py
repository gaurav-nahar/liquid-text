from sqlalchemy.orm import Session
from src.models.bookmark_model import Bookmark


class BookmarkRepo:

    @staticmethod
    def get_by_pdf(db: Session, pdf_id: int, user_id: str):
        return (
            db.query(Bookmark)
            .filter(Bookmark.pdf_id == pdf_id, Bookmark.user_id == user_id)
            .order_by(Bookmark.page_num.asc())
            .all()
        )

    @staticmethod
    def create(db: Session, pdf_id: int, user_id: str, page_num: int, name: str = ""):
        existing = (
            db.query(Bookmark)
            .filter(
                Bookmark.pdf_id == pdf_id,
                Bookmark.user_id == user_id,
                Bookmark.page_num == page_num,
            )
            .first()
        )

        if existing:
            if name and name.strip():
                existing.name = name.strip()
                db.commit()
                db.refresh(existing)
            return existing

        bm = Bookmark(pdf_id=pdf_id, user_id=user_id, page_num=page_num, name=(name or "").strip())
        db.add(bm)
        db.commit()
        db.refresh(bm)
        return bm

    @staticmethod
    def delete(db: Session, bookmark_id: int, user_id: str):
        bm = db.query(Bookmark).filter(Bookmark.id == bookmark_id, Bookmark.user_id == user_id).first()
        if bm:
            db.delete(bm)
            db.commit()
        return bm
