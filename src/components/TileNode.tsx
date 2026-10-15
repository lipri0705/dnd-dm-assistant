import { useEffect, useState } from 'react'
import { Image as KonvaImage, Rect } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { DEFAULT_CANVAS_COLOR, db, type TileRecord } from '../db'

interface Props {
  tile: TileRecord
  others: TileRecord[] // edges to snap to while dragging
  scale: number // current stage scale, for a constant on-screen snap distance
  editable: boolean
  onSelect: () => void
  nodeRef: (node: Konva.Node | null) => void
}

const SNAP_PX = 12 // on-screen distance at which tile edges snap together

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

// Shift that brings one of `edges` within `threshold` of one of `targets`, or 0.
function snapShift(edges: number[], targets: number[], threshold: number) {
  let best = 0
  let bestDist = threshold
  for (const e of edges) {
    for (const t of targets) {
      const d = Math.abs(t - e)
      if (d < bestDist) {
        bestDist = d
        best = t - e
      }
    }
  }
  return best
}

export default function TileNode({ tile, others, scale, editable, onSelect, nodeRef }: Props) {
  const image = useBlobImage(tile.image)

  const onDragMove = (e: KonvaEventObject<DragEvent>) => {
    const node = e.target
    const threshold = SNAP_PX / scale
    const { x, y } = node.position()
    const dx = snapShift([x, x + tile.width], others.flatMap((o) => [o.x, o.x + o.width]), threshold)
    const dy = snapShift([y, y + tile.height], others.flatMap((o) => [o.y, o.y + o.height]), threshold)
    node.position({ x: x + dx, y: y + dy })
  }

  const onDragEnd = (e: KonvaEventObject<DragEvent>) => {
    db.tiles.update(tile.id, { x: e.target.x(), y: e.target.y() })
  }

  // The transformer resizes by scaling; store the result as width/height and reset the scale.
  const onTransformEnd = (e: KonvaEventObject<Event>) => {
    const node = e.target
    const width = node.width() * node.scaleX()
    const height = node.height() * node.scaleY()
    node.scale({ x: 1, y: 1 })
    db.tiles.update(tile.id, { x: node.x(), y: node.y(), width, height })
  }

  const common = {
    ref: nodeRef,
    x: tile.x,
    y: tile.y,
    width: tile.width,
    height: tile.height,
    draggable: editable,
    listening: editable,
    onClick: (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true
      onSelect()
    },
    onDragStart: onSelect,
    onDragMove,
    onDragEnd,
    onTransformEnd,
  }

  if (tile.image) {
    // Placeholder while the image decodes, so the layout doesn't jump.
    return image ? <KonvaImage {...common} image={image} /> : <Rect {...common} fill="#444" />
  }
  return <Rect {...common} fill={tile.color ?? DEFAULT_CANVAS_COLOR} />
}
