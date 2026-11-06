export const DAILY_CORRECT_GOAL = 100
export const MATH_TARGET_DATE = '2026-11-25'
export const EE_TARGET_DATE = '2026-11-25'
export const ESAS_TARGET_DATE = '2026-11-24'
const DAILY_PROGRESS_STORAGE_KEY = 'lets-studee-mock-daily-progress-v1'

export interface CompetitionDailyProgress {
  correctByDate: Record<string, number>
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function loadCompetitionDailyProgress(): CompetitionDailyProgress {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(DAILY_PROGRESS_STORAGE_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null || !('correctByDate' in value)
      || typeof value.correctByDate !== 'object' || value.correctByDate === null || Array.isArray(value.correctByDate)) {
      return { correctByDate: {} }
    }
    const correctByDate: Record<string, number> = {}
    for (const [date, count] of Object.entries(value.correctByDate)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isSafeInteger(count) && Number(count) > 0) {
        correctByDate[date] = Number(count)
      }
    }
    return { correctByDate }
  } catch (error) {
    console.error('Could not restore Mock Competition daily progress.', error)
    return { correctByDate: {} }
  }
}

export function saveCompetitionDailyProgress(progress: CompetitionDailyProgress): void {
  try {
    window.localStorage.setItem(DAILY_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch (error) {
    console.error('Could not save Mock Competition daily progress.', error)
  }
}

export function addCorrectAnswer(progress: CompetitionDailyProgress, date = localDateKey()): CompetitionDailyProgress {
  return {
    correctByDate: {
      ...progress.correctByDate,
      [date]: (progress.correctByDate[date] ?? 0) + 1,
    },
  }
}

export function recordDailyCorrectAnswer(date = localDateKey()): void {
  const progress = loadCompetitionDailyProgress()
  saveCompetitionDailyProgress(addCorrectAnswer(progress, date))
}

export function removeCorrectAnswer(progress: CompetitionDailyProgress, date = localDateKey()): CompetitionDailyProgress {
  const { [date]: count = 0, ...otherDates } = progress.correctByDate
  return { correctByDate: count > 1 ? { ...otherDates, [date]: count - 1 } : otherDates }
}

export function undoDailyCorrectAnswer(date = localDateKey()): void {
  saveCompetitionDailyProgress(removeCorrectAnswer(loadCompetitionDailyProgress(), date))
}

export function currentDailyStreak(progress: CompetitionDailyProgress, today = localDateKey()): number {
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (!progress.correctByDate[today]) date.setUTCDate(date.getUTCDate() - 1)
  let streak = 0
  while (progress.correctByDate[date.toISOString().slice(0, 10)]) {
    streak += 1
    date.setUTCDate(date.getUTCDate() - 1)
  }
  return streak
}

export function daysUntilTarget(targetDate: string, today = localDateKey()): number {
  const [year, month, day] = today.split('-').map(Number)
  const [targetYear, targetMonth, targetDay] = targetDate.split('-').map(Number)
  const todayUtc = Date.UTC(year, month - 1, day)
  const targetUtc = Date.UTC(targetYear, targetMonth - 1, targetDay)
  return Math.max(0, Math.round((targetUtc - todayUtc) / 86_400_000))
}

export function daysUntilMathTarget(today = localDateKey()): number {
  return daysUntilTarget(MATH_TARGET_DATE, today)
}
