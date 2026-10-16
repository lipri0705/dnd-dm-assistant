import { useEffect, useRef, useState } from 'react'
import { Layer, Line, Stage, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import {
  db,
  tileBounds,
  type Bounds,
  type MapRecord,
  type MarkerRecord,
  type StrokeRecord,
  type TileRecord,
} from '../db'
import type { Brush } from '../brush'
import MarkerNode from './MarkerNode'
import TileNode from './TileNode'

// markers: work with markers · tiles: arrange tiles · draw: freehand drawing. Markers are locked outside "markers".
export type Mode = 'markers' | 'tiles' | 'draw'

interface Props {
  map: MapRecord
  tiles: TileRecord[] // sorted by z
  strokes: StrokeRecord[]
  markers: MarkerRecord[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onOpenCity: (cityId: number) => void
  mode: Mode
  brush: Brush
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
const MIN_POINT_GAP_PX = 2 // skip pointer moves smaller than this while drawing
const ERASER_HIT_PX = 12 // eraser catches thin strokes within this on-screen distance

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
  const { map, tiles, strokes, markers, selectedId, onSelect, onOpenCity, mode, brush, selectedTileId, onSelectTile } =
    props
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const liveLineRef = useRef<Konva.Line>(null)
  const drawingRef = useRef<number[] | null>(null) // points of the stroke being drawn
  const [spaceDown, setSpaceDown] = useState(false) // in draw mode, Space + drag pans the map
  const transformerRef = useRef<Konva.Transformer>(null)
  const tileNodes = useRef(new Map<number, Konva.Node>())
  const size = useElementSize(containerRef)
  const bounds = tileBounds(tiles)
  // Until the user pans/zooms, show the whole map. The parent remounts this component (via `key`) per map.
  const [userView, setView] = useState<View>()
  const view = userView ?? (size.width && size.height && bounds ? fitView(size, bounds) : undefined)
  const selectedTile = mode === 'tiles' ? tiles.find((t) => t.id === selectedTileId) : undefined

  // Space held = pan while drawing (ignored while typing in a field).
  useEffect(() => {
    if (mode !== 'draw') return
    const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest('input, textarea, select')
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e)) return
      e.preventDefault()
      setSpaceDown(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e)) return
      e.preventDefault() // a focused button would otherwise be "clicked" by Space
      setSpaceDown(false)
    }
    // The "Draw" button keeps focus after the click; Space must not toggle it.
    if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      setSpaceDown(false)
    }
  }, [mode])

  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    const drawCursor = spaceDown ? 'grab' : brush.tool === 'eraser' ? 'cell' : 'crosshair'
    container.style.cursor = mode === 'draw' ? drawCursor : ''
  }, [mode, spaceDown, brush.tool])

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

  const drawing = mode === 'draw' && brush.tool === 'brush' && !spaceDown

  const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const pointer = e.target.getStage()?.getPointerPosition()
    if (!drawing || e.evt.button !== 0 || !view || !pointer) return
    const p = toMap(pointer, view)
    drawingRef.current = [p.x, p.y]
    liveLineRef.current?.points(drawingRef.current)
  }

  const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const points = drawingRef.current
    const pointer = e.target.getStage()?.getPointerPosition()
    if (!points || !view || !pointer) return
    const p = toMap(pointer, view)
    const [lx, ly] = points.slice(-2)
    if (Math.hypot(p.x - lx, p.y - ly) * view.scale < MIN_POINT_GAP_PX) return
    points.push(p.x, p.y)
    liveLineRef.current?.points(points)
    liveLineRef.current?.getLayer()?.batchDraw()
  }

  const finishStroke = () => {
    const points = drawingRef.current
    drawingRef.current = null
    liveLineRef.current?.points([])
    if (!points || !view) return
    // A click without moving leaves a dot.
    const strokePoints = points.length === 2 ? [...points, ...points] : points
    db.strokes.add({ mapId: map.id, points: strokePoints, color: brush.color, width: brush.width / view.scale })
  }

  // Eraser: a click on a stroke, or dragging over it with the button held, deletes the whole stroke.
  const eraseOnEnter = (e: KonvaEventObject<MouseEvent>, id: number) => {
    if (e.evt.buttons & 1) db.strokes.delete(id)
  }

  // Double-click on a tile adds a marker and selects it. Marker clicks don't bubble here.
  const onStageDblClick = async (e: KonvaEventObject<MouseEvent>) => {
    if (mode !== 'markers') return
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
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable={mode !== 'draw' || spaceDown}
          onWheel={onWheel}
          onDragEnd={onStageDragEnd}
          onClick={() => (mode === 'tiles' ? onSelectTile(null) : mode === 'markers' ? onSelect(null) : undefined)}
          onDblClick={onStageDblClick}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={finishStroke}
          onMouseLeave={finishStroke}
        >
          <Layer>
            {tiles.map((t) => (
              <TileNode
                key={t.id}
                tile={t}
                others={tiles.filter((o) => o.id !== t.id)}
                scale={view.scale}
                editable={mode === 'tiles'}
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
          <Layer listening={mode === 'draw' && brush.tool === 'eraser'}>
            {strokes.map((s) => (
              <Line
                key={s.id}
                points={s.points}
                stroke={s.color}
                strokeWidth={s.width}
                hitStrokeWidth={Math.max(s.width, ERASER_HIT_PX / view.scale)}
                lineCap="round"
                lineJoin="round"
                tension={s.points.length > 4 ? 0.4 : 0} // no smoothing for dots (identical points)
                onMouseDown={() => db.strokes.delete(s.id)}
                onMouseEnter={(e) => eraseOnEnter(e, s.id)}
              />
            ))}
            <Line
              ref={liveLineRef}
              stroke={brush.color}
              strokeWidth={brush.width / view.scale}
              lineCap="round"
              lineJoin="round"
              tension={0.4}
              listening={false}
            />
          </Layer>
          <Layer listening={mode === 'markers'} opacity={mode === 'markers' ? 1 : 0.4}>
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
