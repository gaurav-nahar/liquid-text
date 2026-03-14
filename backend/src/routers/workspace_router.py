from fastapi import APIRouter, Depends, Request, UploadFile, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
import json
import math
# Repository Imports
from src.repo.workspace_repo import WorkspaceRepo
from src.repo.snippet_repo import SnippetRepo
from src.repo.box_repo import BoxRepo
from src.repo.line_repo import LineRepo
from src.repo.connection_repo import ConnectionRepo

# Database and Models
from src.db.db import get_db
from src.models.snippet_model import Snippet
from src.models.box_model import Box
from src.models.line_model import Line
from src.models.connection_model import Connection
from src.models.workspace_model import Workspace

# Request Models
from src.request.snippet_request import SnippetCreate
from src.request.box_request import BoxCreate, BoxUpdate
from src.request.line_request import LineCreate, LineUpdate
from src.request.connection_request import ConnectionCreate, ConnectionUpdate

router = APIRouter(prefix="/workspace", tags=["workspace"])

# ----------------------------
# HELPERS
# ----------------------------
def safe_float(value, default=0.0):
    try:
        val = float(value)
        if math.isnan(val) or math.isinf(val):
            return default
        return val
    except (TypeError, ValueError):
        return default

def safe_int(value, default=0):
    try:
        if value is None or value == "": return default
        return int(value)
    except (TypeError, ValueError):
        return default

def get_obj_id(obj):
    if obj is None: return None
    if isinstance(obj, dict): return obj.get("id")
    return getattr(obj, "id", None)

def extract_index_and_key(path: str):
    parts = path.split("[")
    idx = parts[1].split("]")[0]
    key = parts[2].split("]")[0]
    return idx, key

# ----------------------------
# SAVE WORKSPACE ENDPOINT
# ----------------------------
@router.get("/list/{pdf_id}")
async def list_workspaces(pdf_id: int, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
    return WorkspaceRepo.get_by_pdf(db, pdf_id, user_id=x_user_id)
# ➕ Naya workspace create karne ke liye
@router.post("/create/{pdf_id}")
async def create_workspace(pdf_id: int, name: str, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
    return WorkspaceRepo.create(db, pdf_id, name, user_id=x_user_id)

@router.post("/save/{pdf_id}/{workspace_id}")
async def save_workspace(pdf_id: int, workspace_id: int, request: Request, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(None)):
    print(f"[DEBUG] save_workspace: pdf_id={pdf_id}, workspace_id={workspace_id}, x_user_id={x_user_id}")
    # Verify workspace belongs to user
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if x_user_id:
        if ws.user_id != x_user_id and ws.user_id != 'legacy_user':
            print(f"[ERROR] Authorization mismatch: workspace.user_id={ws.user_id}, x_user_id={x_user_id}")
            raise HTTPException(status_code=403, detail=f"Not authorized to access this workspace (Owned by {ws.user_id})")
        
        # If it was legacy, claim it or just proceed
        if ws.user_id == 'legacy_user':
            print(f"[INFO] User {x_user_id} is claiming/accessing legacy workspace {workspace_id}")

    form = await request.form()
    
    # 1. PARSE FORM-DATA INTO OBJECTS
    snippets_raw = {}
    boxes_raw = {}
    lines_raw = {}
    connections_raw = {}

    for key, value in form.items():
        if key.startswith("snippets"):
            idx, field = extract_index_and_key(key)
            snippets_raw.setdefault(idx, {})[field] = value
        elif key.startswith("boxes"):
            idx, field = extract_index_and_key(key)
            boxes_raw.setdefault(idx, {})[field] = value
        elif key.startswith("lines"):
            idx, field = extract_index_and_key(key)
            lines_raw.setdefault(idx, {})[field] = value
        elif key.startswith("connections"):
            idx, field = extract_index_and_key(key)
            connections_raw.setdefault(idx, {})[field] = value

    for key, val in form.items():
        if isinstance(val, UploadFile):
            idx, _ = extract_index_and_key(key)
            snippets_raw.setdefault(idx, {})["file"] = val

    # 2. ID TRACKING & MAPPING
    id_map = {}
    touched_snippet_ids = []
    touched_box_ids = []
    touched_line_ids = []
    touched_connection_ids = []

    # 3. UPSERT SNIPPETS
    for s_dict in snippets_raw.values():
        frontend_id = s_dict.get("id")
        s_dict["pdf_id"] = pdf_id
        s_dict["workspace_id"] = workspace_id
        s_type = s_dict.get("type")
        
        update_data = {
            "type": s_type,
            "x": safe_float(s_dict.get("x")),
            "y": safe_float(s_dict.get("y")),
            "width": safe_float(s_dict.get("width")),
            "height": safe_float(s_dict.get("height")),
            "page": safe_int(s_dict.get("page")),
            "content": s_dict.get("content", "image" if s_type == "image" else ""),
            "x_pct": safe_float(s_dict.get("xPct")),
            "y_pct": safe_float(s_dict.get("yPct")),
            "width_pct": safe_float(s_dict.get("widthPct")),
            "height_pct": safe_float(s_dict.get("heightPct"))
        }

        file_obj: Optional[UploadFile] = s_dict.get("file")
        db_id = safe_int(frontend_id)
        
        # Read file binary once if it exists
        file_binary = None
        if file_obj:
            file_binary = await file_obj.read()

        if db_id > 0:
            # TRY UPDATE
            existing = SnippetRepo.update(db, db_id, update_data, user_id=x_user_id, file_binary=file_binary)
            if existing:
                s_id = get_obj_id(existing)
                touched_snippet_ids.append(s_id)
                id_map[str(frontend_id)] = s_id
                continue

        # CREATE
        req = SnippetCreate(
            pdf_id=pdf_id,
            workspace_id=workspace_id,
            type=update_data["type"],
            x=update_data["x"],
            y=update_data["y"],
            width=update_data["width"],
            height=update_data["height"],
            page=update_data["page"],
            content=update_data["content"],
            x_pct=update_data["x_pct"],
            y_pct=update_data["y_pct"],
            width_pct=update_data["width_pct"],
            height_pct=update_data["height_pct"]
        )
        new_snippet = SnippetRepo.create(
            db, pdf_id, workspace_id, req, 
            user_id=x_user_id, 
            file_binary=file_binary
        )
        new_id = get_obj_id(new_snippet)
        touched_snippet_ids.append(new_id)
        if frontend_id: id_map[str(frontend_id)] = new_id

    # 4. UPSERT BOXES
    for b_dict in boxes_raw.values():
        frontend_id = b_dict.get("id")
        b_dict["pdf_id"] = pdf_id
        b_dict["workspace_id"] = workspace_id
        db_id = safe_int(frontend_id)

        if db_id > 0:
            existing = BoxRepo.update(db, db_id, BoxUpdate(**b_dict), user_id=x_user_id)
            if existing:
                b_id = get_obj_id(existing)
                touched_box_ids.append(b_id)
                id_map[str(frontend_id)] = b_id
                continue

        new_box = BoxRepo.create(db, pdf_id, workspace_id, BoxCreate(**b_dict), user_id=x_user_id)
        nb_id = get_obj_id(new_box)
        touched_box_ids.append(nb_id)
        if frontend_id: id_map[str(frontend_id)] = nb_id

    # 5. UPSERT LINES
    for l_dict in lines_raw.values():
        frontend_id = l_dict.get("id")
        l_dict["pdf_id"] = pdf_id
        l_dict["workspace_id"] = workspace_id
        if "points" in l_dict:
            try:
                l_dict["points"] = json.loads(l_dict["points"])
            except:
                continue
        l_dict["stroke_width"] = safe_float(l_dict.get("stroke_width", 2.0))
        db_id = safe_int(frontend_id)

        if db_id > 0:
            existing = LineRepo.update(db, db_id, LineUpdate(**l_dict), user_id=x_user_id)
            if existing:
                new_id = get_obj_id(existing)
                touched_line_ids.append(new_id)
                if frontend_id: id_map[str(frontend_id)] = new_id
                continue
                
        new_line = LineRepo.create(db, pdf_id, workspace_id, LineCreate(**l_dict), user_id=x_user_id)
        new_id = get_obj_id(new_line)
        touched_line_ids.append(new_id)
        if frontend_id: id_map[str(frontend_id)] = new_id

    # 6. UPSERT CONNECTIONS
    for c_dict in connections_raw.values():
        frontend_id = c_dict.get("id")
        c_dict["pdf_id"] = pdf_id
        c_dict["workspace_id"] = workspace_id
        f_src, f_tgt = str(c_dict.get("source_id")), str(c_dict.get("target_id"))
        src_id = id_map.get(f_src, safe_int(f_src))
        tgt_id = id_map.get(f_tgt, safe_int(f_tgt))
        
        if src_id > 0 and tgt_id > 0:
            c_dict["source_id"], c_dict["target_id"] = src_id, tgt_id
            db_id = safe_int(frontend_id)
            if db_id > 0:
                existing = ConnectionRepo.update(db, db_id, ConnectionUpdate(**c_dict), user_id=x_user_id)
                if existing:
                    conn_id = get_obj_id(existing)
                    touched_connection_ids.append(conn_id)
                    if frontend_id: id_map[str(frontend_id)] = conn_id
                    continue
            
            new_conn = ConnectionRepo.create(db, pdf_id, workspace_id, ConnectionCreate(**c_dict), user_id=x_user_id)
            nc_id = get_obj_id(new_conn)
            touched_connection_ids.append(nc_id)
            if frontend_id: id_map[str(frontend_id)] = nc_id

    # 7. DELETE ORPHANS
    db.query(Snippet).filter(Snippet.workspace_id == workspace_id, Snippet.user_id == x_user_id, ~Snippet.id.in_(touched_snippet_ids)).delete(synchronize_session=False)
    db.query(Box).filter(Box.workspace_id == workspace_id, Box.user_id == x_user_id, ~Box.id.in_(touched_box_ids)).delete(synchronize_session=False)
    db.query(Line).filter(Line.workspace_id == workspace_id, Line.user_id == x_user_id, ~Line.id.in_(touched_line_ids)).delete(synchronize_session=False)
    db.query(Connection).filter(Connection.workspace_id == workspace_id, Connection.user_id == x_user_id, ~Connection.id.in_(touched_connection_ids)).delete(synchronize_session=False)
    
    db.commit()
    print(f"[SUCCESS] Workspace {workspace_id} saved for user {x_user_id}")

    return {"message": "Workspace saved successfully", "id_map": id_map}
