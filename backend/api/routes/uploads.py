import uuid
import os
import aiofiles
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db, Upload
from services.storage import upload_path, thumbnail_path
from services.video_processor import probe_video, generate_thumbnail

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv"}
MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024  # 5 GB


@router.post("")
async def upload_video(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Formato no soportado. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    upload_id = str(uuid.uuid4())
    filename = f"{upload_id}{ext}"
    dest = upload_path(filename)

    async with aiofiles.open(dest, "wb") as out:
        total = 0
        while chunk := await file.read(1024 * 1024):
            await out.write(chunk)
            total += len(chunk)
            if total > MAX_FILE_SIZE:
                await out.close()
                os.unlink(dest)
                raise HTTPException(413, "Archivo demasiado grande (máx 5 GB)")

    try:
        info = probe_video(dest)
    except Exception as e:
        os.unlink(dest)
        raise HTTPException(422, f"No se pudo leer el video: {e}")

    thumb_name = None
    try:
        thumb_name = generate_thumbnail(upload_id, filename, time=min(1.0, info["duration"] * 0.1))
    except Exception:
        pass

    record = Upload(
        id=upload_id,
        original_name=file.filename,
        filename=filename,
        size=total,
        duration=info["duration"],
        width=info["width"],
        height=info["height"],
        fps=info["fps"],
        has_audio=int(info["has_audio"]),
        thumbnail=thumb_name,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return _serialize(record)


@router.get("")
def list_uploads(db: Session = Depends(get_db)):
    uploads = db.query(Upload).order_by(Upload.created_at.desc()).all()
    return [_serialize(u) for u in uploads]


@router.delete("/{upload_id}")
def delete_upload(upload_id: str, db: Session = Depends(get_db)):
    record = db.query(Upload).filter(Upload.id == upload_id).first()
    if not record:
        raise HTTPException(404, "Upload no encontrado")
    try:
        os.unlink(upload_path(record.filename))
    except FileNotFoundError:
        pass
    if record.thumbnail:
        try:
            os.unlink(thumbnail_path(record.thumbnail))
        except FileNotFoundError:
            pass
    db.delete(record)
    db.commit()
    return {"ok": True}


@router.get("/{upload_id}/thumbnail")
def get_thumbnail(upload_id: str, db: Session = Depends(get_db)):
    record = db.query(Upload).filter(Upload.id == upload_id).first()
    if not record or not record.thumbnail:
        raise HTTPException(404, "Thumbnail no disponible")
    path = thumbnail_path(record.thumbnail)
    if not os.path.exists(path):
        raise HTTPException(404, "Thumbnail no encontrado")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/{upload_id}/stream")
def stream_video(upload_id: str, db: Session = Depends(get_db)):
    record = db.query(Upload).filter(Upload.id == upload_id).first()
    if not record:
        raise HTTPException(404, "Upload no encontrado")
    path = upload_path(record.filename)
    if not os.path.exists(path):
        raise HTTPException(404, "Archivo no encontrado")
    return FileResponse(path, media_type="video/mp4")


def _serialize(u: Upload) -> dict:
    return {
        "id": u.id,
        "original_name": u.original_name,
        "filename": u.filename,
        "size": u.size,
        "duration": u.duration,
        "width": u.width,
        "height": u.height,
        "fps": u.fps,
        "has_audio": bool(u.has_audio),
        "thumbnail_url": f"/api/uploads/{u.id}/thumbnail" if u.thumbnail else None,
        "stream_url": f"/api/uploads/{u.id}/stream",
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }
