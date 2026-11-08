import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import LectureAnnotations, { type LectureHistory, type NoteEdit } from './LectureAnnotations'
import LectureHighlighter from './LectureHighlighter'
import LectureNotesPicker from './LectureNotesPicker'
import LectureStickyNotes from './LectureStickyNotes'
import MathText from './MathText'
import { raiseScripts, splitBareSubscripts, wrapBareSubscripts } from './noteSubscripts'
import { contestPreparationContext, selfCheckInstruction, shortcutGuidanceInstruction, stripOuterCodeFence, SVG_SUBSCRIPT_EXAMPLE, topicScopeInstruction } from './aiPromptContext'
import { EE_TOPIC_GUIDANCE, TOPIC_GROUPS, type Topic } from './studyTypes'
import { LECTURE_NOTES_STORAGE_KEY, loadLectureNotes } from './lectureNotesStorage'
import { deleteNoteRange, selectionSourceRange } from './noteSource'
import type { AnnotationTool } from './lectureInk'
import { loadStickyNotes, STICKY_NOTES_STORAGE_KEY, writeStickyNote, type StickyNotes } from './stickyNotesStorage'
import './lecture.css'

const mathShortcuts = [
  { label: 'Inline math', value: '$...$', start: 1, end: 4 },
  { label: 'Display math', value: '$$\n...\n$$', start: 3, end: 6 },
  { label: 'Fraction', value: '$\\frac{}{}$', start: 7, end: 7 },
  { label: 'Square root', value: '$\\sqrt{}$', start: 7, end: 7 },
  { label: 'Superscript', value: '$x^{}$', start: 4, end: 4 },
  { label: 'Subscript', value: '$x_{}$', start: 4, end: 4 },
] as const

function lectureSectionTopics(topic: Topic): readonly Topic[] {
  const groups: readonly (readonly Topic[])[] = TOPIC_GROUPS.map((group) => group.topics)
  return groups.find((topics) => topics.includes(topic)) ?? [topic]
}

function lectureNotesPrompt(topic: Topic, group: string): string {
  return `${contestPreparationContext(group)}

Create useful, concise lecture notes for the exact topic "${topic}" in ${group}. Start directly with the material. Do not create a crash course, master course, broad subject overview, competition forecast, practice-question set, or unrelated numbered sections.
${topicScopeInstruction(topic)}
${EE_TOPIC_GUIDANCE[topic] ? `For this EE topic, its intended scope is: ${EE_TOPIC_GUIDANCE[topic]}` : ''}

Explain only the concepts, terminology, assumptions, formulas, units, methods, and useful shortcuts needed to understand "${topic}". Keep related concepts only when they directly explain the topic; do not expand into neighboring topics. When this topic has valid shortcuts, include a concise "Shortcuts" section with explicit given-case-to-shortcut guidance (for example, "When [these conditions/givens] apply, use [this shortcut]"), its formula or steps, and any limits. Include a short example only if it clarifies a central concept or demonstrates when a shortcut applies. Be accurate, use consistent notation, and do not invent facts or add filler.
${shortcutGuidanceInstruction(topic)}

Write mathematical expressions in valid LaTeX using $...$ inline and $$...$$ for display equations. Use restrained bold emphasis and small tables only when they materially help.

DIAGRAMS
Include a diagram wherever the topic depends on a visual: circuit schematics (sources, resistors, inductors, capacitors, switches, meters, labeled nodes, current directions, polarities), phasor diagrams, waveforms, magnetic circuits, machine connections, single-line diagrams, vector or geometry figures, and graphs. Omit diagrams when text alone is clear. Place each diagram directly after the explanation it supports, and refer to its labels in the text.
Draw each diagram as compact inline SVG on its own lines, starting with <svg and ending with </svg>, with xmlns="http://www.w3.org/2000/svg" and a valid viewBox (about 400 to 640 wide). Use only these elements: svg, g, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, defs, marker, title, desc. Do not use scripts, styles, style attributes, class, CSS, external images, gradients, filters, or foreignObject.
The diagram must stay readable in both light and dark mode: do not draw a background rectangle; draw all lines, symbols, and text in black (#000000) with fill="none" on outlines; use stroke-width from 1 to 2; use at most one accent color (#d62828 or #1d4ed8) only to highlight a key current, voltage, or phasor. Draw resistors as zigzag paths, inductors as arcs, capacitors as two parallel plates, and sources as circles with + and - or a ~ symbol. Label every component and quantity with <text> using plain text (for example R1, 10 Ω, I1), with font-size from 12 to 16 and font-family="sans-serif". Never put LaTeX, $, _, ^, or backslashes inside SVG text: an underscore shows up literally, so "I_L" would display as I_L. Write every subscript with a tspan instead, for example ${SVG_SUBSCRIPT_EXAMPLE} draws I with subscript L; do the same for N<tspan baseline-shift="sub" font-size="10">L</tspan>, V<tspan baseline-shift="sub" font-size="10">s</tspan>, and similar labels.

NOTATION
Outside diagrams, wrap every variable that has a subscript or superscript in $...$, even inside a sentence or table: write $I_L$, $N_L$, $V_{s}$, never bare I_L, N_L, or V_s.

COPYABLE OUTPUT
Return the notes inside exactly one \`\`\`markdown code block, with no introduction or text outside it. Do not use nested code fences. The block must be ready to paste into the lecture notes editor.

${selfCheckInstruction({ diagrams: true })}`
}

const SVG_ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'marker', 'title', 'desc'])
const SVG_ATTRIBUTES = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'd', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule',
  'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'text-anchor', 'dominant-baseline', 'font-size',
  'font-family', 'font-weight', 'id', 'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight',
  'refX', 'refY', 'orient', 'preserveAspectRatio', 'baseline-shift', 'dx', 'dy',
])

function safeSvgSource(source: string): string | null {
  if (source.length > 200_000 || typeof DOMParser === 'undefined') return null
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (root.localName.toLowerCase() !== 'svg' || document.querySelector('parsererror')) return null
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) return null
  const dimensionScale = Math.min(640 / viewBox[2], 360 / viewBox[3])
  root.setAttribute('width', String(Math.max(1, Math.round(viewBox[2] * dimensionScale))))
  root.setAttribute('height', String(Math.max(1, Math.round(viewBox[3] * dimensionScale))))

  const sanitizeElement = (element: Element): boolean => {
    if (!SVG_ELEMENTS.has(element.localName.toLowerCase())) return false
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name
      const value = attribute.value.trim()
      if (name === 'stroke-width') {
        const strokeWidth = Number(value)
        if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) element.removeAttribute(name)
        else element.setAttribute(name, String(Math.min(strokeWidth, 2)))
        continue
      }
      if (!SVG_ATTRIBUTES.has(name)) {
        element.removeAttribute(name)
        continue
      }
      if (['fill', 'stroke'].includes(name) && !/^(#[\da-f]{3,8}|none|currentColor|black|white|red|blue|green|gray|grey)$/i.test(value)) {
        element.removeAttribute(name)
      } else if (name.startsWith('marker-') && !/^url\(#[\w-]+\)$/.test(value)) {
        element.removeAttribute(name)
      } else if (name === 'd' && !/^[a-z\d.,\s+e-]+$/i.test(value)) {
        element.removeAttribute(name)
      } else if (name === 'points' && !/^[\d.,\s+\-e]+$/i.test(value)) {
        element.removeAttribute(name)
      } else if (name === 'transform' && !/^(?:(?:translate|scale|rotate|matrix|skewX|skewY)\([\d.,\s+-]+\)\s*)+$/i.test(value)) {
        element.removeAttribute(name)
      } else if (!['fill', 'stroke', 'marker-start', 'marker-mid', 'marker-end', 'd', 'points', 'transform', 'font-family', 'id', 'xmlns', 'text-anchor', 'dominant-baseline', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule', 'orient', 'preserveAspectRatio'].includes(name) && !/^[\w.,%+\s-]+$/.test(value)) {
        element.removeAttribute(name)
      } else if (name === 'id' && !/^[\w-]+$/.test(value)) {
        element.removeAttribute(name)
      }
    }
    for (const child of Array.from(element.children)) {
      if (!sanitizeElement(child)) child.remove()
    }
    if (['text', 'tspan'].includes(element.localName.toLowerCase())) raiseScripts(element)
    return true
  }

  if (!sanitizeElement(root)) return null
  return new XMLSerializer().serializeToString(root)
}

function LectureSvgDiagram({ source, offset }: { source: string; offset: number }) {
  const safeSource = safeSvgSource(source)
  if (!safeSource) return null
  return <img className="lecture-diagram" title="Click to edit or fix this diagram" data-s={offset} data-e={offset + source.length} data-atom="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(safeSource)}`} alt="Diagram for these lecture notes" />
}

/** Pairs each consecutive piece of a string with where it starts. */
function withOffsets(pieces: string[], start: number, separator = 0): Array<[string, number]> {
  const starts = pieces.reduce<number[]>((list, _piece, index) => [...list, index === 0 ? start : list[index - 1] + pieces[index - 1].length + separator], [])
  return pieces.map((piece, index) => [piece, starts[index]])
}

// Every rendered piece carries its place in the note's source (see noteSource.ts), so a
// selection in the notes can be traced back to the exact markdown or LaTeX it came from.
function renderNoteInlineContent(text: string, keyPrefix: string, offset: number): ReactNode[] {
  const parts = text.split(/(<span style="color:\s*#[\da-f]{6}">[\s\S]+?<\/span>|\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\]|<u>[\s\S]+?<\/u>|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/gi)
  return withOffsets(parts, offset).map(([part, at], index) => {
    const key = `${keyPrefix}-${index}`
    if (!part) return null
    const colorMatch = /^<span style="color:\s*(#[\da-f]{6})">([\s\S]*)<\/span>$/i.exec(part)
    if (colorMatch) return <span key={key} style={{ color: colorMatch[1] }}>{renderNoteInlineContent(colorMatch[2], key, at + part.indexOf('>') + 1)}</span>
    if (part.startsWith('$') || part.startsWith('\\[') || part.startsWith('\\(')) {
      return <span key={key} data-s={at} data-e={at + part.length} data-atom=""><MathText text={part} /></span>
    }
    if (part.startsWith('<u>') && part.endsWith('</u>')) return <u key={key}>{renderNoteInlineContent(part.slice(3, -4), key, at + 3)}</u>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{renderNoteInlineContent(part.slice(2, -2), key, at + 2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={key}>{renderNoteInlineContent(part.slice(1, -1), key, at + 1)}</em>
    const pieces = splitBareSubscripts(part)
    return withOffsets(pieces.map((piece) => piece.text), at).map(([pieceText, pieceStart], pieceIndex) => (
      pieces[pieceIndex].math
        ? <span key={`${key}-${pieceIndex}`} data-s={pieceStart} data-e={pieceStart + pieceText.length} data-atom=""><MathText text={wrapBareSubscripts(pieceText)} /></span>
        : <span key={`${key}-${pieceIndex}`} data-s={pieceStart} data-e={pieceStart + pieceText.length}>{pieceText}</span>
    ))
  })
}

function LectureNoteTextBlock({ text, offset }: { text: string; offset: number }) {
  const lines = text.split('\n')
  const lineStarts = withOffsets(lines, offset, 1).map(([, start]) => start)
  const firstTrimmed = lines[0].trim()
  const heading = /^(#{1,3})\s+(.+)$/.exec(firstTrimmed)
  if (heading && lines.length === 1) {
    const lead = lines[0].length - lines[0].trimStart().length
    const content = renderNoteInlineContent(heading[2], 'heading', offset + lead + heading[0].length - heading[2].length)
    if (heading[1].length === 1) return <h2>{content}</h2>
    if (heading[1].length === 2) return <h3>{content}</h3>
    return <h4>{content}</h4>
  }

  const listItems = lines.map((line) => /^(\s*)([-*+]|\d+[.)])\s+(.+)$/.exec(line))
  if (listItems.every(Boolean)) {
    const ordered = /^\d/.test(listItems[0]?.[2] ?? '')
    const List = ordered ? 'ol' : 'ul'
    return <List>{listItems.map((item, index) => (
      <li key={index}>{renderNoteInlineContent(item?.[3] ?? '', `list-${index}`, lineStarts[index] + lines[index].length - (item?.[3].length ?? 0))}</li>
    ))}</List>
  }

  if (lines.length > 1 && lines.every((line) => line.trim().startsWith('|'))) {
    const rows = lines.map((line, lineIndex) => {
      const trimmed = line.trim()
      const first = lineStarts[lineIndex] + line.length - line.trimStart().length + (trimmed.startsWith('|') ? 1 : 0)
      return withOffsets(trimmed.replace(/^\||\|$/g, '').split('|'), first, 1)
        .map(([raw, start]) => ({ text: raw.trim(), offset: start + raw.length - raw.trimStart().length }))
    })
    const bodyRows = rows.filter((row, index) => index !== 1 || !row.every((cell) => /^:?-{3,}:?$/.test(cell.text)))
    // data-block-* (not data-s/e) so text selection inside cells still maps to the cell text.
    return <div className="lecture-table-scroll" data-block-s={offset} data-block-e={offset + text.length} title="Click to edit or fix this table"><table>
      <thead><tr>{bodyRows[0]?.map((cell, index) => <th key={index}>{renderNoteInlineContent(cell.text, `table-heading-${index}`, cell.offset)}</th>)}</tr></thead>
      <tbody>{bodyRows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderNoteInlineContent(cell.text, `table-${rowIndex}-${cellIndex}`, cell.offset)}</td>)}</tr>)}</tbody>
    </table></div>
  }

  return <p>{renderNoteInlineContent(text, 'note', offset)}</p>
}

/** An AI reply pasted back in usually comes wrapped in a ```markdown fence; keep only its inside. */
function cleanPastedSource(text: string): string {
  return /^\s*```/.test(text) ? stripOuterCodeFence(text) : text
}

function LectureNoteContent({ note }: { note: string }) {
  return <>{withOffsets(note.split(/(<svg\b[\s\S]*?<\/svg>)/gi), 0).map(([block, offset], index) => {
    if (!block.trim()) return null
    if (/^<svg\b/i.test(block)) return <LectureSvgDiagram key={`diagram-${index}`} source={block} offset={offset} />
    return withOffsets(block.split(/(\n{2,})/), offset).map(([paragraph, paragraphOffset], paragraphIndex) => {
      if (!paragraph.trim() || /^\n+$/.test(paragraph)) return null
      return <LectureNoteTextBlock key={`paragraph-${index}-${paragraphIndex}`} text={paragraph} offset={paragraphOffset} />
    })
  })}</>
}

export default function LectureScreen({
  topic,
  previousTopic: openedBefore,
  onBack,
  onStartWrittenTest,
  onNotesChange,
  onChangeTopic,
  onBacktrack,
  onManageQuestions,
}: {
  topic: Topic
  previousTopic?: Topic
  onBack: () => void
  onStartWrittenTest: () => void
  onNotesChange: (topic: Topic, hasNotes: boolean) => void
  onChangeTopic: (topic: Topic) => void
  onBacktrack: () => void
  onManageQuestions: () => void
}) {
  const [savedState] = useState(loadLectureNotes)
  const [notes, setNotes] = useState(savedState.notes)
  const [savedStickyState] = useState(loadStickyNotes)
  const [stickyNotes, setStickyNotes] = useState(savedStickyState.notes)
  const [saveNotice, setSaveNotice] = useState(savedState.error || savedStickyState.error || 'Saved on this device')
  const [promptNotice, setPromptNotice] = useState('')
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool | null>(null)
  const [highlightOptions, setHighlightOptions] = useState<HTMLDivElement | null>(null)
  const [noteEdit, setNoteEdit] = useState<{ topic: Topic; edit: NoteEdit } | null>(null)
  const [deletedToast, setDeletedToast] = useState<number | null>(null)
  const [sourceEdit, setSourceEdit] = useState<{ start: number; end: number; original: string; text: string } | null>(null)
  const sourceEditRef = useRef<HTMLDialogElement>(null)
  const [sourceEditNotice, setSourceEditNotice] = useState('')
  const historyRef = useRef<LectureHistory | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const noteDialogRef = useRef<HTMLDialogElement>(null)
  const promptRef = useRef<HTMLDetailsElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const note = notes[topic] ?? ''
  const topicGroup = TOPIC_GROUPS.find((group) => group.topics.some((item) => item === topic))?.name ?? 'Study'
  const prompt = lectureNotesPrompt(topic, topicGroup)
  const sectionTopics = lectureSectionTopics(topic)
  const topicIndex = sectionTopics.indexOf(topic)
  const previousTopic = sectionTopics[topicIndex - 1]
  const nextTopic = sectionTopics[topicIndex + 1]

  useEffect(() => {
    function closePrompt() {
      if (promptRef.current?.open) promptRef.current.open = false
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && promptRef.current?.contains(target)) return
      closePrompt()
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closePrompt()
    }
    function handleVisibility() {
      if (document.hidden) closePrompt()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('hashchange', closePrompt)
    window.addEventListener('popstate', closePrompt)
    return () => {
      closePrompt()
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('hashchange', closePrompt)
      window.removeEventListener('popstate', closePrompt)
    }
  }, [])

  function leaveTopic(go: () => void) {
    if (promptRef.current) promptRef.current.open = false
    setPromptNotice('')
    go()
    window.scrollTo({ top: 0 })
  }

  function changeTopic(nextTopic: Topic) {
    leaveTopic(() => onChangeTopic(nextTopic))
  }

  function updateNotes(value: string) {
    const fencedOutput = /^\s*```(?:html|text|markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i.exec(value)
    const cleanedValue = fencedOutput ? fencedOutput[1].trim() : value
    const nextNotes = { ...notes, [topic]: cleanedValue }
    setNotes(nextNotes)
    try {
      window.localStorage.setItem(LECTURE_NOTES_STORAGE_KEY, JSON.stringify(nextNotes))
      onNotesChange(topic, cleanedValue.trim().length > 0 || (stickyNotes[topic]?.length ?? 0) > 0)
      setSaveNotice('Saved on this device')
    } catch (error) {
      console.error('Could not save lecture notes.', error)
      setSaveNotice('Could not save your notes. Check browser storage and try again.')
    }
  }

  useEffect(() => {
    if (deletedToast === null) return undefined
    const timer = window.setTimeout(() => setDeletedToast(null), 10_000)
    return () => window.clearTimeout(timer)
  }, [deletedToast])

  // Deleting a selection removes exactly that part of the markdown and LaTeX source.
  function deleteSelection(range: Range) {
    const paper = paperRef.current
    const span = paper && selectionSourceRange(paper, range)
    if (!span) {
      setSaveNotice('That selection could not be matched to the notes. Edit it in “Edit notes / LaTeX”.')
      return
    }
    // The deletion joins the notebook toolbar's undo history, alongside drawings and text boxes.
    setDeletedToast(changeNote(deleteNoteRange(note, span.start, span.end)))
  }

  /** Saves a change to the note's text as one step in the notebook's undo history. */
  function changeNote(after: string): number {
    const edit = { id: Date.now(), before: note, after }
    setNoteEdit({ topic, edit })
    updateNotes(after)
    return edit.id
  }

  function restoreNote(value: string) {
    updateNotes(value)
  }

  // Edit opens only the selected part's own source, so a typo or bad LaTeX can be fixed in place.
  function editSelection(range: Range) {
    const paper = paperRef.current
    const span = paper && selectionSourceRange(paper, range)
    if (!span) {
      setSaveNotice('That selection could not be matched to the notes. Edit it in “Edit notes / LaTeX”.')
      return
    }
    const original = note.slice(span.start, span.end)
    setSourceEditNotice('')
    setSourceEdit({ ...span, original, text: original })
  }

  function saveSourceEdit() {
    if (!sourceEdit) return
    const text = cleanPastedSource(sourceEdit.text)
    if (text !== sourceEdit.original) {
      changeNote(`${note.slice(0, sourceEdit.start)}${text}${note.slice(sourceEdit.end)}`)
    }
    sourceEditRef.current?.close()
  }

  useEffect(() => {
    const dialog = sourceEditRef.current
    if (sourceEdit && dialog && !dialog.open) dialog.showModal()
  }, [sourceEdit])

  async function copySourceBlock() {
    if (!sourceEdit) return
    try {
      await navigator.clipboard.writeText(sourceEdit.text)
      setSourceEditNotice('Copied. Ask your AI to fix it, then paste its answer into the box above and Save.')
    } catch (error) {
      console.error('Could not copy the selected source.', error)
      setSourceEditNotice('Could not copy. Select the text in the box and copy it instead.')
    }
  }

  // In reading mode, clicking a diagram or a table opens its source for fixing. A table click only
  // counts when no text is selected, so selecting cell text for Edit/Delete still works.
  function openDiagramEditor(event: React.MouseEvent<HTMLDivElement>) {
    if (annotationTool) return
    const target = event.target
    if (!(target instanceof Element)) return
    let start: number
    let end: number
    if (target instanceof HTMLImageElement && target.classList.contains('lecture-diagram')) {
      start = Number(target.dataset.s)
      end = Number(target.dataset.e)
    } else {
      const table = target.closest<HTMLElement>('.lecture-table-scroll[data-block-s]')
      const selection = window.getSelection()
      if (!table || (selection && !selection.isCollapsed)) return
      start = Number(table.dataset.blockS)
      end = Number(table.dataset.blockE)
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    const original = note.slice(start, end)
    setSourceEditNotice('')
    setSourceEdit({ start, end, original, text: original })
  }

  function undoDelete() {
    if (deletedToast !== null) historyRef.current?.undoNoteEdit(deletedToast)
    setDeletedToast(null)
  }

  function saveStickyNote(id: string | null, text: string) {
    persistStickyNotes(writeStickyNote(stickyNotes, topic, id, text))
  }

  function deleteStickyNotes(ids: ReadonlySet<string>) {
    persistStickyNotes([...ids].reduce((current, id) => writeStickyNote(current, topic, id, ''), stickyNotes))
  }

  function persistStickyNotes(nextNotes: StickyNotes) {
    setStickyNotes(nextNotes)
    try {
      window.localStorage.setItem(STICKY_NOTES_STORAGE_KEY, JSON.stringify(nextNotes))
      onNotesChange(topic, note.trim().length > 0 || (nextNotes[topic]?.length ?? 0) > 0)
      setSaveNotice('Saved on this device')
    } catch (error) {
      console.error('Could not save sticky notes.', error)
      setSaveNotice('Could not save your notes. Check browser storage and try again.')
    }
  }

  function openEditor() {
    if (!noteDialogRef.current?.open) noteDialogRef.current?.showModal()
  }

  function closeEditor() {
    if (noteDialogRef.current?.open) noteDialogRef.current.close()
  }

  function insertShortcut(value: string, selectionStart: number, selectionEnd: number) {
    const editor = editorRef.current
    if (!editor) return
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const nextNote = `${note.slice(0, start)}${value}${note.slice(end)}`
    updateNotes(nextNote)
    window.requestAnimationFrame(() => {
      editor.focus()
      editor.setSelectionRange(start + selectionStart, start + selectionEnd)
    })
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setPromptNotice('Lecture prompt copied. Paste it into your AI chat.')
    } catch (error) {
      console.error('Could not copy the lecture notes prompt.', error)
      setPromptNotice('Could not copy the prompt. Select the prompt text below and copy it.')
    }
  }

  return (
    <section
      className="lecture-view"
      aria-labelledby="lecture-title"
      onClick={(event) => {
        const target = event.target
        if (target instanceof Element && target.closest('.lecture-ai-prompt')) return
        if (promptRef.current) promptRef.current.open = false
      }}
    >
      <div className="lecture-toolbar">
        <button className="lecture-back-button" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to topics
        </button>
        <LectureNotesPicker
          topic={topic}
          hasNotes={(item) => (notes[item] ?? '').trim().length > 0 || (stickyNotes[item]?.length ?? 0) > 0}
          onOpen={changeTopic}
        />
        {openedBefore && (
          <button className="lecture-back-button lecture-backtrack" type="button" title={`Back to ${openedBefore}`} onClick={() => leaveTopic(onBacktrack)}>
            <span aria-hidden="true">↩</span> <span className="lecture-backtrack-label">{openedBefore}</span>
          </button>
        )}
        <nav className="lecture-topic-nav" aria-label={`${topicGroup} lecture notes`}>
          {previousTopic && (
            <button type="button" title={`Previous: ${previousTopic}`} onClick={() => changeTopic(previousTopic)}>
              <span aria-hidden="true">‹</span>
              <span className="lecture-topic-nav-label"><small>Back</small><span>{previousTopic}</span></span>
            </button>
          )}
          {nextTopic && (
            <button type="button" title={`Next: ${nextTopic}`} onClick={() => changeTopic(nextTopic)}>
              <span className="lecture-topic-nav-label"><small>Next</small><span>{nextTopic}</span></span>
              <span aria-hidden="true">›</span>
            </button>
          )}
        </nav>
      </div>
      <header className="lecture-heading">
        <div>
          <p className="eyebrow">Study lecture notebook · {topicGroup}</p>
          <h1 id="lecture-title">{topic}</h1>
          <p>Build your own organized lecture notes. Notes save automatically on this device.</p>
        </div>
        <div className="lecture-heading-actions">
          <span className="lecture-save-status" role="status">{saveNotice}</span>
          <button className="primary-action lecture-test-button" type="button" onClick={onStartWrittenTest}>
            Take {topic} written test
          </button>
          <button className="secondary-action" type="button" onClick={openEditor}>Edit notes / LaTeX</button>
          <button className="secondary-action" type="button" onClick={onManageQuestions}>Manage questions</button>
        </div>
      </header>

      <details ref={promptRef} className="lecture-ai-prompt">
        <summary>Copy AI prompt to create lecture notes</summary>
        <p>Copy this topic-specific prompt into your AI chat, then paste the finished notes into your notebook.</p>
        <textarea aria-label={`AI lecture notes prompt for ${topic}`} readOnly rows={12} value={prompt} />
        <div className="lecture-prompt-actions">
          <button className="secondary-action" type="button" onClick={() => { void copyPrompt() }}>Copy lecture prompt</button>
          {promptNotice && <span role="status">{promptNotice}</span>}
        </div>
      </details>

      <LectureStickyNotes key={topic} topic={topic} group={topicGroup} notes={stickyNotes[topic] ?? []} onSave={saveStickyNote} onDelete={deleteStickyNotes} />

      <article className="lecture-notebook" aria-label={`${topic} lecture notebook`}>
        <LectureAnnotations key={topic} topic={topic} note={note} paperRef={paperRef} tool={annotationTool} onToolChange={setAnnotationTool} highlightOptionsRef={setHighlightOptions} noteEdit={noteEdit?.topic === topic ? noteEdit.edit : null} onRestoreNote={restoreNote} historyRef={historyRef} onSaveProblem={setSaveNotice} />
        <div ref={paperRef} className="lecture-notebook-paper" onClick={openDiagramEditor}>
          {note.trim()
            ? <LectureNoteContent note={note} />
            : <p className="lecture-notebook-empty">Your lecture notes will appear here. Use the AI prompt above to create a first draft, then paste it using “Edit notes / LaTeX”.</p>}
        </div>
        {note.trim() && <LectureHighlighter key={topic} topic={topic} note={note} paperRef={paperRef} active={annotationTool === 'highlight'} optionsSlot={highlightOptions} onExit={() => setAnnotationTool(null)} onDeleteSelection={deleteSelection} onEditSelection={editSelection} onSaveProblem={setSaveNotice} />}
      </article>
      {deletedToast !== null && (
        <div className="lecture-undo-toast" role="status">
          <span>Text deleted from your notes.</span>
          <button className="text-action" type="button" aria-label="Undo delete" onClick={undoDelete}>Undo</button>
        </div>
      )}
      <button
        className="secondary-action lecture-back-to-top"
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <span aria-hidden="true">↑</span> Back to top
      </button>

      <dialog
        ref={sourceEditRef}
        className="lecture-editor-dialog lecture-source-edit"
        aria-labelledby="lecture-source-edit-title"
        onClose={() => setSourceEdit(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        {sourceEdit && <>
          <div className="lecture-editor-dialog-heading">
            <div>
              <p className="eyebrow">{topic}</p>
              <h2 id="lecture-source-edit-title">{/^\s*<svg\b/i.test(sourceEdit.original) ? 'Edit diagram' : /^\s*\|/.test(sourceEdit.original) ? 'Edit table' : 'Edit selected text'}</h2>
            </div>
            <button className="text-action" type="button" onClick={() => sourceEditRef.current?.close()}>Cancel</button>
          </div>
          <p className="lecture-editor-help">Only this part of your notes changes. Fix it here, or copy it to your AI and paste the corrected version back in. LaTeX goes between $...$ for inline math or $$...$$ for display math.</p>
          <div className="lecture-source-edit-ai">
            <button className="secondary-action" type="button" onClick={() => { void copySourceBlock() }}>Copy</button>
            {sourceEdit.text !== sourceEdit.original && <button className="text-action" type="button" onClick={() => setSourceEdit({ ...sourceEdit, text: sourceEdit.original })}>Reset to original</button>}
            {sourceEditNotice && <span role="status">{sourceEditNotice}</span>}
          </div>
          <textarea
            className="lecture-editor lecture-source-edit-input"
            aria-label="Selected text and LaTeX"
            autoFocus
            value={sourceEdit.text}
            onChange={(event) => setSourceEdit({ ...sourceEdit, text: event.currentTarget.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                saveSourceEdit()
              }
            }}
            spellCheck
          />
          <div className="lecture-source-edit-preview" aria-label="Preview">
            <strong>Preview</strong>
            <div className="lecture-notebook-paper">{cleanPastedSource(sourceEdit.text).trim() ? <LectureNoteContent note={cleanPastedSource(sourceEdit.text)} /> : <p className="lecture-notebook-empty">This part will be removed.</p>}</div>
          </div>
          <div className="lecture-editor-dialog-actions">
            <span>Ctrl+Enter saves. Undo at the top of the notebook reverts it.</span>
            <button className="primary-action" type="button" onClick={saveSourceEdit}>Save</button>
          </div>
        </>}
      </dialog>

      <dialog
        ref={noteDialogRef}
        className="lecture-editor-dialog"
        aria-labelledby="lecture-editor-title"
        onCancel={(event) => {
          event.preventDefault()
          closeEditor()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeEditor()
        }}
      >
        <div className="lecture-editor-dialog-heading">
          <div>
            <p className="eyebrow">{topic}</p>
            <h2 id="lecture-editor-title">Edit lecture notes and LaTeX</h2>
          </div>
          <button className="text-action" type="button" onClick={closeEditor}>Close</button>
        </div>
        <p className="lecture-editor-help">
          Type or paste the entire AI markdown code block here; its outer fence is removed automatically. LaTeX formulas, headings, lists, tables, and safe SVG diagrams are supported.
        </p>
        <div className="lecture-shortcuts" role="group" aria-label="Insert LaTeX shortcut">
          {mathShortcuts.map((shortcut) => (
            <button
              key={shortcut.label}
              className="secondary-action"
              type="button"
              title={`Insert ${shortcut.label}`}
              onClick={() => insertShortcut(shortcut.value, shortcut.start, shortcut.end)}
            >
              {shortcut.label}
            </button>
          ))}
        </div>
        <textarea
          ref={editorRef}
          className="lecture-editor"
          aria-label={`${topic} lecture notes`}
          value={note}
          onChange={(event) => updateNotes(event.currentTarget.value)}
          placeholder={`Paste your ${topic} lecture notes here. LaTeX is supported, for example $y(t)=Ce^{-at}$ or $$\\frac{a}{b}$$.`}
          spellCheck
        />
        <div className="lecture-editor-dialog-actions">
          <span role="status">{saveNotice}</span>
          <button className="primary-action" type="button" onClick={closeEditor}>Done</button>
        </div>
      </dialog>
    </section>
  )
}
