import { useRef, useState } from 'react'
import { EE_FOUNDATION_TOPICS, EE_TOPIC_SECTIONS, ESAS_TOPICS, MATH_TOPICS, type Topic } from './studyTypes'

const SECTIONS: readonly { name: string; topics: readonly Topic[] }[] = [
  { name: 'Math', topics: MATH_TOPICS },
  { name: 'Electrical Fundamentals', topics: EE_FOUNDATION_TOPICS },
  ...EE_TOPIC_SECTIONS,
  { name: 'ESAS', topics: ESAS_TOPICS },
]

export default function LectureNotesPicker({
  topic,
  hasNotes,
  onOpen,
}: {
  topic: Topic
  hasNotes: (topic: Topic) => boolean
  onOpen: (topic: Topic) => void
}) {
  const [filter, setFilter] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const search = filter.trim().toLowerCase()
  const sections = SECTIONS
    .map((section) => ({ ...section, topics: section.topics.filter((item) => item.toLowerCase().includes(search)) }))
    .filter((section) => section.topics.length > 0)

  function open() {
    setFilter('')
    dialogRef.current?.showModal()
    dialogRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' })
    // Only keyboards get the search box focused: on a phone it would pop up the on-screen keyboard.
    if (window.matchMedia('(pointer: fine)').matches) filterRef.current?.focus()
  }

  function close() {
    dialogRef.current?.close()
  }

  function choose(nextTopic: Topic) {
    close()
    if (nextTopic !== topic) onOpen(nextTopic)
  }

  return (
    <>
      <button className="lecture-back-button" type="button" onClick={open}>Open notes</button>
      <dialog
        ref={dialogRef}
        className="lecture-editor-dialog lecture-picker-dialog"
        aria-labelledby="lecture-picker-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <div className="lecture-editor-dialog-heading">
          <h2 id="lecture-picker-title">Open notes</h2>
          <button className="text-action" type="button" onClick={close}>Close</button>
        </div>
        <input
          ref={filterRef}
          className="lecture-picker-filter"
          type="search"
          aria-label="Find a topic"
          placeholder="Find a topic"
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && sections[0]) choose(sections[0].topics[0])
          }}
        />
        <div className="lecture-picker-list">
          {sections.map((section) => (
            <section key={section.name}>
              <h3>{section.name}</h3>
              <div className="lecture-picker-topics">
                {section.topics.map((item) => (
                  <button key={item} type="button" aria-current={item === topic} onClick={() => choose(item)}>
                    <span>{item}</span>
                    {item === topic
                      ? <small>Open now</small>
                      : hasNotes(item) && <small className="has-notes">Notes</small>}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {sections.length === 0 && <p className="lecture-picker-empty">No topics match “{filter.trim()}”.</p>}
        </div>
      </dialog>
    </>
  )
}
