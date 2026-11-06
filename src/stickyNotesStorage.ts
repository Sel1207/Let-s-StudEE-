import { createQuestionId } from './questionLogic'
import { LEGACY_TOPIC_ALIASES, TOPICS, type Topic } from './studyTypes'

export const STICKY_NOTES_STORAGE_KEY = 'lets-studee-lecture-sticky-notes-v1'

export interface StickyNote {
  id: string
  text: string
}

export type StickyNotes = Partial<Record<Topic, StickyNote[]>>

function isStickyNote(value: unknown): value is StickyNote {
  if (typeof value !== 'object' || value === null) return false
  const { id, text } = value as Partial<StickyNote>
  return typeof id === 'string' && typeof text === 'string'
}

export function loadStickyNotes(): { notes: StickyNotes; error: string } {
  const unreadable = { notes: {}, error: 'Saved sticky notes could not be read. New notes will still be saved.' }
  if (typeof window === 'undefined') return { notes: {}, error: '' }
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STICKY_NOTES_STORAGE_KEY) ?? '{}')
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return unreadable
    const notes: StickyNotes = {}
    for (const [savedTopic, topicNotes] of Object.entries(saved)) {
      const topic = TOPICS.find((item) => item === savedTopic) ?? LEGACY_TOPIC_ALIASES[savedTopic]
      if (topic && Array.isArray(topicNotes)) notes[topic] = topicNotes.filter(isStickyNote)
    }
    return { notes, error: '' }
  } catch (error) {
    console.error('Could not restore sticky notes.', error)
    return unreadable
  }
}

// New notes go first. An existing note saved with no text is removed.
export function writeStickyNote(notes: StickyNotes, topic: Topic, id: string | null, text: string): StickyNotes {
  const current = notes[topic] ?? []
  if (id === null) return text ? { ...notes, [topic]: [{ id: createQuestionId(), text }, ...current] } : notes
  return {
    ...notes,
    [topic]: text
      ? current.map((note) => (note.id === id ? { ...note, text } : note))
      : current.filter((note) => note.id !== id),
  }
}

export function withStickyNoteText(lectureNotes: Partial<Record<Topic, string>>, stickyNotes: StickyNotes): Partial<Record<Topic, string>> {
  const merged = { ...lectureNotes }
  for (const topic of TOPICS) {
    const texts = (stickyNotes[topic] ?? []).map((note) => note.text)
    if (texts.length) merged[topic] = [merged[topic] ?? '', ...texts].join('\n\n')
  }
  return merged
}
