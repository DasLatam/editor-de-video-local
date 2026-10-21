import { useState } from 'react'
import { Plus, Trash2, Loader2, Sparkles, Mic, X } from 'lucide-react'
import type { Clip, Subtitle } from '../../types'
import { projectsApi } from '../../api/client'
import { Button } from '../UI/Button'
import { secToTimestamp, formatDuration } from '../../utils/format'

interface Props {
  clips: Clip[]
  subtitles: Subtitle[]
  onChange: (subtitles: Subtitle[]) => void
}

export function SubtitleEditor({ clips, subtitles, onChange }: Props) {
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState('es')
  const [karaoke, setKaraoke] = useState(true)

  async function handleTranscribe() {
    if (!clips.length) { setError('Agregá clips primero'); return }
    setTranscribing(true)
    setError(null)
    try {
      // Transcribe all clips and merge segments
      const allSegments: Subtitle[] = []
      let timeOffset = 0

      for (const clip of clips) {
        const { segments } = await projectsApi.transcribe(
          clip.upload_id, clip.filename, language, karaoke
        )
        // Offset by the clip's effective position in the sequence
        const clipStart = clip.trim_start
        for (const seg of segments) {
          // Only include segments within the clip's active range
          const cuts = clip.cuts ?? []
          const isInCut = cuts.some(c => seg.start >= c.start && seg.end <= c.end)
          if (isInCut) continue
          allSegments.push({
            start: round3(timeOffset + seg.start - clipStart),
            end: round3(timeOffset + seg.end - clipStart),
            text: seg.text,
          })
        }
        const trimEnd = clip.trim_end ?? clip.duration
        const cutsDur = (clip.cuts ?? []).reduce((acc, c) => acc + (c.end - c.start), 0)
        timeOffset += (trimEnd - clipStart) - cutsDur
      }

      onChange(allSegments)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error en transcripción')
    } finally {
      setTranscribing(false)
    }
  }

  function addSubtitle() {
    const last = subtitles[subtitles.length - 1]
    const start = last ? last.end + 0.1 : 0
    onChange([...subtitles, { start, end: start + 2.5, text: '' }])
  }

  function update(i: number, field: keyof Subtitle, value: string | number) {
    const updated = [...subtitles]
    updated[i] = { ...updated[i], [field]: value }
    onChange(updated)
  }

  function remove(i: number) {
    onChange(subtitles.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setKaraoke(k => !k)}
              className={`relative w-10 h-5 rounded-full transition-colors ${karaoke ? 'bg-brand-600' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${karaoke ? 'left-5' : 'left-0.5'}`} />
            </div>
            <span className="text-sm text-gray-700 font-medium">Modo karaoke</span>
          </label>
        </div>

        {karaoke && (
          <p className="text-xs text-brand-700 bg-brand-50 rounded-lg px-3 py-2">
            <Mic className="inline h-3.5 w-3.5 mr-1" />
            Karaoke: separa en grupos de ~4 palabras para mostrar el texto en sincronía con el habla
          </p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleTranscribe}
            loading={transcribing}
            disabled={!clips.length}
            size="sm"
            className="flex-1"
          >
            <Sparkles className="h-4 w-4" />
            {transcribing ? 'Transcribiendo...' : 'Transcribir con IA'}
          </Button>
          <Button variant="secondary" size="sm" onClick={addSubtitle}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 rounded-xl p-3">
          <X className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {transcribing && (
        <div className="flex items-center gap-3 bg-blue-50 rounded-xl p-4">
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-700">Transcribiendo con Whisper...</p>
            <p className="text-xs text-blue-600">Puede tardar varios minutos según la duración.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      {subtitles.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span>{subtitles.length} subtítulos</span>
          <button
            onClick={() => onChange([])}
            className="text-red-400 hover:text-red-600 transition-colors"
          >
            Borrar todos
          </button>
        </div>
      )}

      {/* List */}
      {subtitles.length === 0 && !transcribing ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">Sin subtítulos. Usá "Transcribir con IA" o agregá manualmente.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {subtitles.map((sub, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-brand-600 w-6 shrink-0">{i + 1}</span>
                <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                  <input
                    type="number" min={0} step={0.1} value={sub.start}
                    onChange={e => update(i, 'start', parseFloat(e.target.value))}
                    className="w-20 text-xs border border-gray-200 rounded px-2 py-1 font-mono"
                  />
                  <span className="text-gray-400 text-xs">→</span>
                  <input
                    type="number" min={0} step={0.1} value={sub.end}
                    onChange={e => update(i, 'end', parseFloat(e.target.value))}
                    className="w-20 text-xs border border-gray-200 rounded px-2 py-1 font-mono"
                  />
                  <span className="text-xs text-gray-400 ml-1">
                    {formatDuration(sub.end - sub.start)}
                  </span>
                </div>
                <button onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                value={sub.text}
                onChange={e => update(i, 'text', e.target.value)}
                rows={karaoke ? 1 : 2}
                placeholder="Texto..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function round3(n: number) { return Math.round(n * 1000) / 1000 }
