from sqlalchemy.orm import Session
from src.models.workspace_model import Workspace
from src.utils.case_context import apply_case_context_to_dict

class WorkspaceRepo:
    @staticmethod
    def get_by_pdf(db: Session, pdf_id: int, user_id: str):
        # user_id is now mandatory
        return db.query(Workspace).filter(Workspace.pdf_id == pdf_id, Workspace.user_id == user_id).all()

    @staticmethod
    def _null_safe_eq(column, value):
        """Return a SQLAlchemy filter clause that handles NULL correctly.
        
        PostgreSQL: NULL = NULL -> FALSE (always), so we must use IS NULL
        when the value is None. Without this, get_or_create creates a NEW
        workspace on every call instead of finding the existing one.
        """
        if value is None:
            return column.is_(None)
        return column == value

    @staticmethod
    def get_or_create_for_case(db: Session, diary_no: str, diary_year: str, establishment: str, user_id: str):
        """Find or create a single shared workspace for a diary case (pdf_id=None).

        Uses null-safe comparisons because PostgreSQL NULL == NULL -> FALSE.
        Without this, every call with diary_no/year=None creates a new workspace.
        """
        ws = db.query(Workspace).filter(
            WorkspaceRepo._null_safe_eq(Workspace.diary_no, diary_no),
            WorkspaceRepo._null_safe_eq(Workspace.diary_year, diary_year),
            WorkspaceRepo._null_safe_eq(Workspace.establishment, establishment),
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
