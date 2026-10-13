import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BLANK_SIZE, db, getMap } from './db'
import MapCanvas from './components/MapCanvas'
import MarkerPanel from './components/MarkerPanel'

// Sets the background of the world map (cityId = null) or of a city's map, creating the map if needed.
// Replacing a background keeps the markers (coords are relative).
async function saveBackground(cityId: number | null, image?: Blob) {
  let size = BLANK_SIZE
  if (image) {
    const bitmap = await createImageBitmap(image)
    size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
  }
  const existing = await getMap(cityId)
  if (existing) {
    await db.maps.update(existing.id, { image, ...size })
  } else if (cityId === null) {
    await db.maps.add({ kind: 'world', name: 'World', image, ...size })
  } else {
    await db.maps.add({ kind: 'city', cityId, name: '', image, ...size })
  }
}

export default function App() {
  // null = world map is shown, otherwise the id of the open city's marker
  const [cityId, setCityId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // null = no map yet, undefined = still loading
  const map = useLiveQuery(() => getMap(cityId), [cityId])
  const city = useLiveQuery(() => (cityId === null ? undefined : db.markers.get(cityId)), [cityId])
  const markers = useLiveQuery(
    () => (map ? db.markers.where('mapId').equals(map.id).toArray() : []),
    [map?.id],
  )
  const selected = markers?.find((m) => m.id === selectedId)

  const openCity = (id: number | null) => {
    setSelectedId(null)
    setCityId(id)
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) saveBackground(cityId, file).catch((err) => alert(`Could not load image: ${err}`))
  }

  const placeName = cityId === null ? 'the world' : city?.label || 'this city'

  return (
    <div className="app">
      <header className="toolbar">
        {cityId === null ? (
          <strong>World</strong>
        ) : (
          <>
            <button onClick={() => openCity(null)}>← World</button>
            <strong>{city?.label || 'City'}</strong>
          </>
        )}
        <label className="button">
          Upload PNG
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
        </label>
        <button onClick={() => saveBackground(cityId)}>Blank canvas</button>
        {map && (
          <span className="hint">
            Double-click the map to add a {map.kind === 'world' ? 'city' : 'marker'} · drag to move · click to edit
            {map.kind === 'world' && ' · double-click a city to open it'}
          </span>
        )}
      </header>
      <main className="stage">
        <div className="canvas-area">
          {map === null && (
            <p className="hint center">No map for {placeName} yet. Upload a PNG or start with a blank canvas.</p>
          )}
          {map && markers && (
            <MapCanvas
              key={`${map.id}:${map.width}x${map.height}:${map.image?.size ?? 0}`}
              map={map}
              markers={markers}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpenCity={openCity}
            />
          )}
        </div>
        {selected && (
          <MarkerPanel
            key={selected.id}
            marker={selected}
            onClose={() => setSelectedId(null)}
            onOpenCity={openCity}
          />
        )}
      </main>
    </div>
  )
}
