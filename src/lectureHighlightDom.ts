import type { TextSpan } from './lectureHighlights'

// Formulas and diagrams are "whole pieces": a highlight covers all of one or none of it.
const WHOLE_PIECE = '.katex, img'
const SIDE_SCROLLER = '.math-display, .lecture-table-scroll'
const IMAGE_MARK = '￼'
const BLOCK = 'p, li, h2, h3, h4, th, td, img, .math-display'
const WORD_CHARACTER = /[\p{L}\p{N}_'’-]/u
const JOINED_LINE_GAP = 12

interface Segment extends TextSpan {
  node: Text | Element
}

export interface NoteMap {
  text: string
  segments: Segment[]
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export function mapNote(paper: HTMLElement): NoteMap {
  const segments: Segment[] = []
  let text = ''
  const add = (node: Text | Element, value: string) => {
    segments.push({ node, start: text.length, end: text.length + value.length })
    text += value
  }
  const visit = (node: Node) => {
    if (node instanceof Text) {
      if (node.data) add(node, node.data)
    } else if (node instanceof Element) {
      if (node.matches('img')) add(node, IMAGE_MARK)
      else if (node.matches('.katex')) add(node, node.querySelector('annotation')?.textContent ?? node.textContent ?? IMAGE_MARK)
      else node.childNodes.forEach(visit)
      // A break keeps neighboring blocks from counting as touching, so they never fuse into one highlight.
      if (node.matches(BLOCK) && !text.endsWith('\n')) text += '\n'
    }
  }
  paper.childNodes.forEach(visit)
  return { text, segments }
}

function isWhole(segment: Segment): boolean {
  return segment.node instanceof Element
}

// Grows a span over any formula or diagram it touches and trims the spaces at its ends.
export function snapSpan(map: NoteMap, span: TextSpan): TextSpan | null {
  let { start, end } = span
  for (const segment of map.segments) {
    if (isWhole(segment) && segment.start < end && segment.end > start) {
      start = Math.min(start, segment.start)
      end = Math.max(end, segment.end)
    }
  }
  while (start < end && /\s/.test(map.text[start])) start += 1
  while (end > start && /\s/.test(map.text[end - 1])) end -= 1
  return start < end ? { start, end } : null
}

// The span of one spot in the note: empty inside text, or the whole piece inside a formula.
export function spanAtPoint(map: NoteMap, node: Node, offset: number): TextSpan {
  const element = node instanceof Element ? node : node.parentElement
  const whole = element?.closest(WHOLE_PIECE)
  const segment = map.segments.find((item) => item.node === (whole ?? node))
  if (segment) {
    if (whole) return { start: segment.start, end: segment.end }
    return { start: segment.start + offset, end: segment.start + offset }
  }
  const spot = document.createRange()
  spot.setStart(node, offset)
  spot.collapse(true)
  const next = map.segments.find((item) => spot.comparePoint(item.node, 0) >= 0)
  const at = next?.start ?? map.text.length
  return { start: at, end: at }
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  if (document.caretPositionFromPoint) {
    const caret = document.caretPositionFromPoint(x, y)
    return caret && { node: caret.offsetNode, offset: caret.offset }
  }
  const caret = document.caretRangeFromPoint?.(x, y)
  return caret ? { node: caret.startContainer, offset: caret.startOffset } : null
}

export function spanAtScreen(map: NoteMap, paper: HTMLElement, x: number, y: number): TextSpan | null {
  const bounds = paper.getBoundingClientRect()
  const insideX = Math.min(Math.max(x, bounds.left + 1), bounds.right - 1)
  const insideY = Math.min(Math.max(y, bounds.top + 1), bounds.bottom - 1)
  const target = document.elementFromPoint(insideX, insideY)
  if (!target || !paper.contains(target)) return null
  const whole = target.closest(WHOLE_PIECE)
  if (whole) return spanAtPoint(map, whole, 0)
  const caret = caretAt(insideX, insideY)
  return caret && paper.contains(caret.node) ? spanAtPoint(map, caret.node, caret.offset) : null
}

export function wordAt(map: NoteMap, offset: number): TextSpan | null {
  const segment = map.segments.find((item) => !isWhole(item) && offset >= item.start && offset <= item.end)
  if (!segment) return null
  let start = offset
  let end = offset
  while (start > segment.start && WORD_CHARACTER.test(map.text[start - 1])) start -= 1
  while (end < segment.end && WORD_CHARACTER.test(map.text[end])) end += 1
  return start < end ? { start, end } : null
}

function pieceRects(segment: Segment, span: TextSpan): Rect[] {
  const { node } = segment
  if (node instanceof Text) {
    const range = document.createRange()
    range.setStart(node, Math.max(0, span.start - segment.start))
    range.setEnd(node, Math.min(node.length, span.end - segment.start))
    return [...range.getClientRects()]
  }
  if (node.matches('img')) return [node.getBoundingClientRect()]
  const lines = [...node.querySelectorAll('.katex-base, .base')].flatMap((line) => [...line.getClientRects()])
  return lines.length > 0 ? lines : [...node.getClientRects()]
}

function clipped(rect: Rect, segment: Segment): Rect {
  const element = segment.node instanceof Element ? segment.node : segment.node.parentElement
  const scroller = element?.closest(SIDE_SCROLLER)?.getBoundingClientRect()
  return {
    left: Math.max(rect.left, scroller?.left ?? rect.left),
    top: rect.top,
    right: Math.min(rect.right, scroller?.right ?? rect.right),
    bottom: rect.bottom,
  }
}

function sameLine(a: Rect, b: Rect): boolean {
  const shared = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  const gap = Math.max(a.left, b.left) - Math.min(a.right, b.right)
  return shared >= Math.min(a.bottom - a.top, b.bottom - b.top) / 2 && gap <= JOINED_LINE_GAP
}

// One smooth band per line, however many pieces of text and math that line is made of.
export function spanRects(map: NoteMap, span: TextSpan): Rect[] {
  const lines: Rect[] = []
  const pieces = map.segments
    .filter((segment) => segment.start < span.end && segment.end > span.start)
    .flatMap((segment) => pieceRects(segment, span).map((rect) => clipped(rect, segment)))
    .filter((rect) => rect.right - rect.left > 0.5 && rect.bottom - rect.top > 0.5)
    .sort((a, b) => a.left - b.left || a.top - b.top)
  // Going left to right lets a line grow piece by piece, even past a much taller fraction.
  for (const piece of pieces) {
    const line = lines.find((item) => sameLine(item, piece))
    if (line) {
      line.left = Math.min(line.left, piece.left)
      line.top = Math.min(line.top, piece.top)
      line.right = Math.max(line.right, piece.right)
      line.bottom = Math.max(line.bottom, piece.bottom)
    } else {
      lines.push({ left: piece.left, top: piece.top, right: piece.right, bottom: piece.bottom })
    }
  }
  return lines.sort((a, b) => a.top - b.top)
}
