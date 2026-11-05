import { describe, expect, it } from 'vitest'
import { createInitialStudyData } from './studyStorage'
import { parseFullAppBackup } from './appBackup'

function fullBackup(storage: Record<string, string>) {
  return JSON.stringify({
    format: 'lets-studee-full-backup',
    version: 1,
    exportedAt: 1,
    storage,
  })
}

function validStorage(): Record<string, string> {
  return {
    'lets-studee-study-data-v1': JSON.stringify(createInitialStudyData()),
    'lets-studee-mock-competitions-v1': JSON.stringify({
      versions: [],
      history: [],
      favorites: [],
      settings: {},
      subjects: ['Math', 'EE', 'ESAS'],
      activeSubject: 'Math',
    }),
    'lets-studee-theme-v1': 'dark',
    'lets-studee-lecture-notes-v1': JSON.stringify({ Algebra: 'A note with $x^2$.' }),
  }
}

describe('full app backup', () => {
  it('accepts a complete backup and preserves lecture notes and preferences', () => {
    const storage = validStorage()
    expect(parseFullAppBackup(fullBackup(storage))).toEqual(storage)
  })

  it('rejects backups missing Study or Mock Competition data', () => {
    const storage = validStorage()
    delete storage['lets-studee-study-data-v1']
    expect(() => parseFullAppBackup(fullBackup(storage))).toThrow(/missing Study or Mock Competition data/)
  })

  it('rejects unsupported storage keys', () => {
    const storage = { ...validStorage(), 'another-site-private-data': 'value' }
    expect(() => parseFullAppBackup(fullBackup(storage))).toThrow(/invalid app storage entry/)
  })

  it('rejects invalid Study data before changing browser storage', () => {
    const storage = { ...validStorage(), 'lets-studee-study-data-v1': JSON.stringify({ version: 99 }) }
    expect(() => parseFullAppBackup(fullBackup(storage))).toThrow(/Study backup is invalid/)
  })

  it('rejects malformed Mock Competition data', () => {
    const storage = { ...validStorage(), 'lets-studee-mock-competitions-v1': JSON.stringify({ versions: [] }) }
    expect(() => parseFullAppBackup(fullBackup(storage))).toThrow(/missing saved sets, score history, or favorites/)
  })
})
