export interface NoteLine {
  text: string
  marker: string | null
  afterGap: boolean
}

const LINE_OR_GAP = /(?:\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|[^\n])+|\n(?=\n)/g
const LIST_MARKER = /^\s*(?:([-*•])|(\d+[.)]))\s+/
const FIRST_LINE = /^(?:\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|[^\n])+/

export function splitNoteTitle(note: string): { title: string; body: string } {
  const text = note.replace(/\r\n?/g, '\n').trim()
  const firstLine = FIRST_LINE.exec(text)?.[0] ?? ''
  return {
    title: firstLine.replace(/^#+\s+/, '').replace(/^title:\s*/i, '').trim(),
    body: text.slice(firstLine.length).trim(),
  }
}

export function noteLines(note: string): NoteLine[] {
  const lines: NoteLine[] = []
  let afterGap = false
  for (const line of note.replace(/\r\n?/g, '\n').match(LINE_OR_GAP) ?? []) {
    if (!line.trim()) {
      afterGap = lines.length > 0
      continue
    }
    const list = LIST_MARKER.exec(line)
    lines.push({
      text: (list ? line.slice(list[0].length) : line).trim(),
      marker: list ? (list[2] ?? '•') : null,
      afterGap,
    })
    afterGap = false
  }
  return lines
}
