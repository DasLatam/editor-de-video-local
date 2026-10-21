import { useRef, useState, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Scissors, Trash2, Clock, X, Undo2, Eye } from 'lucide-react'
import type { Clip, Cut } from '../../types'
import { formatDuration } from '../../utils/format'

interface Props {
  clip: Clip
  index: number
  onRemove: () => void
  onChange: (clip: Clip) => void
  onPreviewSeek: (uploadId: string, time: number) => void
  isPreviewActive: boolean
}

export function ClipItem({ clip, index, onRemove, onChange, onPreviewSeek, isPreviewActive }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clip.upload_id + '-' + index })

  const [cutMode, setCutMode] = useState(false)
  const [pendingCutStart, setPendingCutStart] = useState<number | null>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const trimEnd = clip.trim_end ?? clip.duration
  const effectiveDuration = trimEnd - clip.trim_start
  const cuts = clip.cuts ?? []

  const posToTime = useCallback((e: React.MouseEvent): number => {
    const rect = barRef.current!.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    // Map bar position → actual video time (within trim range)
    return clip.trim_start + ratio * effectiveDuration
  }, [clip.trim_start, effectiveDuration])

  function handleBarClick(e: React.MouseEvent) {
    const t = posToTime(e)
    if (!cutMode) {
      // Just seek preview on click
      onPreviewSeek(clip.upload_id, t)
      return
    }
    if (pendingCutStart === null) {
      setPendingCutStart(t)
    } else {
      const start = Math.min(pendingCutStart, t)
      const end = Math.max(pendingCutStart, t)
      if (end - start > 0.1) {
        onChange({ ...clip, cuts: [...cuts, { start, end }] })
      }
      setPendingCutStart(null)
      setCutMode(false)
    }
  }

  function handleBarMouseMove(e: React.MouseEvent) {
    const t = posToTime(e)
    setHoverTime(t)
    // Seek preview while hovering (scrubbing)
    onPreviewSeek(clip.upload_id, t)
  }

  function handleBarMouseLeave() {
    setHoverTime(null)
  }

  function removeCut(i: number) {
    onChange({ ...clip, cuts: cuts.filter((_, idx) => idx !== i) })
  }

  function setTrimStart(v: number) {
    const newStart = Math.min(v, trimEnd - 0.1)
    onPreviewSeek(clip.upload_id, newStart)
    onChange({ ...clip, trim_start: newStart, cuts: cuts.filter(c => c.end > newStart) })
  }

  function setTrimEnd(v: number) {
    const newEnd = Math.max(v, clip.trim_start + 0.1)
    onPreviewSeek(clip.upload_id, newEnd)
    onChange({ ...clip, trim_end: newEnd >= clip.duration ? null : newEnd, cuts: cuts.filter(c => c.start < newEnd) })
  }

  const cancelCutMode = () => { setCutMode(false); setPendingCutStart(null) }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-xl p-3 shadow-sm space-y-3 transition-colors ${
        isPreviewActive ? 'border-brand-400 ring-1 ring-brand-300' : 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical className="h-5 w-5" />
        </button>
        <span className="text-xs font-bold text-brand-600 bg-brand-50 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <p className="text-sm font-medium text-gray-800 truncate flex-1">{clip.original_name}</p>
        <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
          <Clock className="h-3 w-3" />
          {formatDuration(effectiveDuration)}
        </div>
        <button
          onClick={() => onPreviewSeek(clip.upload_id, clip.trim_start)}
          className={`p-1 rounded-lg transition-colors shrink-0 ${
            isPreviewActive
              ? 'text-brand-600 bg-brand-50'
              : 'text-gray-400 hover:text-brand-500 hover:bg-brand-50'
          }`}
          title="Ver preview"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 shrink-0">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Visual timeline bar */}
      <div className="space-y-1.5">
        <div
          ref={barRef}
          onClick={handleBarClick}
          onMouseMove={handleBarMouseMove}
          onMouseLeave={handleBarMouseLeave}
          className={`relative h-9 bg-gray-200 rounded-lg overflow-hidden select-none ${
            cutMode ? 'cursor-crosshair' : 'cursor-pointer'
          }`}
          title={cutMode ? 'Click para marcar inicio/fin del corte' : 'Click o arrastrar para previsualizar'}
        >
          {/* Trimmed-off zones (darker) */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-gray-300"
            style={{ width: `${(clip.trim_start / clip.duration) * 100}%` }}
          />
          <div
            className="absolute top-0 bottom-0 right-0 bg-gray-300"
            style={{ width: `${((clip.duration - trimEnd) / clip.duration) * 100}%` }}
          />

          {/* Included zone */}
          <div
            className="absolute top-0 bottom-0 bg-brand-400"
            style={{
              left: `${(clip.trim_start / clip.duration) * 100}%`,
              right: `${((clip.duration - trimEnd) / clip.duration) * 100}%`,
            }}
          />

          {/* Cut zones */}
          {cuts.map((cut, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 bg-red-500"
              style={{
                left: `${(cut.start / clip.duration) * 100}%`,
                width: `${((cut.end - cut.start) / clip.duration) * 100}%`,
              }}
            />
          ))}

          {/* Pending cut preview */}
          {pendingCutStart !== null && hoverTime !== null && (
            <div
              className="absolute top-0 bottom-0 bg-yellow-400/70 pointer-events-none"
              style={{
                left: `${(Math.min(pendingCutStart, hoverTime) / clip.duration) * 100}%`,
                width: `${(Math.abs(hoverTime - pendingCutStart) / clip.duration) * 100}%`,
              }}
            />
          )}

          {/* Pending cut start marker */}
          {pendingCutStart !== null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-yellow-500 pointer-events-none z-10"
              style={{ left: `${(pendingCutStart / clip.duration) * 100}%` }}
            />
          )}

          {/* Hover playhead */}
          {hoverTime !== null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-white/80 pointer-events-none z-10"
              style={{ left: `${(hoverTime / clip.duration) * 100}%` }}
            />
          )}

          {/* Time labels */}
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-white/90 font-medium pointer-events-none z-20">
            {formatDuration(clip.trim_start)}
          </span>
          {hoverTime !== null && (
            <span
              className="absolute top-1/2 -translate-y-1/2 text-[10px] text-white font-bold bg-gray-900/70 px-1 rounded pointer-events-none z-20"
              style={{
                left: `clamp(30px, ${(hoverTime / clip.duration) * 100}%, calc(100% - 40px))`,
                transform: 'translateX(-50%) translateY(-50%)',
              }}
            >
              {formatDuration(hoverTime)}
            </span>
          )}
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-white/90 font-medium pointer-events-none z-20">
            {formatDuration(trimEnd)}
          </span>
        </div>

        {/* Cut mode instructions */}
        {cutMode && (
          <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5">
            <span className="text-xs text-yellow-800">
              {pendingCutStart === null
                ? 'Hacé click donde empieza la sección a eliminar'
                : `Inicio: ${formatDuration(pendingCutStart)} — ahora click donde termina`}
            </span>
            <button onClick={cancelCutMode} className="text-yellow-600 hover:text-yellow-800 ml-2">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Trim sliders */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-12 shrink-0">Inicio</span>
          <input
            type="range" min={0} max={clip.duration} step={0.1}
            value={clip.trim_start}
            onChange={e => setTrimStart(parseFloat(e.target.value))}
            className="flex-1 accent-brand-600 h-1.5 cursor-pointer"
          />
          <span className="text-xs text-gray-600 w-12 text-right">{formatDuration(clip.trim_start)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-12 shrink-0">Fin</span>
          <input
            type="range" min={0} max={clip.duration} step={0.1}
            value={trimEnd}
            onChange={e => setTrimEnd(parseFloat(e.target.value))}
            className="flex-1 accent-brand-600 h-1.5 cursor-pointer"
          />
          <span className="text-xs text-gray-600 w-12 text-right">{formatDuration(trimEnd)}</span>
        </div>
      </div>

      {/* Cuts list + add button */}
      <div className="space-y-1.5">
        {cuts.map((cut, i) => (
          <div key={i} className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
            <Scissors className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <span className="text-xs text-red-700 flex-1">
              {formatDuration(cut.start)} → {formatDuration(cut.end)}
              <span className="text-red-400 ml-1">({formatDuration(cut.end - cut.start)})</span>
            </span>
            <button onClick={() => removeCut(i)} className="text-red-400 hover:text-red-600" title="Deshacer corte">
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <button
          onClick={() => { setCutMode(true); setPendingCutStart(null) }}
          disabled={cutMode}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg px-2 py-1 transition-colors disabled:opacity-40"
        >
          <Scissors className="h-3.5 w-3.5" />
          Marcar sección a eliminar
        </button>
      </div>
    </div>
  )
}
