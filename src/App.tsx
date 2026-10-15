import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addTile,
  BLANK_SIZE,
  createMap,
  db,
  DEFAULT_CANVAS_COLOR,
  deleteWorld,
  getCityMap,
  listTiles,
  listWorlds,
  type LocationKey,
} from './db'
import { downloadBlob, exportCampaign, importCampaign } from './backup'
import MapCanvas from './components/MapCanvas'
import MarkerPanel from './components/MarkerPanel'
import TilePanel from './components/TilePanel'

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

async function imageSize(image: Blob) {
  const bitmap = await createImageBitmap(image)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

// Id of the map being shown, creating it if needed: the city's map, or the first world of a new campaign.
// Created empty, because the caller adds a tile right away.
async function ensureMap(worldId: number | null, cityId: number | null) {
  if (cityId !== null) return (await getCityMap(cityId))?.id ?? db.maps.add({ kind: 'city', cityId, name: '' })
  if (worldId !== null) return worldId
  return db.maps.add({ kind: 'world', name: 'World' })
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
  // Edit map mode: arrange tiles instead of working with markers.
  const [editMode, setEditMode] = useState(false)
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null)
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
  const tiles = useLiveQuery(() => (map ? listTiles(map.id) : []), [map?.id])
  const selected = markers?.find((m) => m.id === selectedId)
  const selectedTile = editMode ? tiles?.find((t) => t.id === selectedTileId) : undefined

  const openCity = (id: number | null) => {
    setSelectedId(null)
    setEditMode(false)
    setSelectedTileId(null)
    setCityId(id)
  }

  const toggleEditMode = () => {
    setSelectedId(null)
    setSelectedTileId(null)
    setEditMode(!editMode)
  }

  // New tiles open in edit mode, selected, so they can be dragged into place right away.
  const showNewTile = (tileId: number) => {
    setSelectedId(null)
    setEditMode(true)
    setSelectedTileId(tileId)
  }

  const openWorld = (id: number) => {
    setChosenWorldId(id)
    rememberWorld(id)
    openCity(null)
  }

  const onNewWorld = async () => {
    const name = prompt('Name of the new world:', 'New world')?.trim()
    if (!name) return
    openWorld(await createMap({ kind: 'world', name }))
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

  // Several images can be picked at once; each becomes a tile to the right of the previous one.
  const onAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    let lastTileId: number | undefined
    for (const file of files) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      const tooBig = file.size > LARGE_IMAGE_BYTES
      if (tooBig && !confirm(`"${file.name}" is ${mb} MB. Large maps load slowly. Use it anyway?`)) continue
      try {
        const mapId = await ensureMap(worldId, cityId)
        lastTileId = await addTile(mapId, { image: file }, await imageSize(file))
      } catch (err) {
        alert(`Could not load "${file.name}": ${err}`)
      }
    }
    if (lastTileId !== undefined) showNewTile(lastTileId)
  }

  const onAddCanvas = async () => {
    const mapId = await ensureMap(worldId, cityId)
    showNewTile(await addTile(mapId, { color: DEFAULT_CANVAS_COLOR }, BLANK_SIZE))
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
        <label className="button" title="Add one or more images as tiles of this map">
          Add PNG
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={onAddImages} />
        </label>
        <button onClick={onAddCanvas} title="Add a plain color canvas tile">
          Add canvas
        </button>
        {tiles && tiles.length > 0 && (
          <button className={editMode ? 'active' : ''} onClick={toggleEditMode} title="Arrange, resize and color tiles">
            {editMode ? 'Done editing' : 'Edit map'}
          </button>
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
        {map && tiles && tiles.length > 0 && (
          <span className="hint">
            {editMode ? (
              'Drag tiles to arrange (edges snap together) · drag corners to resize · click a tile for color and order'
            ) : (
              <>
                Double-click the map to add a {map.kind === 'world' ? 'city' : 'marker'} · drag to move · click to edit
                {map.kind === 'world' && ' · double-click a city to open it'}
              </>
            )}
          </span>
        )}
      </header>
      <main className="stage">
        <div className="canvas-area">
          {(map === null || tiles?.length === 0) && (
            <p className="hint center">
              {worlds?.length === 0
                ? 'No world yet. Add a PNG or a canvas to start.'
                : `No map for ${placeName} yet. Add a PNG or a canvas.`}
            </p>
          )}
          {map && markers && tiles && tiles.length > 0 && (
            <MapCanvas
              key={map.id}
              map={map}
              tiles={tiles}
              markers={markers}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpenCity={openCity}
              editMode={editMode}
              selectedTileId={selectedTileId}
              onSelectTile={setSelectedTileId}
            />
          )}
          <a className="credits" href="https://game-icons.net" target="_blank" rel="noreferrer">
            Icons: game-icons.net (CC BY 3.0)
          </a>
        </div>
        {selectedTile && tiles && (
          <TilePanel key={selectedTile.id} tile={selectedTile} tiles={tiles} onClose={() => setSelectedTileId(null)} />
        )}
        {!editMode && selected && location && (
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
