import { useEffect, useRef, useState } from 'react'
import { Layer, Stage, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { db, tileBounds, type Bounds, type MapRecord, type MarkerRecord, type TileRecord } from '../db'
import MarkerNode from './MarkerNode'
import TileNode from './TileNode'

interface Props {
  map: MapRecord
  tiles: TileRecord[] // sorted by z
  markers: MarkerRecord[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onOpenCity: (cityId: number) => void
  editMode: boolean // arrange tiles; markers are dimmed and locked
  selectedTileId: number | null
  onSelectTile: (id: number | null) => void
}

interface View {
  scale: number
  x: number
  y: number
}

const MIN_SCALE = 0.02
const MAX_SCALE = 10
const MIN_TILE_PX = 20 // smallest on-screen tile size when resizing

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

function fitView(size: { width: number; height: number }, b: Bounds): View {
  const scale = Math.min(size.width / b.width, size.height / b.height) * 0.95
  return {
    scale,
    x: (size.width - b.width * scale) / 2 - b.x * scale,
    y: (size.height - b.height * scale) / 2 - b.y * scale,
  }
}

const inside = (p: { x: number; y: number }, t: TileRecord) =>
  p.x >= t.x && p.x <= t.x + t.width && p.y >= t.y && p.y <= t.y + t.height

export default function MapCanvas(props: Props) {
  const { map, tiles, markers, selectedId, onSelect, onOpenCity, editMode, selectedTileId, onSelectTile } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const tileNodes = useRef(new Map<number, Konva.Node>())
  const size = useElementSize(containerRef)
  const bounds = tileBounds(tiles)
  // Until the user pans/zooms, show the whole map. The parent remounts this component (via `key`) per map.
  const [userView, setView] = useState<View>()
  const view = userView ?? (size.width && size.height && bounds ? fitView(size, bounds) : undefined)
  const selectedTile = editMode ? tiles.find((t) => t.id === selectedTileId) : undefined

  // Attach the resize handles to the selected tile's node.
  useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return
    const node = selectedTile ? tileNodes.current.get(selectedTile.id) : undefined
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  })

  const toMap = (pointer: { x: number; y: number }, v: View) => ({
    x: (pointer.x - v.x) / v.scale,
    y: (pointer.y - v.y) / v.scale,
  })

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const pointer = e.target.getStage()?.getPointerPosition()
    if (!view || !pointer) return
    const anchor = toMap(pointer, view)
    const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor))
    setView({ scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale })
  }

  const onStageDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return // ignore marker/tile drags bubbling up
    if (view) setView({ ...view, x: e.target.x(), y: e.target.y() })
  }

  // Double-click on a tile adds a marker and selects it. Marker clicks don't bubble here.
  const onStageDblClick = async (e: KonvaEventObject<MouseEvent>) => {
    if (editMode) return
    const pointer = e.target.getStage()?.getPointerPosition()
    if (!view || !pointer) return
    const p = toMap(pointer, view)
    if (!tiles.some((t) => inside(p, t))) return
    const kind = map.kind === 'world' ? 'city' : 'building'
    const label = kind === 'city' ? 'New city' : 'New marker'
    const id = await db.markers.add({ mapId: map.id, kind, label, ...p })
    onSelect(id)
  }

  return (
    <div ref={containerRef} className="canvas-container">
      {view && bounds && (
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
          onClick={() => (editMode ? onSelectTile(null) : onSelect(null))}
          onDblClick={onStageDblClick}
        >
          <Layer>
            {tiles.map((t) => (
              <TileNode
                key={t.id}
                tile={t}
                others={tiles.filter((o) => o.id !== t.id)}
                scale={view.scale}
                editable={editMode}
                onSelect={() => onSelectTile(t.id)}
                nodeRef={(node) => {
                  if (node) tileNodes.current.set(t.id, node)
                  else tileNodes.current.delete(t.id)
                }}
              />
            ))}
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              keepRatio={!!selectedTile?.image}
              enabledAnchors={
                selectedTile?.image
                  ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                  : undefined // all anchors for color canvases
              }
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < MIN_TILE_PX || newBox.height < MIN_TILE_PX ? oldBox : newBox
              }
            />
          </Layer>
          <Layer listening={!editMode} opacity={editMode ? 0.4 : 1}>
            {markers.map((m) => (
              <MarkerNode
                key={m.id}
                marker={m}
                bounds={bounds}
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
