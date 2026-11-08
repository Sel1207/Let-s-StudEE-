import { LEGACY_TOPIC_ALIASES, TOPICS, type Topic } from './studyTypes'

export const LECTURE_INK_STORAGE_KEY = 'lets-studee-lecture-ink-v1'
export const LECTURE_INK_TOOL_STORAGE_KEY = 'lets-studee-lecture-ink-tool-v1'

export type InkTool = 'pen' | 'marker'
/** `highlight` is the text highlighter that snaps to words; `marker` highlights freehand anywhere. */
export type AnnotationTool = InkTool | 'highlight' | 'text' | 'eraser'

export const PEN_COLORS = [
  { id: 'ink', label: 'Ink' },
  { id: 'red', label: 'Red' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'purple', label: 'Purple' },
] as const

export const MARKER_COLORS = [
  { id: 'yellow', label: 'Yellow' },
  { id: 'green', label: 'Green' },
  { id: 'blue', label: 'Blue' },
  { id: 'pink', label: 'Pink' },
  { id: 'orange', label: 'Orange' },
] as const

export const PEN_SIZES = [2, 4, 7] as const
export const MARKER_SIZES = [12, 20, 30] as const
export const TEXT_SIZES = [13, 16, 22] as const

export type PenColor = typeof PEN_COLORS[number]['id']
export type MarkerColor = typeof MARKER_COLORS[number]['id']

/**
 * Notes reflow with the window, so every mark is pinned to the block (paragraph, heading, table,
 * diagram) it was drawn on. `x` is a fraction of the paper's width and `y` is pixels below the
 * block's top, so a mark follows its paragraph when the text above it wraps differently.
 * Block -1 is the top of the paper itself.
 */
export interface InkStroke {
  id: string
  kind: 'ink'
  tool: InkTool
  color: string
  size: number
  block: number
  points: Array<[number, number]>
}

export interface TextNote {
  id: string
  kind: 'text'
  color: PenColor
  size: number
  block: number
  x: number
  y: number
  text: string
}

export type Annotation = InkStroke | TextNote
export type TopicAnnotations = Partial<Record<Topic, Annotation[]>>

export interface ToolPreferences {
  penColor: PenColor
  penSize: number
  markerColor: MarkerColor
  markerSize: number
  textColor: PenColor
  textSize: number
}

export const DEFAULT_TOOL_PREFERENCES: ToolPreferences = {
  penColor: 'ink',
  penSize: PEN_SIZES[1],
  markerColor: 'yellow',
  markerSize: MARKER_SIZES[1],
  textColor: 'ink',
  textSize: TEXT_SIZES[1],
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const penColorIds = new Set<string>(PEN_COLORS.map((color) => color.id))
const markerColorIds = new Set<string>(MARKER_COLORS.map((color) => color.id))

function parseAnnotation(value: unknown): Annotation | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !Number.isInteger(item.block) || (item.block as number) < -1) return null
  if (item.kind === 'ink') {
    if (item.tool !== 'pen' && item.tool !== 'marker') return null
    const colors = item.tool === 'pen' ? penColorIds : markerColorIds
    if (typeof item.color !== 'string' || !colors.has(item.color) || !isNumber(item.size) || item.size <= 0) return null
    if (!Array.isArray(item.points)) return null
    const points = item.points.filter((point): point is [number, number] => (
      Array.isArray(point) && point.length === 2 && isNumber(point[0]) && isNumber(point[1])
    ))
    if (points.length === 0) return null
    return { id: item.id, kind: 'ink', tool: item.tool, color: item.color, size: item.size, block: item.block as number, points }
  }
  if (item.kind === 'text') {
    if (typeof item.text !== 'string' || !item.text.trim() || !isNumber(item.x) || !isNumber(item.y) || !isNumber(item.size)) return null
    const color = typeof item.color === 'string' && penColorIds.has(item.color) ? item.color as PenColor : 'ink'
    return { id: item.id, kind: 'text', color, size: item.size, block: item.block as number, x: item.x, y: item.y, text: item.text }
  }
  return null
}

export function parseAnnotations(source: string | null): { annotations: TopicAnnotations; error: string } {
  if (!source) return { annotations: {}, error: '' }
  try {
    const saved: unknown = JSON.parse(source)
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) throw new Error('not an object')
    const annotations: TopicAnnotations = {}
    for (const [savedTopic, list] of Object.entries(saved)) {
      const topic = TOPICS.find((item) => item === savedTopic) ?? LEGACY_TOPIC_ALIASES[savedTopic]
      if (!topic || !Array.isArray(list)) continue
      annotations[topic] = list.flatMap((entry) => {
        const parsed = parseAnnotation(entry)
        return parsed ? [parsed] : []
      })
    }
    return { annotations, error: '' }
  } catch {
    return { annotations: {}, error: 'Saved drawings could not be read. New ones will still be saved.' }
  }
}

export function loadAnnotations(): { annotations: TopicAnnotations; error: string } {
  if (typeof window === 'undefined') return { annotations: {}, error: '' }
  try {
    return parseAnnotations(window.localStorage.getItem(LECTURE_INK_STORAGE_KEY))
  } catch {
    return { annotations: {}, error: 'Saved drawings could not be read. New ones will still be saved.' }
  }
}

export function loadToolPreferences(): ToolPreferences {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(LECTURE_INK_TOOL_STORAGE_KEY) ?? '{}')
    if (typeof saved !== 'object' || saved === null) return DEFAULT_TOOL_PREFERENCES
    const value = saved as Partial<Record<keyof ToolPreferences, unknown>>
    return {
      penColor: typeof value.penColor === 'string' && penColorIds.has(value.penColor) ? value.penColor as PenColor : DEFAULT_TOOL_PREFERENCES.penColor,
      penSize: PEN_SIZES.find((size) => size === value.penSize) ?? DEFAULT_TOOL_PREFERENCES.penSize,
      markerColor: typeof value.markerColor === 'string' && markerColorIds.has(value.markerColor) ? value.markerColor as MarkerColor : DEFAULT_TOOL_PREFERENCES.markerColor,
      markerSize: MARKER_SIZES.find((size) => size === value.markerSize) ?? DEFAULT_TOOL_PREFERENCES.markerSize,
      textColor: typeof value.textColor === 'string' && penColorIds.has(value.textColor) ? value.textColor as PenColor : DEFAULT_TOOL_PREFERENCES.textColor,
      textSize: TEXT_SIZES.find((size) => size === value.textSize) ?? DEFAULT_TOOL_PREFERENCES.textSize,
    }
  } catch {
    return DEFAULT_TOOL_PREFERENCES
  }
}

/** Drops points closer than `minDistance` to the last kept one; the final point is always kept. */
export function simplifyPoints(points: ReadonlyArray<readonly [number, number]>, minDistance: number): Array<[number, number]> {
  if (points.length <= 2) return points.map(([x, y]) => [x, y])
  const kept: Array<[number, number]> = [[points[0][0], points[0][1]]]
  for (let index = 1; index < points.length - 1; index += 1) {
    const [x, y] = points[index]
    const [lastX, lastY] = kept[kept.length - 1]
    if (Math.hypot(x - lastX, y - lastY) >= minDistance) kept.push([x, y])
  }
  const last = points[points.length - 1]
  kept.push([last[0], last[1]])
  return kept
}

/** A smooth SVG path through the points, using each midpoint as a curve anchor. */
export function smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return ''
  const round = (value: number) => Math.round(value * 10) / 10
  const [firstX, firstY] = points[0]
  // A single tap still leaves a dot: a zero-length segment draws as a round cap.
  if (points.length === 1) return `M${round(firstX)} ${round(firstY)}L${round(firstX + 0.01)} ${round(firstY)}`
  if (points.length === 2) return `M${round(firstX)} ${round(firstY)}L${round(points[1][0])} ${round(points[1][1])}`
  let path = `M${round(firstX)} ${round(firstY)}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const [x, y] = points[index]
    const [nextX, nextY] = points[index + 1]
    path += `Q${round(x)} ${round(y)} ${round((x + nextX) / 2)} ${round((y + nextY) / 2)}`
  }
  const last = points[points.length - 1]
  return `${path}L${round(last[0])} ${round(last[1])}`
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Whether a point is within `reach` pixels of the stroke's line (on-screen coordinates). */
export function strokeHit(points: ReadonlyArray<readonly [number, number]>, x: number, y: number, reach: number): boolean {
  if (points.length === 1) return Math.hypot(x - points[0][0], y - points[0][1]) <= reach
  for (let index = 1; index < points.length; index += 1) {
    const [ax, ay] = points[index - 1]
    const [bx, by] = points[index]
    if (distanceToSegment(x, y, ax, ay, bx, by) <= reach) return true
  }
  return false
}

/** The last block whose top is at or above `y`, or -1 when `y` is above every block. */
export function anchorBlock(blockTops: readonly number[], y: number): number {
  let anchor = -1
  for (let index = 0; index < blockTops.length; index += 1) {
    if (blockTops[index] <= y) anchor = index
    else break
  }
  return anchor
}
