import { describe, expect, it } from 'vitest'
import { withStickyNoteText, writeStickyNote, type StickyNotes } from './stickyNotesStorage'

const saved: StickyNotes = { Algebra: [{ id: 'a', text: 'First' }, { id: 'b', text: 'Second' }] }

describe('writeStickyNote', () => {
  it('puts a new note first', () => {
    const notes = writeStickyNote(saved, 'Algebra', null, 'Newest').Algebra ?? []
    expect(notes.map((note) => note.text)).toEqual(['Newest', 'First', 'Second'])
  })

  it('ignores a new note with no text', () => {
    expect(writeStickyNote(saved, 'Algebra', null, '')).toBe(saved)
  })

  it('edits only the chosen note', () => {
    expect(writeStickyNote(saved, 'Algebra', 'b', 'Changed').Algebra).toEqual([{ id: 'a', text: 'First' }, { id: 'b', text: 'Changed' }])
  })

  it('removes an existing note saved with no text', () => {
    expect(writeStickyNote(saved, 'Algebra', 'a', '').Algebra).toEqual([{ id: 'b', text: 'Second' }])
  })
})

describe('withStickyNoteText', () => {
  it('adds sticky notes to the searchable lecture text, even without lecture notes', () => {
    expect(withStickyNoteText({}, saved).Algebra).toContain('Second')
    expect(withStickyNoteText({ Algebra: 'Lecture' }, saved).Algebra).toContain('Lecture')
  })
})
