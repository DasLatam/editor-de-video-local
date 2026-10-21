# Imagen única: compila la interfaz y la sirve desde el backend.
#   docker build -t editor-de-video-local .
#   docker run -p 8088:8088 -v $PWD/storage:/app/storage editor-de-video-local
FROM node:20-alpine AS interfaz
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/requirements.txt backend/requirements-whisper.txt ./
# WHISPER=0 arma una imagen sin subtítulos automáticos (más liviana).
ARG WHISPER=1
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$WHISPER" = "1" ]; then pip install --no-cache-dir -r requirements-whisper.txt; fi
COPY backend/ .
COPY --from=interfaz /src/dist /app/frontend/dist
ENV STORAGE_PATH=/app/storage \
    DATABASE_URL=sqlite:////app/storage/editor.db \
    HF_HOME=/app/storage/modelos
VOLUME /app/storage
EXPOSE 8088
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8088", "--workers", "1"]
