import { ALLOWED_DURATIONS, EE_TOPICS, TOPICS, type AllowedDuration, type Question, type StudyData, type StudySettings, type Topic, type TopicPreference, type TopicResult } from './studyTypes'
import { DEFAULT_FOUNDATIONAL_QUESTIONS } from './defaultFoundationalQuestions'
import { PREFERRED_VOICE_URI } from './speechVoice'

const STORAGE_KEY = 'lets-studee-study-data-v1'
const DEFAULTS_MIGRATION_KEY = 'lets-studee-defaults-migration-v1'
const SPEEDS = ['slow', 'normal', 'fast'] as const
const FILTERS = ['any', 20, 30, 60, 120] as const

function createDefaultFoundationalQuestions(): Question[] {
  return DEFAULT_FOUNDATIONAL_QUESTIONS.map((question, index) => ({
    id: `foundational-default-${String(index + 1).padStart(2, '0')}`,
    ...question,
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function topicRecord<T>(createValue: (topic: Topic) => T): Record<Topic, T> {
  return Object.fromEntries(TOPICS.map((topic) => [topic, createValue(topic)])) as Record<Topic, T>
}

function isEETopic(topic: Topic): boolean {
  return EE_TOPICS.some((eeTopic) => eeTopic === topic)
}

export function createInitialStudyData(): StudyData {
  return {
    version: 1,
    questionBanks: topicRecord((topic) => topic === 'Foundational Math' ? createDefaultFoundationalQuestions() : []),
    topicPreferences: topicRecord(() => ({ active: true, weight: 1 })),
    settings: {
      defaultSeconds: 60,
      speechSpeed: 'normal',
      voiceURI: PREFERRED_VOICE_URI,
      announceDuration: true,
      timeFilter: 'any',
    },
    usedQuestionIds: topicRecord(() => []),
    results: topicRecord(() => ({ gotIt: 0, missedIt: 0 })),
  }
}

function parseQuestionList(value: unknown, topic: Topic): Question[] {
  if (!Array.isArray(value)) throw new Error(`The ${topic} question bank is invalid.`)
  const ids = new Set<string>()
  return value.map((entry, index) => {
    if (!isRecord(entry)
      || typeof entry.id !== 'string'
      || typeof entry.text !== 'string'
      || !entry.text.trim()
      || !ALLOWED_DURATIONS.includes(entry.seconds as AllowedDuration)) {
      throw new Error(`Question ${index + 1} in ${topic} is invalid.`)
    }
    if (ids.has(entry.id)) throw new Error(`Question IDs in ${topic} must be unique.`)
    ids.add(entry.id)
    return { id: entry.id, text: entry.text.trim(), seconds: entry.seconds as AllowedDuration }
  })
}

function parsePreference(value: unknown, topic: Topic): TopicPreference {
  if (!isRecord(value)
    || typeof value.active !== 'boolean'
    || typeof value.weight !== 'number'
    || !Number.isInteger(value.weight)
    || value.weight < 0
    || value.weight > 5) {
    throw new Error(`The ${topic} topic settings are invalid.`)
  }
  return { active: value.active, weight: value.weight }
}

function parseResult(value: unknown, topic: Topic): TopicResult {
  if (!isRecord(value)
    || !Number.isInteger(value.gotIt)
    || !Number.isInteger(value.missedIt)
    || Number(value.gotIt) < 0
    || Number(value.missedIt) < 0) {
    throw new Error(`The ${topic} study results are invalid.`)
  }
  return { gotIt: Number(value.gotIt), missedIt: Number(value.missedIt) }
}

function parseSettings(value: unknown): StudySettings {
  if (!isRecord(value)
    || !ALLOWED_DURATIONS.includes(value.defaultSeconds as AllowedDuration)
    || !SPEEDS.includes(value.speechSpeed as typeof SPEEDS[number])
    || typeof value.voiceURI !== 'string'
    || typeof value.announceDuration !== 'boolean'
    || !FILTERS.includes(value.timeFilter as typeof FILTERS[number])) {
    throw new Error('The study settings in this backup are invalid.')
  }

  return {
    defaultSeconds: value.defaultSeconds as AllowedDuration,
    speechSpeed: value.speechSpeed as StudySettings['speechSpeed'],
    voiceURI: value.voiceURI,
    announceDuration: value.announceDuration,
    timeFilter: value.timeFilter as StudySettings['timeFilter'],
  }
}

export function parseStudyBackup(value: unknown): StudyData {
  if (!isRecord(value) || value.version !== 1) throw new Error('This is not a Lets StudEE! backup file.')
  const questionBanks = value.questionBanks
  const topicPreferences = value.topicPreferences
  const usedQuestionIds = value.usedQuestionIds
  const results = value.results
  if (!isRecord(questionBanks)
    || !isRecord(topicPreferences)
    || !isRecord(usedQuestionIds)
    || !isRecord(results)) {
    throw new Error('The backup is missing question banks or study progress.')
  }

  return {
    version: 1,
    questionBanks: topicRecord((topic) => !Object.hasOwn(questionBanks, topic) && isEETopic(topic)
      ? []
      : parseQuestionList(questionBanks[topic], topic)),
    topicPreferences: topicRecord((topic) => !Object.hasOwn(topicPreferences, topic) && isEETopic(topic)
      ? { active: true, weight: 1 }
      : parsePreference(topicPreferences[topic], topic)),
    settings: parseSettings(value.settings),
    usedQuestionIds: topicRecord((topic) => {
      const ids = usedQuestionIds[topic]
      if (!Object.hasOwn(usedQuestionIds, topic) && isEETopic(topic)) return []
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        throw new Error(`The ${topic} question progress is invalid.`)
      }
      return [...ids]
    }),
    results: topicRecord((topic) => !Object.hasOwn(results, topic) && isEETopic(topic)
      ? { gotIt: 0, missedIt: 0 }
      : parseResult(results[topic], topic)),
  }
}

export function loadStudyData(): StudyData {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      window.localStorage.setItem(DEFAULTS_MIGRATION_KEY, 'complete')
      return createInitialStudyData()
    }

    const data = parseStudyBackup(JSON.parse(saved) as unknown)
    if (window.localStorage.getItem(DEFAULTS_MIGRATION_KEY) !== 'complete') {
      if (!data.questionBanks['Foundational Math'].length) {
        data.questionBanks['Foundational Math'] = createDefaultFoundationalQuestions()
      }
      if (!data.settings.voiceURI) data.settings.voiceURI = PREFERRED_VOICE_URI
      window.localStorage.setItem(DEFAULTS_MIGRATION_KEY, 'complete')
    }
    return data
  } catch {
    return createInitialStudyData()
  }
}

export function saveStudyData(data: StudyData): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}
