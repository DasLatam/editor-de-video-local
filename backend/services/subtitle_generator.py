"""Subtítulos automáticos con faster-whisper.

faster-whisper es opcional: el editor arranca y exporta sin él. Se importa recién
al transcribir, y si no está instalado se avisa con un mensaje claro en vez de
tirar abajo el servidor.
"""
import os

from services.storage import upload_path

_models: dict = {}


class WhisperNoDisponible(RuntimeError):
    """faster-whisper no está instalado en este entorno."""


def whisper_disponible() -> bool:
    try:
        import faster_whisper  # noqa: F401
    except ImportError:
        return False
    return True


def get_model(size: str = "small"):
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise WhisperNoDisponible(
            "La transcripción automática no está instalada. Instalá faster-whisper "
            "(pip install -r backend/requirements-whisper.txt) y reiniciá el editor. "
            "Mientras tanto podés cargar los subtítulos a mano."
        ) from e
    if size not in _models:
        _models[size] = WhisperModel(size, device="cpu", compute_type="int8")
    return _models[size]


def transcribe(filename: str, language: str = "es", model_size: str = "small",
               karaoke: bool = False, max_words: int = 4, max_duration: float = 2.5) -> list:
    """
    Transcribe audio. With karaoke=True uses word timestamps and groups
    into short phrases. Returns [{start, end, text}].
    """
    path = upload_path(filename)
    if not os.path.exists(path):
        raise FileNotFoundError("No existe ese clip en la biblioteca")
    model = get_model(model_size)

    segments_iter, _ = model.transcribe(
        path,
        language=language,
        task="transcribe",
        word_timestamps=karaoke,
        vad_filter=True,
    )

    if not karaoke:
        return [
            {"start": round(seg.start, 3), "end": round(seg.end, 3), "text": seg.text.strip()}
            for seg in segments_iter
        ]

    # Karaoke mode: collect word-level timestamps then group
    all_words = []
    for seg in segments_iter:
        if seg.words:
            for w in seg.words:
                text = w.word.strip()
                if text:
                    all_words.append({"word": text, "start": w.start, "end": w.end})

    if not all_words:
        return []

    chunks = []
    group: list[dict] = []

    for word in all_words:
        group.append(word)
        duration = word["end"] - group[0]["start"]
        if len(group) >= max_words or duration >= max_duration:
            chunks.append(_make_chunk(group))
            group = []

    if group:
        chunks.append(_make_chunk(group))

    return chunks


def _make_chunk(words: list[dict]) -> dict:
    return {
        "start": round(words[0]["start"], 3),
        "end": round(words[-1]["end"], 3),
        "text": " ".join(w["word"] for w in words).strip(),
    }
