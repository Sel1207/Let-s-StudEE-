import { useEffect, useRef, useState } from 'react'
import MathText from './MathText'
import NoteText from './NoteText'
import { noteDetailsPrompt, stripOuterCodeFence } from './aiPromptContext'
import { splitNoteTitle } from './noteLines'
import type { StickyNote } from './stickyNotesStorage'
import type { Topic } from './studyTypes'
import { useCollapseOnOutsidePress } from './useCollapseOnOutsidePress'

function RenderedNote({ text }: { text: string }) {
  const { title, body } = splitNoteTitle(text)
  return (
    <>
      <MathText text={title} className="lecture-sticky-rendered-title" />
      {body && <NoteText text={body} />}
    </>
  )
}

export default function LectureStickyNotes({
  topic,
  group,
  notes,
  onSave,
  onDelete,
}: {
  topic: Topic
  group: string
  notes: StickyNote[]
  onSave: (id: string | null, text: string) => void
  onDelete: (ids: ReadonlySet<string>) => void
}) {
  const [editing, setEditing] = useState<{ id: string | null; original: string } | null>(null)
  const [mode, setMode] = useState<'preview' | 'edit'>('edit')
  const [draft, setDraft] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string> | null>(null)
  const [confirmingSelection, setConfirmingSelection] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const promptRef = useCollapseOnOutsidePress()
  const prompt = noteDetailsPrompt({ Section: group, Topic: topic }, { subject: 'this topic', titled: true })
  const cleanDraft = stripOuterCodeFence(draft)

  useEffect(() => {
    if (!editing) return
    if (!dialogRef.current?.open) dialogRef.current?.showModal()
    if (mode === 'edit') editorRef.current?.focus()
  }, [editing, mode])

  function open(note: StickyNote | null) {
    setDraft(note?.text ?? '')
    setMode(note ? 'preview' : 'edit')
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

  function toggleSelected(id: string) {
    const next = new Set(selectedIds)
    if (!next.delete(id)) next.add(id)
    setSelectedIds(next)
    setConfirmingSelection(false)
  }

  function stopSelecting() {
    setSelectedIds(null)
    setConfirmingSelection(false)
  }

  function deleteSelected() {
    if (!selectedIds?.size) return
    if (!confirmingSelection) {
      setConfirmingSelection(true)
      return
    }
    onDelete(selectedIds)
    stopSelecting()
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
        <div className="lecture-sticky-tools">
          {selectedIds ? (
            <>
              <button className="text-action" type="button" onClick={stopSelecting}>Cancel</button>
              <button className="secondary-action lecture-sticky-remove" type="button" disabled={selectedIds.size === 0} onClick={deleteSelected}>
                {confirmingSelection ? 'Press again to delete' : `Delete ${selectedIds.size} selected`}
              </button>
            </>
          ) : (
            <>
              {notes.length > 0 && <button className="secondary-action" type="button" onClick={() => setSelectedIds(new Set())}>Delete</button>}
              <button className="secondary-action" type="button" onClick={() => open(null)}>Add note</button>
            </>
          )}
        </div>
      </div>
      {notes.length > 0 && (
        <ul className="lecture-sticky-list">
          {notes.map((note) => {
            const title = <MathText text={splitNoteTitle(note.text).title} />
            return (
              <li key={note.id}>
                {selectedIds ? (
                  <label className={`lecture-sticky-note${selectedIds.has(note.id) ? ' is-selected' : ''}`}>
                    <input type="checkbox" checked={selectedIds.has(note.id)} onChange={() => toggleSelected(note.id)} />
                    {title}
                  </label>
                ) : (
                  <button className="lecture-sticky-note" type="button" onClick={() => open(note)}>{title}</button>
                )}
              </li>
            )
          })}
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
            <h2 id="lecture-sticky-dialog-title">{mode === 'preview' ? 'Sticky note' : editing?.id ? 'Edit sticky note' : 'Add a sticky note'}</h2>
          </div>
          <button className="text-action" type="button" onClick={close}>Close</button>
        </div>
        {mode === 'preview' ? (
          <button className="question-note-preview" type="button" aria-label="Edit this note" onClick={() => setMode('edit')}>
            <strong>Click note to edit</strong>
            <span><RenderedNote text={draft} /></span>
          </button>
        ) : (
          <>
            <label className="question-note-label lecture-sticky-label" htmlFor="lecture-sticky-text">Note (the first line is its title)</label>
            <textarea
              ref={editorRef}
              id="lecture-sticky-text"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              placeholder={'Title on the first line\n\nThen your shortcut, formula, or reminder. LaTeX such as $E=mc^2$ is supported.'}
              rows={6}
            />
            {cleanDraft && (
              <div className="lecture-sticky-live">
                <strong>Preview</strong>
                <span><RenderedNote text={cleanDraft} /></span>
              </div>
            )}
            <details ref={promptRef} className="question-note-ai-prompt">
              <summary>AI prompt for this note</summary>
              <textarea aria-label="AI prompt for this note" readOnly rows={8} value={prompt} />
              <button className="secondary-action" type="button" onClick={() => { void copyPrompt() }}>Copy AI prompt</button>
            </details>
          </>
        )}
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
          {mode === 'preview' ? (
            <button className="text-action" type="button" onClick={close}>Close</button>
          ) : (
            <>
              <button className="text-action" type="button" onClick={close}>Cancel</button>
              <button className="primary-action" type="button" onClick={() => save(cleanDraft)}>Save note</button>
            </>
          )}
        </div>
      </dialog>
    </section>
  )
}
