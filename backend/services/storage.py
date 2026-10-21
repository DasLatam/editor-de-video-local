import os

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORAGE_BASE = os.getenv("STORAGE_PATH", os.path.join(_BACKEND_DIR, "storage"))

UPLOADS_DIR = os.path.join(STORAGE_BASE, "uploads")
PROCESSED_DIR = os.path.join(STORAGE_BASE, "processed")
EXPORTS_DIR = os.path.join(STORAGE_BASE, "exports")
THUMBNAILS_DIR = os.path.join(STORAGE_BASE, "thumbnails")
PREVIEWS_DIR = os.path.join(STORAGE_BASE, "previews")

# Marca: logo para la placa de cierre y marca de agua chica para la esquina.
# Por defecto se buscan en la carpeta de storage; se cambian con BRAND_LOGO y
# BRAND_WATERMARK. Si no existen, esas dos opciones del export no hacen nada.
LOGO_PATH = os.getenv("BRAND_LOGO", os.path.join(STORAGE_BASE, "logo.png"))
FAVICON_PATH = os.getenv("BRAND_WATERMARK", os.path.join(STORAGE_BASE, "watermark.png"))


def ensure_dirs():
    for d in [UPLOADS_DIR, PROCESSED_DIR, EXPORTS_DIR, THUMBNAILS_DIR, PREVIEWS_DIR]:
        os.makedirs(d, exist_ok=True)


def preview_path(filename: str) -> str:
    return os.path.join(PREVIEWS_DIR, filename)


def upload_path(filename: str) -> str:
    # El nombre llega desde la API: sólo se acepta un nombre de archivo suelto
    # dentro de uploads/, nunca una ruta («../../algo»).
    return os.path.join(UPLOADS_DIR, os.path.basename(filename))


def export_path(filename: str) -> str:
    return os.path.join(EXPORTS_DIR, filename)


def thumbnail_path(filename: str) -> str:
    return os.path.join(THUMBNAILS_DIR, filename)
