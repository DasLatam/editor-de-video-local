import { useState, useEffect, useRef } from 'react'
import { Film, Loader2, RefreshCw, Play } from 'lucide-react'
import { projectsApi } from '../../api/client'
import { Button } from '../UI/Button'
import type { Clip, ProjectSettings } from '../../types'

interface Props {
  projectId: string
  clips: Clip[]
  settings: ProjectSettings
  onBeforeGenerate: () => Promise<void>  // save current state first
}

export function FullPreview({ projectId, clips, settings, onBeforeGenerate }: Props) {
  const [generating, setGenerating] = useState(false)
  const [ready, setReady] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check on mount if a preview already exists
  useEffect(() => {
    checkStatus()
    return () => stopPolling()
  }, [projectId])

  async function checkStatus() {
    try {
      const s = await projectsApi.previewStatus(projectId)
      if (s.ready && s.url) {
        setReady(true)
        setVideoUrl(s.url + '?t=' + Date.now())
      }
    } catch { /* ignore */ }
  }

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const s = await projectsApi.previewStatus(projectId)
        if (s.ready && s.url) {
          stopPolling()
          setGenerating(false)
          setReady(true)
          setVideoUrl(s.url + '?t=' + Date.now())
        }
      } catch { /* ignore */ }
    }, 2000)
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleGenerate() {
    setGenerating(true)
    setReady(false)
    setVideoUrl(null)
    try {
      await onBeforeGenerate()
      await projectsApi.startPreview(projectId)
      startPolling()
    } catch (e: any) {
      setGenerating(false)
    }
  }

  const totalDuration = clips.reduce((acc, c) => {
    const trimEnd = c.trim_end ?? c.duration
    const cutsDur = (c.cuts ?? []).reduce((s, cut) => s + (cut.end - cut.start), 0)
    return acc + (trimEnd - c.trim_start) - cutsDur
  }, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Film className="h-4 w-4 text-brand-600" />
            Vista Previa del Video Completo
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {clips.length} clip{clips.length !== 1 ? 's' : ''} · {formatDur(totalDuration)} · {settings.aspect_ratio}
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          loading={generating}
          disabled={!clips.length}
          size="sm"
          variant={ready ? 'secondary' : 'primary'}
        >
          {generating
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</>
            : ready
              ? <><RefreshCw className="h-4 w-4" /> Actualizar</>
              : <><Play className="h-4 w-4" /> Generar Preview</>
          }
        </Button>
      </div>

      {generating && (
        <div className="bg-blue-50 rounded-xl p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-700">Generando preview en baja calidad...</p>
            <p className="text-xs text-blue-500">Incluye todos los recortes y cortes aplicados. Subtítulos excluidos para acelerar.</p>
          </div>
        </div>
      )}

      {ready && videoUrl && (
        <div className="space-y-2">
          <video
            key={videoUrl}
            src={videoUrl}
            controls
            className="w-full rounded-xl bg-black shadow-lg"
            style={{ maxHeight: '60vh' }}
          />
          <p className="text-xs text-gray-400 text-center">
            Preview en baja calidad — el video exportado final es en alta calidad
          </p>
        </div>
      )}

      {!generating && !ready && clips.length > 0 && (
        <div className="bg-gray-100 rounded-xl p-8 flex flex-col items-center gap-3 text-gray-400">
          <Film className="h-12 w-12 opacity-30" />
          <p className="text-sm text-center">
            Hacé click en "Generar Preview" para ver todos los clips editados juntos
          </p>
        </div>
      )}
    </div>
  )
}

function formatDur(s: number) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
