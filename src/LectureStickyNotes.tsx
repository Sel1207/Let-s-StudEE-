import { useEffect, useRef, useState } from 'react'
import NoteText from './NoteText'
import { noteDetailsPrompt, stripOuterCodeFence } from './aiPromptContext'
import type { StickyNote } from './stickyNotesStorage'
import type { Topic } from './studyTypes'
import { useCollapseOnOutsidePress } from './useCollapseOnOutsidePress'

export default function LectureStickyNotes({
  topic,
  group,
  notes,
  onSave,
}: {
  topic: Topic
  group: string
  notes: StickyNote[]
  onSave: (id: string | null, text: string) => void
}) {
  const [editing, setEditing] = useState<{ id: string | null; original: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [notice, setNotice] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const promptRef = useCollapseOnOutsidePress()
  const prompt = noteDetailsPrompt({ Section: group, Topic: topic }, 'this topic')

  useEffect(() => {
    if (!editing || dialogRef.current?.open) return
    dialogRef.current?.showModal()
    editorRef.current?.focus()
  }, [editing])

  function open(note: StickyNote | null) {
    setDraft(note?.text ?? '')
    setConfirmingDelete(false)
    setNotice('')
    setEditing({ id: note?.id ?? null, original: note?.text ?? '' })
  }

  function close() {
    dialogRef.current?.close()
  }

  function save(text: string) {
    if (editing) onSave(editing.id, text)
    close()
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setNotice('AI note prompt copied.')
      if (promptRef.current) promptRef.current.open = false
    } catch {
      setNotice('Could not copy the prompt. Select and copy the prompt text above.')
    }
  }

  return (
    <section className="lecture-sticky" aria-labelledby="lecture-sticky-title">
      <div className="lecture-sticky-heading">
        <h2 id="lecture-sticky-title">Sticky notes{notes.length > 0 && <span> {notes.length}</span>}</h2>
        <button className="secondary-action" type="button" onClick={() => open(null)}>Add note</button>
      </div>
      {notes.length > 0 && (
        <ul className="lecture-sticky-list">
          {notes.map((note) => (
            <li key={note.id}>
              <button className="lecture-sticky-note" type="button" aria-label="Edit this note" onClick={() => open(note)}>
                <NoteText text={note.text} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        className="question-note-dialog"
        aria-labelledby="lecture-sticky-dialog-title"
        onClose={() => setEditing(null)}
        onClick={(event) => {
          // A click out here may only be folding the prompt away, and must never lose typed text.
          if (event.target === event.currentTarget && !promptRef.current?.open && draft === editing?.original) close()
        }}
      >
        <div className="question-note-heading">
          <div>
            <p className="eyebrow">{topic}</p>
            <h2 id="lecture-sticky-dialog-title">{editing?.id ? 'Edit sticky note' : 'Add a sticky note'}</h2>
          </div>
          <button className="text-action" type="button" onClick={close}>Close</button>
        </div>
        <label className="question-note-label lecture-sticky-label" htmlFor="lecture-sticky-text">Note</label>
        <textarea
          ref={editorRef}
          id="lecture-sticky-text"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder="Add a shortcut, formula, or reminder. LaTeX such as $E=mc^2$ is supported."
          rows={6}
        />
        <details ref={promptRef} className="question-note-ai-prompt">
          <summary>AI prompt for this note</summary>
          <textarea aria-label="AI prompt for this note" readOnly rows={8} value={prompt} />
          <button className="secondary-action" type="button" onClick={() => { void copyPrompt() }}>Copy AI prompt</button>
        </details>
        {notice && <p className="session-notice" role="status">{notice}</p>}
        <div className="question-note-actions">
          {editing?.id && (
            <button
              className="text-action remove-question-note lecture-sticky-delete"
              type="button"
              onClick={() => {
                if (confirmingDelete) save('')
                else setConfirmingDelete(true)
              }}
            >
              {confirmingDelete ? 'Press again to delete' : 'Delete'}
            </button>
          )}
          <button className="text-action" type="button" onClick={close}>Cancel</button>
          <button className="primary-action" type="button" onClick={() => save(stripOuterCodeFence(draft))}>Save note</button>
        </div>
      </dialog>
    </section>
  )
}
