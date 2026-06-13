from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

import config

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_SIZE = 5 * 1024 * 1024


@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file.")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Supported formats: PNG, JPG, WEBP, GIF.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file was empty.")
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Avatar must be 5 MB or smaller.")
    filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid4().hex}{suffix}"
    (config.AVATARS_DIR / filename).write_bytes(content)
    return {"status": "ok", "avatar_url": f"/uploads/avatars/{filename}"}
