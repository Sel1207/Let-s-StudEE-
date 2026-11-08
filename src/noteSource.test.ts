import { describe, expect, it } from 'vitest'
import { deleteNoteRange } from './noteSource'
import { splitBareSubscripts } from './noteSubscripts'

describe('deleting part of a note', () => {
  it('cuts the exact source range', () => {
    const note = 'Ohm law: $V=IR$ always holds.'
    expect(deleteNoteRange(note, 9, 16)).toBe('Ohm law: always holds.')
  })

  it('cleans up markup and bullets left empty', () => {
    expect(deleteNoteRange('A **bold** word', 4, 8)).toBe('A  word')
    expect(deleteNoteRange('- one\n- two\n- three', 8, 11)).toBe('- one\n- three')
    expect(deleteNoteRange('# Title\n\nBody', 2, 7)).toBe('\nBody')
  })

  it('takes the other half of a bold or underline pair when the cut runs past it', () => {
    const note = 'Keep **power is conserved** here.'
    expect(deleteNoteRange(note, 7, note.length - 1)).toBe('Keep .')
    expect(deleteNoteRange('A <u>line</u> end', 0, 9)).toBe(' end')
    expect(deleteNoteRange('An *em* word', 4, 8)).toBe('An word')
  })
})

describe('splitting bare subscripts', () => {
  it('keeps every character in order', () => {
    const pieces = splitBareSubscripts('Load I_L and N_L.')
    expect(pieces).toEqual([
      { text: 'Load ', math: false },
      { text: 'I_L', math: true },
      { text: ' and ', math: false },
      { text: 'N_L', math: true },
      { text: '.', math: false },
    ])
    expect(pieces.map((piece) => piece.text).join('')).toBe('Load I_L and N_L.')
  })
})
