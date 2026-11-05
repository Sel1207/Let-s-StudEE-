import { LEGACY_TOPIC_ALIASES, TOPICS, type Topic } from './studyTypes'

export const LECTURE_NOTES_STORAGE_KEY = 'lets-studee-lecture-notes-v1'

export interface LectureNotesState {
  notes: Partial<Record<Topic, string>>
  error: string
}

export function loadLectureNotes(): LectureNotesState {
  if (typeof window === 'undefined') return { notes: {}, error: '' }
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(LECTURE_NOTES_STORAGE_KEY) ?? '{}')
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
      return { notes: {}, error: 'Saved lecture notes could not be read. New edits will still be saved.' }
    }
    const notes: Partial<Record<Topic, string>> = {}
    for (const [savedTopic, note] of Object.entries(saved)) {
      if (typeof note !== 'string') continue
      const topic = TOPICS.find((item) => item === savedTopic) ?? LEGACY_TOPIC_ALIASES[savedTopic]
      if (topic && notes[topic] === undefined) notes[topic] = note
    }
    return { notes, error: '' }
  } catch (error) {
    console.error('Could not restore lecture notes.', error)
    return { notes: {}, error: 'Saved lecture notes could not be read. New edits will still be saved.' }
  }
}
