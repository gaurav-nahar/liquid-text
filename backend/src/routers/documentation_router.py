from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List

from src.db.db import get_db
from src.repo.documentation_repo import DocumentationRepo
from src.request.documentation_request import (
    DocPageCreate, DocPageUpdate, DocPageOut,
    DocShareCreate, DocShareOut,
)

router = APIRouter()


@router.get("/workspace/{workspace_id}", response_model=List[DocPageOut])
def get_pages(workspace_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    return DocumentationRepo.get_by_workspace(db, workspace_id, user_id=x_user_id)


@router.post("/workspace/{workspace_id}", response_model=DocPageOut)
def create_page(workspace_id: int, req: DocPageCreate, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    return DocumentationRepo.create(db, workspace_id, user_id=x_user_id, req=req)


@router.put("/{doc_id}", response_model=DocPageOut)
def update_page(doc_id: str, req: DocPageUpdate, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    page = DocumentationRepo.update(db, doc_id, user_id=x_user_id, req=req)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found or unauthorized")
    return page


@router.delete("/{doc_id}")
def delete_page(doc_id: str, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    ok = DocumentationRepo.delete(db, doc_id, user_id=x_user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Page not found or unauthorized")
    return {"message": "Deleted successfully"}


@router.post("/{doc_id}/share", response_model=DocShareOut)
def share_page(doc_id: str, req: DocShareCreate, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    share = DocumentationRepo.create_share(
        db, doc_id, owner_id=x_user_id,
        shared_with=req.shared_with, permission=req.permission,
    )
    if not share:
        raise HTTPException(status_code=404, detail="Page not found or you are not the owner")
    return share


@router.delete("/{doc_id}/share/{shared_with}")
def revoke_share(doc_id: str, shared_with: str, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    ok = DocumentationRepo.revoke_share(db, doc_id, owner_id=x_user_id, shared_with=shared_with)
    if not ok:
        raise HTTPException(status_code=404, detail="Share not found or you are not the owner")
    return {"message": "Share revoked"}


@router.get("/{doc_id}/shares", response_model=List[DocShareOut])
def list_shares(doc_id: str, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    shares = DocumentationRepo.list_shares(db, doc_id, owner_id=x_user_id)
    if shares is None:
        raise HTTPException(status_code=404, detail="Page not found or you are not the owner")
    return shares
