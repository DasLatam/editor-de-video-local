"""Prueba de punta a punta del backend, sin cámara ni archivos propios.

Genera un video de 3 segundos con FFmpeg (patrón de prueba + tono), lo sube,
arma un proyecto con un recorte, lo exporta en 9:16 y verifica que salga un MP4
con la duración esperada. No carga Whisper (la transcripción baja un modelo de
cientos de MB): si faster-whisper no está instalado, verifica que transcribir
responda con un aviso claro.

Uso:  cd backend && python -m pytest ../tests -q      (o python ../tests/test_api.py)
"""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

TMP = Path(tempfile.mkdtemp(prefix="editor-test-"))
os.environ["STORAGE_PATH"] = str(TMP / "storage")
os.environ["DATABASE_URL"] = f"sqlite:///{TMP}/test.db"
BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402
from services.video_processor import FFMPEG, FFPROBE  # noqa: E402


def _video_de_prueba() -> Path:
    out = TMP / "prueba.mp4"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error",
                    "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=3",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(out)],
                   check=True)
    return out


def _tiene_audio(path: Path) -> bool:
    r = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "a", "-show_entries",
                        "stream=codec_type", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True)
    return "audio" in r.stdout


def _marca_de_agua():
    """PNG chico de prueba donde el editor busca la marca de agua."""
    from services.storage import FAVICON_PATH
    os.makedirs(os.path.dirname(FAVICON_PATH), exist_ok=True)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                    "color=c=red:s=64x64", "-frames:v", "1", FAVICON_PATH], check=True)


def _duracion(path: Path) -> float:
    r = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                        "-of", "json", str(path)], capture_output=True, text=True, check=True)
    return float(json.loads(r.stdout)["format"]["duration"])


def test_subir_recortar_exportar():
    with TestClient(main.app) as client:
        video = _video_de_prueba()
        with open(video, "rb") as f:
            r = client.post("/api/uploads", files={"file": ("prueba.mp4", f, "video/mp4")})
        assert r.status_code == 200, r.text
        up = r.json()
        assert abs(up["duration"] - 3) < 0.3

        clip = {"upload_id": up["id"], "filename": up["filename"], "original_name": "prueba.mp4",
                "duration": up["duration"], "trim_start": 0.5, "trim_end": 2.5}
        _marca_de_agua()
        r = client.post("/api/projects", json={"name": "Proyecto de prueba", "clips": [clip],
                                               "settings": {"aspect_ratio": "9:16", "output_quality": "low",
                                                            "watermark": True}})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        assert client.post(f"/api/projects/{pid}/process").status_code == 200
        for _ in range(120):
            st = client.get(f"/api/projects/{pid}/status").json()
            if st["status"] in ("completed", "failed"):
                break
            time.sleep(0.5)
        assert st["status"] == "completed", st

        r = client.get(f"/api/projects/{pid}/download")
        assert r.status_code == 200
        out = TMP / "salida.mp4"
        out.write_bytes(r.content)
        assert abs(_duracion(out) - 2.0) < 0.4
        assert _tiene_audio(out), "el export con marca de agua salió sin audio"


def test_estado():
    with TestClient(main.app) as client:
        r = client.get("/api/health")
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True


def test_transcribir_sin_whisper_avisa_claro():
    """Sin faster-whisper instalado, transcribir responde 503 con instrucciones.
    Con faster-whisper instalado no se prueba (bajaría el modelo)."""
    from services.subtitle_generator import whisper_disponible
    if whisper_disponible():
        return
    with TestClient(main.app) as client:
        video = _video_de_prueba()
        with open(video, "rb") as f:
            up = client.post("/api/uploads", files={"file": ("prueba.mp4", f, "video/mp4")}).json()
        r = client.post("/api/projects/transcribe",
                        json={"upload_id": up["id"], "filename": up["filename"]})
        assert r.status_code == 503, r.text
        assert "faster-whisper" in r.json()["detail"]


def test_transcribir_rechaza_modelo_desconocido():
    """Un model_size fuera de la lista no llega a faster-whisper (no baja nada)."""
    with TestClient(main.app) as client:
        r = client.post("/api/projects/transcribe",
                        json={"upload_id": "x", "filename": "x.mp4",
                              "model_size": "alguien/modelo-cualquiera"})
        assert r.status_code == 400, r.text


if __name__ == "__main__":
    test_estado()
    test_transcribir_rechaza_modelo_desconocido()
    test_transcribir_sin_whisper_avisa_claro()
    test_subir_recortar_exportar()
    print("Todo bien.")
