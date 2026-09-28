import { ALLOWED_DURATIONS, TOPICS, type AllowedDuration, type Topic } from './studyTypes'

const SESSION_STORAGE_KEY = 'lets-studee-sessions-v1'

export interface SessionQuestion {
  id: string
  text: string
  topic: Topic
  seconds: AllowedDuration
  askedAt: string
}

export interface StudySession {
  id: string
  startedAt: string
  endedAt: string | null
  questions: SessionQuestion[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSessionQuestion(value: unknown): value is SessionQuestion {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.text === 'string'
    && typeof value.topic === 'string'
    && TOPICS.includes(value.topic as Topic)
    && ALLOWED_DURATIONS.includes(value.seconds as AllowedDuration)
    && typeof value.askedAt === 'string'
}

function isStudySession(value: unknown): value is StudySession {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.startedAt === 'string'
    && (value.endedAt === null || typeof value.endedAt === 'string')
    && Array.isArray(value.questions)
    && value.questions.every(isSessionQuestion)
}

export function loadStudySessions(): StudySession[] {
  try {
    const saved = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!saved) return []
    const parsed: unknown = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed.filter(isStudySession) : []
  } catch {
    return []
  }
}

export function saveStudySessions(sessions: StudySession[]): boolean {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions))
    return true
  } catch {
    return false
  }
}