from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional

from src.db.db import get_db
from src.request.pdf_drawing_line_request import PdfDrawingLineCreate, PdfDrawingLineResponse
from src.repo.pdf_drawing_line_repo import PdfLineRepo

router = APIRouter()

@router.post("/", response_model=PdfDrawingLineResponse)
def create_pdf_line(data: PdfDrawingLineCreate, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    return PdfLineRepo.create(db, data.pdf_id, data, user_id=x_user_id)

@router.get("/pdf/{pdf_id}", response_model=List[PdfDrawingLineResponse])
def get_pdf_lines(pdf_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    return PdfLineRepo.get_by_pdf(db, pdf_id, user_id=x_user_id)

@router.delete("/{line_id}")
def delete_pdf_line(line_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    if not PdfLineRepo.delete(db, line_id, user_id=x_user_id):
        raise HTTPException(status_code=404, detail="PDF Line not found or unauthorized")
    return {"ok": True}

@router.delete("/bulk/pdf/{pdf_id}")
def delete_all_pdf_lines(pdf_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    PdfLineRepo.sync_lines(db, pdf_id, [], user_id=x_user_id) # Effectively deletes all
    return {"ok": True}
    
@router.post("/sync/pdf/{pdf_id}", response_model=List[PdfDrawingLineResponse])
def sync_pdf_lines(pdf_id: int, items: List[dict], db: Session = Depends(get_db), x_user_id: str = Header(...)):
    return PdfLineRepo.sync_lines(db, pdf_id, items, user_id=x_user_id)

@router.get("/health")
def health_check():
    return {"status": "ok", "msg": "PDF Drawing Lines Router is operational"}