import { useEffect, useState } from 'react'
import { Trash2, Plus, Clock, Volume2, VolumeX } from 'lucide-react'
import { uploadsApi } from '../../api/client'
import type { Upload, Clip } from '../../types'
import { UploadZone } from './UploadZone'
import { formatDuration, formatFileSize } from '../../utils/format'
import { Button } from '../UI/Button'

interface Props {
  onAddClip: (clip: Clip) => void
}

export function LibraryPanel({ onAddClip }: Props) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUploads()
  }, [])

  async function loadUploads() {
    setLoading(true)
    try {
      const data = await uploadsApi.list()
      setUploads(data)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    await uploadsApi.delete(id)
    setUploads(prev => prev.filter(u => u.id !== id))
  }

  function handleAdd(upload: Upload) {
    onAddClip({
      upload_id: upload.id,
      filename: upload.filename,
      original_name: upload.original_name,
      duration: upload.duration,
      trim_start: 0,
      trim_end: null,
      cuts: [],
    })
  }

  return (
    <div className="space-y-4">
      <UploadZone onUploaded={u => { setUploads(prev => [u, ...prev]); }} />

      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-4 text-sm text-gray-400">Cargando biblioteca...</div>
        ) : uploads.length === 0 ? (
          <div className="text-center py-4 text-sm text-gray-400">No hay videos en la biblioteca</div>
        ) : (
          uploads.map(upload => (
            <div key={upload.id} className="flex gap-3 bg-gray-50 rounded-xl p-2 items-center group hover:bg-gray-100 transition-colors">
              {/* Thumbnail */}
              <div className="w-16 h-10 bg-gray-200 rounded-lg overflow-hidden shrink-0 relative">
                {upload.thumbnail_url ? (
                  <img src={upload.thumbnail_url} alt={upload.original_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-gray-400 text-xl">🎬</span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{upload.original_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatDuration(upload.duration)}
                  </span>
                  <span className="text-xs text-gray-400">{formatFileSize(upload.size)}</span>
                  {upload.has_audio
                    ? <Volume2 className="h-3 w-3 text-gray-400" />
                    : <VolumeX className="h-3 w-3 text-gray-300" />
                  }
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="secondary" onClick={() => handleAdd(upload)}>
                  <Plus className="h-3 w-3" /> Agregar
                </Button>
                <button
                  onClick={() => handleDelete(upload.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
