import { useState, useEffect, useRef } from 'react'
import { Download, Play, Settings2, Film, Gauge, Droplets } from 'lucide-react'
import type { Project, ProjectSettings, Clip, Subtitle } from '../../types'
import { projectsApi } from '../../api/client'
import { Button } from '../UI/Button'
import { FullPreview } from '../Preview/FullPreview'

interface Props {
  project: Project
  settings: ProjectSettings
  clips: Clip[]
  subtitles: Subtitle[]
  onSettingsChange: (s: ProjectSettings) => void
  onProjectUpdate: (p: Project) => void
  onForceSave: () => Promise<void>
}

const ASPECT_RATIOS = [
  { value: '16:9', platforms: 'YouTube', ratio: '16:9', desc: 'Horizontal · 1920×1080', shape: 'w-8 h-5' },
  { value: '9:16', platforms: 'Shorts · Reels · TikTok', ratio: '9:16', desc: 'Vertical · 1080×1920', shape: 'w-3 h-6' },
  { value: '1:1', platforms: 'Instagram Feed', ratio: '1:1', desc: 'Cuadrado · 1080×1080', shape: 'w-5 h-5' },
  { value: '4:5', platforms: 'Instagram Portrait', ratio: '4:5', desc: 'Retrato · 1080×1350', shape: 'w-4 h-5' },
]

const WM_POSITIONS = [
  { value: 'bottom-right', label: 'Abajo derecha' },
  { value: 'bottom-left', label: 'Abajo izquierda' },
  { value: 'top-right', label: 'Arriba derecha' },
  { value: 'top-left', label: 'Arriba izquierda' },
]

export function ExportPanel({ project, settings, clips, subtitles, onSettingsChange, onProjectUpdate, onForceSave }: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (project.status === 'processing') { setProcessing(true); startPolling() }
    return () => stopPolling()
  }, [project.id])

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const status = await projectsApi.status(project.id)
        setProgress(status.progress)
        setProgressMsg(status.progress_message)
        if (status.status === 'completed') {
          stopPolling(); setProcessing(false)
          onProjectUpdate(await projectsApi.get(project.id))
        } else if (status.status === 'failed') {
          stopPolling(); setProcessing(false)
          setError(status.error_message || 'Error en el procesamiento')
        }
      } catch { /* ignore */ }
    }, 1500)
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleProcess() {
    if (!clips.length) return
    setError(null); setProgress(0); setProgressMsg('Guardando...'); setProcessing(true)
    try {
      await projectsApi.update(project.id, { clips, settings, subtitles })
      await projectsApi.process(project.id)
      onProjectUpdate(await projectsApi.get(project.id))
      startPolling()
    } catch (e: any) {
      setProcessing(false)
      setError(e?.response?.data?.detail || 'Error al iniciar')
    }
  }

  function set(field: keyof ProjectSettings, value: any) {
    onSettingsChange({ ...settings, [field]: value })
  }

  return (
    <div className="space-y-6">
      {/* Full Preview */}
      <div className="bg-gray-50 rounded-xl p-4">
        <FullPreview
          projectId={project.id}
          clips={clips}
          settings={settings}
          onBeforeGenerate={onForceSave}
        />
      </div>

      {/* Aspect ratio */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          <Film className="inline h-4 w-4 mr-1.5" />Formato de salida
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ASPECT_RATIOS.map(ar => {
            const active = settings.aspect_ratio === ar.value
            return (
              <button key={ar.value} onClick={() => set('aspect_ratio', ar.value)}
                className={`p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                  active ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                {/* Shape preview */}
                <div className="flex items-center justify-center w-8 h-8 shrink-0">
                  <div className={`${ar.shape} rounded-sm border-2 ${active ? 'border-brand-500 bg-brand-100' : 'border-gray-400 bg-gray-100'}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-bold leading-tight ${active ? 'text-brand-700' : 'text-gray-800'}`}>
                    {ar.ratio}
                  </p>
                  <p className={`text-[11px] leading-snug truncate ${active ? 'text-brand-600' : 'text-gray-500'}`}>
                    {ar.platforms}
                  </p>
                  <p className={`text-[10px] ${active ? 'text-brand-400' : 'text-gray-400'}`}>
                    {ar.desc}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Speed */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          <Gauge className="inline h-4 w-4 mr-1.5" />
          Velocidad — {settings.speed === 1.0 ? 'Normal' : `${settings.speed.toFixed(2)}x`}
        </label>
        <input type="range" min={0.5} max={2.5} step={0.05} value={settings.speed}
          onChange={e => set('speed', parseFloat(e.target.value))}
          className="w-full accent-brand-600 h-2" />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0.5x lento</span><span>1x</span><span>2.5x rápido</span>
        </div>
        {settings.speed !== 1.0 && (
          <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5 mt-1.5">
            Voz con el mismo tono (tempo-stretch, sin pitch shift)
          </p>
        )}
      </div>

      {/* Image */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-gray-700">
          <Settings2 className="inline h-4 w-4 mr-1.5" />Imagen
        </label>
        <div>
          <div className="flex justify-between mb-1 text-xs text-gray-600">
            <span>Brillo</span><span>{settings.brightness > 0 ? '+' : ''}{settings.brightness.toFixed(2)}</span>
          </div>
          <input type="range" min={-0.5} max={0.5} step={0.05} value={settings.brightness}
            onChange={e => set('brightness', parseFloat(e.target.value))}
            className="w-full accent-brand-600 h-1.5" />
        </div>
        <div>
          <div className="flex justify-between mb-1 text-xs text-gray-600">
            <span>Contraste</span><span>{settings.contrast.toFixed(2)}x</span>
          </div>
          <input type="range" min={0.5} max={2.0} step={0.05} value={settings.contrast}
            onChange={e => set('contrast', parseFloat(e.target.value))}
            className="w-full accent-brand-600 h-1.5" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={settings.normalize_audio}
            onChange={e => set('normalize_audio', e.target.checked)} className="rounded accent-brand-600" />
          <span className="text-sm text-gray-600">Normalizar audio</span>
        </label>
      </div>

      {/* Watermark */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <label className="block text-sm font-semibold text-gray-700">
          <Droplets className="inline h-4 w-4 mr-1.5" />Marca de agua
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <div onClick={() => set('watermark', !settings.watermark)}
            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${settings.watermark ? 'bg-brand-600' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${settings.watermark ? 'left-5' : 'left-0.5'}`} />
          </div>
          <span className="text-sm text-gray-700">Agregar ícono en el video</span>
        </label>
        {settings.watermark && (
          <div className="space-y-2 pl-3 border-l-2 border-brand-200">
            <div>
              <span className="text-xs text-gray-600 block mb-1">Posición</span>
              <select value={settings.watermark_position}
                onChange={e => set('watermark_position', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5">
                {WM_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Opacidad</span><span>{Math.round(settings.watermark_opacity * 100)}%</span>
              </div>
              <input type="range" min={0.2} max={1.0} step={0.05} value={settings.watermark_opacity}
                onChange={e => set('watermark_opacity', parseFloat(e.target.value))}
                className="w-full accent-brand-600 h-1.5" />
            </div>
          </div>
        )}
      </div>

      {/* Brand closing note */}
      <div className="bg-blue-50 rounded-xl px-3 py-2.5 text-xs text-blue-700">
        <span className="font-semibold">Card de cierre:</span> agregá tu video de marca directamente como último clip en la línea de tiempo.
      </div>

      {/* Subtitles style */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <label className="block text-sm font-semibold text-gray-700">Estilo de subtítulos</label>

        {/* Size presets */}
        <div>
          <span className="text-xs text-gray-600 block mb-1.5">Tamaño</span>
          <div className="flex gap-2">
            {([['Chico', 14], ['Normal', 18], ['Grande', 24], ['XL', 32]] as [string, number][]).map(([label, v]) => (
              <button key={v} onClick={() => set('subtitle_font_size', v)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                  settings.subtitle_font_size === v
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div className="flex gap-2">
          {([['white', 'Blanco', '#fff', '#000'], ['yellow', 'Amarillo', '#fef08a', '#854d0e']] as [string, string, string, string][]).map(([v, lbl, bg, fg]) => (
            <button key={v} onClick={() => set('subtitle_color', v)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                settings.subtitle_color === v ? 'border-brand-500 ring-1 ring-brand-300' : 'border-gray-200'
              }`}
              style={{ background: bg, color: fg }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Style toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={settings.subtitle_bg}
            onChange={e => set('subtitle_bg', e.target.checked)} className="rounded accent-brand-600" />
          <span className="text-sm text-gray-600">Fondo semitransparente (caja negra detrás del texto)</span>
        </label>
        {!settings.subtitle_bg && (
          <p className="text-xs text-gray-400 -mt-1">Contorno negro grueso + sombra para mejor contraste</p>
        )}
      </div>

      {/* Quality */}
      <div>
        <span className="text-xs text-gray-600 block mb-1">Calidad</span>
        <div className="flex gap-2">
          {[['high', 'Alta'], ['medium', 'Media']].map(([q, label]) => (
            <button key={q} onClick={() => set('output_quality', q)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                settings.output_quality === q
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Progress */}
      {processing && (
        <div className="bg-blue-50 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-blue-700">{progressMsg}</p>
            <span className="text-sm text-blue-600">{progress}%</span>
          </div>
          <div className="bg-blue-100 rounded-full h-2.5">
            <div className="bg-blue-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 rounded-xl p-3 text-sm text-red-700">{error}</div>}

      {/* Actions */}
      <div className="space-y-2 pt-2">
        <Button onClick={handleProcess} loading={processing}
          disabled={processing || clips.length === 0} className="w-full" size="lg">
          <Play className="h-5 w-5" />
          {processing ? 'Procesando...' : 'Renderizar Video Final'}
        </Button>

        {project.status === 'completed' && project.download_url && (
          <a href={project.download_url} download
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-xl transition-colors text-base">
            <Download className="h-5 w-5" />
            Descargar Video
          </a>
        )}
      </div>
    </div>
  )
}
