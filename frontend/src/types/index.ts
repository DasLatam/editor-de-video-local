export interface Upload {
  id: string
  original_name: string
  filename: string
  size: number
  duration: number
  width: number
  height: number
  fps: number
  has_audio: boolean
  thumbnail_url: string | null
  stream_url: string
  created_at: string
}

export interface Cut {
  start: number
  end: number
}

export interface Clip {
  upload_id: string
  filename: string
  original_name: string
  duration: number
  trim_start: number
  trim_end: number | null
  cuts: Cut[]
}

export interface Subtitle {
  start: number
  end: number
  text: string
}

export interface ProjectSettings {
  aspect_ratio: '16:9' | '9:16' | '1:1' | '4:5'
  brightness: number
  contrast: number
  normalize_audio: boolean
  speed: number
  subtitle_font_size: number
  subtitle_color: string
  subtitle_bg: boolean
  output_quality: 'high' | 'medium'
  watermark: boolean
  watermark_position: string
  watermark_opacity: number
  logo_card: boolean
}

export type ProjectStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface Project {
  id: string
  name: string
  clips: Clip[]
  settings: ProjectSettings
  subtitles: Subtitle[]
  status: ProjectStatus
  progress: number
  progress_message: string
  output_path: string | null
  error_message: string | null
  download_url: string | null
  created_at: string
  updated_at: string
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  aspect_ratio: '16:9',
  brightness: 0,
  contrast: 1.0,
  normalize_audio: true,
  speed: 1.0,
  subtitle_font_size: 18,
  subtitle_color: 'white',
  subtitle_bg: true,
  output_quality: 'high',
  watermark: false,
  watermark_position: 'bottom-right',
  watermark_opacity: 0.85,
  logo_card: false,
}
