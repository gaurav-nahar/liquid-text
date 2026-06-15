from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from src.models.documentation_model import DocumentationPage
from src.models.document_share_model import DocumentShare
from src.request.documentation_request import DocPageCreate, DocPageUpdate


class DocumentationRepo:

    @staticmethod
    def get_by_workspace(db: Session, workspace_id: int, user_id: str):
        """Return pages the user owns OR pages shared with the user."""
        pages = (
            db.query(DocumentationPage)
            .outerjoin(DocumentShare, DocumentShare.doc_id == DocumentationPage.id)
            .filter(
                or_(
                    # Own docs in this workspace
                    and_(
                        DocumentationPage.workspace_id == workspace_id,
                        DocumentationPage.user_id == user_id,
                    ),
                    # Shared docs — any workspace, just needs a share row pointing to this user
                    DocumentShare.shared_with == user_id,
                )
            )
            .distinct()
            .order_by(DocumentationPage.sort_order, DocumentationPage.created_at)
            .all()
        )

        for page in pages:
            page.is_owner = (page.user_id == user_id)
            page.shared_by = None if page.is_owner else page.user_id

        return pages

    @staticmethod
    def get_by_id(db: Session, doc_id: str, user_id: str):
        """Get a single page if user is owner or has share access."""
        page = db.query(DocumentationPage).filter(
            DocumentationPage.id == doc_id,
        ).first()
        if not page:
            return None
        if page.user_id == user_id:
            return page
        share = db.query(DocumentShare).filter(
            DocumentShare.doc_id == doc_id,
            DocumentShare.shared_with == user_id,
        ).first()
        return page if share else None

    @staticmethod
    def create(db: Session, workspace_id: int, user_id: str, req: DocPageCreate):
        page = DocumentationPage(
            id=req.id,
            workspace_id=workspace_id,
            user_id=user_id,
            title=req.title,
            content=req.content,
            sort_order=req.sort_order,
            updated_by=user_id,
        )
        db.add(page)
        db.commit()
        db.refresh(page)
        return page

    @staticmethod
    def update(db: Session, doc_id: str, user_id: str, req: DocPageUpdate):
        """Owner or shared-editor can update. Tracks updated_by for last-write-wins display."""
        page = db.query(DocumentationPage).filter(
            DocumentationPage.id == doc_id,
        ).first()
        if not page:
            return None

        if page.user_id != user_id:
            share = db.query(DocumentShare).filter(
                DocumentShare.doc_id == doc_id,
                DocumentShare.shared_with == user_id,
                DocumentShare.permission == "edit",
            ).first()
            if not share:
                return None

        if req.title is not None:
            page.title = req.title
        if req.content is not None:
            page.content = req.content
        if req.sort_order is not None:
            page.sort_order = req.sort_order
        page.updated_by = user_id

        db.commit()
        db.refresh(page)
        return page

    @staticmethod
    def delete(db: Session, doc_id: str, user_id: str):
        """Only the owner can delete."""
        page = db.query(DocumentationPage).filter(
            DocumentationPage.id == doc_id,
            DocumentationPage.user_id == user_id,
        ).first()
        if not page:
            return False
        db.delete(page)
        db.commit()
        return True

    # ------------------------------------------------------------------
    # SHARE MANAGEMENT
    # ------------------------------------------------------------------

    @staticmethod
    def create_share(db: Session, doc_id: str, owner_id: str, shared_with: str, permission: str = "edit"):
        """Owner shares a doc with another user. Returns None if doc not found or not owner."""
        page = db.query(DocumentationPage).filter(
            DocumentationPage.id == doc_id,
            DocumentationPage.user_id == owner_id,
        ).first()
        if not page:
            return None

        existing = db.query(DocumentShare).filter(
            DocumentShare.doc_id == doc_id,
            DocumentShare.shared_with == shared_with,
        ).first()
        if existing:
            existing.permission = permission
            db.commit()
            db.refresh(existing)
            return existing

        share = DocumentShare(
            doc_id=doc_id,
            shared_by=owner_id,
            shared_with=shared_with,
            permission=permission,
        )
        db.add(share)
        db.commit()
        db.refresh(share)
        return share

    @staticmethod
    def revoke_share(db: Session, doc_id: str, owner_id: str, shared_with: str):
        """Owner revokes a share."""
        page = db.query(DocumentationPage).filter(
            DocumentationPage.id == doc_id,
            DocumentationPage.user_id == owner_id,
        ).first()
        if not page:
            return False

        share = db.query(DocumentShare).filter(
            DocumentShare.doc_id == doc_id,
            DocumentShare.shared_with == shared_with,
        ).first()
        if not share:
            return False

        db.delete(share)
        db.commit()
        return True

    @staticmethod
    def list_shares(db: Session, doc_id: str, owner_id: str):
        """List all users a doc is shared with. Owner only."""
        page = db.query(DocumentationPage).filter(
            DocumentationPage.id == doc_id,
            DocumentationPage.user_id == owner_id,
        ).first()
        if not page:
            return None
        return db.query(DocumentShare).filter(DocumentShare.doc_id == doc_id).all()
