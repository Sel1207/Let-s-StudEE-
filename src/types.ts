export const SUBJECTS = [
  'Foundational Math',
  'Differential Calculus',
  'Integral Calculus',
  'Series and Multivariable Calculus',
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
