from sqlalchemy.orm import Session
from src.models.workspace_model import Workspace
from src.utils.case_context import apply_case_context_to_dict

class WorkspaceRepo:
    @staticmethod
    def get_by_pdf(db: Session, pdf_id: int, user_id: str):
        # user_id is now mandatory
        return db.query(Workspace).filter(Workspace.pdf_id == pdf_id, Workspace.user_id == user_id).all()

    @staticmethod
    def get_or_create_for_case(db: Session, diary_no: str, diary_year: str, establishment: str, user_id: str):
        """Find or create a single shared workspace for a diary case (pdf_id=None)."""
        ws = db.query(Workspace).filter(
            Workspace.diary_no == diary_no,
            Workspace.diary_year == diary_year,
            Workspace.establishment == establishment,
            Workspace.user_id == user_id,
            Workspace.pdf_id.is_(None),
        ).first()
        if ws:
            return ws
        ws = Workspace(
            pdf_id=None,
            name="Main",
            user_id=user_id,
            diary_no=diary_no,
            diary_year=diary_year,
            establishment=establishment,
        )
        db.add(ws)
        db.commit()
        db.refresh(ws)
        return ws

    @staticmethod
    def create(db: Session, pdf_id: int | None, name: str, user_id: str, case_context: dict | None = None):
        # user_id is now mandatory
        payload = apply_case_context_to_dict({
            "pdf_id": pdf_id if pdf_id and pdf_id > 0 else None,
            "name": name,
            "user_id": user_id,
        }, case_context or {})
        db_ws = Workspace(**payload)
        db.add(db_ws)
        db.commit()
        db.refresh(db_ws)
        return db_ws
