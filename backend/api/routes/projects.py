import uuid
import threading
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db, Project, JobStatus
from services.video_processor import process_project, detect_silence
from services.subtitle_generator import transcribe, WhisperNoDisponible
from services.storage import export_path, preview_path
import os

router = APIRouter(prefix="/projects", tags=["projects"])


class CutSchema(BaseModel):
    start: float
    end: float


class ClipSchema(BaseModel):
    upload_id: str
    filename: str
    original_name: str
    duration: float
    trim_start: float = 0
    trim_end: Optional[float] = None
    cuts: list[CutSchema] = []


class ProjectSettings(BaseModel):
    aspect_ratio: str = "16:9"
    brightness: float = 0
    contrast: float = 1.0
    normalize_audio: bool = True
    speed: float = 1.0
    subtitle_font_size: int = 18
    subtitle_color: str = "white"
    subtitle_bg: bool = True
    output_quality: str = "high"
    watermark: bool = False
    watermark_position: str = "bottom-right"
    watermark_opacity: float = 0.85
    logo_card: bool = False


class CreateProjectRequest(BaseModel):
    name: str
    clips: list[ClipSchema] = []
    settings: ProjectSettings = ProjectSettings()
    subtitles: list = []


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    clips: Optional[list[ClipSchema]] = None
    settings: Optional[ProjectSettings] = None
    subtitles: Optional[list] = None


# Tamaños de faster-whisper que se aceptan: cualquier otro valor haría bajar un
# modelo arbitrario de Hugging Face.
MODELOS_WHISPER = {"tiny", "base", "small", "medium"}


class TranscribeRequest(BaseModel):
    upload_id: str
    filename: str
    language: str = "es"
    model_size: str = "small"
    karaoke: bool = False


class DetectSilenceRequest(BaseModel):
    filename: str


@router.post("")
def create_project(body: CreateProjectRequest, db: Session = Depends(get_db)):
    project = Project(
        id=str(uuid.uuid4()),
        name=body.name,
        clips=[c.model_dump() for c in body.clips],
        settings=body.settings.model_dump(),
        subtitles=body.subtitles,
        status=JobStatus.pending,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _serialize(project)


@router.get("")
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [_serialize(p) for p in projects]


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    p = _get_or_404(project_id, db)
    return _serialize(p)


@router.put("/{project_id}")
def update_project(project_id: str, body: UpdateProjectRequest, db: Session = Depends(get_db)):
    p = _get_or_404(project_id, db)
    if body.name is not None:
        p.name = body.name
    if body.clips is not None:
        p.clips = [c.model_dump() for c in body.clips]
    if body.settings is not None:
        p.settings = body.settings.model_dump()
    if body.subtitles is not None:
        p.subtitles = body.subtitles
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    p = _get_or_404(project_id, db)
    if p.output_path:
        try:
            os.unlink(export_path(p.output_path))
        except FileNotFoundError:
            pass
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/{project_id}/process")
def start_processing(project_id: str, db: Session = Depends(get_db)):
    p = _get_or_404(project_id, db)
    if not p.clips:
        raise HTTPException(400, "El proyecto no tiene clips")
    if p.status == JobStatus.processing:
        raise HTTPException(409, "El proyecto ya está siendo procesado")

    p.status = JobStatus.processing
    p.progress = 0
    p.progress_message = "Iniciando..."
    p.error_message = None
    db.commit()

    thread = threading.Thread(
        target=_run_processing,
        args=(project_id,),
        daemon=True,
    )
    thread.start()

    return {"ok": True, "status": "processing"}


@router.get("/{project_id}/status")
def get_status(project_id: str, db: Session = Depends(get_db)):
    p = _get_or_404(project_id, db)
    return {
        "status": p.status,
        "progress": p.progress,
        "progress_message": p.progress_message,
        "output_path": p.output_path,
        "error_message": p.error_message,
    }


@router.get("/{project_id}/download")
def download_project(project_id: str, db: Session = Depends(get_db)):
    p = _get_or_404(project_id, db)
    if p.status != JobStatus.completed or not p.output_path:
        raise HTTPException(404, "El proyecto no tiene un video exportado")
    path = export_path(p.output_path)
    if not os.path.exists(path):
        raise HTTPException(404, "Archivo de exportación no encontrado")
    safe_name = p.name.replace(" ", "_") + ".mp4"
    return FileResponse(path, media_type="video/mp4", filename=safe_name)


@router.post("/transcribe")
def transcribe_video(body: TranscribeRequest):
    if body.model_size not in MODELOS_WHISPER:
        raise HTTPException(
            400, f"model_size tiene que ser uno de: {', '.join(sorted(MODELOS_WHISPER))}")
    try:
        segments = transcribe(
            body.filename, language=body.language, model_size=body.model_size,
            karaoke=body.karaoke,
        )
        return {"segments": segments}
    except WhisperNoDisponible as e:
        raise HTTPException(503, str(e))
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error en transcripción: {e}")


@router.post("/detect-silence")
def detect_silence_endpoint(body: DetectSilenceRequest):
    try:
        result = detect_silence(body.filename)
        return result
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error en detección: {e}")


@router.post("/{project_id}/preview")
def start_preview(project_id: str, db: Session = Depends(get_db)):
    p = _get_or_404(project_id, db)
    if not p.clips:
        raise HTTPException(400, "El proyecto no tiene clips")
    thread = threading.Thread(
        target=_run_preview, args=(project_id, p.clips, p.settings), daemon=True
    )
    thread.start()
    return {"ok": True}


@router.get("/{project_id}/preview/status")
def preview_status(project_id: str):
    path = preview_path(f"{project_id}_preview.mp4")
    ready = os.path.exists(path)
    return {"ready": ready, "url": f"/api/projects/{project_id}/preview/video" if ready else None}


@router.get("/{project_id}/preview/video")
def serve_preview(project_id: str):
    path = preview_path(f"{project_id}_preview.mp4")
    if not os.path.exists(path):
        raise HTTPException(404, "Preview no generado aún")
    return FileResponse(path, media_type="video/mp4")


def _run_preview(project_id: str, clips: list, settings: dict):
    try:
        process_project(project_id=project_id, clips=clips, settings=settings,
                        subtitles=[], is_preview=True)
    except Exception:
        pass  # preview failure is non-fatal


def _run_processing(project_id: str):
    from database import SessionLocal
    db = SessionLocal()
    try:
        p = db.query(Project).filter(Project.id == project_id).first()
        if not p:
            return

        def progress_cb(pct: int, msg: str):
            p.progress = pct
            p.progress_message = msg
            db.commit()

        output_filename = process_project(
            project_id=project_id,
            clips=p.clips,
            settings=p.settings,
            subtitles=p.subtitles,
            progress_cb=progress_cb,
        )

        p.status = JobStatus.completed
        p.output_path = output_filename
        p.progress = 100
        p.progress_message = "Completado"
        db.commit()
    except Exception as e:
        p = db.query(Project).filter(Project.id == project_id).first()
        if p:
            p.status = JobStatus.failed
            p.error_message = str(e)
            db.commit()
    finally:
        db.close()


def _get_or_404(project_id: str, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Proyecto no encontrado")
    return p


def _serialize(p: Project) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "clips": p.clips,
        "settings": p.settings,
        "subtitles": p.subtitles,
        "status": p.status,
        "progress": p.progress,
        "progress_message": p.progress_message,
        "output_path": p.output_path,
        "error_message": p.error_message,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "download_url": f"/api/projects/{p.id}/download" if p.status == "completed" else None,
    }
