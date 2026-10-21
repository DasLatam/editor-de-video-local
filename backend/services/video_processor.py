import subprocess
import json
import os
import math
import re
import shutil
import tempfile
from typing import Optional
_TMP = os.getenv("TMPDIR", tempfile.gettempdir())  # intermedios del export
from services.storage import upload_path, export_path, thumbnail_path, preview_path, LOGO_PATH, FAVICON_PATH


# ---------------------------------------------------------------------------
# Resolución del binario de FFmpeg
#
# No alcanza con llamar a "ffmpeg" y confiar en el PATH: es común tener más de
# un FFmpeg instalado y no todos sirven. Algunos (por ejemplo el de Homebrew en
# Linux) vienen compilados SIN libass, así que no tienen el filtro `subtitles`
# y cualquier export con subtítulos muere con un "Error parsing filterchain"
# que no dice cuál es el problema real. El de Debian/Ubuntu sí lo tiene.
#
# Por eso se elige el binario explícitamente: el primero que realmente tenga el
# filtro `subtitles`. Con FFMPEG_BIN se puede forzar uno a mano y se respeta
# sin más preguntas.
# ---------------------------------------------------------------------------

def _has_subtitles_filter(binary: str) -> bool:
    try:
        result = subprocess.run([binary, "-hide_banner", "-filters"],
                                capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return False
    return any(line.split()[1:2] == ["subtitles"]
               for line in result.stdout.splitlines() if line.strip())


def _resolve_ffmpeg() -> tuple[str, bool]:
    """Devuelve (ruta a ffmpeg, tiene_libass)."""
    forced = os.environ.get("FFMPEG_BIN")
    if forced:
        return forced, _has_subtitles_filter(forced)

    candidates = [c for c in (
        shutil.which("ffmpeg"),
        "/usr/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
    ) if c and os.path.exists(c)]

    for candidate in candidates:
        if _has_subtitles_filter(candidate):
            return candidate, True

    # Ninguno sirve para subtítulos: seguimos con el primero que haya, así los
    # exports sin subtítulos no se caen, y avisamos al arrancar.
    fallback = candidates[0] if candidates else "ffmpeg"
    print(f"[video_processor] AVISO: ningún FFmpeg disponible tiene el filtro "
          f"'subtitles' (falta libass). Usando {fallback}; los exports con "
          f"subtítulos van a fallar. Instalá un FFmpeg con libass o definí "
          f"FFMPEG_BIN apuntando a uno.")
    return fallback, False


FFMPEG, FFMPEG_HAS_SUBTITLES = _resolve_ffmpeg()

# ffprobe: el hermano del ffmpeg elegido, para no mezclar versiones.
_sibling = os.path.join(os.path.dirname(FFMPEG), "ffprobe")
FFPROBE = _sibling if os.path.exists(_sibling) else (shutil.which("ffprobe") or "ffprobe")

print(f"[video_processor] FFmpeg: {FFMPEG} (subtítulos: "
      f"{'sí' if FFMPEG_HAS_SUBTITLES else 'NO'}) · ffprobe: {FFPROBE}")


def probe_video(filepath: str) -> dict:
    cmd = [FFPROBE, "-v", "quiet", "-print_format", "json",
           "-show_streams", "-show_format", filepath]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")
    data = json.loads(result.stdout)
    video_stream = next((s for s in data.get("streams", []) if s["codec_type"] == "video"), None)
    audio_stream = next((s for s in data.get("streams", []) if s["codec_type"] == "audio"), None)
    duration = float(data.get("format", {}).get("duration", 0))
    width = int(video_stream.get("width", 0)) if video_stream else 0
    height = int(video_stream.get("height", 0)) if video_stream else 0
    fps = 30.0
    if video_stream:
        fps_str = video_stream.get("r_frame_rate", "30/1")
        if "/" in fps_str:
            num, den = fps_str.split("/")
            fps = float(num) / float(den) if float(den) > 0 else 30.0
        else:
            fps = float(fps_str)
    return {"duration": duration, "width": width, "height": height, "fps": fps,
            "has_audio": audio_stream is not None}


def generate_thumbnail(upload_id: str, filename: str, time: float = 1.0) -> str:
    src = upload_path(filename)
    thumb_name = f"{upload_id}.jpg"
    dest = thumbnail_path(thumb_name)
    cmd = [FFMPEG, "-y", "-ss", str(time), "-i", src,
           "-vframes", "1", "-q:v", "3", "-vf", "scale=320:-1", dest]
    subprocess.run(cmd, capture_output=True, timeout=30)
    return thumb_name


def detect_silence(filename: str, noise_db: float = -45, min_silence: float = 0.3) -> dict:
    """Detect silence at start and end of an uploaded file. Returns {trim_start, trim_end}."""
    filepath = upload_path(filename)
    if not os.path.exists(filepath):
        raise FileNotFoundError("No existe ese clip en la biblioteca")
    cmd = [FFMPEG, "-i", filepath,
           "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}",
           "-f", "null", "-"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    output = result.stderr

    dur_match = re.search(r"Duration: (\d+):(\d+):([\d.]+)", output)
    duration = 0.0
    if dur_match:
        h, m, s = dur_match.groups()
        duration = int(h) * 3600 + int(m) * 60 + float(s)
    if duration == 0:
        return {"trim_start": 0, "trim_end": None}

    silence_starts = list(map(float, re.findall(r"silence_start: ([\d.e+-]+)", output)))
    silence_ends = list(map(float, re.findall(r"silence_end: ([\d.e+-]+)", output)))

    trim_start = 0.0
    if silence_starts and silence_starts[0] <= 0.5:
        trim_start = silence_ends[0] if silence_ends else 0.0

    trim_end = duration
    if silence_starts:
        last_start = silence_starts[-1]
        if duration - last_start <= 3.0:
            trim_end = last_start

    trim_start = round(max(0.0, trim_start), 3)
    trim_end = round(min(duration, max(trim_end, trim_start + 0.5)), 3)
    if trim_end >= duration - 0.1:
        trim_end = None  # no need to trim end

    return {"trim_start": trim_start, "trim_end": trim_end}


def _compute_included_segments(clip: dict) -> list[tuple[float, float]]:
    total = clip["duration"]
    t_start = clip.get("trim_start", 0) or 0.0
    t_end = clip.get("trim_end") or total
    t_end = min(float(t_end), total)
    cuts = clip.get("cuts", []) or []
    included = [(t_start, t_end)]
    for cut in cuts:
        cs = float(cut["start"]) if isinstance(cut, dict) else cut.start
        ce = float(cut["end"]) if isinstance(cut, dict) else cut.end
        cs, ce = max(t_start, cs), min(t_end, ce)
        if cs >= ce:
            continue
        new = []
        for (s, e) in included:
            if ce <= s or cs >= e:
                new.append((s, e))
            else:
                if s < cs:
                    new.append((s, cs))
                if ce < e:
                    new.append((ce, e))
        included = new
    return [(s, e) for s, e in included if e - s > 0.05]


def _build_atempo(speed: float) -> Optional[str]:
    if abs(speed - 1.0) < 0.01:
        return None
    filters, s = [], speed
    while s > 2.0:
        filters.append("atempo=2.0"); s /= 2.0
    while s < 0.5:
        filters.append("atempo=0.5"); s *= 2.0
    filters.append(f"atempo={s:.4f}")
    return ",".join(filters)


def _extract_segments(clips: list, project_id: str, suffix: str = "",
                      progress_cb=None, start_pct: int = 5, end_pct: int = 35) -> list[str]:
    """Extract all included clip segments to temp files. Returns list of temp file paths."""
    segment_files = []
    total = len(clips)
    for ci, clip in enumerate(clips):
        segments = _compute_included_segments(clip)
        src = upload_path(clip["filename"])
        for si, (seg_start, seg_end) in enumerate(segments):
            seg_file = f"{_TMP}/{project_id}{suffix}_c{ci}_s{si}.mp4"
            cmd = [FFMPEG, "-y", "-ss", str(seg_start), "-to", str(seg_end), "-i", src,
                   "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
                   "-c:a", "aac", "-b:a", "128k", "-avoid_negative_ts", "make_zero", seg_file]
            result = subprocess.run(cmd, capture_output=True, timeout=300)
            if result.returncode == 0 and os.path.exists(seg_file):
                segment_files.append(seg_file)
        if progress_cb:
            pct = start_pct + int((ci + 1) / total * (end_pct - start_pct))
            progress_cb(pct, f"Extrayendo clip {ci + 1}/{total}...")
    return segment_files


def _concat_segments(segment_files: list, output: str, project_id: str, suffix: str = "") -> str:
    if len(segment_files) == 1:
        return segment_files[0]
    concat_list = f"{_TMP}/{project_id}{suffix}_concat.txt"
    with open(concat_list, "w") as f:
        for p in segment_files:
            f.write(f"file '{p}'\n")
    result = subprocess.run(
        [FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", concat_list, "-c", "copy", output],
        capture_output=True, timeout=600)
    try:
        os.unlink(concat_list)
    except Exception:
        pass
    if result.returncode != 0:
        raise RuntimeError(f"Concat error: {result.stderr.decode()[-800:]}")
    return output


def _build_logo_card(tw: int, th: int, duration: float, fps: float, output: str):
    """Create a black card with the brand logo centered, with fade in/out."""
    if not os.path.exists(LOGO_PATH):
        return None
    fade_frames = int(fps * 0.5)
    total_frames = int(fps * duration)
    out_frame = total_frames - fade_frames
    cmd = [
        FFMPEG, "-y",
        "-f", "lavfi", "-i", f"color=black:size={tw}x{th}:duration={duration}:rate={fps}",
        "-i", LOGO_PATH,
        "-filter_complex",
        f"[1:v]scale={int(tw * 0.55)}:-1,format=rgba[logo];"
        f"[0:v][logo]overlay=(W-w)/2:(H-h)/2:format=auto[base];"
        f"[base]fade=in:0:{fade_frames},fade=out:{out_frame}:{fade_frames}[out]",
        "-map", "[out]",
        "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo:d={duration}",
        "-map", "2:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-t", str(duration),
        output
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=120)
    if result.returncode != 0:
        return None
    return output


def process_project(project_id: str, clips: list, settings: dict, subtitles: list,
                    progress_cb=None, is_preview: bool = False) -> str:
    aspect = settings.get("aspect_ratio", "16:9")
    brightness = settings.get("brightness", 0)
    contrast = settings.get("contrast", 1.0)
    normalize_audio = settings.get("normalize_audio", True)
    speed = float(settings.get("speed", 1.0))
    font_size = settings.get("subtitle_font_size", 18)
    font_color = settings.get("subtitle_color", "white")
    subtitle_bg = settings.get("subtitle_bg", True)
    output_quality = settings.get("output_quality", "high")
    add_watermark = settings.get("watermark", False) and not is_preview
    watermark_position = settings.get("watermark_position", "bottom-right")
    watermark_opacity = float(settings.get("watermark_opacity", 0.85))
    add_logo_card = settings.get("logo_card", False) and not is_preview

    tw, th = _aspect_to_dims(aspect)
    if is_preview:
        # Scale down preview to 480p equivalent
        scale = 480 / th
        tw, th = int(tw * scale / 2) * 2, 480

    output_filename = f"{project_id}_preview.mp4" if is_preview else f"{project_id}.mp4"
    output_file = preview_path(output_filename) if is_preview else export_path(output_filename)
    fps = 30.0

    if progress_cb:
        progress_cb(5, "Preparando clips...")

    # Step 1: extract segments
    segment_files = _extract_segments(clips, project_id, suffix="_prv" if is_preview else "",
                                      progress_cb=progress_cb, start_pct=5, end_pct=35)
    if not segment_files:
        raise RuntimeError("No se pudo extraer ningún segmento")

    if progress_cb:
        progress_cb(38, "Uniendo clips...")

    joined = f"{_TMP}/{project_id}{'_prv' if is_preview else ''}_joined.mp4"
    intermediate = _concat_segments(segment_files, joined, project_id,
                                    suffix="_prv" if is_preview else "")

    # Step 2: build filter graph
    if progress_cb:
        progress_cb(55, "Aplicando filtros..." if not is_preview else "Generando preview...")

    vf_parts = [_build_aspect_filter(tw, th)]

    eq_params = []
    if brightness != 0:
        eq_params.append(f"brightness={brightness:.2f}")
    if contrast != 1.0:
        eq_params.append(f"contrast={contrast:.2f}")
    if eq_params:
        vf_parts.append(f"eq={':'.join(eq_params)}")

    if abs(speed - 1.0) > 0.01:
        vf_parts.append(f"setpts={1/speed:.4f}*PTS")

    # Subtitles (skip in preview for speed)
    sub_path = None
    if subtitles and not is_preview:
        if not FFMPEG_HAS_SUBTITLES:
            # Sin esto el error que llega a la UI es un "Error parsing filterchain"
            # ilegible, con el volcado entero del banner de FFmpeg.
            raise RuntimeError(
                f"El FFmpeg en uso ({FFMPEG}) no tiene libass, así que no puede "
                f"quemar subtítulos. Usá un FFmpeg compilado con libass "
                f"(/usr/bin/ffmpeg lo tiene) o definí la variable FFMPEG_BIN.")
        sub_path = f"{_TMP}/{project_id}.ass"
        _write_ass(subtitles, sub_path, settings, tw, th, speed)
        escaped = sub_path.replace("\\", "/").replace(":", "\\:")
        vf_parts.append(f"subtitles={escaped}:fontsdir=/usr/share/fonts")

    # Build command with optional watermark (uses favicon — small corner icon)
    extra_inputs = []
    wm_file = FAVICON_PATH if os.path.exists(FAVICON_PATH) else LOGO_PATH
    if add_watermark and os.path.exists(wm_file):
        extra_inputs = ["-i", wm_file]

    if add_watermark and os.path.exists(wm_file):
        base_vf = ",".join(vf_parts)
        # Favicon is ~square, scale to 7% of shorter dimension
        wm_size = int(min(tw, th) * 0.07)
        pad = int(min(tw, th) * 0.025)
        pos_map = {
            "bottom-right": f"{tw}-w-{pad}:{th}-h-{pad}",
            "bottom-left":  f"{pad}:{th}-h-{pad}",
            "top-right":    f"{tw}-w-{pad}:{pad}",
            "top-left":     f"{pad}:{pad}",
        }
        xy = pos_map.get(watermark_position, f"{tw}-w-{pad}:{th}-h-{pad}")
        filter_complex = (
            f"[0:v]{base_vf}[base];"
            f"[1:v]scale={wm_size}:{wm_size}:flags=lanczos,format=rgba,"
            f"colorchannelmixer=aa={watermark_opacity:.2f}[wm];"
            f"[base][wm]overlay={xy}:format=auto[out]"
        )
        # Con -filter_complex hay que mapear el audio a mano: si no, el video
        # con marca de agua sale mudo.
        vf_arg = ["-filter_complex", filter_complex, "-map", "[out]", "-map", "0:a?"]
    else:
        vf_arg = ["-vf", ",".join(vf_parts)]

    af_parts = []
    atempo = _build_atempo(speed)
    if atempo:
        af_parts.append(atempo)
    if normalize_audio and not is_preview:
        af_parts.append("loudnorm")
    af_chain = ",".join(af_parts) if af_parts else None

    crf = "28" if is_preview else ("18" if output_quality == "high" else "23")
    preset = "ultrafast" if is_preview else "fast"

    cmd = (
        [FFMPEG, "-y", "-i", intermediate]
        + extra_inputs
        + vf_arg
        + (["-af", af_chain] if af_chain else [])
        + ["-c:v", "libx264", "-crf", crf, "-preset", preset,
           "-pix_fmt", "yuv420p", "-movflags", "+faststart",
           "-c:a", "aac", "-b:a", "128k" if is_preview else "192k"]
        + [output_file]
    )

    if progress_cb:
        progress_cb(65, "Renderizando...")

    result = subprocess.run(cmd, capture_output=True, timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg: {result.stderr.decode()[-2000:]}")

    # Step 3: append logo card if needed
    if add_logo_card and os.path.exists(LOGO_PATH):
        if progress_cb:
            progress_cb(88, "Agregando card de cierre...")
        card_file = f"{_TMP}/{project_id}_card.mp4"
        card = _build_logo_card(tw, th, 3.0, fps, card_file)
        if card:
            main_with_card = f"{_TMP}/{project_id}_withcard.mp4"
            card_concat = f"{_TMP}/{project_id}_card_concat.txt"
            with open(card_concat, "w") as f:
                f.write(f"file '{output_file}'\nfile '{card_file}'\n")
            subprocess.run(
                [FFMPEG, "-y", "-f", "concat", "-safe", "0",
                 "-i", card_concat, "-c", "copy", main_with_card],
                capture_output=True, timeout=120)
            if os.path.exists(main_with_card):
                os.replace(main_with_card, output_file)
            for f in [card_file, card_concat]:
                try:
                    os.unlink(f)
                except Exception:
                    pass

    # Cleanup
    for f in segment_files:
        try:
            os.unlink(f)
        except Exception:
            pass
    for tmp in [joined, sub_path]:
        if tmp and tmp != intermediate and os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass

    if progress_cb:
        progress_cb(100, "Listo")

    return output_filename


def _aspect_to_dims(aspect: str):
    return {"9:16": (1080, 1920), "1:1": (1080, 1080),
            "16:9": (1920, 1080), "4:5": (1080, 1350)}.get(aspect, (1920, 1080))


def _build_aspect_filter(tw: int, th: int) -> str:
    return (f"scale={tw}:{th}:force_original_aspect_ratio=decrease,"
            f"pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2:black,setsar=1")


def _write_ass(subtitles: list, path: str, settings: dict, tw: int, th: int, speed: float = 1.0):
    """Write an ASS subtitle file with professional styling."""
    font_size_ui = settings.get("subtitle_font_size", 18)
    font_color   = settings.get("subtitle_color", "white")
    subtitle_bg  = settings.get("subtitle_bg", False)

    # Scale font size: UI 18 → ~80px at 1080-min-dim, proportional otherwise
    ref_dim  = min(tw, th)
    ass_size = max(50, int(font_size_ui * ref_dim / 243))
    # Examples at ref=1080: UI12→53 UI18→80 UI24→106 UI32→141 UI40→177

    # Bottom margin: keep text above the very edge (~8% of height)
    margin_v = max(70, int(th * 0.08))
    # Extra left/right margin so text doesn't touch side edges
    margin_h = max(30, int(tw * 0.04))

    primary = _color_to_ass(font_color)

    if subtitle_bg:
        # Opaque-box style: semi-transparent bg, wide padding, no outline/shadow
        border_style = 3
        outline      = max(8, int(ass_size * 0.12))   # box padding
        shadow       = 0
        back_color   = "&H99000000"   # ~60% opaque black box
        out_color    = "&H00000000"
    else:
        # Professional outline+shadow: thick black outline, drop shadow
        border_style = 1
        outline      = max(3, int(ass_size * 0.055))  # ~4-5px at default size
        shadow       = max(2, int(ass_size * 0.03))
        back_color   = "&H00000000"
        out_color    = "&H00000000"   # black outline

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {tw}
PlayResY: {th}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Ubuntu,{ass_size},{primary},&H000000FF,{out_color},{back_color},-1,0,0,0,100,100,0,0,{border_style},{outline},{shadow},2,{margin_h},{margin_h},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(header)
        for sub in subtitles:
            start = sub["start"] / speed
            end   = sub["end"]   / speed
            text  = sub["text"].strip().replace("\n", "\\N")
            f.write(f"Dialogue: 0,{_sec_to_ass(start)},{_sec_to_ass(end)},Default,,0,0,0,,{text}\n")


def _sec_to_ass(s: float) -> str:
    h   = int(s // 3600)
    m   = int((s % 3600) // 60)
    sec = s % 60
    return f"{h}:{m:02d}:{sec:05.2f}"


def _color_to_ass(color: str) -> str:
    # ASS colour format: &HAABBGGRR (alpha, blue, green, red) — alpha 00 = opaque
    return {
        "white":  "&H00FFFFFF",
        "yellow": "&H0000FFFF",
        "black":  "&H00000000",
    }.get(color, "&H00FFFFFF")
