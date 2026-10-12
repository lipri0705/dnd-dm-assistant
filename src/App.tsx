import { useLiveQuery } from 'dexie-react-hooks'
import { BLANK_SIZE, db } from './db'
import MapCanvas from './components/MapCanvas'

// M1: a single map. Replacing its background keeps the markers (coords are relative).
async function saveBackground(image?: Blob) {
  let size = BLANK_SIZE
  if (image) {
    const bitmap = await createImageBitmap(image)
    size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
  }
  const existing = await db.maps.toCollection().first()
  if (existing) {
    await db.maps.update(existing.id, { image, ...size })
  } else {
    await db.maps.add({ kind: 'city', name: 'Prototype map', image, ...size })
  }
}

export default function App() {
  // null = no map yet, undefined = still loading
  const map = useLiveQuery(() => db.maps.toCollection().first().then((m) => m ?? null))
  const markers = useLiveQuery(
    () => (map ? db.markers.where('mapId').equals(map.id).toArray() : []),
    [map?.id],
  )

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) saveBackground(file).catch((err) => alert(`Could not load image: ${err}`))
  }

  return (
    <div className="app">
      <header className="toolbar">
        <strong>DM Assistant</strong>
        <label className="button">
          Upload PNG
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
        </label>
        <button onClick={() => saveBackground()}>Blank canvas</button>
        {map && markers?.length === 0 && <span className="hint">Click the map to place a marker</span>}
      </header>
      <main className="stage">
        {map === null && <p className="hint center">Upload a PNG or start with a blank canvas.</p>}
        {map && markers && <MapCanvas key={`${map.id}:${map.width}x${map.height}:${map.image?.size ?? 0}`} map={map} markers={markers} />}
      </main>
    </div>
  )
}
