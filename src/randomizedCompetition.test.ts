import { describe, expect, it } from 'vitest'
import { buildRandomizedCompetition, randomizedCompetitionFormat, restoreRandomizedQuestionIds } from './randomizedCompetition'
import { parseCompetitionInput } from './competitionData'
import { EE_TOPICS, ESAS_TOPICS, MATH_TOPICS, TOPICS, type Question, type Topic } from './studyTypes'

function banksWith(count: number, topics: readonly Topic[] = MATH_TOPICS): Record<Topic, Question[]> {
  const banks = {} as Record<Topic, Question[]>
  TOPICS.forEach((topic) => { banks[topic] = [] })
  for (let index = 0; index < count; index += 1) {
    const topic = topics[index % topics.length]
    banks[topic].push({
      id: `question-${index}`,
      text: `Question ${index}`,
      seconds: [15, 30, 60, 120][index % 4] as Question['seconds'],
      answer: `Answer ${index}`,
      solution: `Solution ${index}`,
    })
  }
  return banks
}

function addQuestions(banks: Record<Topic, Question[]>, topic: Topic, count: number, startIndex = 0) {
  for (let index = 0; index < count; index += 1) {
    const id = `${topic}-${startIndex + index}`
    banks[topic].push({
      id,
      text: `Question ${id}`,
      seconds: 30,
      answer: `Answer ${id}`,
      solution: `Solution ${id}`,
    })
  }
}

describe('randomized Mock Competition generation', () => {
  it('uses the existing format and subject-specific banks for Math', () => {
    const banks = banksWith(14, MATH_TOPICS)
    const result = buildRandomizedCompetition('Math', banks, () => 0)

    expect(randomizedCompetitionFormat('Math')).toContain('Easy and Difficult questions mixed across both rounds')
    expect(result.error).toBe('')
    expect(result.competition?.rounds.map((round) => round.questions.length)).toEqual([7, 7])
    expect(result.competition?.rounds.map((round) => round.questions.map((question) => question.number))).toEqual([
      [1, 2, 3, 4, 5, 6, 7],
      [1, 2, 3, 4, 5, 6, 7],
    ])
    expect(() => parseCompetitionInput(JSON.stringify(result.competition), 'Math')).not.toThrow()
    expect(result.competition?.rounds.every((round) => new Set(round.questions.map(({ difficulty }) => difficulty)).size > 1)).toBe(true)
    expect(result.competition?.rounds.flatMap((round) => round.questions).map(({ difficulty, points }) => [difficulty, points])
      .reduce<Record<string, number>>((counts, [difficulty]) => {
        counts[String(difficulty)] = (counts[String(difficulty)] ?? 0) + 1
        return counts
      }, {})).toEqual({ Easy: 7, Difficult: 7 })
    expect(result.competition?.rounds.flatMap((round) => round.questions).every(({ difficulty, points }) => (
      points === (difficulty === 'Easy' ? 1 : 3)
    ))).toBe(true)
    const selectedQuestions = result.competition?.rounds.flatMap((round) => round.questions) ?? []
    expect(selectedQuestions.every((question) => (
      question.timeSeconds !== null
      && question.studySource !== undefined
      && MATH_TOPICS.includes(question.studySource.topic as typeof MATH_TOPICS[number])
      && question.studySource.questionId.startsWith('question-')
    ))).toBe(true)
    const sourceSeconds = new Map(
      MATH_TOPICS.flatMap((topic) => banks[topic].map((question) => [question.id, question.seconds] as const)),
    )
    expect(selectedQuestions.every((question) => question.timeSeconds === sourceSeconds.get(question.studySource?.questionId ?? ''))).toBe(true)
    expect(new Set(result.competition?.rounds.flatMap((round) => round.questions)
      .map((question) => question.studySource?.questionId)).size).toBe(14)
    expect(result.competition?.rounds.flatMap((round) => round.questions).every((question) => MATH_TOPICS.includes(question.category as typeof MATH_TOPICS[number]))).toBe(true)
  })

  it('builds the fixed EE round difficulty and point structure', () => {
    const result = buildRandomizedCompetition('EE', banksWith(15, EE_TOPICS), () => 0)

    expect(randomizedCompetitionFormat('EE')).toBe('3 rounds of 5 questions (Easy, Average, then Difficult)')
    expect(result.competition?.rounds.map((round) => round.questions.length)).toEqual([5, 5, 5])
    expect(() => parseCompetitionInput(JSON.stringify(result.competition), 'EE')).not.toThrow()
    expect(result.competition?.rounds.map((round) => round.questions.map(({ difficulty, points }) => [difficulty, points]))).toEqual([
      Array.from({ length: 5 }, () => ['Easy', 1]),
      Array.from({ length: 5 }, () => ['Average', 3]),
      Array.from({ length: 5 }, () => ['Difficult', 5]),
    ])
    expect(result.competition?.rounds.flatMap((round) => round.questions)
      .every((question) => EE_TOPICS.includes(question.studySource?.topic as typeof EE_TOPICS[number]))).toBe(true)
  })

  it('mixes ESAS difficulty levels across both rounds with valid point values', () => {
    const banks = banksWith(14, ESAS_TOPICS)
    const result = buildRandomizedCompetition('ESAS', banks, () => 0)

    expect(result.competition?.rounds.map((round) => round.questions.length)).toEqual([7, 7])
    expect(() => parseCompetitionInput(JSON.stringify(result.competition), 'ESAS')).not.toThrow()
    expect(randomizedCompetitionFormat('ESAS')).toContain('Easy, Average, and Difficult questions mixed across both rounds')
    expect(result.competition?.rounds.every((round) => new Set(round.questions.map(({ difficulty }) => difficulty)).size > 1)).toBe(true)
    expect(result.competition?.rounds.flatMap((round) => round.questions).map(({ difficulty }) => difficulty)
      .reduce<Record<string, number>>((counts, difficulty) => {
        counts[difficulty] = (counts[difficulty] ?? 0) + 1
        return counts
      }, {})).toEqual({ Easy: 5, Average: 5, Difficult: 4 })
    expect(result.competition?.rounds.flatMap((round) => round.questions).every(({ difficulty, points }) => (
      points === (difficulty === 'Easy' ? 1 : difficulty === 'Average' ? 3 : 5)
    ))).toBe(true)
  })

  it('explains when there are not enough complete questions', () => {
    const banks = banksWith(13, MATH_TOPICS)
    banks.Matrices[0].answer = ''
    const result = buildRandomizedCompetition('Math', banks, () => 0)

    expect(result.competition).toBeNull()
    expect(result.error).toContain('needs 14 complete questions')
    expect(result.error).toContain('only 12 are available')
    expect(result.error).toContain('missing question text, an answer, or a solution')
  })

  it('does not use questions from other subject banks', () => {
    const banks = banksWith(14, MATH_TOPICS)
    const result = buildRandomizedCompetition('Math', banks, () => 0)

    expect(result.competition?.rounds.flatMap((round) => round.questions).every((question) => MATH_TOPICS.includes(question.category as typeof MATH_TOPICS[number]))).toBe(true)
  })

  it('balances a large topic bank against other available topics', () => {
    const banks = banksWith(0)
    addQuestions(banks, MATH_TOPICS[0], 8)
    MATH_TOPICS.slice(1, 7).forEach((topic) => addQuestions(banks, topic, 2))
    const result = buildRandomizedCompetition('Math', banks, () => 0)
    const selected = result.competition?.rounds.flatMap((round) => round.questions) ?? []
    const counts = selected.reduce<Record<string, number>>((totals, question) => {
      totals[question.category] = (totals[question.category] ?? 0) + 1
      return totals
    }, {})

    expect(selected).toHaveLength(14)
    expect(Object.keys(counts)).toHaveLength(7)
    expect(Object.values(counts).every((count) => count === 2)).toBe(true)
    expect(counts[MATH_TOPICS[0]]).toBe(2)
  })

  it('relaxes the two-question topic limit only when available topics cannot fill the competition', () => {
    const banks = banksWith(0)
    MATH_TOPICS.slice(0, 4).forEach((topic, index) => addQuestions(banks, topic, index === 0 ? 8 : 2))
    const result = buildRandomizedCompetition('Math', banks, () => 0)
    const selected = result.competition?.rounds.flatMap((round) => round.questions) ?? []
    const counts = selected.reduce<Record<string, number>>((totals, question) => {
      totals[question.category] = (totals[question.category] ?? 0) + 1
      return totals
    }, {})

    expect(selected).toHaveLength(14)
    expect(Object.keys(counts)).toHaveLength(4)
    expect(Math.max(...Object.values(counts))).toBeGreaterThan(2)
  })

  it('restores generated question IDs and Study source metadata after parsing a saved run', () => {
    const generated = buildRandomizedCompetition('Math', banksWith(14, MATH_TOPICS), () => 0).competition
    if (!generated) throw new Error('Expected a randomized competition.')
    const parsed = parseCompetitionInput(JSON.stringify(generated), 'Math')
    const restored = restoreRandomizedQuestionIds(parsed, generated)

    expect(restored.rounds.flatMap((round) => round.questions).map(({ id }) => id))
      .toEqual(generated.rounds.flatMap((round) => round.questions).map(({ id }) => id))
    expect(restored.rounds[0].questions[0].studySource).toEqual(generated.rounds[0].questions[0].studySource)
  })
})
