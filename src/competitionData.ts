import { LEGACY_TOPIC_ALIASES, TOPICS, type Topic } from './studyTypes'

export type CompetitionDifficulty = 'Easy' | 'Average' | 'Difficult'
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
  spokenAnswer: string | null
  solution: string
  timeSeconds: number | null
  note?: string
  studySource?: { topic: Topic; questionId: string }
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
  subject: string
  competition: Competition
  createdAt: number
  updatedAt: number
}

export interface CompetitionScoreQuestion {
  number: number
  difficulty: CompetitionDifficulty
  points: number
  earnedPoints: number
  snapshot?: CompetitionQuestionSnapshot
}

export interface CompetitionQuestionSnapshot {
  category: string
  type: CompetitionQuestionType
  question: string
  choices: CompetitionChoices | null
  answer: string
  solution: string
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
  sourceVersionId?: string
  competitionName: string
  savedAt: number
  score: number
  maxScore: number
  rounds: CompetitionScoreRound[]
  suddenDeath: CompetitionSuddenDeathScore | null
}

export interface CompetitionFavorite {
  id: string
  sourceVersionId: string
  questionId: string
  source?: 'study'
  studyTopic?: string
  competitionName: string
  round: number | 'Sudden Death'
  number: number
  category: string
  difficulty: CompetitionDifficulty
  points: number
  type: CompetitionQuestionType
  question: string
  choices: CompetitionChoices | null
  answer: string
  solution: string
  timeSeconds: number
  savedAt: number
}

export interface CompetitionSettings {
  easySeconds: number
  averageSeconds: number
  difficultSeconds: number
  speechSpeed: 'slow' | 'normal' | 'fast'
  voiceURI: string
  volume: number
  muted: boolean
}

export interface CompetitionStorage {
  versions: CompetitionVersion[]
  history: CompetitionScoreHistory[]
  favorites: CompetitionFavorite[]
  settings: CompetitionSettings
  subjects: string[]
  activeSubject: string
}

export interface CompetitionBackup {
  format: 'lets-studee-competition-backup'
  version: 1
  exportedAt: number
  competitions: CompetitionVersion[]
  history: CompetitionScoreHistory[]
  favorites: CompetitionFavorite[]
  subjects?: string[]
}

const STORAGE_KEY = 'lets-studee-mock-competitions-v1'
const DEFAULT_SETTINGS: CompetitionSettings = {
  easySeconds: 30,
  averageSeconds: 90,
  difficultSeconds: 180,
  speechSpeed: 'normal',
  voiceURI: '',
  volume: 0.8,
  muted: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDifficulty(value: unknown): value is CompetitionDifficulty {
  return value === 'Easy' || value === 'Average' || value === 'Difficult'
}

function isEsasSubject(subject: string): boolean {
  return competitionNameKey(subject) === 'esas'
}

function isElectricalEngineeringSubject(subject: string): boolean {
  const key = competitionNameKey(subject)
  return key === 'ee' || key === 'electrical engineering'
}

function usesThreeDifficultyLevels(subject: string): boolean {
  return isEsasSubject(subject) || isElectricalEngineeringSubject(subject)
}

function expectedPoints(difficulty: CompetitionDifficulty, subject: string): number | null {
  if (usesThreeDifficultyLevels(subject)) {
    return difficulty === 'Easy' ? 1 : difficulty === 'Average' ? 3 : 5
  }
  if (difficulty === 'Easy') return 1
  if (difficulty === 'Difficult') return 3
  return null
}

function validateSubjectFormat(competition: Competition, subject: string): Competition {
  if (isEsasSubject(subject)
    && (competition.rounds.length !== 3
      || competition.rounds.some((round, index) => round.round !== index + 1 || round.questions.length !== 7))) {
    fail('rounds', 'ESAS competitions must have exactly three rounds, with seven questions in each round')
  }
  if (isElectricalEngineeringSubject(subject)) {
    const expectedDifficulties: CompetitionDifficulty[] = ['Easy', 'Average', 'Difficult']
    if (competition.rounds.length !== expectedDifficulties.length
      || competition.rounds.some((round, index) => round.round !== index + 1 || round.questions.length !== 5)) {
      fail('rounds', 'EE competitions must have exactly three rounds, with five questions in each round')
    }
    competition.rounds.forEach((round, index) => {
      if (round.questions.some((question) => question.difficulty !== expectedDifficulties[index])) {
        fail(`rounds[${index}].questions`, `all questions in Round ${index + 1} must be ${expectedDifficulties[index]}`)
      }
    })
  }
  return competition
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function parseScoreQuestion(value: unknown): CompetitionScoreQuestion | null {
  if (!isRecord(value) || !Number.isInteger(value.number) || Number(value.number) < 1
    || !isDifficulty(value.difficulty)
    || !isNonNegativeInteger(value.points) || value.points < 1
    || !isNonNegativeInteger(value.earnedPoints) || value.earnedPoints > value.points) return null
  return {
    number: Number(value.number),
    difficulty: value.difficulty,
    points: value.points,
    earnedPoints: value.earnedPoints,
    snapshot: parseQuestionSnapshot(value.snapshot) ?? undefined,
  }
}

function parseQuestionSnapshot(value: unknown): CompetitionQuestionSnapshot | null {
  if (!isRecord(value) || typeof value.category !== 'string' || !value.category
    || (value.type !== 'Identification' && value.type !== 'Problem-solving' && value.type !== 'Multiple choice')
    || typeof value.question !== 'string' || !value.question
    || typeof value.answer !== 'string' || !value.answer
    || typeof value.solution !== 'string' || !value.solution) return null
  let choices: CompetitionChoices | null
  try {
    choices = parseChoices(value.choices, 'question snapshot.choices')
  } catch {
    return null
  }
  return {
    category: value.category,
    type: value.type,
    question: value.question,
    choices,
    answer: value.answer,
    solution: value.solution,
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
    ...(typeof value.sourceVersionId === 'string' && value.sourceVersionId ? { sourceVersionId: value.sourceVersionId } : {}),
    competitionName: value.competitionName,
    savedAt: value.savedAt,
    score: value.score,
    maxScore: value.maxScore,
    rounds: rounds as CompetitionScoreRound[],
    suddenDeath,
  }
}

function parseFavorite(value: unknown): CompetitionFavorite | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id
    || typeof value.sourceVersionId !== 'string' || !value.sourceVersionId
    || typeof value.questionId !== 'string' || !value.questionId
    || typeof value.competitionName !== 'string' || !value.competitionName
    || (value.round !== 'Sudden Death' && (!Number.isInteger(value.round) || Number(value.round) < 1))
    || !Number.isInteger(value.number) || Number(value.number) < 1
    || typeof value.category !== 'string' || !value.category
    || !isDifficulty(value.difficulty)
    || !isNonNegativeInteger(value.points) || value.points < 1
    || (value.type !== 'Identification' && value.type !== 'Problem-solving' && value.type !== 'Multiple choice')
    || typeof value.question !== 'string' || !value.question
    || typeof value.answer !== 'string' || !value.answer
    || typeof value.solution !== 'string' || !value.solution
    || !isNonNegativeInteger(value.timeSeconds) || value.timeSeconds < 1
    || !isNonNegativeInteger(value.savedAt)) return null
  let choices: CompetitionChoices | null
  try {
    choices = parseChoices(value.choices, 'favorite.choices')
  } catch {
    return null
  }
  const savedStudyTopic = typeof value.studyTopic === 'string' ? value.studyTopic : undefined
  const normalizedStudyTopic = savedStudyTopic
    ? TOPICS.find((topic) => topic === savedStudyTopic) ?? LEGACY_TOPIC_ALIASES[savedStudyTopic]
    : undefined
  return {
    id: value.source === 'study' && normalizedStudyTopic
      ? `study:${encodeURIComponent(normalizedStudyTopic)}:${encodeURIComponent(value.questionId)}`
      : value.id,
    sourceVersionId: value.sourceVersionId,
    questionId: value.questionId,
    ...(value.source === 'study' ? { source: 'study' as const } : {}),
    ...(savedStudyTopic ? { studyTopic: normalizedStudyTopic ?? savedStudyTopic } : {}),
    competitionName: value.competitionName,
    round: value.round === 'Sudden Death' ? value.round : Number(value.round),
    number: Number(value.number),
    category: value.category,
    difficulty: value.difficulty,
    points: Number(value.points),
    type: value.type,
    question: value.question,
    choices,
    answer: value.answer,
    solution: value.solution,
    timeSeconds: Number(value.timeSeconds),
    savedAt: Number(value.savedAt),
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

function parseQuestion(value: unknown, path: string, round: number | 'Sudden Death', index: number, subject: string): CompetitionQuestion {
  if (!isRecord(value)) fail(path, 'expected an object')
  const number = readPositiveInteger(value.number, `${path}.number`)
  const category = readString(value.category, `${path}.category`)
  if (!isDifficulty(value.difficulty) || (!usesThreeDifficultyLevels(subject) && value.difficulty === 'Average')) {
    fail(`${path}.difficulty`, usesThreeDifficultyLevels(subject) ? 'expected "Easy", "Average", or "Difficult"' : 'expected "Easy" or "Difficult"')
  }
  const difficulty = value.difficulty
  const expectedQuestionPoints = expectedPoints(difficulty, subject)
  const points = readPositiveInteger(value.points, `${path}.points`)
  if (points !== expectedQuestionPoints) fail(`${path}.points`, `must be ${expectedQuestionPoints} for ${difficulty}`)
  if (value.type !== 'Identification' && value.type !== 'Problem-solving' && value.type !== 'Multiple choice') {
    fail(`${path}.type`, 'expected "Identification", "Problem-solving", or "Multiple choice"')
  }

  const choices = parseChoices(value.choices, `${path}.choices`)
  const spokenChoices = parseChoices(value.spokenChoices, `${path}.spokenChoices`)

  let timeSeconds: number | null = null
  if (value.timeSeconds !== undefined && value.timeSeconds !== null) {
    timeSeconds = readPositiveInteger(value.timeSeconds, `${path}.timeSeconds`)
  }
  let studySource: CompetitionQuestion['studySource']
  if (value.studySource !== undefined) {
    const savedTopic = isRecord(value.studySource) && typeof value.studySource.topic === 'string'
      ? value.studySource.topic
      : ''
    const topic = TOPICS.find((item) => item === savedTopic) ?? LEGACY_TOPIC_ALIASES[savedTopic]
    if (!isRecord(value.studySource) || !topic) {
      fail(`${path}.studySource`, 'expected a Study topic and question ID')
    }
    studySource = {
      topic,
      questionId: readString(value.studySource.questionId, `${path}.studySource.questionId`),
    }
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
    spokenAnswer: readOptionalString(value.spokenAnswer, `${path}.spokenAnswer`),
    solution: readString(value.solution, `${path}.solution`),
    timeSeconds,
    ...(typeof value.note === 'string' && value.note.trim() ? { note: value.note.trim() } : {}),
    ...(studySource ? { studySource } : {}),
  }
}

function syntaxLocation(source: string, position: number): string {
  const before = source.slice(0, position)
  const lines = before.split('\n')
  return `line ${lines.length}, column ${lines.at(-1)!.length + 1}`
}

export function parseCompetitionText(source: string, subject = 'Math'): Competition {
  let value: unknown
  try {
    value = JSON.parse(source) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.'
    const match = message.match(/position\s+(\d+)/i)
    const where = match ? ` (${syntaxLocation(source, Number(match[1]))})` : ''
    throw new Error(`Invalid JSON${where}: ${message}`, { cause: error })
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
      parseQuestion(rawQuestion, `${path}.questions[${itemIndex}]`, round, questionIndex++, subject)
    ))
    return { round, questions }
  })
  let suddenDeath: CompetitionQuestion[] = []
  if (value.suddenDeath !== undefined) {
    if (!Array.isArray(value.suddenDeath)) fail('suddenDeath', 'expected an array')
    suddenDeath = value.suddenDeath.map((question, index) => (
      parseQuestion(question, `suddenDeath[${index}]`, 'Sudden Death', questionIndex++, subject)
    ))
  }
  return validateSubjectFormat({ competitionName, rounds, suddenDeath }, subject)
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
    answerreadaloud: 'spokenAnswer',
    spokenanswer: 'spokenAnswer',
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
export function parseCompetitionInput(source: string, subject = 'Math'): Competition {
  const plainText = source.trim()
    .replace(/^```[^\r\n]*\r?\n/, '')
    .replace(/\r?\n```\s*$/, '')
  if (plainText.startsWith('{') || plainText.startsWith('[')) return parseCompetitionText(plainText, subject)

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
      spokenAnswer: record.spokenAnswer,
      solution: record.solution,
      timeSeconds,
    }
    if (isSuddenDeath) {
      suddenDeath.push(parseQuestion(rawQuestion, path, 'Sudden Death', questionIndex++, subject))
      return
    }

    const round = readPositiveInteger(Number(roundText), `${path}.round`)
    const parsed = parseQuestion(rawQuestion, path, round, questionIndex++, subject)
    if (previousRound !== round) {
      if (seenRounds.has(round)) fail(`${path}.round`, 'round questions must be grouped together to preserve their order')
      rounds.push({ round, questions: [] })
      seenRounds.add(round)
      previousRound = round
    }
    rounds.at(-1)!.questions.push(parsed)
  })

  if (!rounds.length) fail('rounds', 'expected at least one regular round')
  return validateSubjectFormat({ competitionName: name, rounds, suddenDeath }, subject)
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

export function defaultCompetitionSubjects(): string[] {
  return ['Math', 'EE', 'ESAS']
}

export function createCompetitionBackup(storage: Pick<CompetitionStorage, 'versions' | 'history' | 'favorites'> & Partial<Pick<CompetitionStorage, 'subjects'>>): string {
  const backup: CompetitionBackup = {
    format: 'lets-studee-competition-backup',
    version: 1,
    exportedAt: Date.now(),
    competitions: storage.versions,
    history: storage.history,
    favorites: storage.favorites,
    subjects: storage.subjects ?? defaultCompetitionSubjects(),
  }
  return JSON.stringify(backup, null, 2)
}

export function parseCompetitionBackup(source: string): Pick<CompetitionStorage, 'versions' | 'history' | 'favorites' | 'subjects'> {
  let value: unknown
  try {
    value = JSON.parse(source) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.'
    throw new Error(`This backup is not valid JSON: ${message}`, { cause: error })
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
    const subject = typeof entry.subject === 'string' && entry.subject.trim() ? entry.subject.trim() : 'Math'
    let competition: Competition
    try {
      competition = parseCompetitionText(JSON.stringify(entry.competition), subject)
    } catch (error) {
      fail(`${path}.competition`, error instanceof Error ? error.message : 'invalid competition data')
    }
    return {
      id: entry.id,
      name: entry.name,
      subject,
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
  const favorites = Array.isArray(value.favorites)
    ? value.favorites.map((entry, index): CompetitionFavorite => {
      const parsed = parseFavorite(entry)
      if (!parsed) fail(`favorites[${index}]`, 'invalid saved question')
      return parsed
    })
    : []
  const importedSubjects = Array.isArray(value.subjects)
    ? value.subjects.filter((subject): subject is string => typeof subject === 'string' && Boolean(subject.trim())).map((subject) => subject.trim())
    : []
  const subjects = [...new Map([...defaultCompetitionSubjects(), ...versions.map((version) => version.subject), ...importedSubjects]
    .map((subject) => [subject.normalize('NFKC').toLowerCase(), subject])).values()]
  if (versions.length === 0 && history.length === 0 && favorites.length === 0) fail('backup', 'there are no saved competitions, scores, or favorite questions to import')
  return { versions, history, favorites, subjects }
}

export function loadCompetitionStorage(): CompetitionStorage {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return { versions: [], history: [], favorites: [], settings: defaultCompetitionSettings(), subjects: defaultCompetitionSubjects(), activeSubject: 'Math' }
    const value: unknown = JSON.parse(saved)
    if (!isRecord(value)) return { versions: [], history: [], favorites: [], settings: defaultCompetitionSettings(), subjects: defaultCompetitionSubjects(), activeSubject: 'Math' }
    const versions = Array.isArray(value.versions) ? value.versions.flatMap((entry): CompetitionVersion[] => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string'
        || typeof entry.createdAt !== 'number' || typeof entry.updatedAt !== 'number'
        || !isRecord(entry.competition)) return []
      const subject = typeof entry.subject === 'string' && entry.subject.trim() ? entry.subject.trim() : 'Math'
      try {
        const competition = parseCompetitionText(JSON.stringify(entry.competition), subject)
        return [{
          id: entry.id,
          name: entry.name,
          subject,
          competition,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        }]
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
    const favorites = Array.isArray(value.favorites)
      ? value.favorites.flatMap((entry): CompetitionFavorite[] => {
        const parsed = parseFavorite(entry)
        return parsed ? [parsed] : []
      })
      : []
    const settings = isRecord(value.settings) ? value.settings : {}
    const subjects = Array.isArray(value.subjects)
      ? value.subjects.filter((subject): subject is string => typeof subject === 'string' && Boolean(subject.trim())).map((subject) => subject.trim())
      : []
    const normalizedSubjects = [...new Map([...defaultCompetitionSubjects(), ...versions.map((version) => version.subject), ...subjects]
      .map((subject) => [subject.normalize('NFKC').toLowerCase(), subject])).values()]
    const savedActiveSubject = typeof value.activeSubject === 'string' ? value.activeSubject : 'Math'
    const activeSubject = normalizedSubjects.find((subject) => (
      subject.normalize('NFKC').toLowerCase() === savedActiveSubject.normalize('NFKC').toLowerCase()
    ))
      ?? 'Math'
    return {
      versions,
      history,
      favorites,
      subjects: normalizedSubjects,
      activeSubject,
      settings: {
        easySeconds: Number.isInteger(settings.easySeconds) && Number(settings.easySeconds) > 0 ? Number(settings.easySeconds) : DEFAULT_SETTINGS.easySeconds,
        averageSeconds: Number.isInteger(settings.averageSeconds) && Number(settings.averageSeconds) > 0 ? Number(settings.averageSeconds) : DEFAULT_SETTINGS.averageSeconds,
        difficultSeconds: Number.isInteger(settings.difficultSeconds) && Number(settings.difficultSeconds) > 0 ? Number(settings.difficultSeconds) : DEFAULT_SETTINGS.difficultSeconds,
        speechSpeed: settings.speechSpeed === 'slow' || settings.speechSpeed === 'fast' ? settings.speechSpeed : 'normal',
        voiceURI: typeof settings.voiceURI === 'string' ? settings.voiceURI : '',
        volume: typeof settings.volume === 'number' ? Math.max(0, Math.min(1, settings.volume)) : DEFAULT_SETTINGS.volume,
        muted: typeof settings.muted === 'boolean' ? settings.muted : false,
      },
    }
  } catch {
    return { versions: [], history: [], favorites: [], settings: defaultCompetitionSettings(), subjects: defaultCompetitionSubjects(), activeSubject: 'Math' }
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
