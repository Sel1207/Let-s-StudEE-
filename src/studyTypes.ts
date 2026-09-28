export const TOPICS = [
  'Foundational Math',
  'Calculus 1',
  'Calculus 2',
  'Calculus 3',
  'Linear Algebra',
  'Advanced Mathematics',
  'Differential Equations',
  'Discrete Math',
] as const

export type Topic = (typeof TOPICS)[number]
export type SpeechSpeed = 'slow' | 'normal' | 'fast'
export type TimeFilter = 'any' | 20 | 30 | 60 | 120
export type Preset = 'all-equal' | 'only-selected' | 'focus-weakest'

export const ALLOWED_DURATIONS = [20, 30, 45, 60, 90, 120, 150, 180] as const
export type AllowedDuration = (typeof ALLOWED_DURATIONS)[number]

export interface Question {
  id: string
  text: string
  seconds: AllowedDuration
}

export interface TopicPreference {
  active: boolean
  weight: number
}

export interface TopicResult {
  gotIt: number
  missedIt: number
}

export interface StudySettings {
  defaultSeconds: AllowedDuration
  speechSpeed: SpeechSpeed
  voiceURI: string
  announceDuration: boolean
  timeFilter: TimeFilter
}

export interface StudyData {
  version: 1
  questionBanks: Record<Topic, Question[]>
  topicPreferences: Record<Topic, TopicPreference>
  settings: StudySettings
  usedQuestionIds: Record<Topic, string[]>
  results: Record<Topic, TopicResult>
}
