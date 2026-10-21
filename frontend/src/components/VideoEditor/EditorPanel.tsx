import { useState, useCallback, useRef, useEffect } from 'react'
import { Video, Subtitles, Settings, CheckCircle } from 'lucide-react'
import type { Project, Clip, ProjectSettings, Subtitle } from '../../types'
import { projectsApi } from '../../api/client'
import { LibraryPanel } from '../Clips/LibraryPanel'
import { TimelineEditor } from '../Timeline/TimelineEditor'
import { SubtitleEditor } from '../Subtitles/SubtitleEditor'
import { ExportPanel } from '../Export/ExportPanel'
import { VideoPreview } from '../Preview/VideoPreview'

interface Props {
  project: Project
  onUpdate: (p: Project) => void
}

type Tab = 'clips' | 'subtitles' | 'export'

interface PreviewState {
  uploadId: string
  src: string
  name: string
  seekTime: number
  trimStart: number
  trimEnd: number
  cuts: Array<{ start: number; end: number }>
  duration: number
}

export function EditorPanel({ project, onUpdate }: Props) {
  const [clips, setClips] = useState<Clip[]>(project.clips ?? [])
  const [settings, setSettings] = useState<ProjectSettings>(project.settings as ProjectSettings)
  const [subtitles, setSubtitles] = useState<Subtitle[]>(project.subtitles ?? [])
  const [tab, setTab] = useState<Tab>('clips')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [autoTrimming, setAutoTrimming] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setClips(project.clips ?? [])
    setSettings(project.settings as ProjectSettings)
    setSubtitles(project.subtitles ?? [])
  }, [project.id])

  const scheduleSave = useCallback((newClips: Clip[], newSettings: ProjectSettings, newSubs: Subtitle[]) => {
    setSaved(false)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const updated = await projectsApi.update(project.id, {
          clips: newClips, settings: newSettings, subtitles: newSubs,
        })
        onUpdate(updated)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } finally {
        setSaving(false)
      }
    }, 800)
  }, [project.id, onUpdate])

  const forceSave = useCallback(async () => {
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null }
    setSaving(true)
    try {
      await projectsApi.update(project.id, { clips, settings, subtitles })
    } finally {
      setSaving(false)
    }
  }, [project.id, clips, settings, subtitles])

  function handleClipsChange(newClips: Clip[]) {
    setClips(newClips)
    scheduleSave(newClips, settings, subtitles)
  }

  function handleSettingsChange(newSettings: ProjectSettings) {
    setSettings(newSettings)
    scheduleSave(clips, newSettings, subtitles)
  }

  function handleSubtitlesChange(newSubs: Subtitle[]) {
    setSubtitles(newSubs)
    scheduleSave(clips, settings, newSubs)
  }

  function handlePreviewSeek(uploadId: string, time: number) {
    const clip = clips.find(c => c.upload_id === uploadId)
    if (!clip) return
    setPreview(prev => {
      if (prev?.uploadId === uploadId) return { ...prev, seekTime: time }
      return {
        uploadId, src: `/api/uploads/${uploadId}/stream`,
        name: clip.original_name, seekTime: time,
        trimStart: clip.trim_start, trimEnd: clip.trim_end ?? clip.duration,
        cuts: clip.cuts ?? [], duration: clip.duration,
      }
    })
  }

  // Keep preview meta in sync with clip edits
  useEffect(() => {
    if (!preview) return
    const clip = clips.find(c => c.upload_id === preview.uploadId)
    if (!clip) return
    setPreview(prev => prev ? {
      ...prev,
      trimStart: clip.trim_start,
      trimEnd: clip.trim_end ?? clip.duration,
      cuts: clip.cuts ?? [],
    } : null)
  }, [clips])

  function handleAddClip(clip: Clip) {
    const newClips = [...clips, clip]
    handleClipsChange(newClips)
    setPreview({
      uploadId: clip.upload_id, src: `/api/uploads/${clip.upload_id}/stream`,
      name: clip.original_name, seekTime: 0,
      trimStart: 0, trimEnd: clip.duration,
      cuts: [], duration: clip.duration,
    })
  }

  async function handleAutoTrim() {
    if (!clips.length) return
    setAutoTrimming(true)
    try {
      const updated = await Promise.all(
        clips.map(async (clip) => {
          try {
            const result = await projectsApi.detectSilence(clip.filename)
            return { ...clip, trim_start: result.trim_start, trim_end: result.trim_end ?? clip.trim_end }
          } catch { return clip }
        })
      )
      handleClipsChange(updated)
    } finally {
      setAutoTrimming(false)
    }
  }

  const tabs = [
    { id: 'clips' as Tab, label: 'Editor', icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4" /></svg> },
    { id: 'subtitles' as Tab, label: 'Subtítulos', icon: <Subtitles className="h-4 w-4" /> },
    { id: 'export' as Tab, label: 'Exportar', icon: <Settings className="h-4 w-4" /> },
  ]

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-brand-600" />
          <h1 className="text-lg font-semibold text-gray-900">{project.name}</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {saving && <span className="animate-pulse">Guardando...</span>}
          {saved && (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" /> Guardado
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-0 shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab === t.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'clips' && (
          <div className="h-full flex flex-col min-h-0">
            {/* Top: Library + Preview */}
            <div className="flex gap-3 min-h-0 shrink-0" style={{ height: '42%', minHeight: 180 }}>
              {/* Library */}
              <div className="w-52 shrink-0 overflow-y-auto py-2 pr-1 border-r border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">Biblioteca</h3>
                <LibraryPanel onAddClip={handleAddClip} />
              </div>

              {/* Preview */}
              <div className="flex-1 min-w-0 py-2 flex flex-col">
                {preview ? (
                  <VideoPreview
                    src={preview.src}
                    clipName={preview.name}
                    seekTime={preview.seekTime}
                    trimStart={preview.trimStart}
                    trimEnd={preview.trimEnd}
                    cuts={preview.cuts}
                    duration={preview.duration}
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 rounded-xl text-gray-500">
                    <svg className="h-10 w-10 opacity-20 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                    <p className="text-xs text-center px-4">Seleccioná un clip en la línea de tiempo para previsualizarlo</p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom: Timeline editor */}
            <div className="flex-1 min-h-0 border-t border-gray-200" style={{ minHeight: 160 }}>
              <TimelineEditor
                clips={clips}
                onChange={handleClipsChange}
                onPreviewSeek={handlePreviewSeek}
                previewUploadId={preview?.uploadId ?? null}
                onAutoTrim={handleAutoTrim}
                autoTrimming={autoTrimming}
              />
            </div>
          </div>
        )}

        {tab === 'subtitles' && (
          <div className="h-full overflow-y-auto pt-3">
            <SubtitleEditor clips={clips} subtitles={subtitles} onChange={handleSubtitlesChange} />
          </div>
        )}

        {tab === 'export' && (
          <div className="h-full overflow-y-auto pt-3">
            <ExportPanel
              project={project}
              settings={settings}
              clips={clips}
              subtitles={subtitles}
              onSettingsChange={handleSettingsChange}
              onProjectUpdate={onUpdate}
              onForceSave={forceSave}
            />
          </div>
        )}
      </div>
    </div>
  )
}
