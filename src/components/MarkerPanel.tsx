import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { countBuildings, db, deleteMarker, listCities, moveToCity, type MarkerRecord } from '../db'

interface Props {
  marker: MarkerRecord
  currentCityId: number | null // city whose map is open; null on the world map
  onClose: () => void
  onOpenCity: (cityId: number) => void
}

type TextField = 'label' | 'type' | 'description'

// Parent keys this by marker id, so local state resets when the selection changes.
export default function MarkerPanel({ marker, currentCityId, onClose, onOpenCity }: Props) {
  // Local state keeps typing smooth; every change is also written to IndexedDB.
  const [fields, setFields] = useState({
    label: marker.label,
    type: marker.type ?? '',
    description: marker.description ?? '',
  })
  const isCity = marker.kind === 'city'
  const buildingCount = useLiveQuery(() => (isCity ? countBuildings(marker.id) : 0), [marker.id])
  const cities = useLiveQuery(() => (marker.kind === 'character' ? listCities() : []), [marker.kind])

  const onFieldChange = (field: TextField) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [field]: e.target.value }))
    db.markers.update(marker.id, { [field]: e.target.value })
  }

  const onMove = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    await moveToCity(marker.id, Number(e.target.value))
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
      {!isCity && (
        <div className="segmented">
          {(['building', 'character'] as const).map((kind) => (
            <button
              key={kind}
              className={marker.kind === kind ? 'active' : ''}
              onClick={() => db.markers.update(marker.id, { kind })}
            >
              {kind === 'building' ? 'Building' : 'Character'}
            </button>
          ))}
        </div>
      )}
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
      {marker.kind === 'character' && cities && (
        <label>
          City
          <select value={currentCityId ?? ''} onChange={onMove}>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label || 'Unnamed city'}
              </option>
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
