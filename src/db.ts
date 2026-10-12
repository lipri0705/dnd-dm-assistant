import Dexie, { type EntityTable } from 'dexie'

export interface MapRecord {
  id: number
  kind: 'world' | 'city'
  name: string
  image?: Blob // undefined = blank canvas
  width: number // image size in px (or blank canvas size)
  height: number
}

export interface MarkerRecord {
  id: number
  mapId: number
  kind: 'city' | 'building' | 'character'
  label: string
  x: number // 0–1, relative to map width
  y: number // 0–1, relative to map height
}

export const BLANK_SIZE = { width: 2000, height: 1400 }

export const db = new Dexie('dnd-dm') as Dexie & {
  maps: EntityTable<MapRecord, 'id'>
  markers: EntityTable<MarkerRecord, 'id'>
}

db.version(1).stores({
  maps: '++id, kind',
  markers: '++id, mapId',
})
