import { useEffect, useRef, useState } from 'react'
import { Image as KonvaImage, Layer, Rect, Stage } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { db, type MapRecord, type MarkerRecord } from '../db'
import MarkerNode from './MarkerNode'

interface Props {
  map: MapRecord
  markers: MarkerRecord[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onOpenCity: (cityId: number) => void
}

interface View {
  scale: number
  x: number
  y: number
}

const MIN_SCALE = 0.05
const MAX_SCALE = 10

// Loads a Blob into an <img> and revokes the object URL when the Blob changes or on unmount.
function useBlobImage(blob?: Blob) {
  const [loaded, setLoaded] = useState<{ blob: Blob; el: HTMLImageElement }>()
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const el = new window.Image()
    el.onload = () => setLoaded({ blob, el })
    el.src = url
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return loaded && loaded.blob === blob ? loaded.el : undefined
}

function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return size
}

function fitView(size: { width: number; height: number }, map: MapRecord): View {
  const scale = Math.min(size.width / map.width, size.height / map.height) * 0.95
  return { scale, x: (size.width - map.width * scale) / 2, y: (size.height - map.height * scale) / 2 }
}

export default function MapCanvas({ map, markers, selectedId, onSelect, onOpenCity }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(containerRef)
  const image = useBlobImage(map.image)
  // Until the user pans/zooms, show the whole map. The parent remounts this
  // component (via `key`) when the map's background changes, which resets the view.
  const [userView, setView] = useState<View>()
  const view = userView ?? (size.width && size.height ? fitView(size, map) : undefined)

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = e.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!view || !pointer) return
    const anchor = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale }
    const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor))
    setView({ scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale })
  }

  const onStageDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return // ignore marker drags bubbling up
    if (view) setView({ ...view, x: e.target.x(), y: e.target.y() })
  }

  // Double-click on empty map space adds a marker and selects it. Marker clicks don't bubble here.
  const onStageDblClick = async (e: KonvaEventObject<MouseEvent>) => {
    const pointer = e.target.getStage()?.getPointerPosition()
    if (!view || !pointer) return
    const x = (pointer.x - view.x) / view.scale / map.width
    const y = (pointer.y - view.y) / view.scale / map.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    const kind = map.kind === 'world' ? 'city' : 'building'
    const label = kind === 'city' ? 'New city' : 'New marker'
    const id = await db.markers.add({ mapId: map.id, kind, label, x, y })
    onSelect(id)
  }

  return (
    <div ref={containerRef} className="canvas-container">
      {view && (
        <Stage
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable
          onWheel={onWheel}
          onDragEnd={onStageDragEnd}
          onClick={() => onSelect(null)}
          onDblClick={onStageDblClick}
        >
          <Layer>
            {map.image ? (
              image && <KonvaImage image={image} width={map.width} height={map.height} />
            ) : (
              <Rect width={map.width} height={map.height} fill="#efe6cf" stroke="#8a7a55" strokeWidth={4} />
            )}
            {markers.map((m) => (
              <MarkerNode
                key={m.id}
                marker={m}
                mapWidth={map.width}
                mapHeight={map.height}
                scale={view.scale}
                selected={m.id === selectedId}
                onSelect={() => onSelect(m.id)}
                onOpen={m.kind === 'city' ? () => onOpenCity(m.id) : undefined}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  )
}
