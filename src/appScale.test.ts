import { describe, expect, it } from 'vitest'
import { DISPLAY_SCALES, MIN_SCALED_WIDTH, parseDisplayScale, zoomFor } from './appScale'

describe('display size', () => {
  it('defaults to 125% and reads saved choices safely', () => {
    expect(DISPLAY_SCALES.default.zoom).toBe(1.25)
    expect(parseDisplayScale(null)).toBe('default')
    expect(parseDisplayScale('huge')).toBe('default')
    expect(parseDisplayScale('small')).toBe('small')
    expect(parseDisplayScale('large')).toBe('large')
  })

  it('scales computers and tablets but keeps phones at 100%', () => {
    expect(zoomFor('default', 1600)).toBe(1.25)
    expect(zoomFor('large', MIN_SCALED_WIDTH)).toBe(1.4)
    expect(zoomFor('large', 390)).toBe(1)
    expect(zoomFor('small', 1600)).toBe(1)
  })
})
