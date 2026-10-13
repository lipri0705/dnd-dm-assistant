import { db, type MapRecord, type MarkerRecord } from './db'

// Whole campaign as one JSON file. Images are embedded as data URLs, so the file is self-contained.
interface BackupFile {
  app: 'dnd-dm'
  version: 1
  exportedAt: string
  maps: (Omit<MapRecord, 'image'> & { image?: string })[]
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

export async function exportCampaign(): Promise<Blob> {
  const [maps, markers] = await Promise.all([db.maps.toArray(), db.markers.toArray()])
  const file: BackupFile = {
    app: 'dnd-dm',
    version: 1,
    exportedAt: new Date().toISOString(),
    maps: await Promise.all(
      maps.map(async (m) => ({ ...m, image: m.image ? await blobToDataUrl(m.image) : undefined })),
    ),
    markers,
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

// Replaces the whole campaign with the file's contents. Ids are kept, so map/marker links stay intact.
export async function importCampaign(file: Blob) {
  const data = JSON.parse(await file.text()) as BackupFile
  if (data?.app !== 'dnd-dm' || !Array.isArray(data.maps) || !Array.isArray(data.markers)) {
    throw new Error('This is not a DM Assistant backup file.')
  }
  // Decode images before the transaction: awaiting non-Dexie promises inside it would commit it early.
  const maps: MapRecord[] = await Promise.all(
    data.maps.map(async (m) => ({ ...m, image: m.image ? await (await fetch(m.image)).blob() : undefined })),
  )
  await db.transaction('rw', db.maps, db.markers, async () => {
    await db.maps.clear()
    await db.markers.clear()
    await db.maps.bulkAdd(maps)
    await db.markers.bulkAdd(data.markers)
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
