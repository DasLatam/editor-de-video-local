import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove
} from '@dnd-kit/sortable'
import { ListVideo } from 'lucide-react'
import type { Clip } from '../../types'
import { ClipItem } from './ClipItem'
import { formatDuration } from '../../utils/format'

interface Props {
  clips: Clip[]
  onChange: (clips: Clip[]) => void
  onPreviewSeek: (uploadId: string, time: number) => void
  previewUploadId: string | null
}

export function Timeline({ clips, onChange, onPreviewSeek, previewUploadId }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const totalDuration = clips.reduce((acc, c) => {
    const trimEnd = c.trim_end ?? c.duration
    const gross = trimEnd - c.trim_start
    const cutsDuration = (c.cuts ?? []).reduce((s, cut) => s + Math.max(0, cut.end - cut.start), 0)
    return acc + Math.max(0, gross - cutsDuration)
  }, 0)

  const ids = clips.map((c, i) => c.upload_id + '-' + i)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = ids.indexOf(active.id as string)
      const newIndex = ids.indexOf(over.id as string)
      onChange(arrayMove(clips, oldIndex, newIndex))
    }
  }

  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <ListVideo className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">Agregá clips desde tu biblioteca para comenzar</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{clips.length} clip{clips.length !== 1 ? 's' : ''}</span>
        <span className="text-xs font-medium text-gray-700">Duración total: {formatDuration(totalDuration)}</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {clips.map((clip, i) => (
              <ClipItem
                key={ids[i]}
                clip={clip}
                index={i}
                onRemove={() => onChange(clips.filter((_, idx) => idx !== i))}
                onChange={updated => {
                  const next = [...clips]
                  next[i] = updated
                  onChange(next)
                }}
                onPreviewSeek={onPreviewSeek}
                isPreviewActive={previewUploadId === clip.upload_id}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
