import axios from 'axios'
import type { Upload, Project, Clip, ProjectSettings, Subtitle } from '../types'

const api = axios.create({ baseURL: '/api' })

export const uploadsApi = {
  list: (): Promise<Upload[]> => api.get('/uploads').then(r => r.data),
  upload: (file: File, onProgress?: (pct: number) => void): Promise<Upload> =>
    api.post('/uploads', (() => { const f = new FormData(); f.append('file', file); return f })(), {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => onProgress?.(Math.round((e.loaded * 100) / (e.total ?? 1))),
    }).then(r => r.data),
  delete: (id: string): Promise<void> => api.delete(`/uploads/${id}`),
}

export const projectsApi = {
  list: (): Promise<Project[]> => api.get('/projects').then(r => r.data),
  get: (id: string): Promise<Project> => api.get(`/projects/${id}`).then(r => r.data),
  create: (name: string): Promise<Project> => api.post('/projects', { name }).then(r => r.data),
  update: (id: string, payload: { clips?: Clip[]; settings?: ProjectSettings; subtitles?: Subtitle[]; name?: string }): Promise<Project> =>
    api.put(`/projects/${id}`, payload).then(r => r.data),
  delete: (id: string): Promise<void> => api.delete(`/projects/${id}`),
  process: (id: string): Promise<void> => api.post(`/projects/${id}/process`),
  status: (id: string): Promise<{ status: string; progress: number; progress_message: string; output_path: string | null; error_message: string | null }> =>
    api.get(`/projects/${id}/status`).then(r => r.data),
  transcribe: (uploadId: string, filename: string, language = 'es', karaoke = false): Promise<{ segments: Subtitle[] }> =>
    api.post('/projects/transcribe', { upload_id: uploadId, filename, language, karaoke }).then(r => r.data),
  detectSilence: (filename: string): Promise<{ trim_start: number; trim_end: number | null }> =>
    api.post('/projects/detect-silence', { filename }).then(r => r.data),
  startPreview: (id: string): Promise<void> => api.post(`/projects/${id}/preview`),
  previewStatus: (id: string): Promise<{ ready: boolean; url: string | null }> =>
    api.get(`/projects/${id}/preview/status`).then(r => r.data),
}
