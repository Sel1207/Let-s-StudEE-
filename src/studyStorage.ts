import { ALLOWED_DURATIONS, TOPICS, type AllowedDuration, type Question, type StudyData, type StudySettings, type Topic, type TopicPreference, type TopicResult } from './studyTypes'

const STORAGE_KEY = 'lets-studee-study-data-v1'
const DEFAULTS_MIGRATION_KEY = 'lets-studee-defaults-migration-v1'
const SPEEDS = ['slow', 'normal', 'fast'] as const
const FILTERS = ['any', 15, 20, 30, 60, 120] as const
const LEGACY_TOPIC_NAMES: Partial<Record<Topic, string>> = {
  'Differential Calculus': 'Calculus 1',
  'Integral Calculus': 'Calculus 2',
  'Series and Multivariable Calculus': 'Calculus 3',
  'DC Generators': 'DC Machines',
  'AC Motors': 'AC Machines',
  'Power System Analysis': 'Power Systems',
  'Distribution Systems': 'Distribution System',
  'Electrical Transients': 'Transient Analysis',
  'Feedback & Control Systems': 'Control Systems',
  'AC Polyphase': 'Polyphase Circuits',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function topicRecord<T>(createValue: (topic: Topic) => T): Record<Topic, T> {
  return Object.fromEntries(TOPICS.map((topic) => [topic, createValue(topic)])) as Record<Topic, T>
}

function getTopicValue(record: Record<string, unknown>, topic: Topic): unknown {
  if (Object.hasOwn(record, topic)) return record[topic]
  const legacyName = LEGACY_TOPIC_NAMES[topic]
  return legacyName && Object.hasOwn(record, legacyName) ? record[legacyName] : undefined
}

export function createInitialStudyData(): StudyData {
  return {
    version: 1,
    questionBanks: topicRecord(() => []),
    topicPreferences: topicRecord(() => ({ active: true, weight: 1 })),
    settings: {
      defaultSeconds: 60,
      speechSpeed: 'normal',
      voiceURI: '',
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
      || (entry.spokenText !== undefined && (typeof entry.spokenText !== 'string' || !entry.spokenText.trim()))
      || (entry.answer !== undefined && typeof entry.answer !== 'string')
      || (entry.spokenAnswer !== undefined && (typeof entry.spokenAnswer !== 'string' || !entry.spokenAnswer.trim()))
      || (entry.solution !== undefined && typeof entry.solution !== 'string')
      || (entry.note !== undefined && (typeof entry.note !== 'string' || !entry.note.trim()))
      || !ALLOWED_DURATIONS.includes(entry.seconds as AllowedDuration)) {
      throw new Error(`Question ${index + 1} in ${topic} is invalid.`)
    }
    if (ids.has(entry.id)) throw new Error(`Question IDs in ${topic} must be unique.`)
    ids.add(entry.id)
    return {
      id: entry.id,
      text: entry.text.trim(),
      seconds: entry.seconds as AllowedDuration,
      ...(typeof entry.spokenText === 'string' ? { spokenText: entry.spokenText.trim() } : {}),
      ...(typeof entry.answer === 'string' ? { answer: entry.answer.trim() } : {}),
      ...(typeof entry.spokenAnswer === 'string' ? { spokenAnswer: entry.spokenAnswer.trim() } : {}),
      ...(typeof entry.solution === 'string' ? { solution: entry.solution.trim() } : {}),
      ...(typeof entry.note === 'string' ? { note: entry.note.trim() } : {}),
    }
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
    questionBanks: topicRecord((topic) => getTopicValue(questionBanks, topic) !== undefined
      ? parseQuestionList(getTopicValue(questionBanks, topic), topic)
      : []),
    topicPreferences: topicRecord((topic) => getTopicValue(topicPreferences, topic) !== undefined
      ? parsePreference(getTopicValue(topicPreferences, topic), topic)
      : { active: true, weight: 1 }),
    settings: parseSettings(value.settings),
    usedQuestionIds: topicRecord((topic) => {
      const ids = getTopicValue(usedQuestionIds, topic) ?? []
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        throw new Error(`The ${topic} question progress is invalid.`)
      }
      return [...ids]
    }),
    results: topicRecord((topic) => getTopicValue(results, topic) !== undefined
      ? parseResult(getTopicValue(results, topic), topic)
      : { gotIt: 0, missedIt: 0 }),
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

const MANAGE_TOPIC_STORAGE_KEY = 'lets-studee-manage-topic-v1'

export function loadManageTopic(): Topic {
  try {
    const savedTopic = window.localStorage.getItem(MANAGE_TOPIC_STORAGE_KEY)
    return TOPICS.find((topic) => topic === savedTopic) ?? TOPICS[0]
  } catch (error) {
    console.error('Could not restore the selected question-bank topic.', error)
    return TOPICS[0]
  }
}

export function saveManageTopic(topic: Topic) {
  try {
    window.localStorage.setItem(MANAGE_TOPIC_STORAGE_KEY, topic)
  } catch (error) {
    console.error('Could not save the selected question-bank topic.', error)
  }
}
