import {
  convertLegacy,
  db,
  type LegacyMap,
  type MapRecord,
  type MarkerRecord,
  type StrokeRecord,
  type TileRecord,
} from './db'

// Whole campaign as one JSON file. Images are embedded as data URLs, so the file is self-contained.
interface BackupFileV3 {
  app: 'dnd-dm'
  version: 3
  exportedAt: string
  maps: MapRecord[]
  tiles: (Omit<TileRecord, 'image'> & { image?: string })[]
  strokes: StrokeRecord[]
  markers: MarkerRecord[]
}

// Files exported before drawings existed: same as v3 without strokes.
type BackupFileV2 = Omit<BackupFileV3, 'version' | 'strokes'> & { version: 2 }

// Files exported before maps were made of tiles (one image per map, markers as 0–1 fractions).
interface BackupFileV1 {
  app: 'dnd-dm'
  version: 1
  maps: (Omit<LegacyMap, 'image'> & { image?: string })[]
  markers: MarkerRecord[]
}

async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  // Chunked: String.fromCharCode(...bytes) overflows the call stack on large images.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

const dataUrlToBlob = async (url?: string) => (url ? (await fetch(url)).blob() : undefined)

export async function exportCampaign(): Promise<Blob> {
  const [maps, tiles, strokes, markers] = await Promise.all([
    db.maps.toArray(),
    db.tiles.toArray(),
    db.strokes.toArray(),
    db.markers.toArray(),
  ])
  const file: BackupFileV3 = {
    app: 'dnd-dm',
    version: 3,
    exportedAt: new Date().toISOString(),
    maps,
    tiles: await Promise.all(
      tiles.map(async (t) => ({ ...t, image: t.image ? await blobToDataUrl(t.image) : undefined })),
    ),
    strokes,
    markers,
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

// Replaces the whole campaign with the file's contents. Ids are kept, so links between records stay intact.
export async function importCampaign(file: Blob) {
  const data = JSON.parse(await file.text()) as BackupFileV1 | BackupFileV2 | BackupFileV3
  if (data?.app !== 'dnd-dm' || !Array.isArray(data.maps) || !Array.isArray(data.markers)) {
    throw new Error('This is not a DM Assistant backup file.')
  }
  // Decode images before the transaction: awaiting non-Dexie promises inside it would commit it early.
  let content: { maps: MapRecord[]; tiles: Omit<TileRecord, 'id'>[]; strokes: StrokeRecord[]; markers: MarkerRecord[] }
  if (data.version === 1) {
    const maps = await Promise.all(data.maps.map(async (m) => ({ ...m, image: await dataUrlToBlob(m.image) })))
    content = { ...convertLegacy(maps, data.markers), strokes: [] }
  } else if ((data.version === 2 || data.version === 3) && Array.isArray(data.tiles)) {
    const tiles = await Promise.all(data.tiles.map(async (t) => ({ ...t, image: await dataUrlToBlob(t.image) })))
    const strokes = data.version === 3 && Array.isArray(data.strokes) ? data.strokes : []
    content = { maps: data.maps, tiles, strokes, markers: data.markers }
  } else {
    throw new Error('This backup was made by a newer version of DM Assistant.')
  }
  await db.transaction('rw', db.maps, db.tiles, db.strokes, db.markers, async () => {
    await Promise.all([db.maps.clear(), db.tiles.clear(), db.strokes.clear(), db.markers.clear()])
    await db.maps.bulkAdd(content.maps)
    await db.tiles.bulkAdd(content.tiles as TileRecord[])
    await db.strokes.bulkAdd(content.strokes)
    await db.markers.bulkAdd(content.markers)
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000) // let the download start first
}
