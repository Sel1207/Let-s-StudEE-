import { SUBJECTS, type PracticeQuestion, type Subject } from './types'

const STORAGE_KEY = 'lets-studee-question-bank'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSubject(value: unknown): Subject | null {
  if (typeof value !== 'string') return null
  return SUBJECTS.find((subject) => subject.toLowerCase() === value.trim().toLowerCase()) ?? null
}

export function parseQuestionBank(value: unknown): PracticeQuestion[] {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.questions)
      ? value.questions
      : null

  if (!entries?.length) {
    throw new Error('The JSON file needs a non-empty "questions" array.')
  }

  return entries.map((entry, index) => {
    const subject = isRecord(entry) ? parseSubject(entry.subject) : null
    const question = isRecord(entry) && typeof entry.question === 'string'
      ? entry.question.trim()
      : ''
    const rawAnswer = isRecord(entry) ? entry.answer : null
    const answer = typeof rawAnswer === 'string' || typeof rawAnswer === 'number'
      ? String(rawAnswer).trim()
      : ''

    if (!subject || !question || !answer) {
      throw new Error(`Question ${index + 1} needs a valid subject, question, and answer.`)
    }

    return { subject, question, answer }
  })
}

export function loadQuestionBank(): PracticeQuestion[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? parseQuestionBank(JSON.parse(stored) as unknown) : []
  } catch {
    return []
  }
}

export function saveQuestionBank(questions: PracticeQuestion[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(questions))
    return true
  } catch {
    return false
  }
}

export function pickRandomQuestion(
  bank: PracticeQuestion[],
  selectedSubjects: ReadonlySet<Subject>,
  previousQuestion: PracticeQuestion | null,
): PracticeQuestion | null {
  const eligible = bank.filter((question) => selectedSubjects.has(question.subject))
  if (!eligible.length) return null

  const fresh = eligible.filter((question) => question !== previousQuestion)
  const pool = fresh.length ? fresh : eligible
  return pool[Math.floor(Math.random() * pool.length)]
}
