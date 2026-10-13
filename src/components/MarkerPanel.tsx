import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  countBuildings,
  db,
  deleteMarker,
  getCityMap,
  listLocations,
  moveCharacter,
  type LocationKey,
  type MarkerRecord,
} from '../db'

interface Props {
  marker: MarkerRecord
  location: LocationKey // map that is open: a world map or a city map
  onClose: () => void
  onOpenCity: (cityId: number) => void
}

type TextField = 'label' | 'type' | 'description'

const KIND_NAMES: Record<MarkerRecord['kind'], string> = { city: 'City', building: 'Building', character: 'Character' }

// Parent keys this by marker id, so local state resets when the selection changes.
export default function MarkerPanel({ marker, location, onClose, onOpenCity }: Props) {
  // Local state keeps typing smooth; every change is also written to IndexedDB.
  const [fields, setFields] = useState({
    label: marker.label,
    type: marker.type ?? '',
    description: marker.description ?? '',
  })
  const isCity = marker.kind === 'city'
  const buildingCount = useLiveQuery(() => (isCity ? countBuildings(marker.id) : 0), [marker.id])
  const locations = useLiveQuery(() => (marker.kind === 'character' ? listLocations() : []), [marker.kind])
  // A city with its own map can't become a character, or its map would be orphaned.
  const hasCityMap = useLiveQuery(() => (isCity ? getCityMap(marker.id).then(Boolean) : false), [marker.id, isCity])
  const kinds = location.startsWith('world:') ? (['city', 'character'] as const) : (['building', 'character'] as const)

  const onFieldChange = (field: TextField) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [field]: e.target.value }))
    db.markers.update(marker.id, { [field]: e.target.value })
  }

  const onMove = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === location) return
    await moveCharacter(marker.id, e.target.value as LocationKey)
    onClose() // the marker has left this map
  }

  const onDelete = async () => {
    const extra = isCity ? ' Its city map and all markers on it will be deleted too.' : ''
    if (!confirm(`Delete "${fields.label || 'marker'}"?${extra}`)) return
    await deleteMarker(marker)
    onClose()
  }

  return (
    <aside className="panel" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="segmented">
        {kinds.map((kind) => (
          <button
            key={kind}
            className={marker.kind === kind ? 'active' : ''}
            disabled={kind === 'character' && hasCityMap !== false}
            title={kind === 'character' && hasCityMap ? 'This city has its own map' : undefined}
            onClick={() => db.markers.update(marker.id, { kind })}
          >
            {KIND_NAMES[kind]}
          </button>
        ))}
      </div>
      <label>
        Name
        <input
          autoFocus
          onFocus={(e) => e.target.select()}
          value={fields.label}
          onChange={onFieldChange('label')}
          onKeyDown={(e) => e.key === 'Enter' && onClose()}
        />
      </label>
      {!isCity && (
        <label>
          {marker.kind === 'building' ? 'Type (tavern, temple…)' : 'Role (merchant, villain…)'}
          <input value={fields.type} onChange={onFieldChange('type')} />
        </label>
      )}
      <label>
        Description
        <textarea rows={5} value={fields.description} onChange={onFieldChange('description')} />
      </label>
      {isCity && (
        <>
          <p className="panel-info">Buildings: {buildingCount ?? '…'}</p>
          <button onClick={() => onOpenCity(marker.id)}>Open city map →</button>
        </>
      )}
      {marker.kind === 'character' && locations && (
        <label>
          Location
          <select value={location} onChange={onMove}>
            {locations.map(({ world, cities }) => (
              <optgroup key={world.id} label={world.name || 'Unnamed world'}>
                <option value={`world:${world.id}`}>Travelling in {world.name || 'this world'}</option>
                {cities.map((c) => (
                  <option key={c.id} value={`city:${c.id}`}>
                    {c.label || 'Unnamed city'}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      <div className="panel-actions">
        <button onClick={onClose}>Close</button>
        <button className="danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </aside>
  )
}
