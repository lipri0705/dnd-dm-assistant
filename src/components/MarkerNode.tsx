import { Circle, Group, Path, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { db, type Bounds, type MarkerRecord } from '../db'
import { ICON_SIZE } from '../icons'
import { markerColor, markerIcon, markerSize } from '../markerStyle'

interface Props {
  marker: MarkerRecord
  bounds: Bounds // markers are kept within the map's overall extent
  scale: number // current stage scale; markers keep a constant on-screen size
  selected: boolean
  onSelect: () => void
  onOpen?: () => void // cities: double-click opens the city map
}

const BASE_SIZE = 30 // on-screen icon size in px at marker size 1
const HALO_WIDTH = 56 // white outline, in icon units (512 grid): keeps icons readable on any map

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export default function MarkerNode({ marker, bounds, scale, selected, onSelect, onOpen }: Props) {
  // Stop clicks reaching the stage, which would deselect or add a marker.
  const select = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    onSelect()
  }

  const onDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const x = clamp(e.target.x(), bounds.x, bounds.x + bounds.width)
    const y = clamp(e.target.y(), bounds.y, bounds.y + bounds.height)
    e.target.position({ x, y })
    db.markers.update(marker.id, { x, y })
  }

  const size = BASE_SIZE * markerSize(marker)
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
      x={marker.x}
      y={marker.y}
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
