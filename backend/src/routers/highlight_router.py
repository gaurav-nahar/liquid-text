from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from src.db.db import get_db
from src.request.highlight_request import HighlightCreate, HighlightOut
from src.repo.highlight_repo import HighlightRepo
from typing import List, Optional

router = APIRouter()

@router.post("/", response_model=HighlightOut)
def save_highlight(req: HighlightCreate, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    return HighlightRepo.create(db, req, user_id=x_user_id)

@router.get("/pdf/{pdf_id}", response_model=List[HighlightOut])
def get_highlights(pdf_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    return HighlightRepo.get_by_pdf(db, pdf_id, user_id=x_user_id)

@router.delete("/{hl_id}")
def delete_highlight(hl_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    if not HighlightRepo.delete(db, hl_id, user_id=x_user_id):
        raise HTTPException(status_code=404, detail="Highlight not found or unauthorized")
    return {"ok": True}