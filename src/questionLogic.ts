import { ALLOWED_DURATIONS, TOPICS, type AllowedDuration, type Preset, type Question, type StudyData, type Topic, type TimeFilter } from './studyTypes'

const SECOND_ONLY_DURATIONS = [20, 30, 45, 60, 90, 150]
function createQuestionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function parseDurationToken(token: string): AllowedDuration | null {
  const value = token.trim().toLowerCase().replace(/\s+/g, '')
  const compound = value.match(/^([1-3])m(30s)?$/)
  if (compound) {
    const seconds = Number(compound[1]) * 60 + (compound[2] ? 30 : 0)
    return ALLOWED_DURATIONS.includes(seconds as AllowedDuration) ? seconds as AllowedDuration : null
  }

  const simple = value.match(/^(\d+)(m|s)?$/)
  if (!simple) return null
  const amount = Number(simple[1])
  const unit = simple[2]
  const seconds = unit === 'm' ? amount * 60 : amount
  const allowed = unit === 'm' ? [60, 120, 180] : SECOND_ONLY_DURATIONS
  return allowed.includes(seconds) ? seconds as AllowedDuration : null
}

export function parseQuestionLines(text: string, defaultSeconds: AllowedDuration): Question[] {
  const questions: Question[] = []

  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return

    let seconds = defaultSeconds
    let questionText = line.trim()
    const separator = line.indexOf('|')
    if (separator >= 0) {
      const parsedSeconds = parseDurationToken(line.slice(0, separator))
      if (parsedSeconds === null) {
        throw new Error(`Line ${index + 1}: use 20, 30, 45, 60, 90, 1m, 2m, 2m30s, or 3m before the |.`)
      }
      seconds = parsedSeconds
      questionText = line.slice(separator + 1).trim()
    }

    if (!questionText) throw new Error(`Line ${index + 1}: add question text after the time.`)
    questions.push({ id: createQuestionId(), text: questionText, seconds })
  })

  if (!questions.length) throw new Error('Paste at least one question, one per line.')
  return questions
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`
}

function numberWords(value: number): string {
  const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  if (value < 20) return small[value] ?? String(value)
  const ten = Math.floor(value / 10)
  const unit = value % 10
  return unit ? `${tens[ten]}-${small[unit]}` : tens[ten]
}

export function spokenDuration(seconds: number): string {
  if (seconds < 60) return `${numberWords(seconds)} seconds`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  const minuteText = `${numberWords(minutes)} minute${minutes === 1 ? '' : 's'}`
  return remainder ? `${minuteText} ${numberWords(remainder)} seconds` : minuteText
}

export function matchesTimeFilter(question: Question, filter: TimeFilter): boolean {
  return filter === 'any' || question.seconds === filter
}

function getActiveQuestionPools(data: StudyData): Partial<Record<Topic, Question[]>> {
  const pools: Partial<Record<Topic, Question[]>> = {}
  for (const topic of TOPICS) {
    const preference = data.topicPreferences[topic]
    if (!preference.active || preference.weight <= 0) continue
    const questions = data.questionBanks[topic].filter((question) => matchesTimeFilter(question, data.settings.timeFilter))
    if (questions.length) pools[topic] = questions
  }
  return pools
}

function unusedPools(data: StudyData, pools: Partial<Record<Topic, Question[]>>): Partial<Record<Topic, Question[]>> {
  const unused: Partial<Record<Topic, Question[]>> = {}
  for (const topic of TOPICS) {
    const questions = pools[topic]
    if (!questions) continue
    const used = new Set(data.usedQuestionIds[topic])
    const remaining = questions.filter((question) => !used.has(question.id))
    if (remaining.length) unused[topic] = remaining
  }
  return unused
}

function hasQuestions(pools: Partial<Record<Topic, Question[]>>): boolean {
  return TOPICS.some((topic) => Boolean(pools[topic]?.length))
}

export function topicChances(data: StudyData): Record<Topic, number> {
  const pools = getActiveQuestionPools(data)
  const remaining = unusedPools(data, pools)
  const available = hasQuestions(remaining) ? remaining : pools
  const totalWeight = TOPICS.reduce((total, topic) => {
    return total + (available[topic]?.length ? data.topicPreferences[topic].weight : 0)
  }, 0)

  return Object.fromEntries(TOPICS.map((topic) => [
    topic,
    totalWeight > 0 && available[topic]?.length
      ? data.topicPreferences[topic].weight / totalWeight * 100
      : 0,
  ])) as Record<Topic, number>
}

export function questionCounts(data: StudyData): Record<Topic, number> {
  return Object.fromEntries(TOPICS.map((topic) => [
    topic,
    data.questionBanks[topic].filter((question) => matchesTimeFilter(question, data.settings.timeFilter)).length,
  ])) as Record<Topic, number>
}

export function drawQuestion(data: StudyData): { question: Question; topic: Topic; data: StudyData } | null {
  const pools = getActiveQuestionPools(data)
  let available = unusedPools(data, pools)
  let nextData = data

  if (!hasQuestions(available)) {
    available = pools
    const usedQuestionIds = { ...data.usedQuestionIds }
    for (const topic of TOPICS) {
      const cycleIds = new Set(pools[topic]?.map((question) => question.id) ?? [])
      usedQuestionIds[topic] = data.usedQuestionIds[topic].filter((id) => !cycleIds.has(id))
    }
    nextData = { ...data, usedQuestionIds }
  }

  const weightedTopics = TOPICS.filter((topic) => available[topic]?.length && nextData.topicPreferences[topic].weight > 0)
  const totalWeight = weightedTopics.reduce((total, topic) => total + nextData.topicPreferences[topic].weight, 0)
  if (!totalWeight) return null

  let cursor = Math.random() * totalWeight
  let selectedTopic = weightedTopics[0]
  for (const topic of weightedTopics) {
    cursor -= nextData.topicPreferences[topic].weight
    if (cursor < 0) {
      selectedTopic = topic
      break
    }
  }

  const topicQuestions = available[selectedTopic]
  if (!topicQuestions?.length) return null
  const question = topicQuestions[Math.floor(Math.random() * topicQuestions.length)]
  const usedQuestionIds = {
    ...nextData.usedQuestionIds,
    [selectedTopic]: [...nextData.usedQuestionIds[selectedTopic], question.id],
  }

  return { question, topic: selectedTopic, data: { ...nextData, usedQuestionIds } }
}

export function accuracy(result: StudyData['results'][Topic]): number | null {
  const attempts = result.gotIt + result.missedIt
  return attempts ? result.gotIt / attempts * 100 : null
}

export function applyPreset(data: StudyData, preset: Preset): StudyData {
  const topicPreferences = { ...data.topicPreferences }

  if (preset === 'all-equal') {
    for (const topic of TOPICS) topicPreferences[topic] = { active: true, weight: 1 }
  } else if (preset === 'only-selected') {
    for (const topic of TOPICS) {
      const preference = topicPreferences[topic]
      topicPreferences[topic] = { ...preference, weight: preference.active ? 1 : 0 }
    }
  } else {
    for (const topic of TOPICS) {
      const preference = topicPreferences[topic]
      const score = accuracy(data.results[topic])
      const weight = score === null ? 1 : Math.max(1, Math.min(5, 1 + Math.floor((100 - score) / 25)))
      topicPreferences[topic] = { ...preference, weight: preference.active ? weight : preference.weight }
    }
  }

  return { ...data, topicPreferences }
}
