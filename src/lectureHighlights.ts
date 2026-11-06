import { createQuestionId } from './questionLogic'
import { LEGACY_TOPIC_ALIASES, TOPICS, type Topic } from './studyTypes'

export const HIGHLIGHTS_STORAGE_KEY = 'lets-studee-lecture-highlights-v1'
export const HIGHLIGHTER_COLOR_STORAGE_KEY = 'lets-studee-highlighter-color-v1'

export const HIGHLIGHT_COLORS = [
  { id: 'yellow', label: 'Yellow', swatch: '#fff0a0' },
  { id: 'green', label: 'Green', swatch: '#bfeec8' },
  { id: 'blue', label: 'Blue', swatch: '#bcdffb' },
  { id: 'pink', label: 'Pink', swatch: '#fdc8dc' },
  { id: 'orange', label: 'Orange', swatch: '#ffd5a6' },
] as const

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]['id']

export interface TextSpan {
  start: number
  end: number
}

// A highlight points into the note's rendered text. The quote and its surroundings let it
// find its place again after the note is edited, so nothing is ever written into the note itself.
export interface Highlight extends TextSpan {
  id: string
  color: HighlightColor
  quote: string
  before: string
  after: string
}

export type Highlights = Partial<Record<Topic, Highlight[]>>

const CONTEXT_LENGTH = 32

function isHighlightColor(value: unknown): value is HighlightColor {
  return HIGHLIGHT_COLORS.some((color) => color.id === value)
}

function isHighlight(value: unknown): value is Highlight {
  if (typeof value !== 'object' || value === null) return false
  const { id, color, start, end, quote, before, after } = value as Partial<Highlight>
  return typeof id === 'string' && isHighlightColor(color) && typeof start === 'number' && typeof end === 'number'
    && typeof quote === 'string' && quote.length > 0 && typeof before === 'string' && typeof after === 'string'
}

export function loadHighlights(): { highlights: Highlights; error: string } {
  const unreadable = { highlights: {}, error: 'Saved highlights could not be read. New highlights will still be saved.' }
  if (typeof window === 'undefined') return { highlights: {}, error: '' }
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(HIGHLIGHTS_STORAGE_KEY) ?? '{}')
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return unreadable
    const highlights: Highlights = {}
    for (const [savedTopic, topicHighlights] of Object.entries(saved)) {
      const topic = TOPICS.find((item) => item === savedTopic) ?? LEGACY_TOPIC_ALIASES[savedTopic]
      if (topic && Array.isArray(topicHighlights)) highlights[topic] = topicHighlights.filter(isHighlight)
    }
    return { highlights, error: '' }
  } catch (error) {
    console.error('Could not restore highlights.', error)
    return unreadable
  }
}

export function loadHighlighterColor(): HighlightColor {
  try {
    const saved = window.localStorage.getItem(HIGHLIGHTER_COLOR_STORAGE_KEY)
    return isHighlightColor(saved) ? saved : 'yellow'
  } catch {
    return 'yellow'
  }
}

function anchored(text: string, { start, end }: TextSpan, color: HighlightColor): Highlight {
  return {
    id: createQuestionId(),
    color,
    start,
    end,
    quote: text.slice(start, end),
    before: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    after: text.slice(end, end + CONTEXT_LENGTH),
  }
}

function sharedStart(a: string, b: string): number {
  let length = 0
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1
  return length
}

function sharedEnd(a: string, b: string): number {
  let length = 0
  while (length < a.length && length < b.length && a[a.length - 1 - length] === b[b.length - 1 - length]) length += 1
  return length
}

// The same words can appear twice, so the best match is the one with the most familiar
// surroundings, then the one closest to where the highlight used to be.
function locate(highlight: Highlight, text: string): number {
  let best = -1
  let bestContext = -1
  let bestDistance = Infinity
  for (let at = text.indexOf(highlight.quote); at !== -1; at = text.indexOf(highlight.quote, at + 1)) {
    const end = at + highlight.quote.length
    const context = sharedEnd(text.slice(Math.max(0, at - CONTEXT_LENGTH), at), highlight.before)
      + sharedStart(text.slice(end, end + CONTEXT_LENGTH), highlight.after)
    const distance = Math.abs(at - highlight.start)
    if (context > bestContext || (context === bestContext && distance < bestDistance)) {
      best = at
      bestContext = context
      bestDistance = distance
    }
  }
  return best
}

// Highlights whose words were edited away are "lost": hidden, but kept so undoing the edit brings them back.
export function placeHighlights(highlights: readonly Highlight[], text: string): { placed: Highlight[]; lost: Highlight[] } {
  const placed: Highlight[] = []
  const lost: Highlight[] = []
  for (const highlight of highlights) {
    const start = locate(highlight, text)
    if (start === -1) lost.push(highlight)
    else placed.push({ ...highlight, start, end: start + highlight.quote.length })
  }
  return { placed, lost }
}

export function eraseSpan(highlights: readonly Highlight[], text: string, span: TextSpan): Highlight[] {
  const { placed, lost } = placeHighlights(highlights, text)
  const kept = placed.flatMap((highlight) => {
    if (highlight.end <= span.start || highlight.start >= span.end) return [highlight]
    return [{ start: highlight.start, end: span.start }, { start: span.end, end: highlight.end }]
      .filter((piece) => piece.start < piece.end && text.slice(piece.start, piece.end).trim())
      .map((piece) => anchored(text, piece, highlight.color))
  })
  return [...lost, ...kept]
}

// Painting replaces whatever was underneath and joins a touching highlight of the same color.
export function paintSpan(highlights: readonly Highlight[], text: string, span: TextSpan, color: HighlightColor): Highlight[] {
  const painted = placeHighlights(highlights, text).placed
    .filter((highlight) => highlight.color === color && highlight.start <= span.end && highlight.end >= span.start)
    .reduce((joined, highlight) => ({
      start: Math.min(joined.start, highlight.start),
      end: Math.max(joined.end, highlight.end),
    }), span)
  return [...eraseSpan(highlights, text, painted), anchored(text, painted, color)]
}
