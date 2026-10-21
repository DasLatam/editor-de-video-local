import { useState, useRef, useMemo, useEffect } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, horizontalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MousePointer2, Scissors, ZoomIn, ZoomOut, Wand2, Loader2, X, Trash2, Undo2, SplitSquareHorizontal } from 'lucide-react'
import type { Clip } from '../../types'
import { formatDuration } from '../../utils/format'

// ─── Constants ─────────────────────────────────────────────────────────────────

const TRACK_H = 64
const RULER_H = 28
const HANDLE_W = 12

const COLORS = [
  { base: '#3b82f6', dark: '#1d4ed8', light: '#93c5fd' },
  { base: '#8b5cf6', dark: '#6d28d9', light: '#c4b5fd' },
  { base: '#06b6d4', dark: '#0e7490', light: '#67e8f9' },
  { base: '#14b8a6', dark: '#0f766e', light: '#5eead4' },
  { base: '#f97316', dark: '#c2410c', light: '#fdba74' },
  { base: '#ec4899', dark: '#be185d', light: '#f9a8d4' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function effectiveDur(clip: Clip) {
  const end = clip.trim_end ?? clip.duration
  const cuts = (clip.cuts ?? []).reduce((s, c) => s + Math.max(0, c.end - c.start), 0)
  return Math.max(0.05, end - clip.trim_start - cuts)
}

function buildMetrics(clips: Clip[]) {
  let offset = 0
  return clips.map(clip => {
    const eff = effectiveDur(clip)
    const m = { offset, eff, trimEnd: clip.trim_end ?? clip.duration }
    offset += eff
    return m
  })
}

// Positions within block (0..1) where cut seams show
function seamPositions(clip: Clip, eff: number): number[] {
  const end = clip.trim_end ?? clip.duration
  const cuts = (clip.cuts ?? []).filter(c => c.end > clip.trim_start && c.start < end).sort((a, b) => a.start - b.start)
  if (!cuts.length) return []
  const seams: number[] = []
  let cum = 0, src = clip.trim_start
  for (const cut of cuts) {
    const segEnd = Math.min(cut.start, end)
    if (segEnd > src) { cum += segEnd - src; seams.push(cum / eff) }
    src = Math.max(cut.end, src)
  }
  return seams
}

// Global output time → { clipIdx, localT in source }
function globalToLocal(t: number, clips: Clip[], metrics: ReturnType<typeof buildMetrics>) {
  let rem = Math.max(0, t)
  for (let i = 0; i < clips.length; i++) {
    if (rem <= metrics[i].eff + 1e-6) {
      const clip = clips[i]
      const cuts = [...(clip.cuts ?? [])].sort((a, b) => a.start - b.start)
      let src = clip.trim_start
      let r = rem
      for (const cut of cuts) {
        const segDur = Math.max(0, cut.start - src)
        if (r <= segDur) { src += r; return { idx: i, localT: src } }
        r -= segDur; src = cut.end
      }
      return { idx: i, localT: Math.min(src + r, metrics[i].trimEnd) }
    }
    rem -= metrics[i].eff
  }
  return null
}

// Split clip at source time → two clips
function splitAt(clips: Clip[], idx: number, splitT: number): Clip[] {
  const clip = clips[idx]
  const end = clip.trim_end ?? clip.duration
  if (splitT <= clip.trim_start + 0.05 || splitT >= end - 0.05) return clips
  const left: Clip = {
    ...clip,
    trim_end: splitT,
    cuts: (clip.cuts ?? []).filter(c => c.start < splitT - 0.05).map(c => ({ ...c, end: Math.min(c.end, splitT) })),
  }
  const right: Clip = {
    ...clip,
    trim_start: splitT,
    trim_end: clip.trim_end,
    cuts: (clip.cuts ?? []).filter(c => c.end > splitT + 0.05).map(c => ({ ...c, start: Math.max(c.start, splitT) })),
  }
  return [...clips.slice(0, idx), left, right, ...clips.slice(idx + 1)]
}

// ─── ClipBlock ─────────────────────────────────────────────────────────────────

interface BlockProps {
  id: string
  clip: Clip
  index: number
  blockW: number
  color: typeof COLORS[0]
  seams: number[]
  selected: boolean
  activePreview: boolean
  tool: 'pointer' | 'scissors'
  onBodyClick: (e: React.MouseEvent) => void
  onTrimDown: (e: React.PointerEvent, side: 'start' | 'end') => void
  onRemove: () => void
  dragOverride: string
}

function ClipBlock({ id, clip, index, blockW, color, seams, selected, activePreview, tool, onBodyClick, onTrimDown, onRemove, dragOverride }: BlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const [hovered, setHovered] = useState(false)

  const w = Math.max(blockW, 36)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        width: w,
        height: TRACK_H,
        position: 'relative',
        flexShrink: 0,
        opacity: isDragging ? 0.5 : 1,
        paddingTop: 6,
        paddingBottom: 6,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Left trim handle */}
      <div
        onPointerDown={e => { e.stopPropagation(); onTrimDown(e, 'start') }}
        title={`Inicio: ${formatDuration(clip.trim_start)}`}
        style={{
          position: 'absolute', left: 0, top: 6, bottom: 6, width: HANDLE_W,
          background: selected ? color.base : '#1e293b',
          borderRadius: '5px 0 0 5px',
          cursor: 'col-resize',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10,
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', gap: 2 }}>
          <div style={{ width: 1.5, height: 10, background: 'rgba(255,255,255,0.6)', borderRadius: 2 }} />
          <div style={{ width: 1.5, height: 10, background: 'rgba(255,255,255,0.6)', borderRadius: 2 }} />
        </div>
      </div>

      {/* Main body */}
      <div
        {...attributes}
        {...listeners}
        onClick={onBodyClick}
        style={{
          position: 'absolute',
          left: HANDLE_W, right: HANDLE_W, top: 6, bottom: 6,
          background: `linear-gradient(150deg, ${color.base}, ${color.dark})`,
          borderRadius: 4,
          cursor: tool === 'scissors' ? 'crosshair' : (isDragging ? 'grabbing' : 'pointer'),
          overflow: 'hidden',
          outline: selected
            ? `2px solid #fff`
            : activePreview
              ? `2px solid ${color.light}`
              : '2px solid transparent',
          outlineOffset: selected ? 2 : 0,
          userSelect: 'none',
        }}
      >
        {/* Seam lines */}
        {seams.map((pos, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, bottom: 0, left: `${pos * 100}%`,
            width: 2, background: 'rgba(0,0,0,0.4)',
          }} />
        ))}
        {/* Content */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          padding: '0 6px', gap: 4, pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.95)',
            background: 'rgba(0,0,0,0.25)', borderRadius: 3, padding: '1px 4px', flexShrink: 0,
          }}>
            {index + 1}
          </span>
          {w > 72 && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {clip.original_name.replace(/\.[^.]+$/, '')}
            </span>
          )}
          {w > 120 && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginLeft: 'auto', flexShrink: 0, fontFamily: 'monospace' }}>
              {formatDuration(effectiveDur(clip))}
            </span>
          )}
        </div>
      </div>

      {/* Right trim handle */}
      <div
        onPointerDown={e => { e.stopPropagation(); onTrimDown(e, 'end') }}
        title={`Fin: ${formatDuration(clip.trim_end ?? clip.duration)}`}
        style={{
          position: 'absolute', right: 0, top: 6, bottom: 6, width: HANDLE_W,
          background: selected ? color.dark : '#1e293b',
          borderRadius: '0 5px 5px 0',
          cursor: 'col-resize',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10,
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', gap: 2 }}>
          <div style={{ width: 1.5, height: 10, background: 'rgba(255,255,255,0.6)', borderRadius: 2 }} />
          <div style={{ width: 1.5, height: 10, background: 'rgba(255,255,255,0.6)', borderRadius: 2 }} />
        </div>
      </div>

      {/* Remove button */}
      {(selected || hovered) && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onRemove() }}
          title="Eliminar clip (Delete)"
          style={{
            position: 'absolute', top: -2, right: HANDLE_W + 2, zIndex: 20,
            background: '#ef4444', border: 'none', borderRadius: '50%',
            width: 16, height: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        >
          <X style={{ width: 9, height: 9, color: '#fff' }} />
        </button>
      )}
    </div>
  )
}

// ─── ClipInspector ─────────────────────────────────────────────────────────────

interface InspectorProps {
  clip: Clip
  index: number
  color: typeof COLORS[0]
  playheadLocal: number | null
  onChange: (c: Clip) => void
  onClose: () => void
  onPreviewSeek: (id: string, t: number) => void
}

function ClipInspector({ clip, index, color, playheadLocal, onChange, onClose, onPreviewSeek }: InspectorProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const dragRef = useRef<{ side: 'start' | 'end'; startX: number; origVal: number } | null>(null)
  const cuts = clip.cuts ?? []
  const trimEnd = clip.trim_end ?? clip.duration

  function pct(t: number) { return (t / clip.duration) * 100 }

  function barTime(e: React.MouseEvent) {
    const rect = barRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * clip.duration
  }

  function onHandleDown(e: React.PointerEvent, side: 'start' | 'end') {
    e.stopPropagation(); e.preventDefault()
    dragRef.current = { side, startX: e.clientX, origVal: side === 'start' ? clip.trim_start : trimEnd }
    window.addEventListener('pointermove', onHandleMove)
    window.addEventListener('pointerup', () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onHandleMove)
    }, { once: true })
  }

  function onHandleMove(e: PointerEvent) {
    const d = dragRef.current; if (!d || !barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    const delta = ((e.clientX - d.startX) / rect.width) * clip.duration
    if (d.side === 'start') {
      const v = Math.max(0, Math.min(d.origVal + delta, trimEnd - 0.1))
      onChange({ ...clip, trim_start: v })
      onPreviewSeek(clip.upload_id, v)
    } else {
      const v = Math.max(clip.trim_start + 0.1, Math.min(d.origVal + delta, clip.duration))
      onChange({ ...clip, trim_end: v >= clip.duration ? null : v })
      onPreviewSeek(clip.upload_id, v)
    }
  }

  const eff = effectiveDur(clip)

  return (
    <div style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb', padding: '10px 12px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#fff', background: color.base,
            borderRadius: 4, padding: '1px 7px',
          }}>
            #{index + 1}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{clip.original_name}</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>
            {formatDuration(eff)} activo · fuente: {formatDuration(clip.duration)}
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
          <X style={{ width: 15, height: 15 }} />
        </button>
      </div>

      {/* Source bar */}
      <div
        ref={barRef}
        onClick={e => onPreviewSeek(clip.upload_id, barTime(e))}
        onMouseMove={e => { setHover(barTime(e)); onPreviewSeek(clip.upload_id, barTime(e)) }}
        onMouseLeave={() => setHover(null)}
        style={{
          position: 'relative', height: 40, background: '#d1d5db', borderRadius: 8,
          cursor: 'crosshair', userSelect: 'none', marginBottom: 10, overflow: 'visible',
        }}
      >
        {/* Trim zone */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${pct(clip.trim_start)}%`, right: `${100 - pct(trimEnd)}%`,
          background: `linear-gradient(90deg, ${color.base}bb, ${color.dark}bb)`,
          borderRadius: 6,
        }} />
        {/* Cuts */}
        {cuts.map((cut, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${pct(cut.start)}%`,
            width: `${pct(cut.end - cut.start)}%`,
            background: 'rgba(239,68,68,0.85)', borderRadius: 3, zIndex: 2,
          }} />
        ))}
        {/* Playhead position */}
        {playheadLocal !== null && (
          <div style={{
            position: 'absolute', top: -4, bottom: -4, left: `${pct(playheadLocal)}%`,
            width: 2, background: '#a78bfa', marginLeft: -1, zIndex: 5,
          }}>
            <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 2, fontSize: 9, color: '#a78bfa', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
              {formatDuration(playheadLocal)}
            </div>
          </div>
        )}
        {/* Hover line */}
        {hover !== null && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(hover)}%`, width: 1, background: 'rgba(255,255,255,0.8)', zIndex: 4 }}>
            <span style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 2, fontSize: 9, background: '#111', color: '#fff', padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
              {formatDuration(hover)}
            </span>
          </div>
        )}
        {/* Trim handles */}
        <div onPointerDown={e => onHandleDown(e, 'start')} style={{ position: 'absolute', top: -4, bottom: -4, left: `${pct(clip.trim_start)}%`, width: 8, marginLeft: -4, background: color.base, borderRadius: 4, cursor: 'col-resize', zIndex: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
        <div onPointerDown={e => onHandleDown(e, 'end')} style={{ position: 'absolute', top: -4, bottom: -4, left: `${pct(trimEnd)}%`, width: 8, marginLeft: -4, background: color.dark, borderRadius: 4, cursor: 'col-resize', zIndex: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
        {/* Labels */}
        <span style={{ position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'rgba(255,255,255,0.85)', pointerEvents: 'none', fontFamily: 'monospace' }}>{formatDuration(clip.trim_start)}</span>
        <span style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'rgba(255,255,255,0.85)', pointerEvents: 'none', fontFamily: 'monospace' }}>{formatDuration(trimEnd)}</span>
      </div>

      {/* Actions & cuts list */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          Trim: {formatDuration(clip.trim_start)} → {formatDuration(trimEnd)}
        </span>
        {cuts.map((cut, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '2px 8px' }}>
            <Scissors style={{ width: 10, height: 10, color: '#ef4444', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#b91c1c', fontFamily: 'monospace' }}>
              {formatDuration(cut.start)} – {formatDuration(cut.end)}
            </span>
            <button onClick={() => onChange({ ...clip, cuts: cuts.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }} title="Eliminar corte">
              <Undo2 style={{ width: 10, height: 10 }} />
            </button>
          </div>
        ))}
        {cuts.length > 1 && (
          <button onClick={() => onChange({ ...clip, cuts: [] })} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
            Borrar todos
          </button>
        )}
      </div>
    </div>
  )
}

// ─── TimelineEditor ─────────────────────────────────────────────────────────────

interface Props {
  clips: Clip[]
  onChange: (clips: Clip[]) => void
  onPreviewSeek: (uploadId: string, time: number) => void
  previewUploadId: string | null
  onAutoTrim: () => void
  autoTrimming: boolean
}

export function TimelineEditor({ clips, onChange, onPreviewSeek, previewUploadId, onAutoTrim, autoTrimming }: Props) {
  const [zoom, setZoom] = useState(80)
  const [playhead, setPlayhead] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [tool, setTool] = useState<'pointer' | 'scissors'>('pointer')
  const [trimTooltip, setTrimTooltip] = useState<{ x: number; t: number } | null>(null)

  const trackScrollRef = useRef<HTMLDivElement>(null)
  const trimDragRef = useRef<{ clipIdx: number; side: 'start' | 'end'; startX: number; origVal: number } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const metrics = useMemo(() => buildMetrics(clips), [clips])
  const totalDur = metrics.reduce((s, m) => s + m.eff, 0)
  const ids = clips.map((c, i) => `${c.upload_id}-${i}`)

  // Ruler ticks
  const ticks = useMemo(() => {
    let step = 1, lbl = 5
    if (zoom < 20) { step = 30; lbl = 60 }
    else if (zoom < 40) { step = 10; lbl = 30 }
    else if (zoom < 80) { step = 5; lbl = 10 }
    else if (zoom < 160) { step = 2; lbl = 10 }
    const list: { t: number; label: boolean }[] = []
    for (let t = 0; t <= totalDur + step; t = Math.round((t + step) * 100) / 100) {
      list.push({ t, label: Math.round(t * 10) % Math.round(lbl * 10) === 0 })
    }
    return list
  }, [zoom, totalDur])

  // Keyboard: Delete/Backspace removes selected clip
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx !== null) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        onChange(clips.filter((_, i) => i !== selectedIdx))
        setSelectedIdx(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIdx, clips, onChange])

  function seekAt(globalT: number) {
    const t = Math.max(0, Math.min(globalT, totalDur))
    setPlayhead(t)
    const loc = globalToLocal(t, clips, metrics)
    if (loc) onPreviewSeek(clips[loc.idx].upload_id, loc.localT)
  }

  function globalXToTime(clientX: number, containerRect: DOMRect) {
    const scroll = trackScrollRef.current?.scrollLeft ?? 0
    return Math.max(0, (clientX - containerRect.left + scroll) / zoom)
  }

  // Trim handles
  function onTrimDown(e: React.PointerEvent, clipIdx: number, side: 'start' | 'end') {
    e.stopPropagation(); e.preventDefault()
    const clip = clips[clipIdx]
    trimDragRef.current = { clipIdx, side, startX: e.clientX, origVal: side === 'start' ? clip.trim_start : (clip.trim_end ?? clip.duration) }
    window.addEventListener('pointermove', onTrimMove)
    window.addEventListener('pointerup', onTrimUp, { once: true })
  }

  function onTrimMove(e: PointerEvent) {
    const d = trimDragRef.current; if (!d) return
    const delta = (e.clientX - d.startX) / zoom
    const clip = clips[d.clipIdx]
    const trimEnd = clip.trim_end ?? clip.duration
    const newVal = d.side === 'start'
      ? Math.max(0, Math.min(d.origVal + delta, trimEnd - 0.1))
      : Math.max(clip.trim_start + 0.1, Math.min(d.origVal + delta, clip.duration))
    const trackRect = trackScrollRef.current?.getBoundingClientRect()
    if (trackRect) {
      const scroll = trackScrollRef.current?.scrollLeft ?? 0
      const handleX = e.clientX - trackRect.left + scroll
      setTrimTooltip({ x: handleX, t: newVal })
    }
    const newClips = clips.map((c, i) => {
      if (i !== d.clipIdx) return c
      if (d.side === 'start') return { ...c, trim_start: newVal }
      return { ...c, trim_end: newVal >= clip.duration ? null : newVal }
    })
    onChange(newClips)
    onPreviewSeek(clips[d.clipIdx].upload_id, newVal)
  }

  function onTrimUp() {
    trimDragRef.current = null
    setTrimTooltip(null)
    window.removeEventListener('pointermove', onTrimMove)
  }

  useEffect(() => () => {
    window.removeEventListener('pointermove', onTrimMove)
    window.removeEventListener('pointerup', onTrimUp)
  }, [])

  // DnD reorder
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id as string), to = ids.indexOf(over.id as string)
    onChange(arrayMove(clips, from, to))
    setSelectedIdx(prev => prev === null ? null : prev === from ? to : prev === to ? from : prev)
  }

  // Clip click (pointer = select | scissors = split)
  function handleClipBodyClick(e: React.MouseEvent, clipIdx: number) {
    e.stopPropagation()
    if (tool === 'scissors') {
      // Single click = split at click position
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      const clip = clips[clipIdx]
      const trimEnd = clip.trim_end ?? clip.duration
      const localT = clip.trim_start + ratio * (trimEnd - clip.trim_start)
      onChange(splitAt(clips, clipIdx, localT))
      return
    }
    setSelectedIdx(prev => prev === clipIdx ? null : clipIdx)
    seekAt(metrics[clipIdx].offset)
  }

  // Split selected clip at playhead
  function splitAtPlayhead() {
    if (selectedIdx === null) return
    const loc = globalToLocal(playhead, clips, metrics)
    if (!loc || loc.idx !== selectedIdx) return
    onChange(splitAt(clips, selectedIdx, loc.localT))
    setSelectedIdx(null)
  }

  // Is playhead inside selected clip?
  const playheadOnSelected = selectedIdx !== null && (() => {
    const loc = globalToLocal(playhead, clips, metrics)
    return loc?.idx === selectedIdx
  })()

  // Local time of playhead within the selected clip (for inspector)
  const playheadLocal = selectedIdx !== null ? (() => {
    const loc = globalToLocal(playhead, clips, metrics)
    return loc?.idx === selectedIdx ? loc.localT : null
  })() : null

  if (clips.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
        <svg style={{ width: 48, height: 48, opacity: 0.25, marginBottom: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
        <p style={{ fontSize: 13 }}>Agregá clips desde la biblioteca para comenzar</p>
      </div>
    )
  }

  const selectedClip = selectedIdx !== null ? clips[selectedIdx] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', userSelect: 'none' }}>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
        {/* Tool buttons */}
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 7, padding: 2, gap: 1 }}>
          <button
            onClick={() => setTool('pointer')}
            title="Seleccionar y arrastrar (V)"
            style={{ padding: '5px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', background: tool === 'pointer' ? '#fff' : 'transparent', color: tool === 'pointer' ? '#111' : '#6b7280', boxShadow: tool === 'pointer' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}
          >
            <MousePointer2 style={{ width: 14, height: 14 }} />
          </button>
          <button
            onClick={() => setTool('scissors')}
            title="Tijera — click en un clip para dividirlo (C)"
            style={{ padding: '5px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', background: tool === 'scissors' ? '#fff' : 'transparent', color: tool === 'scissors' ? '#dc2626' : '#6b7280', boxShadow: tool === 'scissors' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}
          >
            <Scissors style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Tool hint */}
        {tool === 'scissors' && (
          <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 500, background: '#fef2f2', padding: '3px 8px', borderRadius: 5 }}>
            Click en el clip para dividirlo
          </span>
        )}

        {/* Split at playhead */}
        {tool === 'pointer' && selectedIdx !== null && (
          <button
            onClick={splitAtPlayhead}
            disabled={!playheadOnSelected}
            title="Dividir clip seleccionado en la posición del playhead"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
              background: playheadOnSelected ? '#f3f4f6' : 'transparent',
              color: playheadOnSelected ? '#374151' : '#d1d5db',
              border: '1px solid ' + (playheadOnSelected ? '#e5e7eb' : 'transparent'),
              borderRadius: 6, padding: '4px 10px', cursor: playheadOnSelected ? 'pointer' : 'default',
            }}
          >
            <SplitSquareHorizontal style={{ width: 13, height: 13 }} />
            Cortar aquí
          </button>
        )}

        {/* Delete selected */}
        {selectedIdx !== null && (
          <button
            onClick={() => { onChange(clips.filter((_, i) => i !== selectedIdx)); setSelectedIdx(null) }}
            title="Eliminar clip seleccionado (Delete)"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
          >
            <Trash2 style={{ width: 13, height: 13 }} />
            Eliminar
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Auto-trim */}
        <button
          onClick={onAutoTrim}
          disabled={autoTrimming}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', cursor: autoTrimming ? 'not-allowed' : 'pointer', opacity: autoTrimming ? 0.6 : 1 }}
          title="Detecta y elimina silencios del inicio y fin de cada clip"
        >
          {autoTrimming ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : <Wand2 style={{ width: 13, height: 13 }} />}
          Quitar silencios
        </button>

        {/* Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setZoom(z => Math.max(12, z - 15))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><ZoomOut style={{ width: 14, height: 14 }} /></button>
          <input type="range" min={12} max={320} step={4} value={zoom} onChange={e => setZoom(+e.target.value)} style={{ width: 72, accentColor: '#6366f1' }} />
          <button onClick={() => setZoom(z => Math.min(320, z + 15))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><ZoomIn style={{ width: 14, height: 14 }} /></button>
        </div>

        <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace', minWidth: 38, textAlign: 'right' }}>
          {formatDuration(totalDur)}
        </span>
      </div>

      {/* ── Track ──────────────────────────────────────────────────────── */}
      <div
        ref={trackScrollRef}
        style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', background: '#111827', position: 'relative', minHeight: RULER_H + TRACK_H + 16 }}
        onClick={e => {
          const el = trackScrollRef.current; if (!el) return
          if ((e.target as HTMLElement).dataset.ruler !== undefined || e.target === el) {
            const rect = el.getBoundingClientRect()
            seekAt((e.clientX - rect.left + el.scrollLeft) / zoom)
          }
        }}
      >
        <div style={{ width: Math.max(totalDur * zoom + 120, 500), minHeight: RULER_H + TRACK_H + 16, position: 'relative' }}>

          {/* Ruler */}
          <div data-ruler style={{ height: RULER_H, position: 'relative', borderBottom: '1px solid #374151', cursor: 'pointer' }}>
            {ticks.map(({ t, label }) => (
              <div key={t} style={{ position: 'absolute', bottom: 0, left: t * zoom, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 1, height: label ? 10 : 5, background: label ? '#6b7280' : '#374151' }} />
                {label && (
                  <span style={{ position: 'absolute', bottom: '100%', marginBottom: 1, fontSize: 9, color: '#9ca3af', fontFamily: 'monospace', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
                    {formatDuration(t)}
                  </span>
                )}
              </div>
            ))}
            {/* Playhead triangle on ruler */}
            <div style={{ position: 'absolute', top: 0, left: playhead * zoom, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 20 }}>
              <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '8px solid #a78bfa', marginTop: 2 }} />
            </div>
            {/* Playhead time label on ruler */}
            <span style={{ position: 'absolute', top: 1, left: playhead * zoom, transform: 'translateX(-50%)', fontSize: 9, color: '#a78bfa', fontFamily: 'monospace', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20 }}>
              {formatDuration(playhead)}
            </span>
          </div>

          {/* Clips row */}
          <div style={{ height: TRACK_H + 16, position: 'relative', paddingTop: 8, paddingBottom: 8 }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
                <div style={{ display: 'flex' }}>
                  {clips.map((clip, i) => {
                    const m = metrics[i]
                    const bw = Math.max(m.eff * zoom, 36)
                    return (
                      <ClipBlock
                        key={ids[i]}
                        id={ids[i]}
                        clip={clip}
                        index={i}
                        blockW={bw}
                        color={COLORS[i % COLORS.length]}
                        seams={seamPositions(clip, m.eff)}
                        selected={selectedIdx === i}
                        activePreview={previewUploadId === clip.upload_id}
                        tool={tool}
                        onBodyClick={e => handleClipBodyClick(e, i)}
                        onTrimDown={(e, side) => onTrimDown(e, i, side)}
                        onRemove={() => { onChange(clips.filter((_, idx) => idx !== i)); setSelectedIdx(null) }}
                        dragOverride={tool}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>

            {/* Join markers (absolute overlay, between clips) */}
            {clips.slice(0, -1).map((_, i) => {
              const joinX = metrics[i + 1].offset * zoom
              return (
                <JoinMarker
                  key={`join-${i}`}
                  x={joinX}
                  label={`Empalme ${i + 1}→${i + 2} · ${formatDuration(metrics[i + 1].offset)}`}
                  onClick={() => seekAt(Math.max(0, metrics[i + 1].offset - 1.5))}
                />
              )
            })}
          </div>

          {/* Playhead line */}
          <div style={{ position: 'absolute', top: RULER_H, bottom: 0, left: playhead * zoom - 0.5, width: 1, background: '#a78bfa', pointerEvents: 'none', zIndex: 15 }} />

          {/* Trim tooltip */}
          {trimTooltip && (
            <div style={{ position: 'absolute', top: RULER_H + 2, left: trimTooltip.x, transform: 'translateX(-50%)', background: '#1f2937', color: '#fff', fontSize: 11, padding: '3px 7px', borderRadius: 5, pointerEvents: 'none', zIndex: 30, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {formatDuration(trimTooltip.t)}
            </div>
          )}
        </div>
      </div>

      {/* ── Inspector ──────────────────────────────────────────────────── */}
      {selectedClip !== null && selectedIdx !== null && (
        <ClipInspector
          clip={selectedClip}
          index={selectedIdx}
          color={COLORS[selectedIdx % COLORS.length]}
          playheadLocal={playheadLocal}
          onChange={updated => { const next = [...clips]; next[selectedIdx] = updated; onChange(next) }}
          onClose={() => setSelectedIdx(null)}
          onPreviewSeek={onPreviewSeek}
        />
      )}
    </div>
  )
}

// ─── JoinMarker ────────────────────────────────────────────────────────────────

function JoinMarker({ x, label, onClick }: { x: number; label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{ position: 'absolute', top: 0, bottom: 0, left: x, transform: 'translateX(-50%)', zIndex: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
      onClick={e => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
    >
      {/* Vertical line */}
      <div style={{ width: 2, height: '100%', background: hovered ? '#fbbf24' : 'rgba(255,255,255,0.25)', transition: 'background 0.15s' }} />
      {/* Diamond marker in the middle */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%) rotate(45deg)',
        width: hovered ? 12 : 8, height: hovered ? 12 : 8,
        background: hovered ? '#fbbf24' : 'rgba(255,255,255,0.5)',
        transition: 'all 0.15s',
        boxShadow: hovered ? '0 0 0 3px rgba(251,191,36,0.3)' : 'none',
      }} />
      {/* Tooltip on hover */}
      {hovered && (
        <div style={{ position: 'absolute', top: '50%', left: 14, transform: 'translateY(-50%)', background: '#1f2937', color: '#fbbf24', fontSize: 10, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', fontFamily: 'monospace', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
          {label}
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>Click: preview desde aquí</div>
        </div>
      )}
    </div>
  )
}
