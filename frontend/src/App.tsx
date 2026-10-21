import { useEffect, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import type { Project } from './types'
import { projectsApi } from './api/client'
import { ProjectList } from './components/VideoEditor/ProjectList'
import { EditorPanel } from './components/VideoEditor/EditorPanel'

// Nombre y bajada de la barra superior: se definen al compilar con
// VITE_BRAND_NAME y VITE_BRAND_TAGLINE en frontend/.env.local (ver README).
const BRAND = import.meta.env.VITE_BRAND_NAME || 'Editor de video'
const TAGLINE = import.meta.env.VITE_BRAND_TAGLINE || 'Cortá, ordená, subtitulá y exportá para redes'
document.title = BRAND

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setLoading(true)
    try {
      const data = await projectsApi.list()
      setProjects(data)
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(p: Project) {
    setSelected(p)
  }

  function handleUpdate(updated: Project) {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    setSelected(updated)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <Clapperboard className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">{BRAND}</h1>
            <p className="text-xs text-gray-500">{TAGLINE}</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Projects */}
        <aside className="w-64 bg-white border-r border-gray-200 p-4 overflow-hidden flex flex-col shrink-0">
          {loading ? (
            <div className="text-center py-4 text-sm text-gray-400">Cargando...</div>
          ) : (
            <ProjectList
              projects={projects}
              selectedId={selected?.id ?? null}
              onSelect={handleSelect}
              onRefresh={loadProjects}
            />
          )}
        </aside>

        {/* Editor */}
        <main className="flex-1 p-6 overflow-hidden">
          {selected ? (
            <EditorPanel key={selected.id} project={selected} onUpdate={handleUpdate} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
              <Clapperboard className="h-16 w-16 opacity-20" />
              <div className="text-center">
                <p className="text-base font-medium text-gray-500">Seleccioná o creá un proyecto</p>
                <p className="text-sm text-gray-400 mt-1">
                  Usá el panel izquierdo para gestionar tus proyectos de video
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
