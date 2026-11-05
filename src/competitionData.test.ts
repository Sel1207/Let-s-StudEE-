import { describe, expect, it } from 'vitest'
import { createCompetitionBackup, defaultCompetitionSubjects, parseCompetitionBackup, parseCompetitionInput, parseCompetitionText } from './competitionData'

const question = {
  number: 1,
  category: 'Algebra',
  difficulty: 'Easy',
  points: 1,
  type: 'Identification',
  question: 'Find $x$.',
  answer: '$x=2$',
  solution: 'Solve for $x$.',
  timeSeconds: 30,
}

describe('competition question notes', () => {
  it('preserves trimmed notes when parsing a competition', () => {
    const competition = parseCompetitionText(JSON.stringify({
      competitionName: 'Notes test',
      rounds: [{ round: 1, questions: [{ ...question, note: '  Use $x=2$.  ' }] }],
    }))

    expect(competition.rounds[0].questions[0].note).toBe('Use $x=2$.')
  })

  it('parses the answer read-aloud field and keeps older inputs compatible', () => {
    const withSpokenAnswer = parseCompetitionInput(`Competition Name: Spoken answer
---
Round: 1
Question Number: 1
Category: Algebra
Difficulty: Easy
Points: 1
Type: Identification
Time Seconds: 30
Question: Find $x$.
Question Read Aloud: Find x.
Answer: $x=2$
Answer Read Aloud: x equals two.
Solution: Solve for $x$.`)
    const withoutSpokenAnswer = parseCompetitionText(JSON.stringify({
      competitionName: 'Legacy input',
      rounds: [{ round: 1, questions: [{ ...question }] }],
    }))

    expect(withSpokenAnswer.rounds[0].questions[0].spokenAnswer).toBe('x equals two.')
    expect(withoutSpokenAnswer.rounds[0].questions[0].spokenAnswer).toBeNull()
  })

  describe('ESAS competition format', () => {
    const esasQuestion = (number: number, difficulty: 'Easy' | 'Average' | 'Difficult', points: number) => ({
      ...question,
      number,
      category: 'Engineering Science',
      difficulty,
      points,
    })
    const esasCompetition = {
      competitionName: 'ESAS practice',
      rounds: [1, 2].map((round) => ({
        round,
        questions: Array.from({ length: 7 }, (_, index) => {
          const number = index + 1
          const difficulty = number % 3 === 1 ? 'Easy' : number % 3 === 2 ? 'Average' : 'Difficult'
          const points = difficulty === 'Easy' ? 1 : difficulty === 'Average' ? 3 : 5
          return esasQuestion(number, difficulty, points)
        }),
      })),
    }

    it('accepts two seven-question rounds with 1/3/5 point difficulty values', () => {
      const competition = parseCompetitionText(JSON.stringify(esasCompetition), 'ESAS')

      expect(competition.rounds.map((round) => round.questions.length)).toEqual([7, 7])
      expect(competition.rounds.flatMap((round) => round.questions).map(({ difficulty, points }) => [difficulty, points])).toContainEqual(['Average', 3])
      expect(competition.rounds.flatMap((round) => round.questions).map(({ difficulty, points }) => [difficulty, points])).toContainEqual(['Difficult', 5])
    })

    it('rejects ESAS competitions that do not have exactly two seven-question rounds', () => {
      const incomplete = {
        ...esasCompetition,
        rounds: esasCompetition.rounds.map((round, index) => index === 0
          ? { ...round, questions: round.questions.slice(0, 6) }
          : round),
      }

      expect(() => parseCompetitionText(JSON.stringify(incomplete), 'ESAS')).toThrow('exactly two rounds, with seven questions in each')
    })

    it('includes ESAS among the default competition subjects', () => {
      expect(defaultCompetitionSubjects()).toContain('ESAS')
    })
  })

  describe('EE competition format', () => {
    const eeCompetition = {
      competitionName: 'EE practice',
      rounds: (['Easy', 'Average', 'Difficult'] as const).map((difficulty, index) => ({
        round: index + 1,
        questions: Array.from({ length: 5 }, (_, questionIndex) => ({
          ...question,
          number: questionIndex + 1,
          category: 'DC Circuits',
          difficulty,
          points: difficulty === 'Easy' ? 1 : difficulty === 'Average' ? 3 : 5,
        })),
      })),
    }

    it('accepts three five-question rounds with Easy/Average/Difficult worth 1/3/5 points', () => {
      const competition = parseCompetitionText(JSON.stringify(eeCompetition), 'EE')

      expect(competition.rounds.map((round) => round.questions.length)).toEqual([5, 5, 5])
      expect(competition.rounds.map((round) => round.questions[0].difficulty)).toEqual(['Easy', 'Average', 'Difficult'])
      expect(competition.rounds.map((round) => round.questions[0].points)).toEqual([1, 3, 5])
    })

    it('rejects EE competitions that do not have exactly three five-question rounds', () => {
      const incomplete = {
        ...eeCompetition,
        rounds: eeCompetition.rounds.map((round, index) => index === 0
          ? { ...round, questions: round.questions.slice(0, 4) }
          : round),
      }

      expect(() => parseCompetitionText(JSON.stringify(incomplete), 'EE')).toThrow('exactly three rounds, with five questions in each')
    })

    it('rejects questions whose difficulty does not match their EE round', () => {
      const wrongDifficulty = {
        ...eeCompetition,
        rounds: eeCompetition.rounds.map((round, index) => index === 1
          ? { ...round, questions: round.questions.map((item, questionIndex) => questionIndex === 0 ? { ...item, difficulty: 'Easy', points: 1 } : item) }
          : round),
      }

      expect(() => parseCompetitionText(JSON.stringify(wrongDifficulty), 'Electrical Engineering')).toThrow('all questions in Round 2 must be Average')
    })

    it('offers Math, EE, and ESAS as default competition subjects', () => {
      expect(defaultCompetitionSubjects()).toEqual(['Math', 'EE', 'ESAS'])
    })
  })

  it('preserves competition question notes in backups', () => {
    const competition = parseCompetitionText(JSON.stringify({
      competitionName: 'Notes test',
      rounds: [{ round: 1, questions: [{ ...question, note: 'Use $x=2$.' }] }],
    }))
    const backup = createCompetitionBackup({
      versions: [{ id: 'version-1', name: 'Notes test', subject: 'Math', competition, createdAt: 1, updatedAt: 2 }],
      history: [],
      favorites: [],
    })

    const restored = parseCompetitionBackup(backup)
    expect(restored.versions[0].competition.rounds[0].questions[0].note).toBe('Use $x=2$.')
    expect(restored.versions[0].subject).toBe('Math')
    expect(restored.subjects).toContain('Math')
  })

  it('defaults older backup competitions to Math and preserves manually added subjects', () => {
    const competition = parseCompetitionText(JSON.stringify({
      competitionName: 'Older backup',
      rounds: [{ round: 1, questions: [{ ...question }] }],
    }))
    const backup = createCompetitionBackup({
      versions: [{ id: 'version-1', name: 'Older backup', subject: 'Math', competition, createdAt: 1, updatedAt: 2 }],
      history: [],
      favorites: [],
      subjects: ['Math', 'Physics'],
    })
    const legacyBackup = JSON.parse(backup) as { competitions: Array<{ subject?: string; [key: string]: unknown }>; subjects?: string[] }
    delete legacyBackup.competitions[0].subject
    delete legacyBackup.subjects

    const restored = parseCompetitionBackup(JSON.stringify(legacyBackup))
    expect(restored.versions[0].subject).toBe('Math')
    expect(restored.subjects).toContain('Math')
  })
})
