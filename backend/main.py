from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx

# Database
from src.db.db import Base, engine, get_db

# Routers
from src.routers.workspace_router import router as workspace_router
from src.routers.highlight_router import router as highlight_router
from src.routers.pdf_drawing_line_router import router as pdf_drawing_line_router
from src.routers.box_router import router as boxes_router
from src.routers.pdf_router import router as pdf_router
from src.routers.snippet_router import router as snippet_router
from src.routers.line_router import router as line_router
from src.routers.connection_router import router as connection_router
from src.routers.pdf_text_router import router as pdf_text_router
from src.models.pdf_text_model import PdfText
from src.routers.pdf_brush_highlight_router import router as pdf_brush_highlight_router
# 🚀 Dev mode: auto-create tables (disable in production)
Base.metadata.create_all(bind=engine)

# FastAPI app
app = FastAPI(title="Workspace Backend")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://localhost:3333","https://172.25.0.41:3333","https://beta.mphc.gov.in:8888","https://beta.mphc.gov.in:8888/react","https://beta.mphc.gov.in:8888/react/"],
    allow_credentials=True,

    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(pdf_router, prefix="/pdfs", tags=["pdfs"])
app.include_router(snippet_router, prefix="/snippets", tags=["snippets"])
app.include_router(boxes_router, prefix="/boxes", tags=["boxes"])
app.include_router(line_router, prefix="/lines", tags=["lines"])
app.include_router(connection_router, prefix="/connections", tags=["connections"])
app.include_router(workspace_router)
app.include_router(highlight_router, prefix="/highlights", tags=["highlights"])
app.include_router(pdf_text_router, prefix="/pdf_texts", tags=["pdf_texts"])
app.include_router(pdf_drawing_line_router, prefix="/pdf_drawing_lines", tags=["pdf_drawing_lines"])
app.include_router(pdf_brush_highlight_router, prefix="/pdf_brush_highlights", tags=["pdf_brush_highlights"])
@app.get("/")
def root():
    return {"ok": True, "msg": "Workspace Backend running"}


