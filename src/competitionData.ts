export type CompetitionDifficulty = 'Easy' | 'Difficult'
export type CompetitionQuestionType = 'Identification' | 'Problem-solving' | 'Multiple choice'
export type CompetitionChoices = Partial<Record<'A' | 'B' | 'C' | 'D', string>>

export interface CompetitionQuestion {
  id: string
  round: number | 'Sudden Death'
  number: number
  category: string
  difficulty: CompetitionDifficulty
  points: number
  type: CompetitionQuestionType
  question: string
  spokenQuestion: string | null
  choices: CompetitionChoices | null
  spokenChoices: CompetitionChoices | null
  answer: string
  solution: string
  timeSeconds: number | null
}

export interface CompetitionRound {
  round: number
  questions: CompetitionQuestion[]
}

export interface Competition {
  competitionName: string
  rounds: CompetitionRound[]
  suddenDeath: CompetitionQuestion[]
}

export interface CompetitionVersion {
  id: string
  name: string
  competition: Competition
  createdAt: number
  updatedAt: number
}

export interface CompetitionScoreQuestion {
  number: number
  difficulty: CompetitionDifficulty
  points: number
  earnedPoints: number
}

export interface CompetitionScoreRound {
  round: number
  score: number
  maxScore: number
  questions: CompetitionScoreQuestion[]
}

export interface CompetitionSuddenDeathScore {
  score: number
  maxScore: number
  questionCount: number
  questions: CompetitionScoreQuestion[]
}

export interface CompetitionScoreHistory {
  id: string
  competitionName: string
  savedAt: number
  score: number
  maxScore: number
  rounds: CompetitionScoreRound[]
  suddenDeath: CompetitionSuddenDeathScore | null
}

export interface CompetitionSettings {
  easySeconds: number
  difficultSeconds: number
  speechSpeed: 'slow' | 'normal' | 'fast'
  voiceURI: string
  volume: number
  muted: boolean
}

export interface CompetitionStorage {
  versions: CompetitionVersion[]
  history: CompetitionScoreHistory[]
  settings: CompetitionSettings
}

export interface CompetitionBackup {
  format: 'lets-studee-competition-backup'
  version: 1
  exportedAt: number
  competitions: CompetitionVersion[]
  history: CompetitionScoreHistory[]
}

const STORAGE_KEY = 'lets-studee-mock-competitions-v1'
const DEFAULT_SETTINGS: CompetitionSettings = {
  easySeconds: 30,
  difficultSeconds: 180,
  speechSpeed: 'normal',
  voiceURI: '',
  volume: 0.8,
  muted: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function parseScoreQuestion(value: unknown): CompetitionScoreQuestion | null {
  if (!isRecord(value) || !Number.isInteger(value.number) || Number(value.number) < 1
    || (value.difficulty !== 'Easy' && value.difficulty !== 'Difficult')
    || !isNonNegativeInteger(value.points) || value.points < 1
    || !isNonNegativeInteger(value.earnedPoints) || value.earnedPoints > value.points) return null
  return {
    number: Number(value.number),
    difficulty: value.difficulty,
    points: value.points,
    earnedPoints: value.earnedPoints,
  }
}

function parseScoreRound(value: unknown): CompetitionScoreRound | null {
  if (!isRecord(value) || !Number.isInteger(value.round) || Number(value.round) < 1
    || !isNonNegativeInteger(value.score) || !isNonNegativeInteger(value.maxScore)
    || !Array.isArray(value.questions) || !value.questions.length) return null
  const questions = value.questions.map(parseScoreQuestion)
  if (questions.some((question) => question === null)) return null
  return {
    round: Number(value.round),
    score: value.score,
    maxScore: value.maxScore,
    questions: questions as CompetitionScoreQuestion[],
  }
}

function parseSuddenDeathScore(value: unknown): CompetitionSuddenDeathScore | null {
  if (!isRecord(value) || !isNonNegativeInteger(value.score) || !isNonNegativeInteger(value.maxScore)
    || !Array.isArray(value.questions) || !value.questions.length) return null
  const questions = value.questions.map(parseScoreQuestion)
  if (questions.some((question) => question === null)) return null
  const questionCount = isNonNegativeInteger(value.questionCount) && value.questionCount >= questions.length
    ? value.questionCount
    : value.questionCount === undefined ? questions.length : 0
  if (questionCount < questions.length || questionCount < 1) return null
  return {
    score: value.score,
    maxScore: value.maxScore,
    questionCount,
    questions: questions as CompetitionScoreQuestion[],
  }
}

function parseScoreHistory(value: unknown): CompetitionScoreHistory | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id
    || typeof value.competitionName !== 'string' || !value.competitionName
    || !isNonNegativeInteger(value.savedAt) || !isNonNegativeInteger(value.score)
    || !isNonNegativeInteger(value.maxScore) || !Array.isArray(value.rounds) || !value.rounds.length
    || (value.suddenDeath !== null && value.suddenDeath !== undefined && !isRecord(value.suddenDeath))) return null
  const rounds = value.rounds.map(parseScoreRound)
  if (rounds.some((round) => round === null)) return null
  const suddenDeath = value.suddenDeath === null || value.suddenDeath === undefined
    ? null
    : parseSuddenDeathScore(value.suddenDeath)
  if (value.suddenDeath && !suddenDeath) return null
  return {
    id: value.id,
    competitionName: value.competitionName,
    savedAt: value.savedAt,
    score: value.score,
    maxScore: value.maxScore,
    rounds: rounds as CompetitionScoreRound[],
    suddenDeath,
  }
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`)
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'expected a non-empty string')
  return value.trim()
}

function readPositiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    fail(path, 'expected a positive whole number')
  }
  return value
}

function readOptionalString(value: unknown, path: string): string | null {
  if (value === undefined || value === null || value === '') return null
  return readString(value, path)
}

function parseChoices(value: unknown, path: string): CompetitionChoices | null {
  if (value === undefined || value === null) return null
  const rawChoices: Record<string, unknown> = {}
  if (Array.isArray(value)) {
    if (value.length > 4) fail(path, 'use at most four choices (A-D)')
    value.forEach((choice, choiceIndex) => { rawChoices['ABCD'[choiceIndex]] = choice })
  } else if (isRecord(value)) {
    Object.assign(rawChoices, value)
  } else {
    fail(path, 'expected null, an array, or an object with A-D choices')
  }
  const choices: CompetitionChoices = {}
  for (const key of Object.keys(rawChoices)) {
    if (!['A', 'B', 'C', 'D'].includes(key)) fail(`${path}.${key}`, 'choice labels must be A, B, C, or D')
    choices[key as keyof CompetitionChoices] = readString(rawChoices[key], `${path}.${key}`)
  }
  return Object.keys(choices).length ? choices : null
}

function parseQuestion(value: unknown, path: string, round: number | 'Sudden Death', index: number): CompetitionQuestion {
  if (!isRecord(value)) fail(path, 'expected an object')
  const number = readPositiveInteger(value.number, `${path}.number`)
  const category = readString(value.category, `${path}.category`)
  if (value.difficulty !== 'Easy' && value.difficulty !== 'Difficult') {
    fail(`${path}.difficulty`, 'expected "Easy" or "Difficult"')
  }
  const difficulty = value.difficulty
  const expectedPoints = difficulty === 'Easy' ? 1 : 3
  const points = readPositiveInteger(value.points, `${path}.points`)
  if (points !== expectedPoints) fail(`${path}.points`, `must be ${expectedPoints} for ${difficulty}`)
  if (value.type !== 'Identification' && value.type !== 'Problem-solving' && value.type !== 'Multiple choice') {
    fail(`${path}.type`, 'expected "Identification", "Problem-solving", or "Multiple choice"')
  }

  const choices = parseChoices(value.choices, `${path}.choices`)
  const spokenChoices = parseChoices(value.spokenChoices, `${path}.spokenChoices`)

  let timeSeconds: number | null = null
  if (value.timeSeconds !== undefined && value.timeSeconds !== null) {
    timeSeconds = readPositiveInteger(value.timeSeconds, `${path}.timeSeconds`)
  }

  return {
    id: `${round}-${number}-${index}`,
    round,
    number,
    category,
    difficulty,
    points,
    type: value.type,
    question: readString(value.question, `${path}.question`),
    spokenQuestion: readOptionalString(value.spokenQuestion, `${path}.spokenQuestion`),
    choices,
    spokenChoices,
    answer: readString(value.answer, `${path}.answer`),
    solution: readString(value.solution, `${path}.solution`),
    timeSeconds,
  }
}

function syntaxLocation(source: string, position: number): string {
  const before = source.slice(0, position)
  const lines = before.split('\n')
  return `line ${lines.length}, column ${lines.at(-1)!.length + 1}`
}

export function parseCompetitionText(source: string): Competition {
  let value: unknown
  try {
    value = JSON.parse(source) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.'
    const match = message.match(/position\s+(\d+)/i)
    const where = match ? ` (${syntaxLocation(source, Number(match[1]))})` : ''
    throw new Error(`Invalid JSON${where}: ${message}`)
  }
  if (!isRecord(value)) fail('root', 'expected a JSON object')
  const competitionName = readString(value.competitionName, 'competitionName')
  if (!Array.isArray(value.rounds) || value.rounds.length === 0) {
    fail('rounds', 'expected a non-empty array of rounds')
  }
  let questionIndex = 0
  const rounds: CompetitionRound[] = value.rounds.map((rawRound, roundIndex) => {
    const path = `rounds[${roundIndex}]`
    if (!isRecord(rawRound)) fail(path, 'expected an object')
    const round = readPositiveInteger(rawRound.round, `${path}.round`)
    if (!Array.isArray(rawRound.questions) || rawRound.questions.length === 0) {
      fail(`${path}.questions`, 'expected a non-empty array of questions')
    }
    const questions = rawRound.questions.map((rawQuestion, itemIndex) => (
      parseQuestion(rawQuestion, `${path}.questions[${itemIndex}]`, round, questionIndex++)
    ))
    return { round, questions }
  })
  let suddenDeath: CompetitionQuestion[] = []
  if (value.suddenDeath !== undefined) {
    if (!Array.isArray(value.suddenDeath)) fail('suddenDeath', 'expected an array')
    suddenDeath = value.suddenDeath.map((question, index) => (
      parseQuestion(question, `suddenDeath[${index}]`, 'Sudden Death', questionIndex++)
    ))
  }
  return { competitionName, rounds, suddenDeath }
}

type CompetitionTextFields = Record<string, string>

function textFieldName(label: string): string | null {
  const key = label.toLowerCase().replace(/[^a-z0-9]/g, '')
  const names: Record<string, string> = {
    competitionname: 'competitionName',
    name: 'competitionName',
    round: 'round',
    questionnumber: 'number',
    number: 'number',
    category: 'category',
    subject: 'category',
    difficulty: 'difficulty',
    points: 'points',
    type: 'type',
    questiontype: 'type',
    timeseconds: 'timeSeconds',
    time: 'timeSeconds',
    timelimit: 'timeSeconds',
    question: 'question',
    questiontext: 'question',
    questionreadaloud: 'spokenQuestion',
    spokenquestion: 'spokenQuestion',
    choicea: 'choiceA',
    choiceb: 'choiceB',
    choicec: 'choiceC',
    choiced: 'choiceD',
    choiceareadaloud: 'spokenChoiceA',
    choicebreadaloud: 'spokenChoiceB',
    choicecreadaloud: 'spokenChoiceC',
    choicedreadaloud: 'spokenChoiceD',
    spokenchoicea: 'spokenChoiceA',
    spokenchoiceb: 'spokenChoiceB',
    spokenchoicec: 'spokenChoiceC',
    spokenchoiced: 'spokenChoiceD',
    answer: 'answer',
    solution: 'solution',
    extractionnotes: 'notes',
    uncertainfixes: 'notes',
    uncertainreadings: 'notes',
  }
  return names[key] ?? null
}

function parseTextTime(value: string | undefined, path: string): number | null {
  if (value === undefined || /^(null|default|not specified)$/i.test(value.trim())) return null
  const normalized = value.trim().toLowerCase()
  const minutes = normalized.match(/^(\d+)\s*(?:minutes?|mins?|m)$/)
  if (minutes) return readPositiveInteger(Number(minutes[1]) * 60, path)
  const seconds = normalized.match(/^(\d+)\s*(?:seconds?|secs?|s)?$/)
  if (!seconds) fail(path, 'expected a positive time in seconds, minutes, or null')
  return readPositiveInteger(Number(seconds[1]), path)
}

/** Accept the labeled, speaker-friendly plain-text format as well as the legacy JSON format. */
export function parseCompetitionInput(source: string): Competition {
  const plainText = source.trim()
    .replace(/^```[^\r\n]*\r?\n/, '')
    .replace(/\r?\n```\s*$/, '')
  if (plainText.startsWith('{') || plainText.startsWith('[')) return parseCompetitionText(plainText)

  const records: CompetitionTextFields[] = []
  const recordLines: number[] = []
  let fields: CompetitionTextFields = {}
  let activeField = ''
  let recordLine = 1
  let name = ''
  const lines = plainText.split(/\r?\n/)

  const flush = () => {
    if (!Object.keys(fields).length) return
    records.push(fields)
    recordLines.push(recordLine)
    fields = {}
    activeField = ''
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (/^---+\s*$/.test(line)) {
      flush()
      recordLine = index + 2
      return
    }
    if (!line) return

    const match = line.match(/^\*{0,2}([^:]+?):\*{0,2}\s*(.*)$/)
    if (!match) {
      if (!activeField) fail(`line ${index + 1}`, 'expected a labeled field such as "Question: ..."')
      fields[activeField] = fields[activeField] ? `${fields[activeField]} ${line}` : line
      return
    }

    const field = textFieldName(match[1].replace(/\*/g, '').trim())
    if (!field) fail(`line ${index + 1}`, `unrecognized field "${match[1].trim()}"`)
    if (field === 'round' && (fields.question !== undefined || fields.answer !== undefined)) {
      flush()
      recordLine = index + 1
    }
    if (fields[field] !== undefined) fail(`line ${index + 1}`, `duplicate ${match[1].trim()} field`)
    const fieldValue = match[2].replace(/^\*{1,2}|\*{1,2}$/g, '').trim()
    fields[field] = fieldValue
    activeField = field
  })
  flush()

  const questions = records.filter((record) => record.round !== undefined)
  for (const [index, record] of records.entries()) {
    if (record.competitionName) {
      if (name && name !== record.competitionName) fail(`text block ${index + 1}`, 'competition name must be declared only once')
      name = record.competitionName
    }
    if (record.round === undefined && !record.competitionName && record.notes === undefined) {
      fail(`text block ${index + 1}`, `expected a Round field (block begins at line ${recordLines[index]})`)
    }
  }
  if (!name) fail('Competition Name', 'add a non-empty competition name before the first question')
  if (!questions.length) fail('questions', 'no question blocks found; each question needs a Round field')

  const rounds: CompetitionRound[] = []
  const suddenDeath: CompetitionQuestion[] = []
  const seenRounds = new Set<number>()
  let previousRound: number | null = null
  let questionIndex = 0

  questions.forEach((record, index) => {
    const path = `question block ${index + 1}`
    const roundText = record.round.trim()
    const isSuddenDeath = /^sudden\s*death$/i.test(roundText)
    const choices: CompetitionChoices = {}
    const spokenChoices: CompetitionChoices = {}
    for (const letter of ['A', 'B', 'C', 'D'] as const) {
      const choice = record[`choice${letter}`]
      if (choice) choices[letter] = choice
      const spokenChoice = record[`spokenChoice${letter}`]
      if (spokenChoice) spokenChoices[letter] = spokenChoice
    }
    const timeSeconds = parseTextTime(record.timeSeconds, `${path}.timeSeconds`)
    const rawQuestion = {
      number: Number(record.number),
      category: record.category,
      difficulty: record.difficulty,
      points: Number(record.points),
      type: record.type,
      question: record.question,
      spokenQuestion: record.spokenQuestion,
      choices: Object.keys(choices).length ? choices : null,
      spokenChoices: Object.keys(spokenChoices).length ? spokenChoices : null,
      answer: record.answer,
      solution: record.solution,
      timeSeconds,
    }
    if (isSuddenDeath) {
      suddenDeath.push(parseQuestion(rawQuestion, path, 'Sudden Death', questionIndex++))
      return
    }

    const round = readPositiveInteger(Number(roundText), `${path}.round`)
    const parsed = parseQuestion(rawQuestion, path, round, questionIndex++)
    if (previousRound !== round) {
      if (seenRounds.has(round)) fail(`${path}.round`, 'round questions must be grouped together to preserve their order')
      rounds.push({ round, questions: [] })
      seenRounds.add(round)
      previousRound = round
    }
    rounds.at(-1)!.questions.push(parsed)
  })

  if (!rounds.length) fail('rounds', 'expected at least one regular round')
  return { competitionName: name, rounds, suddenDeath }
}

export function createCompetitionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function competitionNameKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function defaultCompetitionSettings(): CompetitionSettings {
  return { ...DEFAULT_SETTINGS }
}

export function createCompetitionBackup(storage: Pick<CompetitionStorage, 'versions' | 'history'>): string {
  const backup: CompetitionBackup = {
    format: 'lets-studee-competition-backup',
    version: 1,
    exportedAt: Date.now(),
    competitions: storage.versions,
    history: storage.history,
  }
  return JSON.stringify(backup, null, 2)
}

export function parseCompetitionBackup(source: string): Pick<CompetitionStorage, 'versions' | 'history'> {
  let value: unknown
  try {
    value = JSON.parse(source) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.'
    throw new Error(`This backup is not valid JSON: ${message}`)
  }
  if (!isRecord(value)) fail('backup', 'expected a JSON object')
  if (value.format !== 'lets-studee-competition-backup' || value.version !== 1) {
    fail('backup', 'this file is not a supported Mock Competition backup')
  }
  if (!Array.isArray(value.competitions)) fail('competitions', 'expected an array')
  if (!Array.isArray(value.history)) fail('history', 'expected an array')

  const versions = value.competitions.map((entry, index): CompetitionVersion => {
    const path = `competitions[${index}]`
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim()
      || typeof entry.name !== 'string' || !entry.name.trim()
      || typeof entry.createdAt !== 'number' || !Number.isFinite(entry.createdAt) || entry.createdAt <= 0
      || typeof entry.updatedAt !== 'number' || !Number.isFinite(entry.updatedAt) || entry.updatedAt <= 0
      || !isRecord(entry.competition)) fail(path, 'expected a saved competition with its name, dates, and question data')
    let competition: Competition
    try {
      competition = parseCompetitionText(JSON.stringify(entry.competition))
    } catch (error) {
      fail(`${path}.competition`, error instanceof Error ? error.message : 'invalid competition data')
    }
    return {
      id: entry.id,
      name: entry.name,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      competition,
    }
  })

  const history = value.history.map((entry, index): CompetitionScoreHistory => {
    const parsed = parseScoreHistory(entry)
    if (!parsed) fail(`history[${index}]`, 'invalid saved score entry')
    return parsed
  })
  if (versions.length === 0 && history.length === 0) fail('backup', 'there are no saved competitions or scores to import')
  return { versions, history }
}

export function loadCompetitionStorage(): CompetitionStorage {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return { versions: [], history: [], settings: defaultCompetitionSettings() }
    const value: unknown = JSON.parse(saved)
    if (!isRecord(value)) return { versions: [], history: [], settings: defaultCompetitionSettings() }
    const versions = Array.isArray(value.versions) ? value.versions.flatMap((entry): CompetitionVersion[] => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string'
        || typeof entry.createdAt !== 'number' || typeof entry.updatedAt !== 'number'
        || !isRecord(entry.competition)) return []
      try {
        const competition = parseCompetitionText(JSON.stringify(entry.competition))
        return [{ id: entry.id, name: entry.name, competition, createdAt: entry.createdAt, updatedAt: entry.updatedAt }]
      } catch {
        return []
      }
    }) : []
    const history = Array.isArray(value.history)
      ? value.history.flatMap((entry): CompetitionScoreHistory[] => {
        const parsed = parseScoreHistory(entry)
        return parsed ? [parsed] : []
      })
      : []
    const settings = isRecord(value.settings) ? value.settings : {}
    return {
      versions,
      history,
      settings: {
        easySeconds: Number.isInteger(settings.easySeconds) && Number(settings.easySeconds) > 0 ? Number(settings.easySeconds) : DEFAULT_SETTINGS.easySeconds,
        difficultSeconds: Number.isInteger(settings.difficultSeconds) && Number(settings.difficultSeconds) > 0 ? Number(settings.difficultSeconds) : DEFAULT_SETTINGS.difficultSeconds,
        speechSpeed: settings.speechSpeed === 'slow' || settings.speechSpeed === 'fast' ? settings.speechSpeed : 'normal',
        voiceURI: typeof settings.voiceURI === 'string' ? settings.voiceURI : '',
        volume: typeof settings.volume === 'number' ? Math.max(0, Math.min(1, settings.volume)) : DEFAULT_SETTINGS.volume,
        muted: typeof settings.muted === 'boolean' ? settings.muted : false,
      },
    }
  } catch {
    return { versions: [], history: [], settings: defaultCompetitionSettings() }
  }
}

export function saveCompetitionStorage(storage: CompetitionStorage): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
    return true
  } catch {
    return false
  }
}
