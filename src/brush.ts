export interface Brush {
  tool: 'brush' | 'eraser'
  color: string
  width: number // on-screen px at the moment of drawing
}

export const DEFAULT_BRUSH: Brush = { tool: 'brush', color: '#7a4a1e', width: 6 }
