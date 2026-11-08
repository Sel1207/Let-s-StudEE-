import { describe, expect, it } from 'vitest'
import { wrapBareSubscripts } from './noteSubscripts'

describe('bare subscripts in notes', () => {
  it('wraps bare subscripts so they render as math', () => {
    expect(wrapBareSubscripts('The load current I_L and turns N_L.')).toBe('The load current $I_{L}$ and turns $N_{L}$.')
    expect(wrapBareSubscripts('Use V_{sec} here')).toBe('Use $V_{sec}$ here')
  })

  it('leaves real words and existing math alone', () => {
    expect(wrapBareSubscripts('snake_case and file_name')).toBe('snake_case and file_name')
    expect(wrapBareSubscripts('no subscripts here')).toBe('no subscripts here')
  })
})

