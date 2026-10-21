#!/bin/bash
# Instalador de editor-de-video-local (Linux o macOS).
#
#   ./install.sh          entorno de Python, dependencias, compilación de la interfaz y prueba
#   ./install.sh --apt    además instala ffmpeg, python3-venv y Node.js con apt (pide sudo)
#   ./install.sh --sin-whisper   no instala los subtítulos automáticos (más liviano;
#                         los subtítulos se cargan a mano)
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"

if [[ " $* " == *" --apt "* ]]; then
    sudo apt-get update
    sudo apt-get install -y ffmpeg python3-venv python3-pip nodejs npm
fi

echo "== Dependencias del sistema"
for b in ffmpeg ffprobe python3 npm; do
    command -v "$b" >/dev/null || { echo "  FALTA $b (./install.sh --apt o instalalo a mano)"; exit 1; }
    echo "  ok    $b"
done
if ffmpeg -hide_banner -filters 2>/dev/null | awk '{print $2}' | grep -qx subtitles; then
    echo "  ok    ffmpeg con libass (subtítulos)"
else
    echo "  AVISO el ffmpeg del PATH no tiene libass: los exports con subtítulos van a fallar"
    echo "        (en Debian/Ubuntu el del paquete 'ffmpeg' sí lo tiene; podés fijarlo con FFMPEG_BIN)"
fi

echo "== Python"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r backend/requirements-dev.txt
echo "  ok    .venv"
if [[ " $* " == *" --sin-whisper "* ]]; then
    echo "  --    sin subtítulos automáticos (instalalos después con: .venv/bin/pip install -r backend/requirements-whisper.txt)"
else
    .venv/bin/pip install -q -r backend/requirements-whisper.txt
    echo "  ok    faster-whisper (el modelo se baja la primera vez que transcribís)"
fi

echo "== Interfaz"
( cd frontend && npm ci --no-audit --no-fund && npm run build ) >/dev/null
echo "  ok    frontend/dist"

[ -f .env ] || { cp .env.example .env; echo "  creado .env"; }

echo "== Prueba (genera un video de 3 s, lo recorta y lo exporta)"
if ( cd backend && ../.venv/bin/python ../tests/test_api.py ) >/dev/null 2>&1; then
    echo "  ok    tests/test_api.py"
else
    echo "  FALLA tests/test_api.py (corré: cd backend && ../.venv/bin/python ../tests/test_api.py)"
fi

echo
echo "Listo. Arrancalo con ./run.sh y abrí http://127.0.0.1:8088"
