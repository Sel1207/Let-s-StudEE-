import { TOPIC_GROUPS, type Question, type Topic } from './studyTypes'
import { createCompetitionId, type Competition, type CompetitionQuestion, type CompetitionRound } from './competitionData'

const RANDOMIZED_COMPETITION_NAME = 'Randomized Mock Competition'

function groupForSubject(subject: string) {
  const key = subject.trim().toLowerCase()
  return TOPIC_GROUPS.find((group) => group.name.toLowerCase() === key
    || (key === 'ee' && group.name === 'Electrical Engineering')) ?? null
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const item = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = item
  }
  return result
}

function pointsForDifficulty(difficulty: CompetitionQuestion['difficulty']): number {
  if (difficulty === 'Easy') return 1
  if (difficulty === 'Average') return 3
  return 5
}

function competitionQuestion(question: Question, category: Topic, round: number, number: number, difficulty: CompetitionQuestion['difficulty'], points: number, id: string): CompetitionQuestion {
  return {
    id,
    round,
    number,
    category,
    difficulty,
    points,
    type: question.seconds >= 60 ? 'Problem-solving' : 'Identification',
    question: question.text.trim(),
    spokenQuestion: question.spokenText?.trim() || null,
    choices: null,
    spokenChoices: null,
    answer: question.answer?.trim() ?? '',
    spokenAnswer: question.spokenAnswer?.trim() || null,
    solution: question.solution?.trim() ?? '',
    timeSeconds: question.seconds,
    ...(question.note?.trim() ? { note: question.note.trim() } : {}),
    studySource: { topic: category, questionId: question.id },
  }
}

function questionCounts(subject: string): number[] {
  if (subject === 'Electrical Engineering') return [5, 5, 5]
  if (subject === 'ESAS') return [7, 7, 7]
  return [7, 7]
}

function randomizedDifficulties(subject: string, questionCount: number, random: () => number): CompetitionQuestion['difficulty'][] {
  if (subject === 'Electrical Engineering') {
    return Array.from({ length: questionCount }, (_, index) => (
      (['Easy', 'Average', 'Difficult'] as const)[Math.floor(index / 5)]
    ))
  }
  const difficulties: CompetitionQuestion['difficulty'][] = subject === 'Math'
    ? [...Array<CompetitionQuestion['difficulty']>(7).fill('Easy'), ...Array<CompetitionQuestion['difficulty']>(7).fill('Difficult')]
    : [...Array<CompetitionQuestion['difficulty']>(7).fill('Easy'),
      ...Array<CompetitionQuestion['difficulty']>(7).fill('Average'),
      ...Array<CompetitionQuestion['difficulty']>(7).fill('Difficult')]
  return shuffle(difficulties, random)
}

function selectTopicBalancedQuestions(
  topics: readonly Topic[],
  questionBanks: Record<Topic, Question[]>,
  count: number,
  random: () => number,
): Array<{ topic: Topic; question: Question }> {
  const topicOrder = shuffle(topics.filter((topic) => questionBanks[topic].length > 0), random)
  const questionsByTopic = new Map(topicOrder.map((topic) => [topic, shuffle(questionBanks[topic], random)]))
  const selected: Array<{ topic: Topic; question: Question }> = []
  let pass = 0

  while (selected.length < count) {
    let selectedThisPass = false
    for (const topic of topicOrder) {
      const question = questionsByTopic.get(topic)?.[pass]
      if (!question) continue
      selected.push({ topic, question })
      selectedThisPass = true
      if (selected.length === count) break
    }
    if (!selectedThisPass) break
    pass += 1
  }

  return selected
}

export function randomizedCompetitionFormat(subject: string): string {
  const group = groupForSubject(subject)
  if (!group) return 'the selected subject format'
  const key = group.name
  if (key === 'Electrical Engineering') return '3 rounds of 5 questions (Easy, Average, then Difficult)'
  if (key === 'ESAS') return '3 rounds of 7 questions, with Easy, Average, and Difficult questions mixed across all three rounds'
  return '2 rounds of 7 questions, with Easy and Difficult questions mixed across both rounds'
}

export function restoreRandomizedQuestionIds(parsed: Competition, saved: Competition): Competition {
  const savedIds = new Map<string, string>()
  const uniqueIds = new Set<string>()
  for (const round of saved.rounds) {
    for (const question of round.questions) {
      if (!question.id || uniqueIds.has(question.id) || savedIds.has(`${round.round}:${question.number}`)) {
        throw new Error('The saved randomized competition has invalid question identifiers.')
      }
      uniqueIds.add(question.id)
      savedIds.set(`${round.round}:${question.number}`, question.id)
    }
  }
  const restored = {
    ...parsed,
    rounds: parsed.rounds.map((round) => ({
      ...round,
      questions: round.questions.map((question) => {
        const id = savedIds.get(`${round.round}:${question.number}`)
        if (!id) throw new Error('The saved randomized competition is missing a question identifier.')
        return { ...question, id }
      }),
    })),
  }
  if (savedIds.size !== restored.rounds.reduce((total, round) => total + round.questions.length, 0)) {
    throw new Error('The saved randomized competition has an invalid question count.')
  }
  return restored
}

export function buildRandomizedCompetition(
  subject: string,
  questionBanks: Record<Topic, Question[]>,
  random: () => number = Math.random,
): { competition: Competition | null; error: string } {
  const group = groupForSubject(subject)
  if (!group) return { competition: null, error: `The “${subject}” subject does not have a supported randomized competition format.` }

  const eligibleByTopic = Object.fromEntries(group.topics.map((topic) => [
    topic,
    (questionBanks[topic] ?? []).filter((question) => (
      question.text.trim() && question.answer?.trim() && question.solution?.trim()
    )),
  ])) as Record<Topic, Question[]>
  const totalEligible = group.topics.reduce((total, topic) => total + eligibleByTopic[topic].length, 0)
  const counts = questionCounts(group.name)
  const required = counts.reduce((total, count) => total + count, 0)
  if (totalEligible < required) {
    const totalCandidates = group.topics.reduce((total, topic) => total + (questionBanks[topic] ?? []).length, 0)
    const incompleteCount = totalCandidates - totalEligible
    const details = incompleteCount
      ? ` ${incompleteCount} ${incompleteCount === 1 ? 'question is' : 'questions are'} missing question text, an answer, or a solution.`
      : ''
    return {
      competition: null,
      error: `A ${group.name} randomized mock competition needs ${required} complete questions, but only ${totalEligible} ${totalEligible === 1 ? 'is' : 'are'} available in its Study banks.${details}`,
    }
  }

  const selected = selectTopicBalancedQuestions(group.topics, eligibleByTopic, required, random)
  const difficulties = randomizedDifficulties(group.name, required, random)
  const runId = createCompetitionId()
  let selectedIndex = 0
  const rounds: CompetitionRound[] = counts.map((count, roundIndex) => {
    const round = roundIndex + 1
    const questions = Array.from({ length: count }, (_, questionIndex) => {
      const { topic, question } = selected[selectedIndex]
      const difficulty = difficulties[selectedIndex]
      const points = group.name === 'Math'
        ? difficulty === 'Easy' ? 1 : 3
        : pointsForDifficulty(difficulty)
      const questionId = `random-${runId}-${selectedIndex + 1}`
      selectedIndex += 1
      return competitionQuestion(question, topic, round, questionIndex + 1, difficulty, points, questionId)
    })
    return { round, questions }
  })

  return {
    competition: { competitionName: RANDOMIZED_COMPETITION_NAME, rounds, suddenDeath: [] },
    error: '',
  }
}
