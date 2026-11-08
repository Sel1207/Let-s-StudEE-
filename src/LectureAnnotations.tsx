import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import MathText from './MathText'
import {
  anchorBlock,
  LECTURE_INK_STORAGE_KEY,
  LECTURE_INK_TOOL_STORAGE_KEY,
  loadAnnotations,
  loadToolPreferences,
  MARKER_COLORS,
  MARKER_SIZES,
  PEN_COLORS,
  PEN_SIZES,
  simplifyPoints,
  smoothPath,
  strokeHit,
  TEXT_SIZES,
  type Annotation,
  type AnnotationTool,
  type InkStroke,
  type TextNote,
  type ToolPreferences,
} from './lectureInk'
import type { Topic } from './studyTypes'
import { screenScale, toPagePx } from './appScale'

interface Layout {
  left: number
  width: number
  paperTop: number
  blockTops: number[]
}

interface Editing {
  note: TextNote
  text: string
  isNew: boolean
}

type Gesture =
  | { mode: 'draw'; pointerId: number; points: Array<[number, number]> }
  | { mode: 'erase'; pointerId: number; last: [number, number] }
  | { mode: 'text'; pointerId: number; x: number; y: number; moved: boolean }
  | { mode: 'pan'; lastY: number }
  | { mode: 'move'; pointerId: number; startX: number; startY: number; from: [number, number] }

/** A change to the note's text, such as deleting a selection, kept in the same undo history. */
export interface NoteEdit {
  id: number
  before: string
  after: string
}

export interface LectureHistory {
  /** Undoes the given note edit, but only if it is still the latest change. */
  undoNoteEdit: (id: number) => void
}

type HistoryEntry = { kind: 'ink'; list: Annotation[] } | { kind: 'note'; edit: NoteEdit }

const NO_ANNOTATIONS: Annotation[] = []
const HISTORY_LIMIT = 60
const TAP_DISTANCE = 6
const ERASER_REACH = 8

const ICONS = {
  select: <path d="M4 3l7 17 2.5-7.5L21 10 4 3z" />,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  highlight: <><path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" /></>,
  marker: <><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" /><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" /></>,
  text: <><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></>,
  eraser: <><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></>,
  undo: <><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></>,
  redo: <><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" /></>,
  move: <><path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="M19 9l3 3-3 3" /><path d="M2 12h20" /><path d="M12 2v20" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>,
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function blockTop(layout: Layout, block: number): number {
  if (block < 0 || layout.blockTops.length === 0) return layout.paperTop
  return layout.blockTops[Math.min(block, layout.blockTops.length - 1)]
}

function toScreen(layout: Layout, block: number, x: number, y: number): [number, number] {
  return [layout.left + x * layout.width, blockTop(layout, block) + y]
}

function fromScreen(layout: Layout, block: number, x: number, y: number): [number, number] {
  return [Math.round(((x - layout.left) / layout.width) * 10000) / 10000, Math.round((y - blockTop(layout, block)) * 10) / 10]
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export default function LectureAnnotations({
  topic,
  note,
  paperRef,
  tool,
  onToolChange,
  highlightOptionsRef,
  noteEdit,
  onRestoreNote,
  historyRef,
  onSaveProblem,
}: {
  topic: Topic
  note: string
  paperRef: RefObject<HTMLDivElement | null>
  tool: AnnotationTool | null
  onToolChange: (tool: AnnotationTool | null) => void
  /** The text highlighter draws its colors into this spot in the toolbar. */
  highlightOptionsRef: (element: HTMLDivElement | null) => void
  /** The latest edit to the note's text; each new one joins the undo history. */
  noteEdit: NoteEdit | null
  onRestoreNote: (note: string) => void
  historyRef: RefObject<LectureHistory | null>
  onSaveProblem: (message: string) => void
}) {
  const [saved] = useState(loadAnnotations)
  const [annotations, setAnnotations] = useState(saved.annotations)
  const [prefs, setPrefs] = useState(loadToolPreferences)
  const [layout, setLayout] = useState<Layout>({ left: 0, width: 1, paperTop: 0, blockTops: [] })
  const [past, setPast] = useState<HistoryEntry[]>([])
  const [future, setFuture] = useState<HistoryEntry[]>([])
  const [seenNoteEdit, setSeenNoteEdit] = useState(noteEdit)
  if (noteEdit !== seenNoteEdit) {
    setSeenNoteEdit(noteEdit)
    if (noteEdit) {
      setPast((current) => [...current.slice(-(HISTORY_LIMIT - 1)), { kind: 'note', edit: noteEdit }])
      setFuture([])
    }
  }
  const [editing, setEditing] = useState<Editing | null>(null)
  const [erasing, setErasing] = useState<ReadonlySet<string>>(new Set())
  const [clearArmed, setClearArmed] = useState(false)
  const layerRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<SVGPathElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const finishedRef = useRef<Editing | null>(null)
  const touchesRef = useRef(new Map<number, number>())
  const textElements = useRef(new Map<string, HTMLElement>())
  const list = annotations[topic] ?? NO_ANNOTATIONS
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    if (saved.error) onSaveProblem(saved.error)
  }, [onSaveProblem, saved.error])

  const measure = useCallback(() => {
    const paper = paperRef.current
    const layer = layerRef.current
    if (!paper || !layer) return
    const origin = layer.getBoundingClientRect()
    const box = paper.getBoundingClientRect()
    // Measurements are in screen pixels; the layer draws in page pixels (they differ when the site is zoomed).
    const blockTops = Array.from(paper.children).map((child) => toPagePx(child.getBoundingClientRect().top - origin.top))
    setLayout((current) => {
      const next = { left: toPagePx(box.left - origin.left), width: Math.max(1, toPagePx(box.width)), paperTop: toPagePx(box.top - origin.top), blockTops }
      const same = current.left === next.left && current.width === next.width && current.paperTop === next.paperTop
        && current.blockTops.length === next.blockTops.length && current.blockTops.every((top, index) => top === next.blockTops[index])
      return same ? current : next
    })
  }, [paperRef])

  useLayoutEffect(measure, [measure, note])

  useEffect(() => {
    const paper = paperRef.current
    if (!paper) return undefined
    let frame = 0
    const remeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    // The toolbar sits above the paper inside the notebook, so its height moves every mark.
    const resizing = new ResizeObserver(remeasure)
    resizing.observe(paper)
    if (toolbarRef.current) resizing.observe(toolbarRef.current)
    window.addEventListener('resize', remeasure)
    paper.addEventListener('load', remeasure, true)
    void document.fonts?.ready.then(remeasure)
    return () => {
      cancelAnimationFrame(frame)
      resizing.disconnect()
      window.removeEventListener('resize', remeasure)
      paper.removeEventListener('load', remeasure, true)
    }
  }, [measure, paperRef])

  const persist = useCallback((next: Annotation[]) => {
    setAnnotations((current) => {
      const nextMap = { ...current, [topic]: next }
      try {
        window.localStorage.setItem(LECTURE_INK_STORAGE_KEY, JSON.stringify(nextMap))
      } catch (error) {
        console.error('Could not save lecture drawings.', error)
        onSaveProblem('Could not save your drawings. Check browser storage and try again.')
      }
      return nextMap
    })
  }, [onSaveProblem, topic])

  const commit = useCallback((next: Annotation[]) => {
    setPast((current) => [...current.slice(-(HISTORY_LIMIT - 1)), { kind: 'ink', list }])
    setFuture([])
    persist(next)
  }, [list, persist])

  const undo = useCallback(() => {
    const entry = past[past.length - 1]
    if (!entry) return
    setPast(past.slice(0, -1))
    if (entry.kind === 'note') {
      setFuture([entry, ...future])
      onRestoreNote(entry.edit.before)
    } else {
      setFuture([{ kind: 'ink', list }, ...future])
      persist(entry.list)
    }
  }, [future, list, onRestoreNote, past, persist])

  const redo = useCallback(() => {
    const entry = future[0]
    if (!entry) return
    setFuture(future.slice(1))
    if (entry.kind === 'note') {
      setPast([...past, entry])
      onRestoreNote(entry.edit.after)
    } else {
      setPast([...past, { kind: 'ink', list }])
      persist(entry.list)
    }
  }, [future, list, onRestoreNote, past, persist])

  useEffect(() => {
    historyRef.current = {
      undoNoteEdit: (id) => {
        const latest = past[past.length - 1]
        if (latest?.kind === 'note' && latest.edit.id === id) undo()
      },
    }
    return () => {
      historyRef.current = null
    }
  }, [historyRef, past, undo])

  function updatePrefs(change: Partial<ToolPreferences>) {
    const next = { ...prefs, ...change }
    setPrefs(next)
    try {
      window.localStorage.setItem(LECTURE_INK_TOOL_STORAGE_KEY, JSON.stringify(next))
    } catch (error) {
      console.error('Could not remember the drawing tool settings.', error)
    }
  }

  // Blur and an outside press can both finish the same edit; only the first one counts.
  const finishEditing = useCallback(() => {
    if (!editing || finishedRef.current === editing) return
    finishedRef.current = editing
    const text = editing.text.trim()
    const original = list.find((item) => item.id === editing.note.id)
    if (!text) {
      if (original) commit(list.filter((item) => item.id !== editing.note.id))
    } else {
      const updated: TextNote = { ...editing.note, text: editing.text.replace(/\s+$/, '') }
      if (!original) commit([...list, updated])
      else if (JSON.stringify(original) !== JSON.stringify(updated)) commit(list.map((item) => (item.id === updated.id ? updated : item)))
    }
    setEditing(null)
  }, [commit, editing, list])

  // Keyboard: undo/redo anywhere outside a text field, Escape puts the tool down.
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (document.querySelector('dialog[open]')) return
      if (event.key === 'Escape' && !editing && tool) {
        onToolChange(null)
        return
      }
      if (isTyping(event.target) || !(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey && past.length) {
        event.preventDefault()
        undo()
      } else if (((key === 'z' && event.shiftKey) || key === 'y') && future.length) {
        event.preventDefault()
        redo()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [editing, future.length, onToolChange, past.length, redo, tool, undo])

  const screenStrokes = useMemo(() => list.flatMap((item) => (
    item.kind === 'ink' ? [{ item, points: item.points.map(([x, y]) => toScreen(layout, item.block, x, y)) }] : []
  )), [layout, list])

  useEffect(() => {
    if (!editing) return
    const editor = editorRef.current
    if (!editor) return
    editor.style.height = 'auto'
    editor.style.height = `${editor.scrollHeight}px`
  }, [editing])

  function layerPoint(event: { clientX: number; clientY: number }): [number, number] {
    const origin = layerRef.current?.getBoundingClientRect()
    return origin ? [toPagePx(event.clientX - origin.left), toPagePx(event.clientY - origin.top)] : [event.clientX, event.clientY]
  }

  function eraseAt(x: number, y: number, clientX: number, clientY: number, hits: Set<string>) {
    for (const stroke of screenStrokes) {
      if (!hits.has(stroke.item.id) && strokeHit(stroke.points, x, y, stroke.item.size / 2 + ERASER_REACH)) hits.add(stroke.item.id)
    }
    for (const [id, element] of textElements.current) {
      const box = element.getBoundingClientRect()
      if (clientX >= box.left - 4 && clientX <= box.right + 4 && clientY >= box.top - 4 && clientY <= box.bottom + 4) hits.add(id)
    }
  }

  function eraseAlong(from: [number, number], to: [number, number], event: ReactPointerEvent) {
    const hits = new Set(erasing)
    const origin = layerRef.current?.getBoundingClientRect()
    const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 4))
    for (let step = 1; step <= steps; step += 1) {
      const x = from[0] + ((to[0] - from[0]) * step) / steps
      const y = from[1] + ((to[1] - from[1]) * step) / steps
      eraseAt(x, y, x * screenScale() + (origin?.left ?? 0), y * screenScale() + (origin?.top ?? 0), hits)
    }
    if (steps === 1) eraseAt(to[0], to[1], event.clientX, event.clientY, hits)
    if (hits.size !== erasing.size) setErasing(hits)
  }

  function cancelGesture() {
    gestureRef.current = null
    draftRef.current?.setAttribute('d', '')
    setErasing(new Set())
  }

  // Fingers are counted across the whole page, because a second finger can land outside the
  // drawing surface. Two fingers drop the stroke in progress and scroll instead, like a PDF reader.
  useEffect(() => {
    if (!tool) return undefined
    const touches = touchesRef.current
    const middle = () => [...touches.values()].reduce((sum, y) => sum + y, 0) / touches.size
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      touches.set(event.pointerId, event.clientY)
      if (touches.size < 2) return
      gestureRef.current = { mode: 'pan', lastY: middle() }
      draftRef.current?.setAttribute('d', '')
      setErasing(new Set())
    }
    const move = (event: PointerEvent) => {
      if (!touches.has(event.pointerId)) return
      touches.set(event.pointerId, event.clientY)
      const gesture = gestureRef.current
      if (gesture?.mode !== 'pan') return
      const now = middle()
      window.scrollBy(0, gesture.lastY - now)
      gesture.lastY = now
    }
    const up = (event: PointerEvent) => {
      if (!touches.delete(event.pointerId)) return
      if (touches.size === 0 && gestureRef.current?.mode === 'pan') gestureRef.current = null
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', up, true)
    return () => {
      touches.clear()
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', up, true)
    }
  }, [tool])

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!tool || (event.pointerType === 'mouse' && event.button !== 0)) return
    if (gestureRef.current?.mode === 'pan') return
    if (editing) finishEditing()
    setClearArmed(false)
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = layerPoint(event)
    if (tool === 'pen' || tool === 'marker') {
      gestureRef.current = { mode: 'draw', pointerId: event.pointerId, points: [point] }
      draftRef.current?.setAttribute('d', smoothPath([point]))
    } else if (tool === 'eraser') {
      gestureRef.current = { mode: 'erase', pointerId: event.pointerId, last: point }
      eraseAlong(point, point, event)
    } else {
      gestureRef.current = { mode: 'text', pointerId: event.pointerId, x: point[0], y: point[1], moved: false }
    }
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.mode === 'pan' || gesture.pointerId !== event.pointerId) return
    if (gesture.mode === 'draw') {
      const events = typeof event.nativeEvent.getCoalescedEvents === 'function' ? event.nativeEvent.getCoalescedEvents() : []
      for (const item of events.length ? events : [event.nativeEvent]) gesture.points.push(layerPoint(item))
      draftRef.current?.setAttribute('d', smoothPath(gesture.points))
    } else if (gesture.mode === 'erase') {
      const point = layerPoint(event)
      eraseAlong(gesture.last, point, event)
      gesture.last = point
    } else if (gesture.mode === 'text') {
      const [x, y] = layerPoint(event)
      if (Math.hypot(x - gesture.x, y - gesture.y) > TAP_DISTANCE) gesture.moved = true
    }
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.mode === 'pan' || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    if (gesture.mode === 'draw') {
      draftRef.current?.setAttribute('d', '')
      const isPen = tool === 'pen'
      const points = simplifyPoints(gesture.points, isPen ? 1.2 : 2)
      const block = anchorBlock(layout.blockTops, Math.min(...points.map(([, y]) => y)))
      const stroke: InkStroke = {
        id: createId(),
        kind: 'ink',
        tool: isPen ? 'pen' : 'marker',
        color: isPen ? prefs.penColor : prefs.markerColor,
        size: isPen ? prefs.penSize : prefs.markerSize,
        block,
        points: points.map(([x, y]) => fromScreen(layout, block, x, y)),
      }
      commit([...list, stroke])
    } else if (gesture.mode === 'erase') {
      if (erasing.size) commit(list.filter((item) => !erasing.has(item.id)))
      setErasing(new Set())
    } else if (gesture.mode === 'text' && !gesture.moved) {
      const top = gesture.y - prefs.textSize * 0.9
      const block = anchorBlock(layout.blockTops, top)
      const [x, y] = fromScreen(layout, block, gesture.x - 6, top)
      setEditing({ note: { id: createId(), kind: 'text', color: prefs.textColor, size: prefs.textSize, block, x, y, text: '' }, text: '', isNew: true })
    }
  }

  function pointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (gesture && gesture.mode !== 'pan' && gesture.pointerId === event.pointerId) cancelGesture()
  }

  function startEditing(textNote: TextNote) {
    if (editing?.note.id === textNote.id) return
    if (editing) finishEditing()
    setEditing({ note: textNote, text: textNote.text, isNew: false })
  }

  function moveDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!editing) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gestureRef.current = {
      mode: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      from: toScreen(layout, editing.note.block, editing.note.x, editing.note.y),
    }
  }

  function moveMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current
    if (gesture?.mode !== 'move' || gesture.pointerId !== event.pointerId || !editing) return
    const x = gesture.from[0] + toPagePx(event.clientX - gesture.startX)
    const y = gesture.from[1] + toPagePx(event.clientY - gesture.startY)
    const block = anchorBlock(layout.blockTops, y)
    const [noteX, noteY] = fromScreen(layout, block, x, y)
    setEditing({ ...editing, note: { ...editing.note, block, x: noteX, y: noteY } })
  }

  function moveUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (gestureRef.current?.mode === 'move') gestureRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    editorRef.current?.focus()
  }

  function deleteEditing() {
    if (!editing) return
    finishedRef.current = editing
    if (list.some((item) => item.id === editing.note.id)) commit(list.filter((item) => item.id !== editing.note.id))
    setEditing(null)
  }

  function chooseTool(next: AnnotationTool) {
    if (editing) finishEditing()
    setClearArmed(false)
    onToolChange(tool === next ? null : next)
  }

  function clearPage() {
    if (!clearArmed) {
      setClearArmed(true)
      return
    }
    commit([])
    setClearArmed(false)
  }

  const markers = screenStrokes.filter((stroke) => stroke.item.tool === 'marker' && !erasing.has(stroke.item.id))
  const pens = screenStrokes.filter((stroke) => stroke.item.tool === 'pen' && !erasing.has(stroke.item.id))
  const texts = list.filter((item): item is TextNote => item.kind === 'text')
  const draftIsPen = tool === 'pen'
  const tools: Array<{ id: AnnotationTool | null; label: string; icon: ReactNode }> = [
    { id: null, label: 'Select and read', icon: ICONS.select },
    { id: 'highlight', label: 'Highlight text', icon: ICONS.highlight },
    { id: 'marker', label: 'Freehand highlighter', icon: ICONS.marker },
    { id: 'pen', label: 'Pen', icon: ICONS.pen },
    { id: 'text', label: 'Add text', icon: ICONS.text },
    { id: 'eraser', label: 'Eraser', icon: ICONS.eraser },
  ]
  const hint = tool === 'highlight'
    ? coarse ? 'Swipe across text to highlight it, or tap a word or formula. Use the brush to highlight anywhere.' : 'Drag across text to highlight it, or click a word or formula. Use the brush to highlight anywhere.'
    : tool === 'marker'
      ? coarse ? 'Highlight anywhere with one finger. Use two fingers to scroll.' : 'Highlight anywhere: drag over text, margins or diagrams.'
    : tool === 'pen'
    ? coarse ? 'Draw with one finger. Use two fingers to scroll.' : 'Draw anywhere on the notes.'
    : tool === 'text'
      ? coarse ? 'Tap anywhere to type. LaTeX like $x^2$ works.' : 'Click anywhere to type. LaTeX like $x^2$ works.'
      : tool === 'eraser'
        ? 'Rub over drawings or text boxes to erase them.'
        : null

  return (
    <>
      <div
        ref={toolbarRef}
        className="lecture-ink-toolbar"
        role="toolbar"
        aria-label="Draw and write on the notes"
        // Changing color or size while typing keeps the text box open.
        onMouseDown={(event) => {
          if (editing && event.target instanceof Element && event.target.closest('.lecture-ink-options')) event.preventDefault()
        }}
      >
        <div className="lecture-ink-tools">
          {tools.map((item) => (
            <button
              key={item.label}
              className="lecture-ink-tool"
              type="button"
              aria-label={item.label}
              aria-pressed={tool === item.id}
              title={item.label}
              onClick={() => (item.id ? chooseTool(item.id) : onToolChange(null))}
            >
              <Icon>{item.icon}</Icon>
            </button>
          ))}
        </div>
        {(tool === 'pen' || tool === 'text') && (
          <div className="lecture-ink-options" role="group" aria-label={tool === 'pen' ? 'Pen color and size' : 'Text color and size'}>
            {PEN_COLORS.map((color) => (
              <button
                key={color.id}
                className="lecture-ink-swatch"
                type="button"
                data-ink={color.id}
                aria-label={`${color.label} ${tool === 'pen' ? 'ink' : 'text'}`}
                aria-pressed={(tool === 'pen' ? prefs.penColor : prefs.textColor) === color.id}
                title={color.label}
                onClick={() => {
                  updatePrefs(tool === 'pen' ? { penColor: color.id } : { textColor: color.id })
                  if (tool === 'text' && editing) setEditing({ ...editing, note: { ...editing.note, color: color.id } })
                }}
              />
            ))}
            <span className="lecture-ink-divider" aria-hidden="true" />
            {(tool === 'pen' ? PEN_SIZES : TEXT_SIZES).map((size, index) => (
              <button
                key={size}
                className="lecture-ink-size"
                type="button"
                aria-label={`${['Small', 'Medium', 'Large'][index]} ${tool === 'pen' ? 'pen' : 'text'}`}
                aria-pressed={(tool === 'pen' ? prefs.penSize : prefs.textSize) === size}
                title={['Small', 'Medium', 'Large'][index]}
                onClick={() => {
                  updatePrefs(tool === 'pen' ? { penSize: size } : { textSize: size })
                  if (tool === 'text' && editing) setEditing({ ...editing, note: { ...editing.note, size } })
                }}
              >
                {tool === 'pen'
                  ? <span className="lecture-ink-dot" style={{ width: size + 3, height: size + 3 }} />
                  : <span style={{ fontSize: 9 + index * 3 }}>A</span>}
              </button>
            ))}
          </div>
        )}
        {tool === 'highlight' && <div ref={highlightOptionsRef} className="lecture-ink-options" role="group" aria-label="Text highlight color" />}
        {tool === 'marker' && (
          <div className="lecture-ink-options" role="group" aria-label="Freehand highlighter color and size">
            {MARKER_COLORS.map((color) => (
              <button
                key={color.id}
                className="lecture-ink-swatch"
                type="button"
                data-marker={color.id}
                aria-label={`${color.label} freehand highlighter`}
                aria-pressed={prefs.markerColor === color.id}
                title={color.label}
                onClick={() => updatePrefs({ markerColor: color.id })}
              />
            ))}
            <span className="lecture-ink-divider" aria-hidden="true" />
            {MARKER_SIZES.map((size, index) => (
              <button
                key={size}
                className="lecture-ink-size"
                type="button"
                aria-label={`${['Thin', 'Medium', 'Thick'][index]} freehand highlighter`}
                aria-pressed={prefs.markerSize === size}
                title={['Thin', 'Medium', 'Thick'][index]}
                onClick={() => updatePrefs({ markerSize: size })}
              >
                <span className="lecture-ink-bar" data-marker={prefs.markerColor} style={{ height: 3 + index * 3 }} />
              </button>
            ))}
          </div>
        )}
        <div className="lecture-ink-history">
          <button className="lecture-ink-tool" type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={past.length === 0} onClick={undo}><Icon>{ICONS.undo}</Icon></button>
          <button className="lecture-ink-tool" type="button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={future.length === 0} onClick={redo}><Icon>{ICONS.redo}</Icon></button>
          {list.length > 0 && (
            <button className={`text-action lecture-ink-clear${clearArmed ? ' is-armed' : ''}`} type="button" title="Clear all drawings and text on this page" onClick={clearPage} onBlur={() => setClearArmed(false)}>
              {clearArmed ? 'Press again' : 'Clear all'}
            </button>
          )}
        </div>
        {hint && <p className="lecture-ink-hint">{hint}</p>}
      </div>

      <div ref={layerRef} className="lecture-ink-layer" data-tool={tool ?? undefined}>
        <svg className="lecture-ink-markers" aria-hidden="true">
          {markers.map(({ item, points }) => (
            <path key={item.id} d={smoothPath(points)} data-marker={item.color} strokeWidth={item.size} />
          ))}
          {tool === 'marker' && <path ref={draftRef} data-marker={prefs.markerColor} strokeWidth={prefs.markerSize} />}
        </svg>
        <svg className="lecture-ink-pens" aria-hidden="true">
          {pens.map(({ item, points }) => (
            <path key={item.id} d={smoothPath(points)} data-ink={item.color} strokeWidth={item.size} />
          ))}
          {draftIsPen && <path ref={draftRef} data-ink={prefs.penColor} strokeWidth={prefs.penSize} />}
        </svg>

        {tool && tool !== 'highlight' && (
          <div
            className="lecture-ink-capture"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerCancel}
            onContextMenu={(event) => event.preventDefault()}
            // A tap's follow-up mousedown would otherwise pull focus out of a text box it just opened.
            onMouseDown={(event) => event.preventDefault()}
          />
        )}

        {texts.map((item) => {
          if (editing?.note.id === item.id || erasing.has(item.id)) return null
          const [x, y] = toScreen(layout, item.block, item.x, item.y)
          return (
            <button
              key={item.id}
              ref={(element) => {
                if (element) textElements.current.set(item.id, element)
                else textElements.current.delete(item.id)
              }}
              className="lecture-ink-text"
              type="button"
              data-ink={item.color}
              title="Edit text"
              style={{ left: x, top: y, fontSize: item.size, maxWidth: Math.max(140, layout.left + layout.width - x) }}
              onClick={() => startEditing(item)}
            >
              <MathText text={item.text} />
            </button>
          )
        })}

        {editing && (() => {
          const [x, y] = toScreen(layout, editing.note.block, editing.note.x, editing.note.y)
          return (
            <div
              className="lecture-ink-editor"
              style={{ left: x, top: y, width: Math.max(160, Math.min(420, layout.left + layout.width - x)) }}
              onBlur={(event) => {
                if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) finishEditing()
              }}
            >
              <textarea
                ref={editorRef}
                autoFocus
                data-ink={editing.note.color}
                rows={1}
                value={editing.text}
                aria-label="Text on the notes"
                placeholder="Type here…"
                style={{ fontSize: editing.note.size }}
                onChange={(event) => setEditing({ ...editing, text: event.currentTarget.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
                    event.preventDefault()
                    event.stopPropagation()
                    finishEditing()
                  }
                }}
              />
              <div className="lecture-ink-editor-actions">
                <button
                  className="lecture-ink-tool"
                  type="button"
                  aria-label="Drag to move this text"
                  title="Drag to move"
                  style={{ cursor: 'move', touchAction: 'none' }}
                  onPointerDown={moveDown}
                  onPointerMove={moveMove}
                  onPointerUp={moveUp}
                  onPointerCancel={moveUp}
                >
                  <Icon>{ICONS.move}</Icon>
                </button>
                <button
                  className="lecture-ink-tool"
                  type="button"
                  aria-label="Delete this text"
                  title="Delete"
                  onClick={deleteEditing}
                >
                  <Icon>{ICONS.trash}</Icon>
                </button>
                <button className="lecture-ink-done" type="button" onClick={finishEditing}>Done</button>
              </div>
            </div>
          )
        })()}
      </div>
    </>
  )
}
