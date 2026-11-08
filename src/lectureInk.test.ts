import { describe, expect, it } from 'vitest'
import { anchorBlock, parseAnnotations, simplifyPoints, smoothPath, strokeHit } from './lectureInk'
import { TOPICS } from './studyTypes'

describe('lecture ink', () => {
  it('anchors a mark to the last block starting at or above it', () => {
    expect(anchorBlock([0, 40, 120], -5)).toBe(-1)
    expect(anchorBlock([0, 40, 120], 40)).toBe(1)
    expect(anchorBlock([0, 40, 120], 500)).toBe(2)
    expect(anchorBlock([], 10)).toBe(-1)
  })

  it('drops points that are too close together but keeps both ends', () => {
    expect(simplifyPoints([[0, 0], [0.5, 0], [1, 0], [3, 0], [3.2, 0]], 2)).toEqual([[0, 0], [3, 0], [3.2, 0]])
  })

  it('draws a dot for a single tap and a curve for longer strokes', () => {
    expect(smoothPath([[5, 5]])).toBe('M5 5L5 5')
    expect(smoothPath([[0, 0], [10, 0], [20, 10]])).toBe('M0 0Q10 0 15 5L20 10')
  })

  it('hits strokes near their line', () => {
    expect(strokeHit([[0, 0], [100, 0]], 50, 6, 8)).toBe(true)
    expect(strokeHit([[0, 0], [100, 0]], 50, 12, 8)).toBe(false)
    expect(strokeHit([[10, 10]], 13, 13, 8)).toBe(true)
  })

  it('keeps valid saved marks and drops broken ones', () => {
    const topic = TOPICS[0]
    const { annotations, error } = parseAnnotations(JSON.stringify({
      [topic]: [
        { id: 'a', kind: 'ink', tool: 'pen', color: 'red', size: 4, block: 0, points: [[0.1, 2], [0.2, 'x'], [0.3, 4]] },
        { id: 'b', kind: 'ink', tool: 'marker', color: 'red', size: 20, block: 0, points: [[0.1, 2]] },
        { id: 'c', kind: 'text', color: 'blue', size: 16, block: -1, x: 0.5, y: 10, text: 'Note $x^2$' },
        { id: 'd', kind: 'text', color: 'blue', size: 16, block: 1, x: 0.5, y: 10, text: '   ' },
      ],
      'Not a topic': [{ id: 'e' }],
    }))
    expect(error).toBe('')
    expect(annotations[topic]?.map((item) => item.id)).toEqual(['a', 'c'])
    expect(annotations[topic]?.[0]).toMatchObject({ points: [[0.1, 2], [0.3, 4]] })
    expect(parseAnnotations('{oops').error).not.toBe('')
  })
})
