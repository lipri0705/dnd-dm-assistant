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

// A campaign has one or more connected worlds (world maps). Each city has at most one city map.
export function listWorlds() {
  return db.maps.where('kind').equals('world').sortBy('id')
}

// null = the city has no map yet.
export function getCityMap(cityId: number) {
  return db.maps.where('cityId').equals(cityId).first().then((m) => m ?? null)
}

async function deleteCityMap(cityId: number) {
  const map = await getCityMap(cityId)
  if (!map) return
  await db.markers.where('mapId').equals(map.id).delete()
  await db.maps.delete(map.id)
}

// Deleting a city also deletes its city map and everything on it.
export function deleteMarker(marker: MarkerRecord) {
  return db.transaction('rw', db.maps, db.markers, async () => {
    if (marker.kind === 'city') await deleteCityMap(marker.id)
    await db.markers.delete(marker.id)
  })
}

// Deleting a world deletes its cities (with their maps) and every marker on it.
export function deleteWorld(worldId: number) {
  return db.transaction('rw', db.maps, db.markers, async () => {
    const markers = await db.markers.where('mapId').equals(worldId).toArray()
    for (const m of markers) if (m.kind === 'city') await deleteCityMap(m.id)
    await db.markers.where('mapId').equals(worldId).delete()
    await db.maps.delete(worldId)
  })
}

// Derived, never stored: buildings recorded on the city's map.
export async function countBuildings(cityId: number) {
  const map = await getCityMap(cityId)
  if (!map) return 0
  return db.markers
    .where('mapId')
    .equals(map.id)
    .filter((m) => m.kind === 'building')
    .count()
}

// Where a character can be: travelling on a world map, or in a city. Encoded for <select> values.
export type LocationKey = `world:${number}` | `city:${number}`

// All worlds with their cities, for the character location picker.
export async function listLocations() {
  const worlds = await listWorlds()
  return Promise.all(
    worlds.map(async (world) => {
      const markers = await db.markers.where('mapId').equals(world.id).toArray()
      return { world, cities: markers.filter((m) => m.kind === 'city') }
    }),
  )
}

// Moves a character to another location, keeping its relative position. Creates a blank city map if needed.
export function moveCharacter(markerId: number, to: LocationKey) {
  return db.transaction('rw', db.maps, db.markers, async () => {
    const [kind, idText] = to.split(':')
    const id = Number(idText)
    const mapId =
      kind === 'world'
        ? id
        : ((await getCityMap(id))?.id ?? (await db.maps.add({ kind: 'city', cityId: id, name: '', ...BLANK_SIZE })))
    await db.markers.update(markerId, { mapId })
  })
}
