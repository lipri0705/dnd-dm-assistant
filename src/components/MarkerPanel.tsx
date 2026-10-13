import { useState } from 'react'
import { db, deleteMarker, type MarkerRecord } from '../db'

interface Props {
  marker: MarkerRecord
  onClose: () => void
  onOpenCity: (cityId: number) => void
}

// Parent keys this by marker id, so local state resets when the selection changes.
export default function MarkerPanel({ marker, onClose, onOpenCity }: Props) {
  // Local state keeps typing smooth; every change is also written to IndexedDB.
  const [label, setLabel] = useState(marker.label)

  const onLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value)
    db.markers.update(marker.id, { label: e.target.value })
  }

  const onDelete = async () => {
    const extra = marker.kind === 'city' ? ' Its city map and all markers on it will be deleted too.' : ''
    if (!confirm(`Delete "${label || 'marker'}"?${extra}`)) return
    await deleteMarker(marker)
    onClose()
  }

  return (
    <aside className="panel">
      <label>
        Label
        <input
          autoFocus
          onFocus={(e) => e.target.select()}
          value={label}
          onChange={onLabelChange}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && onClose()}
        />
      </label>
      {marker.kind === 'city' && <button onClick={() => onOpenCity(marker.id)}>Open city map →</button>}
      <div className="panel-actions">
        <button onClick={onClose}>Close</button>
        <button className="danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </aside>
  )
}
