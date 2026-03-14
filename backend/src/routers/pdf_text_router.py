from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from src.db.db import get_db
from src.request.pdf_text_request import PdfTextCreate, PdfTextOut
from src.repo.pdf_text_repo import PdfTextRepo
from typing import List, Optional

router = APIRouter()

@router.post("/", response_model=PdfTextOut)
def save_pdf_text(req: PdfTextCreate, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    return PdfTextRepo.create(db, req, user_id=x_user_id)

@router.get("/pdf/{pdf_id}", response_model=List[PdfTextOut])
def get_pdf_texts(pdf_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    return PdfTextRepo.get_by_pdf(db, pdf_id, user_id=x_user_id)

@router.put("/{text_id}", response_model=PdfTextOut)
def update_pdf_text(text_id: int, req: PdfTextCreate, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    res = PdfTextRepo.update(db, text_id, req, user_id=x_user_id)
    if not res:
        raise HTTPException(status_code=404, detail="Not found")
    return res

@router.delete("/{text_id}")
def delete_pdf_text(text_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    if not PdfTextRepo.delete(db, text_id, user_id=x_user_id):
        raise HTTPException(status_code=404, detail="Annotation not found or unauthorized")
    return {"ok": True}