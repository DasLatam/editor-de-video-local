import { useState } from 'react'
import { Plus, Folder, Trash2, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import type { Project } from '../../types'
import { projectsApi } from '../../api/client'
import { Button } from '../UI/Button'
import { Badge } from '../UI/Badge'

interface Props {
  projects: Project[]
  selectedId: string | null
  onSelect: (p: Project) => void
  onRefresh: () => void
}

const STATUS_BADGE: Record<string, { variant: any; label: string }> = {
  pending: { variant: 'default', label: 'Borrador' },
  processing: { variant: 'info', label: 'Procesando' },
  completed: { variant: 'success', label: 'Listo' },
  failed: { variant: 'error', label: 'Error' },
}

export function ProjectList({ projects, selectedId, onSelect, onRefresh }: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  async function handleCreate() {
    if (!newName.trim()) return
    const p = await projectsApi.create(newName.trim())
    setNewName('')
    setCreating(false)
    onRefresh()
    onSelect(p)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await projectsApi.delete(id)
    onRefresh()
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Folder className="h-4 w-4" /> Proyectos
        </h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" /> Nuevo
        </Button>
      </div>

      {creating && (
        <div className="mb-3 flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="Nombre del proyecto..."
            className="flex-1 text-sm border border-brand-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          <Button size="sm" onClick={handleCreate}>OK</Button>
        </div>
      )}

      <div className="space-y-1.5 flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Sin proyectos. Creá uno para empezar.</p>
        ) : (
          projects.map(p => {
            const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.pending
            return (
              <div
                key={p.id}
                onClick={() => onSelect(p)}
                className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer group transition-all
                  ${selectedId === p.id
                    ? 'bg-brand-50 border-2 border-brand-200'
                    : 'hover:bg-gray-50 border-2 border-transparent'
                  }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge label={badge.label} variant={badge.variant} />
                    {p.status === 'processing' && <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />}
                    {p.status === 'completed' && <CheckCircle className="h-3 w-3 text-green-500" />}
                    {p.status === 'failed' && <AlertCircle className="h-3 w-3 text-red-500" />}
                    <span className="text-xs text-gray-400">{p.clips?.length ?? 0} clips</span>
                  </div>
                </div>
                <button
                  onClick={e => handleDelete(p.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 rounded-lg transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
