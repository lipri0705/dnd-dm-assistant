import type { MarkerRecord } from './db'
import { ICONS, type IconDef } from './icons'

// Defaults for markers and maps that don't have their own look set yet.
export const DEFAULT_COLOR: Record<MarkerRecord['kind'], string> = {
  city: '#3f7bd9',
  building: '#d9534f',
  character: '#3fae6a',
}

export const DEFAULT_ICON: Record<MarkerRecord['kind'], string> = {
  city: 'castle',
  building: 'house',
  character: 'person',
}

export const COLOR_PRESETS = ['#d9534f', '#f0a030', '#e8d44d', '#3fae6a', '#3f7bd9', '#8a5cd6', '#ffffff', '#222222']

export const DEFAULT_CANVAS_COLOR = '#efe6cf'
export const MARKER_SIZE = { min: 0.5, max: 3, default: 1 }

export const markerColor = (m: MarkerRecord) => m.color ?? DEFAULT_COLOR[m.kind]
export const markerIcon = (m: MarkerRecord): IconDef => ICONS[m.icon ?? ''] ?? ICONS[DEFAULT_ICON[m.kind]]
export const markerSize = (m: MarkerRecord) => m.size ?? MARKER_SIZE.default
