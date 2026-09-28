export const SUBJECTS = [
  'Foundational Math',
  'Calculus 1',
  'Calculus 2',
  'Calculus 3',
  'Linear Algebra',
  'Advanced Mathematics',
  'Differential Equations',
  'Advanced Engineering Math',
  'EE Quiz Show',
] as const

export type Subject = (typeof SUBJECTS)[number]

export interface PracticeQuestion {
  subject: Subject
  question: string
  answer: string
}

export const TIMER_OPTIONS = [
  { label: '15 sec', seconds: 15 },
  { label: '30 sec', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '2 min', seconds: 120 },
] as const
