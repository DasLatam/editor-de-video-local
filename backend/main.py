from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import init_db
from services.storage import ensure_dirs
import os
from api.routes import uploads, projects

app = FastAPI(title=os.getenv("BRAND_NAME", "Editor de video") + " - API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(uploads.router, prefix="/api")
app.include_router(projects.router, prefix="/api")

FRONTEND_DIST = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))


@app.get("/api/health")
def health():
    """Estado del editor: sirve para comprobar la instalación."""
    from services.video_processor import FFMPEG, FFMPEG_HAS_SUBTITLES
    from services.subtitle_generator import whisper_disponible
    return {
        "ok": True,
        "nombre": os.getenv("BRAND_NAME", "Editor de video"),
        "ffmpeg": FFMPEG,
        "ffmpeg_subtitulos": FFMPEG_HAS_SUBTITLES,
        "whisper": whisper_disponible(),
        "interfaz": os.path.isdir(FRONTEND_DIST),
    }


@app.on_event("startup")
def startup():
    ensure_dirs()
    init_db()


# Serve React frontend (only when the build exists)
if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        index = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index)
