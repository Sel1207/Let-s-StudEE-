import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { EE_FOUNDATION_TOPICS, EE_TOPIC_SECTIONS, ESAS_TOPICS, MATH_TOPICS, type Topic } from './studyTypes'

const GROUPS = ['Math', 'EE', 'ESAS'] as const
type Group = (typeof GROUPS)[number]

const SECTIONS: readonly { group: Group; name: string; topics: readonly Topic[] }[] = [
  { group: 'Math', name: 'Math', topics: MATH_TOPICS },
  { group: 'EE', name: 'Electrical Fundamentals', topics: EE_FOUNDATION_TOPICS },
  ...EE_TOPIC_SECTIONS.map((section) => ({ group: 'EE' as const, ...section })),
  { group: 'ESAS', name: 'ESAS', topics: ESAS_TOPICS },
]

export default function LectureNotesPicker({
  topic,
  startIn,
  hasNotes,
  onOpen,
}: {
  topic?: Topic
  startIn?: Topic
  hasNotes: (topic: Topic) => boolean
  onOpen: (topic: Topic) => void
}) {
  const [filter, setFilter] = useState('')
  const [group, setGroup] = useState<Group>('Math')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const search = filter.trim().toLowerCase()
  // Searching looks through every group, so a topic can be found without knowing where it lives.
  const sections = SECTIONS
    .filter((section) => search || section.group === group)
    .map((section) => ({ ...section, topics: section.topics.filter((item) => item.toLowerCase().includes(search)) }))
    .filter((section) => section.topics.length > 0)

  function open() {
    flushSync(() => {
      setFilter('')
      const shownTopic = topic ?? startIn
      setGroup(SECTIONS.find((section) => shownTopic && section.topics.includes(shownTopic))?.group ?? 'Math')
    })
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
        <div className="segmented-control topic-group-toggle lecture-picker-groups" role="group" aria-label="Topic group">
          {GROUPS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={!search && group === item}
              onClick={() => {
                setFilter('')
                setGroup(item)
                dialogRef.current?.querySelector('.lecture-picker-list')?.scrollTo({ top: 0 })
              }}
            >
              {item}
            </button>
          ))}
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
              {(search || section.group === 'EE') && <h3>{section.name}</h3>}
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
