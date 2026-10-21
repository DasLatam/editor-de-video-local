import { useRef, useEffect, useState } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { formatDuration } from '../../utils/format'

interface Props {
  src: string
  clipName: string
  seekTime: number | null     // null = no override, usuario controla
  trimStart: number
  trimEnd: number
  cuts: Array<{ start: number; end: number }>
  duration: number
}

export function VideoPreview({ src, clipName, seekTime, trimStart, trimEnd, cuts, duration }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [muted, setMuted] = useState(false)
  const [ready, setReady] = useState(false)
  const lastSrc = useRef('')

  // Reload when src changes
  useEffect(() => {
    const v = videoRef.current
    if (!v || src === lastSrc.current) return
    lastSrc.current = src
    v.pause()
    v.src = src
    v.load()
    setReady(false)
    setPlaying(false)
    setCurrentTime(trimStart)
  }, [src, trimStart])

  // Seek when seekTime prop changes (hover/drag from timeline)
  useEffect(() => {
    const v = videoRef.current
    if (!v || seekTime === null || !ready) return
    v.currentTime = seekTime
  }, [seekTime, ready])

  // Sync currentTime display
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => setCurrentTime(v.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onReady = () => {
      setReady(true)
      v.currentTime = seekTime !== null ? seekTime : trimStart
    }
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('loadedmetadata', onReady)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('loadedmetadata', onReady)
    }
  }, [])

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play()
    } else {
      v.pause()
    }
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const v = videoRef.current
    const bar = progressRef.current
    if (!v || !bar) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = ratio * duration
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const trimStartPct = duration > 0 ? (trimStart / duration) * 100 : 0
  const trimEndPct = duration > 0 ? (trimEnd / duration) * 100 : 100
  const isInCut = cuts.some(c => currentTime >= c.start && currentTime <= c.end)
  const isOutsideTrim = currentTime < trimStart || currentTime > trimEnd

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden shadow-lg">
      {/* Video */}
      <div className="relative bg-black aspect-video flex items-center justify-center">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          preload="metadata"
          muted={muted}
          playsInline
        />

        {/* Overlay label when in a cut or outside trim */}
        {(isInCut || isOutsideTrim) && ready && (
          <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center pointer-events-none">
            <span className="text-white text-xs font-bold bg-red-700 px-3 py-1 rounded-full">
              {isInCut ? 'SECCIÓN CORTADA' : 'FUERA DEL RECORTE'}
            </span>
          </div>
        )}

        {/* Play overlay on paused */}
        {!playing && ready && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
          >
            <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
              <Play className="h-6 w-6 text-gray-900 ml-1" />
            </div>
          </button>
        )}

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-2 border-white/40 border-t-white rounded-full" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-3 pt-2 pb-3 space-y-2">
        {/* Custom progress bar */}
        <div
          ref={progressRef}
          className="relative h-4 bg-gray-700 rounded-full cursor-pointer group"
          onClick={handleProgressClick}
        >
          {/* Trim range */}
          <div
            className="absolute top-0 bottom-0 bg-brand-800/60 rounded-full"
            style={{ left: `${trimStartPct}%`, right: `${100 - trimEndPct}%` }}
          />
          {/* Cuts */}
          {cuts.map((cut, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 bg-red-500/80"
              style={{
                left: `${(cut.start / duration) * 100}%`,
                width: `${((cut.end - cut.start) / duration) * 100}%`,
              }}
            />
          ))}
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white rounded-full shadow transition-all"
            style={{ left: `${progressPct}%`, transform: 'translateX(-50%)' }}
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow group-hover:scale-125 transition-transform" />
          </div>
        </div>

        {/* Bottom controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="text-white hover:text-brand-300 transition-colors"
            >
              {playing
                ? <Pause className="h-5 w-5" />
                : <Play className="h-5 w-5" />
              }
            </button>
            <button
              onClick={() => { setMuted(m => !m); if (videoRef.current) videoRef.current.muted = !muted }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <span className="text-xs text-gray-300 font-mono">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          {/* Time region indicator */}
          <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isInCut ? 'bg-red-600 text-white' :
            isOutsideTrim ? 'bg-orange-600 text-white' :
            'bg-brand-700 text-white'
          }`}>
            {isInCut ? 'Cortado' : isOutsideTrim ? 'Trimmed' : `Activo · ${formatDuration(trimEnd - trimStart)}`}
          </div>
        </div>

        {/* Clip name */}
        <p className="text-xs text-gray-500 truncate">{clipName}</p>
      </div>
    </div>
  )
}
