import { db, DEFAULT_CANVAS_COLOR, type TileRecord } from '../db'
import { COLOR_PRESETS } from '../markerStyle'

interface Props {
  tile: TileRecord
  tiles: TileRecord[] // all tiles of the map, sorted by z
  onClose: () => void
}

// Some handy canvas colors on top of the marker presets: sea, deep sea, grass, sand, snow, rock.
const CANVAS_PRESETS = ['#2f6fa3', '#1d3f6e', '#5f8f3e', '#d8c38a', '#f2f2f2', '#7a7a7a', ...COLOR_PRESETS]

export default function TilePanel({ tile, tiles, onClose }: Props) {
  const color = tile.color ?? DEFAULT_CANVAS_COLOR
  const minZ = tiles[0]?.z ?? 0
  const maxZ = tiles[tiles.length - 1]?.z ?? 0

  const onDelete = async () => {
    if (!confirm('Delete this tile? Markers on the map stay where they are.')) return
    await db.tiles.delete(tile.id)
    onClose()
  }

  return (
    <aside className="panel" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <strong>{tile.image ? 'Image tile' : 'Canvas tile'}</strong>
      <p className="panel-info">
        {Math.round(tile.width)} × {Math.round(tile.height)}
      </p>
      {!tile.image && (
        <div className="panel-section">
          <span className="panel-caption">Color</span>
          <div className="swatches">
            {CANVAS_PRESETS.map((c) => (
              <button
                key={c}
                className={`swatch ${color === c ? 'active' : ''}`}
                style={{ background: c }}
                title={c}
                onClick={() => db.tiles.update(tile.id, { color: c })}
              />
            ))}
            <input
              type="color"
              value={color}
              title="Custom color"
              onChange={(e) => db.tiles.update(tile.id, { color: e.target.value })}
            />
          </div>
        </div>
      )}
      <div className="panel-section">
        <span className="panel-caption">Layer order</span>
        <div className="panel-actions">
          <button disabled={tile.z === maxZ} onClick={() => db.tiles.update(tile.id, { z: maxZ + 1 })}>
            Bring to front
          </button>
          <button disabled={tile.z === minZ} onClick={() => db.tiles.update(tile.id, { z: minZ - 1 })}>
            Send to back
          </button>
        </div>
      </div>
      <div className="panel-actions">
        <button onClick={onClose}>Close</button>
        <button className="danger" onClick={onDelete}>
          Delete tile
        </button>
      </div>
    </aside>
  )
}
