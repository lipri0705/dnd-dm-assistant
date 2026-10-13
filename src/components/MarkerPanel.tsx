import { useState } from 'react'
import { db, type MarkerRecord } from '../db'

interface Props {
  marker: MarkerRecord
  onClose: () => void
}

// Parent keys this by marker id, so local state resets when the selection changes.
export default function MarkerPanel({ marker, onClose }: Props) {
  // Local state keeps typing smooth; every change is also written to IndexedDB.
  const [label, setLabel] = useState(marker.label)

  const onLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value)
    db.markers.update(marker.id, { label: e.target.value })
  }

  const onDelete = async () => {
    if (!confirm(`Delete "${label || 'marker'}"?`)) return
    await db.markers.delete(marker.id)
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
      <div className="panel-actions">
        <button onClick={onClose}>Close</button>
        <button className="danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </aside>
  )
}
