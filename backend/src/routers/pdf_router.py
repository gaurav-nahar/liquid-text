import asyncio
import base64
import binascii
import hashlib
import io
import logging
import os
import subprocess
import tempfile
import time
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from src.db.db import get_db
from src.request.pdf_request import PdfCreate, PdfOut
from src.repo.pdf_repo import PDFRepo
from src.models.pdf_model import PDFFile
from PIL import Image, ImageOps, ImageFilter

from src.cache.cache import cache_get, cache_set, cache_delete, cache_delete_pattern, get_redis

logger = logging.getLogger(__name__)

SUMMARY_SERVICE_URL = os.getenv("SUMMARY_SERVICE_URL", "http://127.0.0.1:8010/summarize")
SUMMARY_SERVICE_TIMEOUT = float(os.getenv("SUMMARY_SERVICE_TIMEOUT", "240"))
SUMMARY_CACHE_TTL_SECONDS = int(os.getenv("SUMMARY_CACHE_TTL_SECONDS", "1800"))

# Redis-backed summary cache helpers
# Keys: summary:result:{hash}  and  summary:job:{hash}
# Falls back to in-memory dict when Redis is unavailable
_MEM_RESULT: Dict[str, Dict[str, Any]] = {}
_MEM_JOB: Dict[str, Dict[str, Any]] = {}

def _summary_result_key(cache_key: str) -> str:
    return f"summary:result:{cache_key}"

def _summary_job_key(cache_key: str) -> str:
    return f"summary:job:{cache_key}"

def _get_result(cache_key: str) -> Dict[str, Any] | None:
    val = cache_get(_summary_result_key(cache_key))
    return val if val is not None else _MEM_RESULT.get(cache_key)

def _set_result(cache_key: str, payload: Dict[str, Any]) -> None:
    cache_set(_summary_result_key(cache_key), payload, ttl=SUMMARY_CACHE_TTL_SECONDS)
    _MEM_RESULT[cache_key] = payload

def _get_job(cache_key: str) -> Dict[str, Any] | None:
    val = cache_get(_summary_job_key(cache_key))
    return val if val is not None else _MEM_JOB.get(cache_key)

def _set_job(cache_key: str, payload: Dict[str, Any]) -> None:
    # Never store asyncio Task in Redis — strip it before serialising
    serialisable = {k: v for k, v in payload.items() if k != "task"}
    cache_set(_summary_job_key(cache_key), serialisable, ttl=SUMMARY_CACHE_TTL_SECONDS)
    _MEM_JOB[cache_key] = payload  # keep full dict (with task) in local memory

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
        
        logger.debug(f"proxy_pdf: fetching {url}")
        
        async with httpx.AsyncClient(follow_redirects=True) as client:
            try:
                response = await client.get(
                    url, 
                    timeout=30.0,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                    }
                )
                logger.debug(f"proxy_pdf: status {response.status_code}")
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                logger.error(f"proxy_pdf: upstream error {e.response.status_code} for {url}")
                raise HTTPException(
                    status_code=e.response.status_code, 
                    detail=f"External server error: {e.response.reason_phrase}"
                )
            except httpx.RequestError as e:
                logger.error(f"proxy_pdf: connection failed {e}")
                raise HTTPException(status_code=502, detail=f"Cannot reach external server: {str(e)}")
            
            content_type = response.headers.get("content-type", "").lower()
            logger.debug(f"proxy_pdf: content_type={content_type} size={len(response.content)}")

            if "pdf" not in content_type and not url.lower().endswith(".pdf"):
                logger.warning(f"proxy_pdf: URL may not be a PDF content_type={content_type}")
            
            return Response(
                content=response.content,
                media_type="application/pdf"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"proxy_pdf failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching PDF: {str(e)}")


class SummarizeRequest(BaseModel):
    text: str


class OcrSelectionRequest(BaseModel):
    image_data: str
    lang: str = "hin+eng"


def normalize_ocr_text(value: str) -> str:
    lines = []
    for raw_line in value.splitlines():
        line = " ".join(raw_line.split())
        if line:
            lines.append(line)
    return "\n".join(lines).strip()


def make_summary_cache_key(text: str) -> str:
    normalized = " ".join(text.split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def prune_summary_cache() -> None:
    # Redis handles TTL expiry automatically.
    # Prune in-memory fallback dicts only.
    now = time.time()
    for d in (_MEM_RESULT, _MEM_JOB):
        stale = [k for k, v in d.items() if now - v.get("updated_at", now) > SUMMARY_CACHE_TTL_SECONDS]
        for k in stale:
            d.pop(k, None)


def extract_summary_error(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        return str(exc.detail)

    if isinstance(exc, httpx.HTTPStatusError):
        detail = None
        try:
            detail = exc.response.json().get("detail")
        except Exception:
            detail = exc.response.text
        return f"Summary service error ({exc.response.status_code}): {detail or 'upstream failure'}"

    if isinstance(exc, httpx.RequestError):
        return f"Could not reach summary service: {str(exc)}"

    return f"Summarization failed: {exc}"


async def request_summary_from_service(text: str) -> str:
    async with httpx.AsyncClient(timeout=SUMMARY_SERVICE_TIMEOUT) as client:
        response = await client.post(
            SUMMARY_SERVICE_URL,
            json={"text": text},
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        response.raise_for_status()
        data = response.json()

    summary = data.get("summary", "").strip()
    if not summary:
        raise HTTPException(status_code=502, detail="Summary service returned an empty summary")
    return summary


def get_summary_status_payload(cache_key: str) -> Dict[str, Any]:
    prune_summary_cache()

    cached = _get_result(cache_key)
    if cached:
        return {
            "status": "completed",
            "cache_key": cache_key,
            "summary": cached["summary"],
            "cached": True,
            "updated_at": cached["updated_at"],
        }

    job = _get_job(cache_key)
    if not job:
        return {"status": "not_found", "cache_key": cache_key}

    # Treat jobs stuck in "pending" beyond the service timeout as timed out
    if job.get("status") == "pending":
        age = time.time() - job.get("updated_at", time.time())
        if age > SUMMARY_SERVICE_TIMEOUT + 60:
            return {"status": "failed", "cache_key": cache_key, "error": "Summary job timed out"}

    payload = {
        "status": job.get("status", "pending"),
        "cache_key": cache_key,
        "updated_at": job.get("updated_at"),
    }
    if job.get("status") == "failed":
        payload["error"] = job.get("error") or "Summary generation failed."
    return payload


async def run_summary_job(cache_key: str, text: str) -> None:
    try:
        summary = await request_summary_from_service(text)
    except Exception as exc:
        error_message = extract_summary_error(exc)
        logger.exception("Summary job failed for cache_key=%s", cache_key)
        _set_job(cache_key, {"status": "failed", "error": error_message, "updated_at": time.time()})
        return

    updated_at = time.time()
    _set_result(cache_key, {"summary": summary, "updated_at": updated_at})
    _set_job(cache_key, {"status": "completed", "updated_at": updated_at})


def decode_image_data(image_data: str) -> bytes:
    payload = image_data.strip()
    if "," in payload and payload.startswith("data:"):
        payload = payload.split(",", 1)[1]
    try:
        return base64.b64decode(payload)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=400, detail="Invalid image payload for OCR") from exc


def preprocess_ocr_image(image_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("L")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="OCR image could not be opened") from exc

    image = ImageOps.autocontrast(image)
    if image.width < 1200:
        scale = max(2, min(4, int(1200 / max(1, image.width))))
        image = image.resize((image.width * scale, image.height * scale), Image.Resampling.LANCZOS)

    image = image.filter(ImageFilter.SHARPEN)
    return image


def run_tesseract_ocr(image: Image.Image, lang: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as temp_file:
        temp_path = temp_file.name

    try:
        image.save(temp_path, format="PNG")
        result = subprocess.run(
            [
                "tesseract",
                temp_path,
                "stdout",
                "-l",
                lang,
                "--oem",
                "1",
                "--psm",
                "6",
                "-c",
                "preserve_interword_spaces=1",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass

    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"OCR failed: {result.stderr.strip() or 'tesseract error'}")

    return normalize_ocr_text(result.stdout)


@router.post("/ocr_selection")
async def ocr_selection(request: Request, req: OcrSelectionRequest):
    image_bytes = decode_image_data(req.image_data)
    image = preprocess_ocr_image(image_bytes)
    text = run_tesseract_ocr(image, req.lang or "hin+eng")
    return {"text": text}

@router.get("/summarize/status/{cache_key}")
async def summarize_pdf_status(cache_key: str):
    payload = get_summary_status_payload(cache_key)
    if payload["status"] == "not_found":
        raise HTTPException(status_code=404, detail="Summary job not found")
    if payload["status"] == "pending":
        return JSONResponse(status_code=202, content=payload)
    return payload


@router.delete("/summarize/cache/{cache_key}")
async def clear_summary_cache(cache_key: str):
    """Delete cached summary for a specific cache_key so the next request hits the GPU server fresh."""
    cache_delete(_summary_result_key(cache_key))
    cache_delete(_summary_job_key(cache_key))
    _MEM_RESULT.pop(cache_key, None)
    _MEM_JOB.pop(cache_key, None)
    return {"status": "cleared", "cache_key": cache_key}


@router.delete("/summarize/cache")
async def clear_all_summary_cache():
    """Delete ALL cached summaries so every next request hits the GPU server fresh."""
    cache_delete_pattern("summary:result:*")
    cache_delete_pattern("summary:job:*")
    _MEM_RESULT.clear()
    _MEM_JOB.clear()
    return {"status": "all_cleared"}


@router.post("/summarize")
async def summarize_pdf(request: Request, req: SummarizeRequest, async_mode: bool = Query(False)):
    """Forward PDF text to the self-hosted summary service."""
    logger.debug(f"summarize: text_len={len(req.text)}")
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    cache_key = make_summary_cache_key(req.text)
    cached_payload = get_summary_status_payload(cache_key)
    if cached_payload["status"] == "completed":
        cached_payload["cached"] = True
        return cached_payload

    current_job = _get_job(cache_key)
    if current_job and current_job.get("status") == "pending":
        age = time.time() - current_job.get("updated_at", time.time())
        if age <= SUMMARY_SERVICE_TIMEOUT + 60:
            return JSONResponse(
                status_code=202,
                content={"status": "pending", "cache_key": cache_key, "message": "Summary generation already in progress."},
            )

    if async_mode:
        task = asyncio.create_task(run_summary_job(cache_key, req.text))
        _set_job(cache_key, {"status": "pending", "updated_at": time.time(), "task": task})
        return JSONResponse(
            status_code=202,
            content={
                "status": "pending",
                "cache_key": cache_key,
                "message": "Summary generation started.",
            },
        )

    try:
        summary = await request_summary_from_service(req.text)
        updated_at = time.time()
        _set_result(cache_key, {"summary": summary, "updated_at": updated_at})
        _set_job(cache_key, {"status": "completed", "updated_at": updated_at})
        return {
            "status": "completed",
            "cache_key": cache_key,
            "summary": summary,
            "cached": False,
            "updated_at": updated_at,
        }
    except Exception as exc:
        error_message = extract_summary_error(exc)
        logger.exception("Synchronous summary request failed for cache_key=%s", cache_key)
        raise HTTPException(status_code=502, detail=error_message) from exc


@router.post("/open", response_model=PdfOut)
def open_or_create_pdf(req: PdfCreate, db: Session = Depends(get_db)):
    logger.debug(f"open_pdf: name={req.name}")

    # Properly check existing PDF with both name and path
    pdf = (
        db.query(PDFFile)
        .filter(PDFFile.name == req.name, PDFFile.path == req.path)
        .order_by(PDFFile.version.desc())
        .first()
    )

    if pdf:
        logger.debug(f"open_pdf: found existing id={pdf.id}")
        return pdf

    logger.debug("open_pdf: creating new")
    new_pdf = PDFRepo.create(db, req)
    logger.debug(f"open_pdf: created id={new_pdf.id}")
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
    logger.debug(f"save_annotations: pdf_id={pdf_id} user={x_user_id}")
    
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
        logger.error(f"save_annotations failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
