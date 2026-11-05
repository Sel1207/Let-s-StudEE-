import { parseCompetitionBackup, loadCompetitionStorage, type CompetitionStorage } from './competitionData'
import { parseStudyBackup } from './studyStorage'
import type { StudyData } from './studyTypes'
import type { ThemePreference } from './themePreference'

const STUDY_STORAGE_KEY = 'lets-studee-study-data-v1'
const COMPETITION_STORAGE_KEY = 'lets-studee-mock-competitions-v1'
const THEME_STORAGE_KEY = 'lets-studee-theme-v1'
const LEGACY_QUESTION_BANK_KEY = 'lets-studee-question-bank'
const BACKUP_FORMAT = 'lets-studee-full-backup'

interface FullAppBackup {
  format: typeof BACKUP_FORMAT
  version: 1
  exportedAt: number
  storage: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAppStorageKey(key: string): boolean {
  return key.startsWith('lets-studee-') || key === LEGACY_QUESTION_BANK_KEY
}

function competitionStorageForBackup(storage: CompetitionStorage): string {
  return JSON.stringify(storage)
}

export function createFullAppBackup(data: StudyData, theme: ThemePreference): string {
  const storage: Record<string, string> = {}
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key || !isAppStorageKey(key)) continue
    const value = window.localStorage.getItem(key)
    if (value !== null) storage[key] = value
  }
  storage[STUDY_STORAGE_KEY] = JSON.stringify(data)
  storage[COMPETITION_STORAGE_KEY] ??= competitionStorageForBackup(loadCompetitionStorage())
  storage[THEME_STORAGE_KEY] = theme
  const backup: FullAppBackup = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    storage,
  }
  return JSON.stringify(backup, null, 2)
}

export function parseFullAppBackup(source: string): Record<string, string> {
  let value: unknown
  try {
    value = JSON.parse(source) as unknown
  } catch (error) {
    throw new Error('This backup is not valid JSON.', { cause: error })
  }
  if (!isRecord(value) || value.format !== BACKUP_FORMAT || value.version !== 1 || !isRecord(value.storage)) {
    throw new Error('This is not a supported Let’s StudEE! full backup.')
  }

  const storage: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value.storage)) {
    if (!isAppStorageKey(key) || typeof raw !== 'string') {
      throw new Error('The full backup contains an invalid app storage entry.')
    }
    storage[key] = raw
  }
  if (!storage[STUDY_STORAGE_KEY] || !storage[COMPETITION_STORAGE_KEY]) {
    throw new Error('The full backup is missing Study or Mock Competition data.')
  }

  try {
    parseStudyBackup(JSON.parse(storage[STUDY_STORAGE_KEY]) as unknown)
  } catch (error) {
    throw new Error(`The Study backup is invalid: ${error instanceof Error ? error.message : 'unknown error'}`, { cause: error })
  }

  let competition: unknown
  try {
    competition = JSON.parse(storage[COMPETITION_STORAGE_KEY]) as unknown
  } catch (error) {
    throw new Error('The Mock Competition backup is not valid JSON.', { cause: error })
  }
  if (!isRecord(competition) || !Array.isArray(competition.versions)
    || !Array.isArray(competition.history) || !Array.isArray(competition.favorites)) {
    throw new Error('The Mock Competition backup is missing saved sets, score history, or favorites.')
  }
  if (competition.versions.length || competition.history.length || competition.favorites.length) {
    try {
      parseCompetitionBackup(JSON.stringify({
        format: 'lets-studee-competition-backup',
        version: 1,
        exportedAt: Date.now(),
        competitions: competition.versions,
        history: competition.history,
        favorites: competition.favorites,
        subjects: competition.subjects,
      }))
    } catch (error) {
      throw new Error(`The Mock Competition backup is invalid: ${error instanceof Error ? error.message : 'unknown error'}`, { cause: error })
    }
  }
  if (storage[THEME_STORAGE_KEY] && !['light', 'dark'].includes(storage[THEME_STORAGE_KEY])) {
    throw new Error('The theme preference in this backup is invalid.')
  }
  return storage
}

export function restoreFullAppBackup(storage: Record<string, string>): void {
  const previousStorage: Record<string, string> = {}
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key || !isAppStorageKey(key)) continue
    const value = window.localStorage.getItem(key)
    if (value !== null) previousStorage[key] = value
  }

  try {
    for (const key of Object.keys(previousStorage)) {
      if (!(key in storage)) window.localStorage.removeItem(key)
    }
    for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value)
  } catch (error) {
    try {
      for (const key of Object.keys(previousStorage)) window.localStorage.removeItem(key)
      for (const [key, value] of Object.entries(previousStorage)) window.localStorage.setItem(key, value)
    } catch (rollbackError) {
      throw new Error('Backup restore failed and the previous browser data could not be fully restored.', { cause: rollbackError })
    }
    throw new Error('Backup restore failed. Your previous browser data was restored.', { cause: error })
  }
}
