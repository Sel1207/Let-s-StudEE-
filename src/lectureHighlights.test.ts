import { describe, expect, it } from 'vitest'
import { eraseSpan, paintSpan, placeHighlights, type Highlight } from './lectureHighlights'

const TEXT = 'Ohm law says V equals I times R for a resistor.'
const span = (words: string, text = TEXT) => ({ start: text.indexOf(words), end: text.indexOf(words) + words.length })
const summary = (highlights: Highlight[]) => highlights
  .map(({ quote, color }) => `${color}:${quote}`)
  .sort()

describe('painting highlights', () => {
  it('adds a highlight with its words and surroundings', () => {
    const [highlight] = paintSpan([], TEXT, span('V equals'), 'yellow')
    expect(highlight).toMatchObject({ color: 'yellow', quote: 'V equals', before: 'Ohm law says ', after: ' I times R for a resistor.' })
  })

  it('joins touching highlights of the same color', () => {
    const first = paintSpan([], TEXT, span('V equals'), 'yellow')
    expect(summary(paintSpan(first, TEXT, span('equals I'), 'yellow'))).toEqual(['yellow:V equals I'])
  })

  it('paints over a different color instead of stacking on it', () => {
    const first = paintSpan([], TEXT, span('V equals I'), 'yellow')
    expect(summary(paintSpan(first, TEXT, span('equals'), 'pink'))).toEqual(['pink:equals', 'yellow: I', 'yellow:V '])
  })

  it('recolors a whole highlight', () => {
    const first = paintSpan([], TEXT, span('V equals'), 'yellow')
    expect(summary(paintSpan(first, TEXT, first[0], 'blue'))).toEqual(['blue:V equals'])
  })
})

describe('erasing highlights', () => {
  it('splits a highlight around the erased part', () => {
    const first = paintSpan([], TEXT, span('V equals I'), 'green')
    expect(summary(eraseSpan(first, TEXT, span('equals')))).toEqual(['green: I', 'green:V '])
  })

  it('removes a highlight fully inside the erased part', () => {
    const first = paintSpan([], TEXT, span('equals'), 'green')
    expect(eraseSpan(first, TEXT, span('V equals I'))).toEqual([])
  })

  it('drops leftovers that are only spaces', () => {
    const first = paintSpan([], TEXT, span('V equals'), 'green')
    expect(summary(eraseSpan(first, TEXT, span('equals')))).toEqual(['green:V '])
    expect(summary(eraseSpan(first, TEXT, span('V')))).toEqual(['green: equals'])
    const padded = paintSpan([], TEXT, span(' equals'), 'green')
    expect(eraseSpan(padded, TEXT, span('equals'))).toEqual([])
  })

  it('leaves other highlights alone', () => {
    const first = paintSpan([], TEXT, span('Ohm'), 'green')
    expect(eraseSpan(first, TEXT, span('resistor'))).toHaveLength(1)
  })
})

describe('finding highlights after an edit', () => {
  it('follows its words when text is added before them', () => {
    const highlights = paintSpan([], TEXT, span('V equals'), 'yellow')
    const edited = `A new opening sentence. ${TEXT}`
    const [placed] = placeHighlights(highlights, edited).placed
    expect(edited.slice(placed.start, placed.end)).toBe('V equals')
  })

  it('picks the right copy of repeated words', () => {
    const text = 'First the voltage drop. Then the current drop. Finally the power drop.'
    const highlights = paintSpan([], text, { start: text.indexOf('drop', 30), end: text.indexOf('drop', 30) + 4 }, 'blue')
    const edited = `Intro words. ${text}`
    const [placed] = placeHighlights(highlights, edited).placed
    expect(edited.slice(placed.start - 8, placed.end)).toBe('current drop')
  })

  it('hides a highlight whose words are gone and keeps it for later', () => {
    const highlights = paintSpan([], TEXT, span('V equals'), 'yellow')
    const edited = 'Completely different notes.'
    expect(placeHighlights(highlights, edited)).toMatchObject({ placed: [], lost: highlights })
    expect(placeHighlights(highlights, TEXT).placed).toHaveLength(1)
  })

  it('keeps hidden highlights when other highlights change', () => {
    const highlights = paintSpan([], TEXT, span('V equals'), 'yellow')
    const edited = 'Completely different notes.'
    const next = paintSpan(highlights, edited, span('notes', edited), 'pink')
    expect(summary(next)).toEqual(['pink:notes', 'yellow:V equals'])
  })
})
