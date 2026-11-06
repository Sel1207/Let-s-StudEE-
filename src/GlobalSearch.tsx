import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { loadCompetitionStorage } from './competitionData'
import { loadLectureNotes } from './lectureNotesStorage'
import { loadStickyNotes, withStickyNoteText } from './stickyNotesStorage'
import { normalize, prepareSearchIndex, runSearch, searchTokens, buildSearchIndex, type SearchKind, type SearchTarget } from './searchIndex'
import type { StudyData } from './studyTypes'
import './search.css'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="search-glyph">
      <circle cx="10.5" cy="10.5" r="6.25" />
      <path d="m15.25 15.25 4.5 4.5" />
    </svg>
  )
}

function KindIcon({ kind }: { kind: SearchKind }) {
  const paths: Record<SearchKind, ReactNode> = {
    page: <><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M9 9.5h6M9 13h6M9 16.5h3.5" /></>,
    setting: <><circle cx="12" cy="12" r="2.75" /><path d="M12 3.75v2.5M12 17.75v2.5M3.75 12h2.5M17.75 12h2.5M6.2 6.2l1.75 1.75M16.05 16.05l1.75 1.75M6.2 17.8l1.75-1.75M16.05 7.95l1.75-1.75" /></>,
    topic: <><path d="M4.5 6.5 12 3.5l7.5 3-7.5 3z" /><path d="m4.5 12 7.5 3 7.5-3M4.5 17.5l7.5 3 7.5-3" /></>,
    question: <><circle cx="12" cy="12" r="8.25" /><path d="M9.6 9.6a2.45 2.45 0 1 1 3.4 2.25c-.65.3-1 .8-1 1.5v.4" /><path d="M12 16.9h.01" /></>,
    competition: <><path d="M8 4.5h8v4.25a4 4 0 0 1-8 0z" /><path d="M8 6H5.25a2.75 2.75 0 0 0 2.9 3.6M16 6h2.75a2.75 2.75 0 0 1-2.9 3.6M12 12.75v3.5M8.75 19.5h6.5M10 16.25h4" /></>,
    'competition-question': <><path d="M8 4.5h8v4.25a4 4 0 0 1-8 0z" /><path d="M12 12.75v3.5M8.75 19.5h6.5M10 16.25h4" /></>,
    favorite: <path d="M12 19.25s-7-4.2-7-9.4A3.85 3.85 0 0 1 12 7.6a3.85 3.85 0 0 1 7 2.25c0 5.2-7 9.4-7 9.4z" />,
    lecture: <><path d="M5 5.25A1.75 1.75 0 0 1 6.75 3.5H18v15H6.75A1.75 1.75 0 0 0 5 20.25z" /><path d="M5 20.25A1.75 1.75 0 0 1 6.75 18.5H18v2H6.75M9 8h5.5M9 11h4" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[kind]}</svg>
}

const PAGE_ICONS: Partial<Record<string, SearchKind>> = {
  'page:study': 'lecture',
  'page:competitions': 'competition',
  'page:favorites': 'favorite',
  'page:notes': 'question',
  'page:manage': 'topic',
  'page:settings': 'setting',
}

function iconKind(id: string, kind: SearchKind): SearchKind {
  return PAGE_ICONS[id] ?? kind
}

function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length || !text) return <>{text}</>
  const normalized = normalize(text)
  const marks: Array<[number, number]> = []
  for (const token of tokens) {
    let from = 0
    while (from < normalized.length) {
      const index = normalized.indexOf(token, from)
      if (index < 0) break
      marks.push([index, index + token.length])
      from = index + token.length
    }
  }
  if (!marks.length) return <>{text}</>
  marks.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const mark of marks) {
    const last = merged[merged.length - 1]
    if (last && mark[0] <= last[1]) last[1] = Math.max(last[1], mark[1])
    else merged.push([...mark])
  }
  const parts: ReactNode[] = []
  let cursor = 0
  merged.forEach(([start, end], index) => {
    if (start > cursor) parts.push(text.slice(cursor, start))
    parts.push(<mark key={index}>{text.slice(start, end)}</mark>)
    cursor = end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

export function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="search-trigger" type="button" aria-label="Search" title={`Search (${IS_MAC ? '⌘' : 'Ctrl'} K)`} onClick={onOpen}>
      <SearchIcon />
      <span className="search-trigger-label">Search</span>
      <kbd className="search-trigger-kbd">{IS_MAC ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  )
}

export default function GlobalSearch({
  open,
  data,
  onClose,
  onSelect,
}: {
  open: boolean
  data: StudyData
  onClose: () => void
  onSelect: (target: SearchTarget) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [snapshot, setSnapshot] = useState(0)
  const deferredQuery = useDeferredValue(query)

  // Rebuild the index from the latest saved data every time the palette opens.
  const prepared = useMemo(() => {
    if (!open) return []
    const competitions = loadCompetitionStorage()
    const { notes } = loadLectureNotes()
    return prepareSearchIndex(buildSearchIndex(data, competitions, withStickyNoteText(notes, loadStickyNotes().notes)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data, snapshot])

  const groups = useMemo(() => runSearch(prepared, deferredQuery), [prepared, deferredQuery])
  const flat = useMemo(() => groups.flatMap((group) => group.results), [groups])
  const tokens = useMemo(() => searchTokens(deferredQuery), [deferredQuery])
  const safeActive = Math.min(activeIndex, Math.max(0, flat.length - 1))

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      window.requestAnimationFrame(() => inputRef.current?.select())
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [safeActive, open])

  function reset() {
    setQuery('')
    setActiveIndex(0)
    setSnapshot((value) => value + 1)
  }

  function choose(index: number) {
    const result = flat[index]
    if (!result) return
    onSelect(result.entry.target)
    onClose()
    reset()
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(flat.length ? (safeActive + 1) % flat.length : 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(flat.length ? (safeActive - 1 + flat.length) % flat.length : 0)
    } else if (event.key === 'Home' && event.ctrlKey) {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(safeActive)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      reset()
    }
  }

  const groupOffsets = groups.map((_, groupIndex) => groups.slice(0, groupIndex).reduce((total, group) => total + group.results.length, 0))
  const activeId = flat[safeActive] ? `search-option-${safeActive}` : undefined
  const trimmed = deferredQuery.trim()

  return (
    <dialog
      ref={dialogRef}
      className="search-dialog"
      aria-label="Search Lets StudEE"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
        reset()
      }}
      onClose={() => {
        if (open) {
          onClose()
          reset()
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
          reset()
        }
      }}
    >
      <div className="search-panel">
        <div className="search-field">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="go"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search questions, topics, competitions…"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button className="search-clear" type="button" aria-label="Clear search" onClick={() => { setQuery(''); setActiveIndex(0); inputRef.current?.focus() }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8M16 8l-8 8" /></svg>
            </button>
          )}
          <kbd className="search-esc" aria-hidden="true">esc</kbd>
        </div>

        <div className="search-results" id="search-results" role="listbox" aria-label="Search results" ref={listRef}>
          {groups.map((group, groupIndex) => (
            <div className="search-group" role="group" aria-label={group.group} key={group.group}>
              <p className="search-group-label" aria-hidden="true">{trimmed ? group.group : 'Jump to'}</p>
              {group.results.map((result, resultIndex) => {
                const index = groupOffsets[groupIndex] + resultIndex
                const active = index === safeActive
                return (
                  <div
                    key={result.entry.id}
                    id={`search-option-${index}`}
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    className="search-option"
                    onMouseMove={() => { if (!active) setActiveIndex(index) }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(index)}
                  >
                    <span className={`search-option-icon is-${iconKind(result.entry.id, result.entry.kind)}`}><KindIcon kind={iconKind(result.entry.id, result.entry.kind)} /></span>
                    <span className="search-option-copy">
                      <span className="search-option-title"><Highlight text={result.displayTitle} tokens={tokens} /></span>
                      {result.excerpt && <span className="search-option-excerpt"><Highlight text={result.excerpt} tokens={tokens} /></span>}
                      <span className="search-option-subtitle">{result.entry.subtitle}</span>
                    </span>
                    <span className="search-option-enter" aria-hidden="true">↵</span>
                  </div>
                )
              })}
            </div>
          ))}
          {trimmed && !flat.length && (
            <div className="search-empty" role="status">
              <SearchIcon />
              <p><strong>No results for “{trimmed}”</strong></p>
              <p>Try a different word, a topic name, or part of a question.</p>
            </div>
          )}
        </div>

        <footer className="search-footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
          <span><kbd>↵</kbd> to open</span>
          <span><kbd>esc</kbd> to close</span>
        </footer>
      </div>
    </dialog>
  )
}
