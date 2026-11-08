import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { EE_FOUNDATION_TOPICS, EE_TOPIC_SECTIONS, TOPIC_GROUPS, type StudyData, type Topic } from './studyTypes'
import {
  applyTopicMix, countOn, createTopicMix, displayPriority, invertTopics, isTopicOn, loadTopicMixes, MAX_PRIORITY,
  MAX_TOPIC_MIXES, mixMatches, resetPriorities, saveTopicMixes, setPriority, soloTopics, switchTopic, switchTopics,
  weakSpotPriorities, type TopicMix, type TopicPreferences,
} from './topicPriority'

type Group = (typeof TOPIC_GROUPS)[number]
type Filter = 'all' | 'on' | 'off'

const SHORT_GROUP: Record<Group['name'], string> = { Math: 'Math', 'Electrical Engineering': 'EE', ESAS: 'ESAS' }

/** Spreads hues around the wheel so neighbouring topics never share a colour. */
function topicHue(index: number): number {
  return Math.round((index * 137.508 + 152) % 360)
}

export default function TopicPriorityControls({
  data,
  onChangeData,
  group,
  counts,
  chances,
  topicsWithLectureNotes,
  onOpenLecture,
}: {
  data: StudyData
  onChangeData: (data: StudyData) => void
  group: Group
  counts: Record<Topic, number>
  chances: Record<Topic, number>
  topicsWithLectureNotes: Set<Topic>
  onOpenLecture: (topic: Topic) => void
}) {
  const preferences = data.topicPreferences
  const topics: readonly Topic[] = group.topics
  const sections: Array<{ name: string | null; topics: readonly Topic[] }> = group.name === 'Electrical Engineering'
    ? [{ name: 'Electrical Fundamentals', topics: EE_FOUNDATION_TOPICS }, ...EE_TOPIC_SECTIONS]
    : [{ name: null, topics }]
  const groupLabel = SHORT_GROUP[group.name]

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [undo, setUndo] = useState<{ label: string; before: TopicPreferences } | null>(null)
  const [mixes, setMixes] = useState<TopicMix[]>(loadTopicMixes)
  const [mixName, setMixName] = useState<string | null>(null)
  const [mixNotice, setMixNotice] = useState('')
  const [flashTopic, setFlashTopic] = useState<Topic | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!undo) return undefined
    const timer = window.setTimeout(() => setUndo(null), 9000)
    return () => window.clearTimeout(timer)
  }, [undo])

  useEffect(() => {
    if (!flashTopic) return undefined
    const timer = window.setTimeout(() => setFlashTopic(null), 1400)
    return () => window.clearTimeout(timer)
  }, [flashTopic])

  const onCount = countOn(preferences, topics)
  const poolQuestions = topics.reduce((total, topic) => total + (isTopicOn(preferences[topic]) ? counts[topic] : 0), 0)
  const shares = topics
    .map((topic, index) => ({ topic, share: chances[topic], hue: topicHue(index) }))
    .filter(({ share }) => share > 0)
  const groupMixes = mixes.filter((mix) => Object.keys(mix.preferences).some((topic) => topics.includes(topic as Topic)))

  function changeOne(topic: Topic, preference: TopicPreferences[Topic]) {
    onChangeData({ ...data, topicPreferences: { ...preferences, [topic]: preference } })
  }

  /** Bulk changes can be undone, since one tap can wipe a carefully tuned mix. */
  function changeMany(label: string, next: TopicPreferences) {
    setUndo({ label, before: preferences })
    onChangeData({ ...data, topicPreferences: next })
  }

  function undoBulk() {
    if (!undo) return
    onChangeData({ ...data, topicPreferences: undo.before })
    setUndo(null)
  }

  function saveMix() {
    const name = (mixName ?? '').trim()
    if (!name) return
    const others = mixes.filter((mix) => mix.name.toLowerCase() !== name.toLowerCase())
    if (others.length >= MAX_TOPIC_MIXES) {
      setMixNotice(`You can keep up to ${MAX_TOPIC_MIXES} mixes. Remove one first.`)
      return
    }
    const next = [createTopicMix(name, preferences, topics), ...others]
    if (!saveTopicMixes(next)) {
      setMixNotice('Could not save the mix. Check browser storage and try again.')
      return
    }
    setMixes(next)
    setMixName(null)
    setMixNotice(`Saved “${name}”.`)
  }

  function removeMix(mix: TopicMix) {
    const next = mixes.filter((item) => item.id !== mix.id)
    if (saveTopicMixes(next)) setMixes(next)
    setMixNotice(`Removed “${mix.name}”.`)
  }

  function jumpTo(topic: Topic) {
    setQuery('')
    setFilter('all')
    setFlashTopic(topic)
    window.requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-topic="${CSS.escape(topic)}"]`)
      const details = row?.closest('details')
      if (details && !details.open) details.open = true
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  const needle = query.trim().toLowerCase()
  function visible(topic: Topic) {
    if (needle && !topic.toLowerCase().includes(needle)) return false
    const on = isTopicOn(preferences[topic])
    return filter === 'all' || (filter === 'on' ? on : !on)
  }

  function renderTopic(topic: Topic) {
    const preference = preferences[topic]
    const on = isTopicOn(preference)
    const hasLectureNotes = topicsWithLectureNotes.has(topic)
    const style = { '--topic-hue': topicHue(topics.indexOf(topic)) } as CSSProperties
    return (
      <div className={`topic-row${on ? ' is-on' : ''}${flashTopic === topic ? ' is-flashing' : ''}`} key={topic} data-topic={topic} style={style}>
        <button
          className="topic-switch"
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${topic}, ${counts[topic]} question${counts[topic] === 1 ? '' : 's'}`}
          onClick={() => changeOne(topic, switchTopic(preference, !on))}
        >
          <span className="topic-switch-track" aria-hidden="true"><span /></span>
          <span className="topic-name">{topic}</span>
          <span className="topic-count">{counts[topic]}</span>
        </button>
        <div className="topic-weight">
          <PriorityMeter
            topic={topic}
            value={displayPriority(preference)}
            on={on}
            onChange={(weight) => changeOne(topic, setPriority(weight))}
          />
          <span className="topic-chance" title="Share of the questions you will get">{on ? `${Math.round(chances[topic])}%` : '—'}</span>
        </div>
        <button
          className={`topic-open-lecture${hasLectureNotes ? ' has-lecture-notes' : ''}`}
          type="button"
          aria-label={`Open ${topic} lecture${hasLectureNotes ? ' (notes available)' : ''}`}
          onClick={() => onOpenLecture(topic)}
        >
          Open lecture
        </button>
      </div>
    )
  }

  const anyVisible = topics.some(visible)

  return (
    <div className="priority-controls">
      <div className="priority-deck">
        <div className="priority-summary" aria-live="polite">
          <p><strong>{onCount}</strong> of {topics.length} {groupLabel} topics on <span>·</span> <strong>{poolQuestions}</strong> question{poolQuestions === 1 ? '' : 's'} in the pool</p>
        </div>

        <div className="priority-share" role="group" aria-label="Share of the pool by topic">
          {shares.length ? shares.map(({ topic, share, hue }) => (
            <button
              key={topic}
              type="button"
              className="priority-share-segment"
              style={{ flexGrow: share, '--topic-hue': hue } as CSSProperties}
              title={`${topic} · ${Math.round(share)}%`}
              aria-label={`${topic}, ${Math.round(share)} percent. Show it in the list.`}
              onClick={() => jumpTo(topic)}
            />
          )) : <span className="priority-share-empty">{onCount ? 'The topics that are on have no questions yet. Add some in Manage questions.' : 'No topics on. Turn some on to build your round.'}</span>}
        </div>

        <div className="priority-actions" role="group" aria-label={`Change all ${groupLabel} topics`}>
          <button type="button" disabled={onCount === topics.length} onClick={() => changeMany(`All ${groupLabel} topics turned on.`, switchTopics(preferences, topics, true))}>
            <Glyph d="M5 12.5l4.5 4.5L19 7.5" /> All on
          </button>
          <button type="button" disabled={onCount === 0} onClick={() => changeMany(`All ${groupLabel} topics turned off.`, switchTopics(preferences, topics, false))}>
            <Glyph d="M6 6l12 12M18 6L6 18" /> All off
          </button>
          <button type="button" onClick={() => changeMany('Selection flipped.', invertTopics(preferences, topics))}>
            <Glyph d="M7 7h11l-3-3M17 17H6l3 3" /> Flip
          </button>
          <button type="button" disabled={onCount === 0} onClick={() => changeMany('Priorities reset to 1×.', resetPriorities(preferences, topics))}>
            <Glyph d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /> Reset 1×
          </button>
          <button type="button" disabled={onCount === 0} title="Raises the priority of the topics you miss most" onClick={() => changeMany('Priorities set from your accuracy: weaker topics come up more.', weakSpotPriorities(data, topics))}>
            <Glyph d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7Z" /> Weak spots
          </button>
        </div>

        {undo && (
          <div className="priority-undo" role="status">
            <span>{undo.label}</span>
            <button type="button" onClick={undoBulk}>Undo</button>
          </div>
        )}

        <div className="priority-mixes" aria-label="Saved mixes">
          <span className="priority-mixes-label">Mixes</span>
          {groupMixes.map((mix) => {
            const current = mixMatches(preferences, mix)
            return (
              <span className={`priority-mix${current ? ' is-current' : ''}`} key={mix.id}>
                <button type="button" aria-pressed={current} onClick={() => changeMany(`Switched to “${mix.name}”.`, applyTopicMix(preferences, mix))}>{mix.name}</button>
                <button type="button" className="priority-mix-remove" aria-label={`Remove the ${mix.name} mix`} onClick={() => removeMix(mix)}>×</button>
              </span>
            )
          })}
          {mixName === null ? (
            <button type="button" className="priority-mix-add" onClick={() => { setMixNotice(''); setMixName('') }}>+ Save this mix</button>
          ) : (
            <form className="priority-mix-form" onSubmit={(event) => { event.preventDefault(); saveMix() }}>
              <input
                type="text"
                aria-label="Mix name"
                placeholder="Name it, e.g. Board week"
                maxLength={40}
                autoFocus
                value={mixName}
                onChange={(event) => setMixName(event.currentTarget.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') setMixName(null) }}
              />
              <button type="submit" disabled={!mixName.trim()}>Save</button>
              <button type="button" onClick={() => setMixName(null)}>Cancel</button>
            </form>
          )}
          {mixNotice && <span className="priority-mix-notice" role="status">{mixNotice}</span>}
        </div>

        <div className="priority-find">
          <input
            type="search"
            aria-label="Find a topic"
            placeholder="Find a topic"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <div className="segmented-control priority-filter" role="group" aria-label="Show topics">
            {(['all', 'on', 'off'] as const).map((value) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {value === 'all' ? 'All' : value === 'on' ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={listRef} className="topic-list" aria-label={`${group.name} topics`}>
        {sections.map((section) => {
          const shown = section.topics.filter(visible)
          if (!shown.length) return null
          if (!section.name) return shown.map(renderTopic)
          const sectionOn = countOn(preferences, section.topics)
          const state = sectionOn === 0 ? 'false' : sectionOn === section.topics.length ? 'true' : 'mixed'
          return (
            <details className="topic-list-section" key={section.name} open>
              <summary>
                <button
                  className="topic-section-switch"
                  type="button"
                  role="checkbox"
                  aria-checked={state}
                  aria-label={`${section.name}: ${sectionOn} of ${section.topics.length} on. Turn all ${state === 'true' ? 'off' : 'on'}.`}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    changeMany(`${section.name} turned ${state === 'true' ? 'off' : 'on'}.`, switchTopics(preferences, section.topics, state !== 'true'))
                  }}
                >
                  <span aria-hidden="true">{state === 'true' ? '✓' : state === 'mixed' ? '–' : ''}</span>
                </button>
                <h3>{section.name}</h3>
                <span className="topic-list-section-count">{sectionOn}/{section.topics.length} on</span>
                <button
                  className="topic-section-only"
                  type="button"
                  title={`Practise only ${section.name}`}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    changeMany(`Only ${section.name} is on.`, soloTopics(preferences, topics, section.topics))
                  }}
                >
                  Only these
                </button>
              </summary>
              {shown.map(renderTopic)}
            </details>
          )
        })}
        {!anyVisible && (
          <p className="priority-empty">
            No {filter === 'all' ? '' : `${filter} `}topics{needle ? ` match “${query.trim()}”` : ''}.{' '}
            <button type="button" className="text-link" onClick={() => { setQuery(''); setFilter('all') }}>Show all</button>
          </p>
        )}
      </div>
    </div>
  )
}

function Glyph({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
}

/** Five rising bars: tap or drag across them to set 1x–5x, or use the arrow keys. */
function PriorityMeter({ topic, value, on, onChange }: { topic: Topic; value: number; on: boolean; onChange: (weight: number) => void }) {
  const dragging = useRef(false)

  function weightAt(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = (event.clientX - rect.left) / Math.max(1, rect.width)
    return Math.max(1, Math.min(MAX_PRIORITY, Math.ceil(fraction * MAX_PRIORITY)))
  }

  function set(weight: number) {
    if (weight !== value || !on) onChange(weight)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? value + 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? value - 1
        : event.key === 'Home' ? 1
          : event.key === 'End' ? MAX_PRIORITY
            : /^[1-5]$/.test(event.key) ? Number(event.key)
              : null
    if (next === null) return
    event.preventDefault()
    set(Math.max(1, Math.min(MAX_PRIORITY, next)))
  }

  return (
    <>
      <div
        className={`priority-meter${on ? '' : ' is-off'}`}
        role="slider"
        tabIndex={0}
        aria-label={`${topic} priority`}
        aria-describedby="topic-priority-help"
        aria-valuemin={1}
        aria-valuemax={MAX_PRIORITY}
        aria-valuenow={value}
        aria-valuetext={`${value} times standard priority${on ? '' : ', topic off'}`}
        title={on ? `${value}× priority` : 'Off. Tap a bar to turn it on at that priority.'}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          dragging.current = true
          if (event.pointerType === 'mouse') event.currentTarget.setPointerCapture(event.pointerId)
          set(weightAt(event))
        }}
        onPointerMove={(event) => {
          if (dragging.current) set(weightAt(event))
        }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
        onLostPointerCapture={() => { dragging.current = false }}
      >
        {Array.from({ length: MAX_PRIORITY }, (_, index) => (
          <span key={index} className={index < value ? 'is-filled' : ''} style={{ height: `${36 + index * 16}%` }} />
        ))}
      </div>
      <span className="weight-value">{on ? `${value}×` : 'Off'}</span>
    </>
  )
}
