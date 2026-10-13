import Dexie, { type EntityTable } from 'dexie'

export interface MapRecord {
  id: number
  kind: 'world' | 'city'
  cityId?: number // city maps only: id of the city marker on the world map
  name: string
  image?: Blob // undefined = blank canvas
  width: number // image size in px (or blank canvas size)
  height: number
}

export interface MarkerRecord {
  id: number
  mapId: number
  kind: 'city' | 'building' | 'character'
  label: string // name
  type?: string // building type or character role; unused for cities
  description?: string
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

// v2: world map + city maps. The single M1/M2 map becomes the world map, its markers become cities.
db.version(2)
  .stores({
    maps: '++id, kind, cityId',
    markers: '++id, mapId',
  })
  .upgrade(async (tx) => {
    await tx.table('maps').toCollection().modify({ kind: 'world', name: 'World' })
    await tx.table('markers').toCollection().modify({ kind: 'city' })
  })

// null = no map yet. A city map belongs to a city marker; the world map has no cityId.
export function getMap(cityId: number | null) {
  const query =
    cityId === null ? db.maps.where('kind').equals('world') : db.maps.where('cityId').equals(cityId)
  return query.first().then((m) => m ?? null)
}

// Deleting a city also deletes its city map and everything on it.
export function deleteMarker(marker: MarkerRecord) {
  return db.transaction('rw', db.maps, db.markers, async () => {
    if (marker.kind === 'city') {
      const cityMaps = await db.maps.where('cityId').equals(marker.id).toArray()
      for (const m of cityMaps) {
        await db.markers.where('mapId').equals(m.id).delete()
        await db.maps.delete(m.id)
      }
    }
    await db.markers.delete(marker.id)
  })
}

// Cities = city markers on the world map.
export async function listCities() {
  const world = await getMap(null)
  if (!world) return []
  const markers = await db.markers.where('mapId').equals(world.id).toArray()
  return markers.filter((m) => m.kind === 'city')
}

// Derived, never stored: buildings recorded on the city's map.
export async function countBuildings(cityId: number) {
  const map = await getMap(cityId)
  if (!map) return 0
  return db.markers
    .where('mapId')
    .equals(map.id)
    .filter((m) => m.kind === 'building')
    .count()
}

// Moves a marker to another city's map, keeping its relative position. Creates a blank map if the city has none.
export function moveToCity(markerId: number, cityId: number) {
  return db.transaction('rw', db.maps, db.markers, async () => {
    const mapId =
      (await getMap(cityId))?.id ??
      (await db.maps.add({ kind: 'city', cityId, name: '', ...BLANK_SIZE }))
    await db.markers.update(markerId, { mapId })
  })
}
