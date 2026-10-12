import { Circle, Group, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { db, type MarkerRecord } from '../db'

interface Props {
  marker: MarkerRecord
  mapWidth: number
  mapHeight: number
  scale: number // current stage scale; markers keep a constant on-screen size
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export default function MarkerNode({ marker, mapWidth, mapHeight, scale }: Props) {
  const onDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const x = clamp01(e.target.x() / mapWidth)
    const y = clamp01(e.target.y() / mapHeight)
    e.target.position({ x: x * mapWidth, y: y * mapHeight })
    db.markers.update(marker.id, { x, y })
  }

  return (
    <Group
      x={marker.x * mapWidth}
      y={marker.y * mapHeight}
      scaleX={1 / scale}
      scaleY={1 / scale}
      draggable
      onDragEnd={onDragEnd}
      onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'move')}
      onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
    >
      <Circle radius={10} fill="#d9534f" stroke="#fff" strokeWidth={2} shadowBlur={4} />
      <Text text={marker.label} y={14} width={160} offsetX={80} align="center" fontSize={14} fill="#fff" stroke="#000" strokeWidth={0.5} />
    </Group>
  )
}
