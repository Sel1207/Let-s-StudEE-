import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawQuestion, parseDurationToken, parseQuestionLines, questionCounts, spokenDuration, topicChances } from './questionLogic'
import { createInitialStudyData, parseStudyBackup } from './studyStorage'
import { EE_TOPICS, TOPIC_GROUPS, TOPICS, type Question, type Topic } from './studyTypes'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('question time limits', () => {
  it.each([
    ['15', 15],
    ['20', 20],
    ['45', 45],
    ['90', 90],
    ['150', 150],
    ['1m', 60],
    ['2m', 120],
    ['2m30s', 150],
    ['3m', 180],
  ])('parses %s as %i seconds', (token, expected) => {
    expect(parseDurationToken(token)).toBe(expected)
  })

  it('uses the default for lines without a prefix', () => {
    expect(parseQuestionLines('Name a prime number.', 45)).toEqual([
      expect.objectContaining({ text: 'Name a prime number.', seconds: 45 }),
    ])
  })

  it('accepts 15-second prompt output', () => {
    expect(parseQuestionLines('15 | Name a triangle with no equal sides.', 60)[0].seconds).toBe(15)
  })

  it('announces compound durations naturally', () => {
    expect(spokenDuration(20)).toBe('twenty seconds')
    expect(spokenDuration(120)).toBe('two minutes')
    expect(spokenDuration(150)).toBe('two minutes thirty seconds')
  })
})

describe('study backup compatibility', () => {
  it('seeds first-time study data with all 30 foundational math questions', () => {
    const data = createInitialStudyData()
    expect(data.questionBanks['Foundational Math']).toHaveLength(30)
    expect(data.questionBanks['Foundational Math'][0].id).toBe('foundational-default-01')
    expect(data.questionBanks['Power Systems']).toEqual([])
  })

  it('keeps existing banks when new topics are absent from an older backup', () => {
    const legacyData = createInitialStudyData()
    legacyData.questionBanks['Foundational Math'] = [{ id: 'legacy', text: 'Existing question', seconds: 30 }]
    const addedTopics = ['Mathematical Trivia', 'Algebra', 'Trigonometry', 'Analytical Geometry', 'Power Series & Fourier Series Analysis', 'Probability and Statistics', ...EE_TOPICS]
    for (const topic of addedTopics) {
      delete (legacyData.questionBanks as Record<string, unknown>)[topic]
      delete (legacyData.topicPreferences as Record<string, unknown>)[topic]
      delete (legacyData.usedQuestionIds as Record<string, unknown>)[topic]
      delete (legacyData.results as Record<string, unknown>)[topic]
    }

    const restored = parseStudyBackup(legacyData)
    expect(restored.questionBanks['Foundational Math']).toEqual([
      { id: 'legacy', text: 'Existing question', seconds: 30 },
    ])
    expect(restored.questionBanks['Mathematical Trivia']).toEqual([])
    expect(restored.questionBanks.Algebra).toEqual([])
    expect(restored.questionBanks['Probability and Statistics']).toEqual([])
    expect(restored.questionBanks['Power Systems']).toEqual([])
  })

  it('keeps math and electrical engineering in separate topic groups', () => {
    expect(TOPIC_GROUPS.map((group) => group.name)).toEqual(['Math', 'Electrical Engineering'])
    expect(EE_TOPICS).toContain('Illumination')
    expect(EE_TOPICS).toContain('Power Systems')
    expect(TOPICS).toEqual([...TOPIC_GROUPS[0].topics, ...TOPIC_GROUPS[1].topics])
  })
})

function bankWithTopics(entries: Partial<Record<Topic, Question[]>>) {
  const data = createInitialStudyData()
  for (const topic of TOPICS) {
    data.topicPreferences[topic] = {
      active: Object.hasOwn(entries, topic),
      weight: topic === 'Calculus 1' ? 3 : 1,
    }
    data.questionBanks[topic] = entries[topic] ?? []
  }
  return data
}

describe('weighted question draws', () => {
  it('draws only from the currently selected topic group', () => {
    const data = bankWithTopics({
      'Foundational Math': [{ id: 'math-question', text: 'A math question', seconds: 30 }],
      'Power Systems': [{ id: 'ee-question', text: 'An EE question', seconds: 30 }],
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(drawQuestion(data, 'Math')?.topic).toBe('Foundational Math')
    expect(drawQuestion(data, 'Electrical Engineering')?.topic).toBe('Power Systems')
    expect(topicChances(data, 'Math')['Power Systems']).toBe(0)
    expect(topicChances(data, 'Electrical Engineering')['Foundational Math']).toBe(0)
  })

  it('does not repeat a question until the active pool is exhausted', () => {
    const data = bankWithTopics({
      'Foundational Math': [
        { id: 'a', text: 'First question', seconds: 20 },
        { id: 'b', text: 'Second question', seconds: 30 },
      ],
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const first = drawQuestion(data)
    expect(first?.question.id).toBe('a')
    const second = drawQuestion(first!.data)
    expect(second?.question.id).toBe('b')
    const reshuffled = drawQuestion(second!.data)
    expect(reshuffled?.question.id).toBe('a')
  })

  it('draws a topic according to its relative weight', () => {
    const data = bankWithTopics({
      'Foundational Math': [
        { id: 'math-a', text: 'Math question one', seconds: 20 },
        { id: 'math-b', text: 'Math question two', seconds: 20 },
      ],
      'Calculus 1': [
        { id: 'calculus-a', text: 'Calculus question one', seconds: 20 },
        { id: 'calculus-b', text: 'Calculus question two', seconds: 20 },
      ],
    })
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0).mockReturnValueOnce(0.3).mockReturnValueOnce(0)

    expect(drawQuestion(data)?.topic).toBe('Foundational Math')
    expect(drawQuestion(data)?.topic).toBe('Calculus 1')
  })

  it('filters questions by their exact time limit', () => {
    const data = bankWithTopics({
      'Foundational Math': [
        { id: 'quick', text: 'Quick question', seconds: 20 },
        { id: 'long', text: 'Long question', seconds: 60 },
      ],
    })
    data.settings.timeFilter = 20

    expect(questionCounts(data)['Foundational Math']).toBe(1)
    expect(drawQuestion(data)?.question.id).toBe('quick')
  })
})
