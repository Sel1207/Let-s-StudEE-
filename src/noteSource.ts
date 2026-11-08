/**
 * Rendered lecture notes mark every piece of text with where it came from in the note's source:
 * data-s and data-e hold the start and end offsets. Plain text maps one character to one
 * character; formulas, diagrams and other "atoms" (data-atom) only map as a whole.
 */

function pieceOf(node: Node, root: HTMLElement): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : node.parentElement
  const piece = element?.closest<HTMLElement>('[data-s]')
  return piece && root.contains(piece) ? piece : null
}

function bounds(piece: HTMLElement): [number, number] {
  return [Number(piece.dataset.s), Number(piece.dataset.e)]
}

/** Characters of `piece`'s text that come before the boundary point (node, offset). */
function textOffset(piece: HTMLElement, node: Node, offset: number): number {
  const before = document.createRange()
  before.selectNodeContents(piece)
  before.setEnd(node, offset)
  return before.toString().length
}

/** The part of the note's source that a selection in the rendered notes covers. */
export function selectionSourceRange(root: HTMLElement, range: Range): { start: number; end: number } | null {
  const pieces = Array.from(root.querySelectorAll<HTMLElement>('[data-s]')).filter((piece) => range.intersectsNode(piece))
  if (pieces.length === 0) return null
  const first = pieces[0]
  const last = pieces[pieces.length - 1]
  let [start] = bounds(first)
  let [, end] = bounds(last)
  if (!('atom' in first.dataset) && pieceOf(range.startContainer, root) === first) {
    start += textOffset(first, range.startContainer, range.startOffset)
  }
  if (!('atom' in last.dataset) && pieceOf(range.endContainer, root) === last) {
    end = bounds(last)[0] + textOffset(last, range.endContainer, range.endOffset)
  }
  return end > start ? { start, end } : null
}

const MARKERS: Array<[string, string]> = [['**', '**'], ['<u>', '</u>'], ['*', '*']]

function count(text: string, marker: string): number {
  // A single * never counts the halves of a ** pair.
  const plain = marker === '*' ? text.replaceAll('**', '') : text
  return plain.split(marker).length - 1
}

/**
 * Widens a cut so it never leaves half of a formatting pair behind: if the selection started
 * inside **bold** and ran past its end, the opening ** goes too (and the same at the far end).
 */
function widen(note: string, start: number, end: number): [number, number] {
  let from = start
  let to = end
  for (const [open, close] of MARKERS) {
    const cut = note.slice(from, to)
    const symmetric = open === close
    const extraClosers = symmetric ? count(cut, close) % 2 === 1 : count(cut, close) > count(cut, open)
    if (extraClosers && note.slice(from - open.length, from) === open && (open !== '*' || note[from - 2] !== '*')) from -= open.length
    const cutNow = note.slice(from, to)
    const extraOpeners = symmetric ? count(cutNow, open) % 2 === 1 : count(cutNow, open) > count(cutNow, close)
    if (extraOpeners && note.slice(to, to + close.length) === close && (close !== '*' || note[to + 1] !== '*')) to += close.length
  }
  return [from, to]
}

/** Removes source[start, end) from the note and tidies up markup the cut left empty. */
export function deleteNoteRange(note: string, start: number, end: number): string {
  const [from, to] = widen(note, start, end)
  return `${note.slice(0, from)}${note.slice(to)}`
    .replace(/\*\*\*\*|<u><\/u>|<span style="color:\s*#[\da-f]{6}"><\/span>/gi, '')
    .split('\n')
    .filter((line) => !/^\s*([-*+]|\d+[.)]|#{1,3})\s*$/.test(line))
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}
