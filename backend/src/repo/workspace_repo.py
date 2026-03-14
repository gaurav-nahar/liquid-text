from sqlalchemy.orm import Session
from src.models.workspace_model import Workspace

class WorkspaceRepo:
    @staticmethod
    def get_by_pdf(db: Session, pdf_id: int, user_id: str):
        # user_id is now mandatory
        return db.query(Workspace).filter(Workspace.pdf_id == pdf_id, Workspace.user_id == user_id).all()

    @staticmethod
    def create(db: Session, pdf_id: int, name: str, user_id: str):
        # user_id is now mandatory
        db_ws = Workspace(pdf_id=pdf_id, name=name, user_id=user_id)
        db.add(db_ws)
        db.commit()
        db.refresh(db_ws)
        return db_ws