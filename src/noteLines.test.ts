import { describe, expect, it } from 'vitest'
import { noteLines, splitNoteTitle } from './noteLines'

describe('noteLines', () => {
  it('keeps each line and marks the line after a blank gap', () => {
    expect(noteLines('Title\n\nStep 1\nStep 2')).toEqual([
      { text: 'Title', marker: null, afterGap: false },
      { text: 'Step 1', marker: null, afterGap: true },
      { text: 'Step 2', marker: null, afterGap: false },
    ])
  })

  it('turns dash and numbered lines into list items', () => {
    expect(noteLines('- $\\det A = 0$\n* Other\n2. Next\n3) Last')).toEqual([
      { text: '$\\det A = 0$', marker: '•', afterGap: false },
      { text: 'Other', marker: '•', afterGap: false },
      { text: 'Next', marker: '2.', afterGap: false },
      { text: 'Last', marker: '3)', afterGap: false },
    ])
  })

  it('does not treat a leading minus in math as a list item', () => {
    expect(noteLines('-5 is negative\n$-x$')).toEqual([
      { text: '-5 is negative', marker: null, afterGap: false },
      { text: '$-x$', marker: null, afterGap: false },
    ])
  })

  it('keeps multi-line display math together', () => {
    const math = '$$\\begin{pmatrix}1\n2\\end{pmatrix}$$'
    expect(noteLines(`Before\n${math}\nAfter`).map((line) => line.text)).toEqual(['Before', math, 'After'])
  })

  it('splits the first line off as the title', () => {
    expect(splitNoteTitle('Separable $y$\r\n\r\n- Move $y$ left\n- Integrate')).toEqual({ title: 'Separable $y$', body: '- Move $y$ left\n- Integrate' })
    expect(splitNoteTitle('Just a title')).toEqual({ title: 'Just a title', body: '' })
    expect(splitNoteTitle('Title: Euler\nBody').title).toBe('Euler')
    expect(splitNoteTitle('## Euler\nBody').title).toBe('Euler')
  })

  it('keeps multi-line display math whole in a title', () => {
    const math = '$$a\n+b$$'
    expect(splitNoteTitle(`${math}\nBody`)).toEqual({ title: math, body: 'Body' })
  })

  it('handles Windows line breaks and several blank lines', () => {
    expect(noteLines('\r\nOne\r\n\r\n\r\nTwo\r\n')).toEqual([
      { text: 'One', marker: null, afterGap: false },
      { text: 'Two', marker: null, afterGap: true },
    ])
  })
})
