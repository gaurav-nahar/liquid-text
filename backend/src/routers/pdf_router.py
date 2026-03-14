from fastapi import APIRouter, Depends, HTTPException, Response, Query, Header
from sqlalchemy.orm import Session
import httpx
from src.db.db import get_db
from src.request.pdf_request import PdfCreate, PdfOut
from src.repo.pdf_repo import PDFRepo
from src.models.pdf_model import PDFFile

router = APIRouter()

@router.get("/proxy_pdf")
async def proxy_pdf(pdf_url: str = Query(..., alias="url")):
    """
    Proxy endpoint to fetch PDFs from external URLs.
    This solves CORS issues when loading PDFs from different domains.
    - Supports 'url' or 'pdf_url' query parameter.
    """
    try:
        url = pdf_url.strip() if pdf_url else ""
        if not url:
            raise HTTPException(status_code=400, detail="URL cannot be empty")
        
        if not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
        
        print(f"[DEBUG] Proxy_pdf fetching from: {url}")
        
        async with httpx.AsyncClient(follow_redirects=True) as client:
            try:
                response = await client.get(
                    url, 
                    timeout=30.0,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                    }
                )
                print(f"[DEBUG] External site responded with status: {response.status_code}")
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                print(f"[ERROR] External site error: {e.response.status_code} for {url}")
                raise HTTPException(
                    status_code=e.response.status_code, 
                    detail=f"External server error: {e.response.reason_phrase}"
                )
            except httpx.RequestError as e:
                print(f"[ERROR] Connection failed: {str(e)}")
                raise HTTPException(status_code=502, detail=f"Cannot reach external server: {str(e)}")
            
            content_type = response.headers.get("content-type", "").lower()
            print(f"[DEBUG] Received content_type: {content_type}, size: {len(response.content)} bytes")

            if "pdf" not in content_type and not url.lower().endswith(".pdf"):
                print(f"[WARNING] URL might not be a PDF: {content_type}")
            
            return Response(
                content=response.content,
                media_type="application/pdf"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Proxy_pdf failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching PDF: {str(e)}")


@router.post("/open", response_model=PdfOut)
def open_or_create_pdf(req: PdfCreate, db: Session = Depends(get_db)):
    print(f"[DEBUG] Request: name={req.name}, path={req.path}")

    # Properly check existing PDF with both name and path
    pdf = (
        db.query(PDFFile)
        .filter(PDFFile.name == req.name, PDFFile.path == req.path)
        .order_by(PDFFile.version.desc())
        .first()
    )

    if pdf:
        print(f"[DEBUG] Found existing PDF: id={pdf.id}, version={pdf.version}")
        return pdf

    print("[DEBUG] No existing PDF found, creating new PDF...")
    new_pdf = PDFRepo.create(db, req)
    print(f"[DEBUG] Created new PDF: id={new_pdf.id}, version={new_pdf.version}")
    return new_pdf



# ---------------------------------------------------------
# 🔥 2) Get latest PDF by file name
# ---------------------------------------------------------
@router.get("/latest/{file_name}", response_model=PdfOut)
def get_latest_pdf(file_name: str, db: Session = Depends(get_db)):
    pdf = PDFRepo.get_latest_by_name(db, file_name)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    return pdf


# ---------------------------------------------------------
# 🔥 3) Get PDF by ID
# ---------------------------------------------------------
@router.get("/{pdf_id}", response_model=PdfOut)
def get_pdf(pdf_id: int, db: Session = Depends(get_db)):
    pdf = PDFRepo.get(db, pdf_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    return pdf

# ---------------------------------------------------------
# 🔥 4) Save All Annotations (Bundled)
# ---------------------------------------------------------
from src.models.highlight_model import Highlight
from src.models.pdf_text_model import PdfText
from src.models.pdf_drawing_line_model import PdfDrawingLine
from src.models.pdf_brush_highlight_model import PdfBrushHighlight
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

# ----------------------------
# HELPER FUNCTIONS
# ----------------------------
def safe_float(value, default=0.0):
    try:
        if value is None:
            return default
        val = float(value)
        # Check for nan/inf without importing math if possible, or simpler check
        if val != val: # NaN check 
            return default
        if val == float('inf') or val == float('-inf'):
            return default
        return val
    except (TypeError, ValueError):
        return default

def safe_int(value, default=0):
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default

class PdfAnnotationsSave(BaseModel):
    highlights: List[Dict[str, Any]] = []
    pdf_texts: List[Dict[str, Any]] = []
    pdf_drawing_lines: List[Dict[str, Any]] = []
    brush_highlights: List[Dict[str, Any]] = []


@router.post("/{pdf_id}/save_annotations")
def save_pdf_annotations(pdf_id: int, payload: PdfAnnotationsSave, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
    """
    Save PDF annotations with proper upsert logic and user isolation.
    """
    print(f"[DEBUG] Saving Annotations for PDF ID: {pdf_id}, User ID: {x_user_id}")
    
    # ID Tracking
    id_map = {}
    touched_highlight_ids = []
    touched_pdftext_ids = []
    touched_pdfline_ids = []
    touched_brush_ids = []

    try:
        # ========================================
        # 1️⃣ UPSERT HIGHLIGHTS
        # ========================================
        for hl_data in payload.highlights:
            frontend_id = hl_data.get("id")
            db_id = safe_int(frontend_id)
            
            data = {
                "pdf_id": pdf_id,
                "user_id": x_user_id,
                "page_num": safe_int(hl_data.get("page_num")),
                "color": hl_data.get("color", "#FFEB3B"),
                "x_pct": safe_float(hl_data.get("x_pct")),
                "y_pct": safe_float(hl_data.get("y_pct")),
                "width_pct": safe_float(hl_data.get("width_pct")),
                "height_pct": safe_float(hl_data.get("height_pct")),
                "content": hl_data.get("content", "")
            }
            
            if db_id > 0:
                existing = db.query(Highlight).filter(Highlight.id == db_id, Highlight.pdf_id == pdf_id, Highlight.user_id == x_user_id).first()
                if existing:
                    for k, v in data.items():
                        if k != "id" and hasattr(existing, k):
                            setattr(existing, k, v)
                    touched_highlight_ids.append(db_id)
                    id_map[str(frontend_id)] = db_id
                    continue
            
            new_hl = Highlight(**data)
            db.add(new_hl)
            db.flush()
            new_id = new_hl.id
            touched_highlight_ids.append(new_id)
            if frontend_id:
                id_map[str(frontend_id)] = new_id

        # ========================================
        # 2️⃣ UPSERT PDF TEXTS
        # ========================================
        for txt_data in payload.pdf_texts:
            frontend_id = txt_data.get("id")
            db_id = safe_int(frontend_id)
            
            data = {
                "pdf_id": pdf_id,
                "user_id": x_user_id,
                "page_num": safe_int(txt_data.get("page_num")),
                "text": txt_data.get("text", ""),
                "x_pct": safe_float(txt_data.get("x_pct")),
                "y_pct": safe_float(txt_data.get("y_pct"))
            }
            
            if db_id > 0:
                existing = db.query(PdfText).filter(PdfText.id == db_id, PdfText.pdf_id == pdf_id, PdfText.user_id == x_user_id).first()
                if existing:
                    for k, v in data.items():
                        if k != "id" and hasattr(existing, k):
                            setattr(existing, k, v)
                    touched_pdftext_ids.append(db_id)
                    id_map[str(frontend_id)] = db_id
                    continue
            
            new_txt = PdfText(**data)
            db.add(new_txt)
            db.flush()
            new_id = new_txt.id
            touched_pdftext_ids.append(new_id)
            if frontend_id:
                id_map[str(frontend_id)] = new_id

        # ========================================
        # 3️⃣ UPSERT PDF DRAWING LINES
        # ========================================
        for line_data in payload.pdf_drawing_lines:
            frontend_id = line_data.get("id")
            db_id = safe_int(frontend_id)
            
            data = {
                "pdf_id": pdf_id,
                "user_id": x_user_id,
                "page_num": safe_int(line_data.get("page_num")),
                "points": line_data.get("points", []),
                "color": line_data.get("color", "black"),
                "stroke_width": safe_float(line_data.get("stroke_width", 2.0))
            }
            
            if db_id > 0:
                existing = db.query(PdfDrawingLine).filter(PdfDrawingLine.id == db_id, PdfDrawingLine.pdf_id == pdf_id, PdfDrawingLine.user_id == x_user_id).first()
                if existing:
                    for k, v in data.items():
                        if k != "id" and hasattr(existing, k):
                            setattr(existing, k, v)
                    touched_pdfline_ids.append(db_id)
                    id_map[str(frontend_id)] = db_id
                    continue
            
            new_line = PdfDrawingLine(**data)
            db.add(new_line)
            db.flush()
            new_id = new_line.id
            touched_pdfline_ids.append(new_id)
            if frontend_id:
                id_map[str(frontend_id)] = new_id

        # ========================================
        # 4️⃣ UPSERT BRUSH HIGHLIGHTS
        # ========================================
        for brush_data in payload.brush_highlights:
            frontend_id = brush_data.get("id")
            db_id = safe_int(frontend_id)
            
            data = {
                "pdf_id": pdf_id,
                "user_id": x_user_id,
                "page_num": safe_int(brush_data.get("page_num")),
                "path_data": brush_data.get("path_data", []),
                "color": brush_data.get("color", "#FFEB3B"),
                "brush_width": safe_float(brush_data.get("brush_width", 10.0))
            }
            
            if db_id > 0:
                existing = db.query(PdfBrushHighlight).filter(PdfBrushHighlight.id == db_id, PdfBrushHighlight.pdf_id == pdf_id, PdfBrushHighlight.user_id == x_user_id).first()
                if existing:
                    for k, v in data.items():
                        if k != "id" and hasattr(existing, k):
                            setattr(existing, k, v)
                    touched_brush_ids.append(db_id)
                    id_map[str(frontend_id)] = db_id
                    continue
            
            new_brush = PdfBrushHighlight(**data)
            db.add(new_brush)
            db.flush()
            new_id = new_brush.id
            touched_brush_ids.append(new_id)
            if frontend_id:
                id_map[str(frontend_id)] = new_id

        # ========================================
        # 5️⃣ DELETE ORPHANED ITEMS (Isolated by user_id)
        # ========================================
        
        # Highlights
        db.query(Highlight).filter(
            Highlight.pdf_id == pdf_id,
            Highlight.user_id == x_user_id,
            ~Highlight.id.in_(touched_highlight_ids)
        ).delete(synchronize_session=False)

        # PdfText
        db.query(PdfText).filter(
            PdfText.pdf_id == pdf_id,
            PdfText.user_id == x_user_id,
            ~PdfText.id.in_(touched_pdftext_ids)
        ).delete(synchronize_session=False)

        # PdfDrawingLine
        db.query(PdfDrawingLine).filter(
            PdfDrawingLine.pdf_id == pdf_id,
            PdfDrawingLine.user_id == x_user_id,
            ~PdfDrawingLine.id.in_(touched_pdfline_ids)
        ).delete(synchronize_session=False)

        # BrushHighlight
        db.query(PdfBrushHighlight).filter(
            PdfBrushHighlight.pdf_id == pdf_id,
            PdfBrushHighlight.user_id == x_user_id,
            ~PdfBrushHighlight.id.in_(touched_brush_ids)
        ).delete(synchronize_session=False)

        # ========================================
        # 6️⃣ COMMIT & RETURN (Return only User's data)
        # ========================================
        db.commit()

        return {
            "status": "success",
            "id_map": id_map,
            "highlights": [
                {
                    "id": h.id, "page_num": h.page_num, "color": h.color,
                    "x_pct": h.x_pct, "y_pct": h.y_pct, "width_pct": h.width_pct,
                    "height_pct": h.height_pct, "content": h.content
                } for h in db.query(Highlight).filter(Highlight.pdf_id == pdf_id, Highlight.user_id == x_user_id).all()
            ],
            "pdf_texts": [
                {
                    "id": t.id, "page_num": t.page_num, "text": t.text,
                    "x_pct": t.x_pct, "y_pct": t.y_pct
                } for t in db.query(PdfText).filter(PdfText.pdf_id == pdf_id, PdfText.user_id == x_user_id).all()
            ],
            "pdf_drawing_lines": [
                {
                    "id": l.id, "page_num": l.page_num, "points": l.points,
                    "color": l.color, "stroke_width": l.stroke_width
                } for l in db.query(PdfDrawingLine).filter(PdfDrawingLine.pdf_id == pdf_id, PdfDrawingLine.user_id == x_user_id).all()
            ],
            "brush_highlights": [
                {
                    "id": h.id, "page_num": h.page_num, "path_data": h.path_data,
                    "color": h.color, "brush_width": h.brush_width
                } for h in db.query(PdfBrushHighlight).filter(PdfBrushHighlight.pdf_id == pdf_id, PdfBrushHighlight.user_id == x_user_id).all()
            ],
        }

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to save annotations: {e}")
        raise HTTPException(status_code=500, detail=str(e))
