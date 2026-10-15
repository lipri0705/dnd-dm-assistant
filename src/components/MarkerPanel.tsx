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
import { ICON_GROUPS, ICON_SIZE } from '../icons'
import { COLOR_PRESETS, DEFAULT_ICON, MARKER_SIZE, markerColor, markerIcon, markerSize } from '../markerStyle'

interface Props {
  marker: MarkerRecord
  location: LocationKey // map that is open: a world map or a city map
  onClose: () => void
  onOpenCity: (cityId: number) => void
}

type TextField = 'label' | 'type' | 'description'

// Group order in the icon picker: the group matching the marker kind comes first.
const GROUP_FOR_KIND: Record<MarkerRecord['kind'], string> = {
  city: 'Places',
  building: 'Buildings',
  character: 'Characters',
}

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
      <label>
        Size: {markerSize(marker).toFixed(1)}×
        <input
          type="range"
          min={MARKER_SIZE.min}
          max={MARKER_SIZE.max}
          step={0.1}
          value={markerSize(marker)}
          onChange={(e) => db.markers.update(marker.id, { size: Number(e.target.value) })}
        />
      </label>
      <div className="panel-section">
        <span className="panel-caption">Color</span>
        <div className="swatches">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              className={`swatch ${markerColor(marker) === c ? 'active' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => db.markers.update(marker.id, { color: c })}
            />
          ))}
          <input
            type="color"
            value={markerColor(marker)}
            title="Custom color"
            onChange={(e) => db.markers.update(marker.id, { color: e.target.value })}
          />
        </div>
      </div>
      <div className="panel-section">
        <span className="panel-caption">Icon: {markerIcon(marker).label}</span>
        {[...ICON_GROUPS]
          .sort((a, b) => Number(b.title === GROUP_FOR_KIND[marker.kind]) - Number(a.title === GROUP_FOR_KIND[marker.kind]))
          .map((group) => (
            <div key={group.title}>
              <span className="icon-group-title">{group.title}</span>
              <div className="icon-grid">
                {group.icons.map((icon) => (
                  <button
                    key={icon.id}
                    className={markerIcon(marker).id === icon.id ? 'active' : ''}
                    title={icon.label}
                    onClick={() => db.markers.update(marker.id, { icon: icon.id })}
                  >
                    <svg viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`}>
                      <path d={icon.path} fill={markerColor(marker)} />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ))}
        {marker.icon && marker.icon !== DEFAULT_ICON[marker.kind] && (
          <button className="link" onClick={() => db.markers.update(marker.id, { icon: undefined })}>
            Reset to default icon
          </button>
        )}
      </div>
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
