import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react'
import { uploadsApi } from '../../api/client'
import { formatFileSize } from '../../utils/format'
import type { Upload as UploadType } from '../../types'

interface Props {
  onUploaded: (upload: UploadType) => void
}

interface FileState {
  file: File
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

export function UploadZone({ onUploaded }: Props) {
  const [files, setFiles] = useState<FileState[]>([])

  const onDrop = useCallback(async (accepted: File[]) => {
    const newFiles: FileState[] = accepted.map(f => ({ file: f, progress: 0, status: 'uploading' }))
    setFiles(prev => [...prev, ...newFiles])

    for (const item of newFiles) {
      try {
        const upload = await uploadsApi.upload(item.file, (pct) => {
          setFiles(prev => prev.map(f =>
            f.file === item.file ? { ...f, progress: pct } : f
          ))
        })
        setFiles(prev => prev.map(f =>
          f.file === item.file ? { ...f, status: 'done', progress: 100 } : f
        ))
        onUploaded(upload)
      } catch (err: any) {
        const msg = err?.response?.data?.detail || 'Error al subir'
        setFiles(prev => prev.map(f =>
          f.file === item.file ? { ...f, status: 'error', error: msg } : f
        ))
      }
    }
  }, [onUploaded])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv']
    },
    multiple: true,
  })

  const clearDone = () => setFiles(prev => prev.filter(f => f.status !== 'done'))

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${isDragActive
            ? 'border-brand-500 bg-brand-50'
            : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'
          }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
        <p className="text-sm font-medium text-gray-700">
          {isDragActive ? 'Soltá los videos acá' : 'Arrastrá videos o hacé click para seleccionar'}
        </p>
        <p className="text-xs text-gray-500 mt-1">MP4, MOV, AVI, MKV, WebM — hasta 5 GB por archivo</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
              {item.status === 'done' && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
              {item.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
              {item.status === 'uploading' && (
                <div className="h-4 w-4 shrink-0 relative">
                  <svg className="animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{item.file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(item.file.size)}</p>
                {item.status === 'uploading' && (
                  <div className="mt-1 bg-gray-200 rounded-full h-1">
                    <div
                      className="bg-brand-600 h-1 rounded-full transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.status === 'error' && (
                  <p className="text-xs text-red-600 mt-0.5">{item.error}</p>
                )}
              </div>
            </div>
          ))}
          {files.some(f => f.status === 'done') && (
            <button onClick={clearDone} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <X className="h-3 w-3" /> Limpiar completados
            </button>
          )}
        </div>
      )}
    </div>
  )
}
