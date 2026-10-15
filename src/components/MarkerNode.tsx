import { Circle, Group, Path, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { db, type MarkerRecord } from '../db'
import { ICON_SIZE } from '../icons'
import { markerColor, markerIcon } from '../markerStyle'

interface Props {
  marker: MarkerRecord
  mapWidth: number
  mapHeight: number
  scale: number // current stage scale; markers keep a constant on-screen size
  markerScale: number // per-map size multiplier
  selected: boolean
  onSelect: () => void
  onOpen?: () => void // cities: double-click opens the city map
}

const BASE_SIZE = 30 // on-screen icon size in px at markerScale 1
const HALO_WIDTH = 56 // white outline, in icon units (512 grid): keeps icons readable on any map

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export default function MarkerNode({ marker, mapWidth, mapHeight, scale, markerScale, selected, onSelect, onOpen }: Props) {
  // Stop clicks reaching the stage, which would deselect or add a marker.
  const select = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    onSelect()
  }

  const onDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const x = clamp01(e.target.x() / mapWidth)
    const y = clamp01(e.target.y() / mapHeight)
    e.target.position({ x: x * mapWidth, y: y * mapHeight })
    db.markers.update(marker.id, { x, y })
  }

  const size = BASE_SIZE * markerScale
  const icon = markerIcon(marker)
  const iconProps = {
    data: icon.path,
    x: -size / 2,
    y: -size / 2,
    scaleX: size / ICON_SIZE,
    scaleY: size / ICON_SIZE,
  }

  return (
    <Group
      x={marker.x * mapWidth}
      y={marker.y * mapHeight}
      scaleX={1 / scale}
      scaleY={1 / scale}
      draggable
      onDragStart={onSelect}
      onDragEnd={onDragEnd}
      onClick={select}
      onDblClick={(e) => {
        e.cancelBubble = true
        if (onOpen) onOpen()
        else onSelect()
      }}
      onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'move')}
      onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
    >
      {/* Invisible hit area: thin icon shapes are hard to click otherwise. */}
      <Circle radius={size * 0.72} fill="rgba(0,0,0,0)" />
      {selected && <Circle radius={size * 0.8} stroke="#ffd54a" strokeWidth={3} />}
      <Path {...iconProps} fill="#fff" stroke="#fff" strokeWidth={HALO_WIDTH} lineJoin="round" listening={false} />
      <Path {...iconProps} fill={markerColor(marker)} listening={false} />
      <Text
        text={marker.label}
        y={size / 2 + 4}
        width={160}
        offsetX={80}
        align="center"
        fontSize={14}
        fill="#fff"
        stroke="#000"
        strokeWidth={0.5}
      />
    </Group>
  )
}
