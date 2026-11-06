import { describe, expect, it } from 'vitest'
import { shouldTick } from './timerTicks'

function ticksFor(limit: number): number[] {
  const ticks: number[] = []
  for (let remaining = limit - 1; remaining >= 0; remaining -= 1) {
    if (shouldTick(remaining, limit)) ticks.push(remaining)
  }
  return ticks
}

describe('shouldTick', () => {
  it('ticks every 10 seconds from the start, then every second for the last 10', () => {
    expect(ticksFor(60)).toEqual([50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  })

  it('counts the 10-second ticks from the start for limits that are not multiples of 10', () => {
    expect(ticksFor(45)).toEqual([35, 25, 15, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  })

  it('ticks every second when the whole limit fits in the final countdown', () => {
    expect(ticksFor(5)).toEqual([4, 3, 2, 1])
  })

  it('leaves zero to the time-up sound', () => {
    expect(shouldTick(0, 60)).toBe(false)
  })
})
