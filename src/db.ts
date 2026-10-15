import Dexie, { type EntityTable } from 'dexie'

export interface MapRecord {
  id: number
  kind: 'world' | 'city'
  cityId?: number // city maps only: id of the city marker on the world map
  name: string
}

// A map is a board of tiles: uploaded images and plain color canvases, placed side by side or overlapping.
export interface TileRecord {
  id: number
  mapId: number
  image?: Blob // image tile; without it the tile is a color canvas
  color?: string // canvas tiles only
  x: number // position and size in map units (an image tile starts at 1 unit = 1 image px)
  y: number
  width: number
  height: number
  z: number // draw order, higher = on top
}

export interface MarkerRecord {
  id: number
  mapId: number
  kind: 'city' | 'building' | 'character'
  label: string // name
  type?: string // building type or character role; unused for cities
  description?: string
  icon?: string // id from src/icons.ts; default depends on kind
  color?: string // icon color; default depends on kind
  size?: number // size multiplier (1 = default)
  x: number // position in map units (same space as tiles)
  y: number
}

// Before v3 a map was a single image or blank canvas and markers were stored as 0–1 fractions of it.
export type LegacyMap = MapRecord & { image?: Blob; width?: number; height?: number; background?: string }

export const BLANK_SIZE = { width: 2000, height: 1400 }
export const DEFAULT_CANVAS_COLOR = '#efe6cf'

export const db = new Dexie('dnd-dm') as Dexie & {
  maps: EntityTable<MapRecord, 'id'>
  tiles: EntityTable<TileRecord, 'id'>
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

// v3: maps are made of tiles. Each old map's image/canvas becomes its first tile; markers move to map units.
db.version(3)
  .stores({
    maps: '++id, kind, cityId',
    tiles: '++id, mapId',
    markers: '++id, mapId',
  })
  .upgrade(async (tx) => {
    const converted = convertLegacy(await tx.table('maps').toArray(), await tx.table('markers').toArray())
    await tx.table('maps').clear()
    await tx.table('maps').bulkAdd(converted.maps)
    await tx.table('tiles').bulkAdd(converted.tiles)
    await tx.table('markers').bulkPut(converted.markers)
  })

// Shared by the v3 migration and by importing old (version 1) backup files.
export function convertLegacy(maps: LegacyMap[], markers: MarkerRecord[]) {
  const sizes = new Map(
    maps.map((m) => [m.id, { width: m.width ?? BLANK_SIZE.width, height: m.height ?? BLANK_SIZE.height }]),
  )
  return {
    maps: maps.map(({ id, kind, cityId, name }): MapRecord => ({ id, kind, cityId, name })),
    tiles: maps.map(
      (m): Omit<TileRecord, 'id'> => ({
        mapId: m.id,
        image: m.image,
        color: m.image ? undefined : (m.background ?? DEFAULT_CANVAS_COLOR),
        x: 0,
        y: 0,
        ...sizes.get(m.id)!,
        z: 0,
      }),
    ),
    markers: markers.map((mk) => {
      const size = sizes.get(mk.mapId)
      return size ? { ...mk, x: mk.x * size.width, y: mk.y * size.height } : mk
    }),
  }
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

// Smallest rectangle around all tiles; null for a map without tiles.
export function tileBounds(tiles: Pick<TileRecord, 'x' | 'y' | 'width' | 'height'>[]): Bounds | null {
  if (tiles.length === 0) return null
  const left = Math.min(...tiles.map((t) => t.x))
  const top = Math.min(...tiles.map((t) => t.y))
  const right = Math.max(...tiles.map((t) => t.x + t.width))
  const bottom = Math.max(...tiles.map((t) => t.y + t.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function listTiles(mapId: number) {
  return db.tiles.where('mapId').equals(mapId).sortBy('z')
}

// Adds a tile to the right of everything already on the map, on top of the other tiles.
export async function addTile(
  mapId: number,
  tile: { image: Blob } | { color: string },
  size: { width: number; height: number },
) {
  const tiles = await listTiles(mapId)
  const bounds = tileBounds(tiles)
  return db.tiles.add({
    mapId,
    ...tile,
    x: bounds ? bounds.x + bounds.width : 0,
    y: bounds ? bounds.y : 0,
    ...size,
    z: tiles.length ? tiles[tiles.length - 1].z + 1 : 0,
  })
}

// New maps start with one blank canvas tile, like the old "blank canvas".
export async function createMap(map: Omit<MapRecord, 'id'>) {
  return db.transaction('rw', db.maps, db.tiles, async () => {
    const mapId = await db.maps.add(map)
    await db.tiles.add({ mapId, color: DEFAULT_CANVAS_COLOR, x: 0, y: 0, ...BLANK_SIZE, z: 0 })
    return mapId
  })
}

// A campaign has one or more connected worlds (world maps). Each city has at most one city map.
export function listWorlds() {
  return db.maps.where('kind').equals('world').sortBy('id')
}

// null = the city has no map yet.
export function getCityMap(cityId: number) {
  return db.maps.where('cityId').equals(cityId).first().then((m) => m ?? null)
}

async function deleteMapContents(mapId: number) {
  await db.markers.where('mapId').equals(mapId).delete()
  await db.tiles.where('mapId').equals(mapId).delete()
  await db.maps.delete(mapId)
}

async function deleteCityMap(cityId: number) {
  const map = await getCityMap(cityId)
  if (map) await deleteMapContents(map.id)
}

// Deleting a city also deletes its city map and everything on it.
export function deleteMarker(marker: MarkerRecord) {
  return db.transaction('rw', db.maps, db.tiles, db.markers, async () => {
    if (marker.kind === 'city') await deleteCityMap(marker.id)
    await db.markers.delete(marker.id)
  })
}

// Deleting a world deletes its cities (with their maps), its tiles and every marker on it.
export function deleteWorld(worldId: number) {
  return db.transaction('rw', db.maps, db.tiles, db.markers, async () => {
    const markers = await db.markers.where('mapId').equals(worldId).toArray()
    for (const m of markers) if (m.kind === 'city') await deleteCityMap(m.id)
    await deleteMapContents(worldId)
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

// Moves a character to another location, keeping its position relative to the map's overall extent.
// Creates a blank city map if needed.
export function moveCharacter(markerId: number, to: LocationKey) {
  return db.transaction('rw', db.maps, db.tiles, db.markers, async () => {
    const marker = await db.markers.get(markerId)
    if (!marker) return
    const [kind, idText] = to.split(':')
    const id = Number(idText)
    const mapId =
      kind === 'world' ? id : ((await getCityMap(id))?.id ?? (await createMap({ kind: 'city', cityId: id, name: '' })))
    const from = tileBounds(await listTiles(marker.mapId))
    const target = tileBounds(await listTiles(mapId))
    let { x, y } = marker
    if (from && target) {
      x = target.x + ((x - from.x) / from.width) * target.width
      y = target.y + ((y - from.y) / from.height) * target.height
    }
    await db.markers.update(markerId, { mapId, x, y })
  })
}
