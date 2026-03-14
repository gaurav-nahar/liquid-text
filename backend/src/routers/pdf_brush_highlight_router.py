from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from src.db.db import get_db
from src.repo import pdf_brush_highlight_repo
from src.request.pdf_brush_highlight_request import BrushHighlightCreate, BrushHighlightResponse, BrushHighlightSyncItem

router = APIRouter()

@router.get("/pdf/{pdf_id}", response_model=List[BrushHighlightResponse])
def get_brush_highlights(pdf_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    return pdf_brush_highlight_repo.get_all_by_pdf_id(db, pdf_id, user_id=x_user_id)

@router.post("/pdf/{pdf_id}", response_model=BrushHighlightResponse)
def create_brush_highlight(pdf_id: int, highlight: BrushHighlightCreate, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    path_data = [{"xPct": p.xPct, "yPct": p.yPct} for p in highlight.path_data]
    return pdf_brush_highlight_repo.create(db, pdf_id, highlight.page_num, path_data, highlight.color, highlight.brush_width, user_id=x_user_id)

@router.post("/sync/pdf/{pdf_id}", response_model=List[BrushHighlightResponse])
def sync_brush_highlights(pdf_id: int, items: List[BrushHighlightSyncItem], db: Session = Depends(get_db), x_user_id: str = Header(...)):
    """Smart sync endpoint that handles reconcilation"""
    data = [item.model_dump() for item in items]
    return pdf_brush_highlight_repo.sync_highlights(db, pdf_id, data, user_id=x_user_id)

@router.delete("/{highlight_id}")
def delete_brush_highlight(highlight_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    if not pdf_brush_highlight_repo.delete(db, highlight_id, user_id=x_user_id):
        raise HTTPException(status_code=404, detail="Not found or unauthorized")
    return {"message": "Deleted"}