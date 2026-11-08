import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'
import { mapNote, snapSpan, spanAtPoint, spanAtScreen, spanRects, wordAt, type NoteMap } from './lectureHighlightDom'
import {
  eraseSpan,
  HIGHLIGHT_COLORS,
  HIGHLIGHTER_COLOR_STORAGE_KEY,
  HIGHLIGHTS_STORAGE_KEY,
  loadHighlighterColor,
  loadHighlights,
  paintSpan,
  placeHighlights,
  type Highlight,
  type HighlightColor,
  type TextSpan,
} from './lectureHighlights'
import type { Topic } from './studyTypes'

type Pen = HighlightColor | 'erase'

interface Band {
  id: string
  color: Pen
  x: number
  y: number
  width: number
  height: number
}

interface Popup {
  span: TextSpan
  highlight?: Highlight
  /** The text selection that opened this popup, for "Delete text". */
  range?: Range
  x: number
  y: number
  below: boolean
}

interface Stroke {
  pointerId: number
  x: number
  y: number
  from: TextSpan
  span: TextSpan | null
  moved: boolean
}

const NO_BANDS: Band[] = []
const NO_HIGHLIGHTS: Highlight[] = []
const DRAG_DISTANCE = 5
const POPUP_HALF_WIDTH = 124
const POPUP_ROOM = 64
const EDGE_SCROLL_ZONE = 48
const EDGE_SCROLL_STEP = 14
const SELECTION_SETTLE_MS = 160

const PENCIL_PATHS = <>
  <path d="M12 20h9" />
  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
</>
const TRASH_PATHS = <>
  <path d="M3 6h18" />
  <path d="M8 6V4h8v2" />
  <path d="M19 6l-1 14H6L5 6" />
  <path d="M10 11v6M14 11v6" />
</>
const ERASER_PATHS = <>
  <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
  <path d="M22 21H7" />
  <path d="m5 11 9 9" />
</>

function Icon({ paths }: { paths: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  )
}

function penCursor(pen: Pen): string {
  const fill = HIGHLIGHT_COLORS.find((color) => color.id === pen)?.swatch ?? '#fff'
  const path = pen === 'erase'
    ? 'M7 21l-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21z'
    : 'M9 11l-6 6v3h9l3-3zM22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4z'
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="${path}" fill="${fill}" stroke="#202722" stroke-width="1.6" stroke-linejoin="round"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(icon)}") 3 21, crosshair`
}

export default function LectureHighlighter({
  topic,
  note,
  paperRef,
  active,
  optionsSlot,
  onExit,
  onDeleteSelection,
  onEditSelection,
  onSaveProblem,
}: {
  topic: Topic
  note: string
  paperRef: RefObject<HTMLDivElement | null>
  /** True while "Highlight text" is the chosen tool in the notebook toolbar. */
  active: boolean
  /** Where the toolbar wants this tool's colors drawn. */
  optionsSlot: HTMLElement | null
  onExit: () => void
  /** Deletes the selected text from the note's source. */
  onDeleteSelection: (range: Range) => void
  /** Opens the selected text's own markdown and LaTeX for a quick fix. */
  onEditSelection: (range: Range) => void
  onSaveProblem: (message: string) => void
}) {
  const [saved] = useState(loadHighlights)
  const [highlights, setHighlights] = useState(saved.highlights)
  const [lastColor, setLastColor] = useState(loadHighlighterColor)
  const [choice, setChoice] = useState<Pen | null>(null)
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    if (active) setChoice(null)
  }
  const pen: Pen | null = active ? choice ?? lastColor : null
  const [clearArmed, setClearArmed] = useState(false)
  const [popup, setPopup] = useState<Popup | null>(null)
  const [bands, setBands] = useState(NO_BANDS)
  const [strokeBands, setStrokeBands] = useState(NO_BANDS)
  const layerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<NoteMap>({ text: '', segments: [] })
  const bandsRef = useRef(NO_BANDS)
  const list = highlights[topic] ?? NO_HIGHLIGHTS
  const shownCount = new Set(bands.map((band) => band.id)).size
  const hiddenCount = list.length - shownCount

  const bandsFor = useCallback((span: TextSpan, id: string, color: Pen): Band[] => {
    const origin = layerRef.current?.getBoundingClientRect()
    if (!origin) return NO_BANDS
    return spanRects(mapRef.current, span).map((rect) => ({
      id,
      color,
      x: rect.left - origin.left - 1,
      y: rect.top - origin.top - 1,
      width: rect.right - rect.left + 2,
      height: rect.bottom - rect.top + 2,
    }))
  }, [])

  const measure = useCallback(() => {
    const paper = paperRef.current
    if (!paper) return
    mapRef.current = mapNote(paper)
    const nextBands = placeHighlights(list, mapRef.current.text).placed
      .flatMap((highlight) => bandsFor(highlight, highlight.id, highlight.color))
    bandsRef.current = nextBands
    setBands(nextBands)
  }, [bandsFor, list, paperRef])

  // The notes are drawn before this runs, and everything that moves their text redraws the bands.
  useLayoutEffect(measure, [measure, note])

  useEffect(() => {
    const paper = paperRef.current
    if (!paper) return undefined
    let frame = 0
    const remeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resizing = new ResizeObserver(remeasure)
    resizing.observe(paper)
    paper.addEventListener('scroll', remeasure, true)
    void document.fonts?.ready.then(remeasure)
    return () => {
      cancelAnimationFrame(frame)
      resizing.disconnect()
      paper.removeEventListener('scroll', remeasure, true)
    }
  }, [measure, paperRef])

  const save = useCallback((next: Highlight[]) => {
    const nextHighlights = { ...highlights, [topic]: next }
    setHighlights(nextHighlights)
    try {
      window.localStorage.setItem(HIGHLIGHTS_STORAGE_KEY, JSON.stringify(nextHighlights))
    } catch (error) {
      console.error('Could not save highlights.', error)
      onSaveProblem('Could not save your highlights. Check browser storage and try again.')
    }
  }, [highlights, onSaveProblem, topic])

  const rememberColor = useCallback((color: HighlightColor) => {
    setLastColor(color)
    try {
      window.localStorage.setItem(HIGHLIGHTER_COLOR_STORAGE_KEY, color)
    } catch (error) {
      console.error('Could not remember the highlighter color.', error)
    }
  }, [])

  const paint = useCallback((span: TextSpan, color: Pen) => {
    const { text } = mapRef.current
    save(color === 'erase' ? eraseSpan(list, text, span) : paintSpan(list, text, span, color))
  }, [list, save])

  const openPopup = useCallback((span: TextSpan, highlight?: Highlight, range?: Range) => {
    const origin = layerRef.current?.getBoundingClientRect()
    const rects = spanRects(mapRef.current, span)
    if (!origin || rects.length === 0) return
    const first = rects[0]
    const last = rects[rects.length - 1]
    // Phones show their own copy menu above a selection, so ours goes underneath.
    const below = window.matchMedia('(pointer: coarse)').matches || first.top < POPUP_ROOM + 40
    const wanted = below ? last.bottom + 8 : first.top - 8
    const onScreen = Math.min(Math.max(wanted, POPUP_ROOM), window.innerHeight - POPUP_ROOM)
    const middle = (first.left + first.right) / 2 - origin.left
    setPopup({
      span,
      highlight,
      range,
      x: Math.min(Math.max(middle, POPUP_HALF_WIDTH), Math.max(POPUP_HALF_WIDTH, origin.width - POPUP_HALF_WIDTH)),
      y: onScreen - origin.top,
      below,
    })
  }, [])

  const highlightAtScreen = useCallback((x: number, y: number): Highlight | undefined => {
    const origin = layerRef.current?.getBoundingClientRect()
    if (!origin) return undefined
    const band = bandsRef.current.find((item) => {
      const left = x - origin.left - item.x
      const top = y - origin.top - item.y
      return left >= 0 && left <= item.width && top >= 0 && top <= item.height
    })
    return band && placeHighlights(list, mapRef.current.text).placed.find((highlight) => highlight.id === band.id)
  }, [list])

  // Pen on: dragging paints straight onto the notes, and a tap marks one word, formula or diagram.
  useEffect(() => {
    const paper = paperRef.current
    if (!paper || !pen) return undefined
    let stroke: Stroke | null = null

    const tap = (from: TextSpan, x: number, y: number) => {
      const highlight = highlightAtScreen(x, y)
      if (highlight) {
        if (pen === 'erase') paint(highlight, 'erase')
        else openPopup(highlight, highlight)
        return
      }
      if (pen === 'erase') return
      const span = from.start < from.end ? from : wordAt(mapRef.current, from.start)
      if (span) paint(span, pen)
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      const from = spanAtScreen(mapRef.current, paper, event.clientX, event.clientY)
      if (!from) return
      setPopup(null)
      stroke = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, from, span: null, moved: false }
      paper.setPointerCapture(event.pointerId)
    }
    const move = (event: PointerEvent) => {
      if (stroke?.pointerId !== event.pointerId) return
      if (!stroke.moved && Math.hypot(event.clientX - stroke.x, event.clientY - stroke.y) < DRAG_DISTANCE) return
      stroke.moved = true
      const to = spanAtScreen(mapRef.current, paper, event.clientX, event.clientY)
      if (to) {
        const start = Math.min(stroke.from.start, to.start)
        const end = Math.max(stroke.from.end, to.end)
        stroke.span = snapSpan(mapRef.current, { start, end })
        setStrokeBands(stroke.span ? bandsFor(stroke.span, 'stroke', pen) : NO_BANDS)
      }
      if (event.pointerType === 'mouse') {
        if (event.clientY < EDGE_SCROLL_ZONE) window.scrollBy(0, -EDGE_SCROLL_STEP)
        else if (event.clientY > window.innerHeight - EDGE_SCROLL_ZONE) window.scrollBy(0, EDGE_SCROLL_STEP)
      }
    }
    const up = (event: PointerEvent) => {
      if (stroke?.pointerId !== event.pointerId) return
      const finished = stroke
      stroke = null
      setStrokeBands(NO_BANDS)
      if (!finished.moved) tap(finished.from, event.clientX, event.clientY)
      else if (finished.span) paint(finished.span, pen)
    }
    // A vertical swipe hands the finger over to scrolling, which simply drops the stroke.
    const cancel = () => {
      stroke = null
      setStrokeBands(NO_BANDS)
    }
    const block = (event: Event) => event.preventDefault()
    const blockDuringStroke = (event: Event) => {
      if (stroke) event.preventDefault()
    }

    window.getSelection()?.removeAllRanges()
    paper.dataset.pen = pen
    paper.style.cursor = penCursor(pen)
    paper.addEventListener('pointerdown', down)
    paper.addEventListener('pointermove', move)
    paper.addEventListener('pointerup', up)
    paper.addEventListener('pointercancel', cancel)
    paper.addEventListener('selectstart', block)
    paper.addEventListener('dragstart', block)
    paper.addEventListener('contextmenu', blockDuringStroke)
    return () => {
      delete paper.dataset.pen
      paper.style.cursor = ''
      paper.removeEventListener('pointerdown', down)
      paper.removeEventListener('pointermove', move)
      paper.removeEventListener('pointerup', up)
      paper.removeEventListener('pointercancel', cancel)
      paper.removeEventListener('selectstart', block)
      paper.removeEventListener('dragstart', block)
      paper.removeEventListener('contextmenu', blockDuringStroke)
    }
  }, [bandsFor, highlightAtScreen, openPopup, paint, paperRef, pen])

  // Pen off: the notes select like normal text, and colors pop up beside a selection or a highlight.
  useEffect(() => {
    const paper = paperRef.current
    if (!paper || pen) return undefined
    let pressing = false
    let timer = 0

    const check = () => {
      if (pressing) return
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setPopup((current) => (current?.highlight ? current : null))
        return
      }
      const range = selection.getRangeAt(0)
      if (!range.intersectsNode(paper)) return
      const map = mapRef.current
      const start = spanAtPoint(map, range.startContainer, range.startOffset).start
      const end = spanAtPoint(map, range.endContainer, range.endOffset).end
      const span = snapSpan(map, { start, end })
      if (span) openPopup(span, undefined, range.cloneRange())
    }
    const settle = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(check, SELECTION_SETTLE_MS)
    }
    const press = () => {
      pressing = true
    }
    const release = () => {
      pressing = false
      settle()
    }
    const click = (event: MouseEvent) => {
      if (!window.getSelection()?.isCollapsed) return
      const highlight = highlightAtScreen(event.clientX, event.clientY)
      if (highlight) openPopup(highlight, highlight)
    }

    document.addEventListener('selectionchange', settle)
    document.addEventListener('pointerdown', press)
    document.addEventListener('pointerup', release)
    document.addEventListener('pointercancel', release)
    paper.addEventListener('click', click)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('selectionchange', settle)
      document.removeEventListener('pointerdown', press)
      document.removeEventListener('pointerup', release)
      document.removeEventListener('pointercancel', release)
      paper.removeEventListener('click', click)
    }
  }, [highlightAtScreen, openPopup, paperRef, pen])

  // Pressing elsewhere or Escape steps back one level: popups first, then the pen.
  useEffect(() => {
    function pressOutside(event: PointerEvent) {
      if (!(event.target instanceof Node)) return
      if (!popupRef.current?.contains(event.target)) setPopup(null)
      if (!optionsSlot?.contains(event.target)) setClearArmed(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return
      if (popup) setPopup(null)
      else if (active) onExit()
    }
    document.addEventListener('pointerdown', pressOutside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', pressOutside)
      document.removeEventListener('keydown', escape)
    }
  }, [active, onExit, optionsSlot, popup])

  function choosePen(next: Pen) {
    if (next !== 'erase') rememberColor(next)
    setChoice(next)
    setPopup(null)
  }

  function choosePopupColor(color: HighlightColor) {
    if (!popup) return
    paint(popup.span, color)
    rememberColor(color)
    setPopup(null)
    window.getSelection()?.removeAllRanges()
  }

  function removePopupHighlight() {
    if (!popup) return
    paint(popup.span, 'erase')
    setPopup(null)
  }

  function clearAll() {
    if (!clearArmed) {
      setClearArmed(true)
      return
    }
    save([])
    setClearArmed(false)
  }

  return (
    <>
      <div ref={layerRef} className="lecture-highlight-layer" aria-hidden="true">
        {[...bands, ...strokeBands].map((band, index) => (
          <span
            key={`${band.id}-${index}`}
            className="lecture-highlight"
            data-color={band.color}
            style={{ left: band.x, top: band.y, width: band.width, height: band.height }}
          />
        ))}
      </div>

      {popup && (
        <div
          ref={popupRef}
          className={`lecture-highlight-popup${popup.below ? ' is-below' : ''}`}
          role="toolbar"
          aria-label={popup.highlight ? 'Change this highlight' : 'Highlight the selected text'}
          style={{ left: popup.x, top: popup.y }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.id}
              className="lecture-highlight-swatch"
              type="button"
              aria-label={`Highlight ${color.label.toLowerCase()}`}
              aria-pressed={popup.highlight?.color === color.id}
              title={color.label}
              style={{ background: color.swatch }}
              onClick={() => choosePopupColor(color.id)}
            />
          ))}
          {popup.range && !popup.highlight && (
            <button
              className="lecture-highlight-tool"
              type="button"
              aria-label="Edit the selected text and its LaTeX"
              title="Edit text"
              onClick={() => {
                if (popup.range) onEditSelection(popup.range)
                setPopup(null)
                window.getSelection()?.removeAllRanges()
              }}
            >
              <Icon paths={PENCIL_PATHS} />
            </button>
          )}
          {popup.range && !popup.highlight && (
            <button
              className="lecture-highlight-tool lecture-highlight-delete"
              type="button"
              aria-label="Delete the selected text from the notes"
              title="Delete text"
              onClick={() => {
                if (popup.range) onDeleteSelection(popup.range)
                setPopup(null)
                window.getSelection()?.removeAllRanges()
              }}
            >
              <Icon paths={TRASH_PATHS} />
            </button>
          )}
          {popup.highlight && (
            <button className="lecture-highlight-tool" type="button" aria-label="Remove highlight" title="Remove highlight" onClick={removePopupHighlight}>
              <Icon paths={ERASER_PATHS} />
            </button>
          )}
        </div>
      )}

      {active && optionsSlot && createPortal(
        <>
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.id}
              className="lecture-ink-swatch"
              type="button"
              aria-label={`Highlight text ${color.label.toLowerCase()}`}
              aria-pressed={pen === color.id}
              title={color.label}
              style={{ background: color.swatch }}
              onClick={() => choosePen(color.id)}
            />
          ))}
          <span className="lecture-ink-divider" aria-hidden="true" />
          <button
            className="lecture-ink-tool"
            type="button"
            aria-label="Remove text highlights"
            aria-pressed={pen === 'erase'}
            title="Remove highlights"
            onClick={() => choosePen('erase')}
          >
            <Icon paths={ERASER_PATHS} />
          </button>
          {list.length > 0 && (
            <button className={`text-action lecture-ink-clear${clearArmed ? ' is-armed' : ''}`} type="button" title="Clear all text highlights on this page" onClick={clearAll}>
              {clearArmed ? 'Press again' : `Clear highlights (${list.length})`}
            </button>
          )}
          {hiddenCount > 0 && <small className="lecture-ink-note">{hiddenCount} hidden because their words were edited.</small>}
        </>,
        optionsSlot,
      )}
    </>
  )
}
