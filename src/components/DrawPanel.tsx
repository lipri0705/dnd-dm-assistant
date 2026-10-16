import type { Brush } from '../brush'
import { db, type StrokeRecord } from '../db'

// Road, river, sea, grass, sand, rock, black, white, red, gold.
const BRUSH_COLORS = ['#7a4a1e', '#3b8ad9', '#1d3f6e', '#5f8f3e', '#d8c38a', '#7a7a7a', '#222222', '#ffffff', '#d9534f', '#e8b830']
const WIDTH = { min: 1, max: 60 }

interface Props {
  brush: Brush
  onBrushChange: (brush: Brush) => void
  strokes: StrokeRecord[] // drawings on the current map, oldest first
  onClose: () => void
}

export default function DrawPanel({ brush, onBrushChange, strokes, onClose }: Props) {
  const set = (patch: Partial<Brush>) => onBrushChange({ ...brush, ...patch })

  const onClear = () => {
    if (!confirm(`Delete all ${strokes.length} strokes on this map?`)) return
    db.strokes.bulkDelete(strokes.map((s) => s.id))
  }

  return (
    <aside className="panel">
      <strong>Draw</strong>
      <div className="segmented">
        {(['brush', 'eraser'] as const).map((tool) => (
          <button key={tool} className={brush.tool === tool ? 'active' : ''} onClick={() => set({ tool })}>
            {tool === 'brush' ? 'Brush' : 'Eraser'}
          </button>
        ))}
      </div>
      {brush.tool === 'brush' ? (
        <>
          <div className="panel-section">
            <span className="panel-caption">Color</span>
            <div className="swatches">
              {BRUSH_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${brush.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  title={c}
                  onClick={() => set({ color: c })}
                />
              ))}
              <input type="color" value={brush.color} title="Custom color" onChange={(e) => set({ color: e.target.value })} />
            </div>
          </div>
          <label>
            Width: {brush.width}px
            <input
              type="range"
              min={WIDTH.min}
              max={WIDTH.max}
              value={brush.width}
              onChange={(e) => set({ width: Number(e.target.value) })}
            />
          </label>
        </>
      ) : (
        <p className="panel-info">Click or drag over a stroke to erase it.</p>
      )}
      <p className="hint">Hold Space and drag to move the map · wheel to zoom</p>
      <div className="panel-actions">
        <button disabled={strokes.length === 0} onClick={() => db.strokes.delete(strokes[strokes.length - 1].id)}>
          Undo last stroke
        </button>
      </div>
      <div className="panel-actions">
        <button onClick={onClose}>Done</button>
        <button className="danger" disabled={strokes.length === 0} onClick={onClear}>
          Clear drawings
        </button>
      </div>
    </aside>
  )
}
