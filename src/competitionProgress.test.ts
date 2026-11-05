import { describe, expect, it } from 'vitest'
import {
  addCorrectAnswer,
  currentDailyStreak,
  daysUntilTarget,
  daysUntilMathTarget,
  EE_TARGET_DATE,
  ESAS_TARGET_DATE,
  type CompetitionDailyProgress,
} from './competitionProgress'

describe('Mock Competition daily progress', () => {
  it('counts only recorded correct answers toward a date', () => {
    const progress = addCorrectAnswer({ correctByDate: {} }, '2026-10-26')
    expect(addCorrectAnswer(progress, '2026-10-26').correctByDate['2026-10-26']).toBe(2)
    expect(progress.correctByDate['2026-10-26']).toBe(1)
  })

  it('keeps the streak through yesterday and continues it when today is active', () => {
    const progress: CompetitionDailyProgress = {
      correctByDate: {
        '2026-10-24': 3,
        '2026-10-25': 1,
        '2026-10-26': 8,
      },
    }
    expect(currentDailyStreak(progress, '2026-10-26')).toBe(3)
    expect(currentDailyStreak(progress, '2026-10-27')).toBe(3)
    expect(currentDailyStreak(progress, '2026-10-28')).toBe(0)
  })

  it('counts down to November 25, 2026 without negative days', () => {
    expect(daysUntilMathTarget('2026-10-26')).toBe(30)
    expect(daysUntilMathTarget('2026-11-25')).toBe(0)
    expect(daysUntilMathTarget('2026-11-26')).toBe(0)
  })

  it('counts down to the ESAS target on November 24, 2026', () => {
    expect(daysUntilTarget(ESAS_TARGET_DATE, '2026-10-26')).toBe(29)
    expect(daysUntilTarget(ESAS_TARGET_DATE, '2026-11-24')).toBe(0)
  })

  it('counts down to the EE target on November 25, 2026', () => {
    expect(daysUntilTarget(EE_TARGET_DATE, '2026-10-27')).toBe(29)
    expect(daysUntilTarget(EE_TARGET_DATE, '2026-11-25')).toBe(0)
  })
})
