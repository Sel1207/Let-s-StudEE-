import MathText from './MathText'
import { noteLines } from './noteLines'

export default function NoteText({ text }: { text: string }) {
  return <span className="note-text">{noteLines(text).map((line, index) => (
    <span className={`note-line${line.marker ? ' note-line-item' : ''}${line.afterGap ? ' note-line-after-gap' : ''}`} key={index}>
      {line.marker && <span className="note-line-marker" aria-hidden="true">{line.marker}</span>}
      <MathText text={line.text} />
    </span>
  ))}</span>
}
