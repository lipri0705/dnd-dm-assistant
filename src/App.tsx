import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BLANK_SIZE, db, deleteWorld, getCityMap, listWorlds, type LocationKey } from './db'
import { downloadBlob, exportCampaign, importCampaign } from './backup'
import MapCanvas from './components/MapCanvas'
import MarkerPanel from './components/MarkerPanel'
import { DEFAULT_CANVAS_COLOR, MARKER_SCALE, mapMarkerScale } from './markerStyle'

const LARGE_IMAGE_BYTES = 10 * 1024 * 1024
const LAST_WORLD_KEY = 'dnd-dm:lastWorldId' // per-browser convenience only

function readLastWorld() {
  try {
    return Number(localStorage.getItem(LAST_WORLD_KEY)) || null
  } catch {
    return null
  }
}

function rememberWorld(id: number) {
  try {
    localStorage.setItem(LAST_WORLD_KEY, String(id))
  } catch {
    // private mode etc. — not important
  }
}

async function imageSize(image?: Blob) {
  if (!image) return BLANK_SIZE
  const bitmap = await createImageBitmap(image)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

// Sets the background of a city's map (creating it if needed), or of a world map.
// With no world yet, creates the first one. Replacing a background keeps the markers (coords are relative).
async function saveBackground(worldId: number | null, cityId: number | null, image?: Blob) {
  const size = await imageSize(image)
  if (cityId !== null) {
    const existing = await getCityMap(cityId)
    if (existing) await db.maps.update(existing.id, { image, ...size })
    else await db.maps.add({ kind: 'city', cityId, name: '', image, ...size })
  } else if (worldId !== null) {
    await db.maps.update(worldId, { image, ...size })
  } else {
    await db.maps.add({ kind: 'world', name: 'World', image, ...size })
  }
}

export default function App() {
  const worlds = useLiveQuery(listWorlds)
  const [chosenWorldId, setChosenWorldId] = useState(readLastWorld)
  // Fall back to the first world if the chosen one doesn't exist (first run, deleted, after import).
  const worldId = worlds?.some((w) => w.id === chosenWorldId) ? chosenWorldId : (worlds?.[0]?.id ?? null)
  const world = worlds?.find((w) => w.id === worldId)

  // null = the world map is shown, otherwise the id of the open city's marker
  const [cityId, setCityId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // Ask Chrome not to evict our data when the disk is low. Chrome decides silently (no prompt);
  // data stays local either way, so the result isn't shown.
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  // null = no map yet, undefined = still loading
  const map = useLiveQuery(
    () => (cityId !== null ? getCityMap(cityId) : worldId !== null ? db.maps.get(worldId).then((m) => m ?? null) : null),
    [cityId, worldId],
  )
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

  const openWorld = (id: number) => {
    setChosenWorldId(id)
    rememberWorld(id)
    openCity(null)
  }

  const onNewWorld = async () => {
    const name = prompt('Name of the new world:', 'New world')?.trim()
    if (!name) return
    openWorld(await db.maps.add({ kind: 'world', name, ...BLANK_SIZE }))
  }

  const onRenameWorld = () => {
    if (!world) return
    const name = prompt('Rename world:', world.name)?.trim()
    if (name) db.maps.update(world.id, { name })
  }

  const onDeleteWorld = async () => {
    if (!world) return
    const msg = `Delete world "${world.name}"? All its cities, city maps, buildings and characters on it will be deleted.`
    if (!confirm(msg)) return
    await deleteWorld(world.id)
    openCity(null)
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const mb = (file.size / 1024 / 1024).toFixed(1)
    if (file.size > LARGE_IMAGE_BYTES && !confirm(`This image is ${mb} MB. Large maps load slowly. Use it anyway?`)) return
    saveBackground(worldId, cityId, file).catch((err) => alert(`Could not load image: ${err}`))
  }

  const onExport = async () => {
    const date = new Date().toISOString().slice(0, 10)
    downloadBlob(await exportCampaign(), `dnd-campaign-${date}.json`)
  }

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !confirm('Replace the whole current campaign with this backup? This cannot be undone.')) return
    try {
      await importCampaign(file)
      openCity(null)
    } catch (err) {
      alert(`Could not import: ${err instanceof Error ? err.message : err}`)
    }
  }

  const location: LocationKey | null =
    cityId !== null ? `city:${cityId}` : worldId !== null ? `world:${worldId}` : null
  const placeName = cityId === null ? 'this world' : city?.label || 'this city'

  return (
    <div className="app">
      <header className="toolbar">
        {worlds && worlds.length > 0 && (
          <span className="world-switcher">
            <select value={worldId ?? ''} onChange={(e) => openWorld(Number(e.target.value))} title="Switch world">
              {worlds.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || 'Unnamed world'}
                </option>
              ))}
            </select>
            <button onClick={onNewWorld} title="New world">
              +
            </button>
            <button onClick={onRenameWorld} title="Rename this world">
              ✎
            </button>
            <button onClick={onDeleteWorld} title="Delete this world">
              ✕
            </button>
          </span>
        )}
        {cityId !== null && (
          <>
            <button onClick={() => openCity(null)}>← {world?.name || 'World'}</button>
            <strong>{city?.label || 'City'}</strong>
            {markers && <span className="hint">{markers.filter((m) => m.kind === 'building').length} buildings</span>}
          </>
        )}
        <label className="button">
          Upload PNG
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
        </label>
        <button onClick={() => saveBackground(worldId, cityId)}>Blank canvas</button>
        {map && !map.image && (
          <label className="inline-control" title="Color of this blank canvas">
            Canvas
            <input
              type="color"
              value={map.background ?? DEFAULT_CANVAS_COLOR}
              onChange={(e) => db.maps.update(map.id, { background: e.target.value })}
            />
          </label>
        )}
        {map && (
          <label className="inline-control" title="Size of all markers on this map">
            Marker size
            <input
              type="range"
              min={MARKER_SCALE.min}
              max={MARKER_SCALE.max}
              step={0.1}
              value={mapMarkerScale(map)}
              onChange={(e) => db.maps.update(map.id, { markerScale: Number(e.target.value) })}
            />
          </label>
        )}
        <span className="toolbar-right">
          <button onClick={onExport} title="Download the whole campaign (all worlds, maps, images, records) as one file">
            Export
          </button>
          <label className="button" title="Replace the current campaign with a backup file">
            Import
            <input type="file" accept="application/json,.json" hidden onChange={onImport} />
          </label>
        </span>
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
            <p className="hint center">
              {worlds?.length === 0
                ? 'No world yet. Upload a PNG or start with a blank canvas.'
                : `No map for ${placeName} yet. Upload a PNG or start with a blank canvas.`}
            </p>
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
          <a className="credits" href="https://game-icons.net" target="_blank" rel="noreferrer">
            Icons: game-icons.net (CC BY 3.0)
          </a>
        </div>
        {selected && location && (
          <MarkerPanel
            key={selected.id}
            marker={selected}
            location={location}
            onClose={() => setSelectedId(null)}
            onOpenCity={openCity}
          />
        )}
      </main>
    </div>
  )
}
