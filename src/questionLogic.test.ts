import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawQuestion, parseDurationToken, parseQuestionLines, questionCounts, spokenDuration, topicChances, writtenTestQuestions } from './questionLogic'
import { createInitialStudyData, parseStudyBackup } from './studyStorage'
import { parseCompetitionBackup } from './competitionData'
import { EE_TOPIC_SECTIONS, EE_TOPICS, ESAS_TOPICS, TOPIC_GROUPS, TOPICS, type Question, type Topic } from './studyTypes'

afterEach(() => {
  vi.restoreAllMocks()
})

it('migrates legacy calculus banks, preferences, and progress to the renamed topics', () => {
  const legacyData = createInitialStudyData()
  const legacyBanks = legacyData.questionBanks as Record<string, Question[]>
  const legacyPreferences = legacyData.topicPreferences as Record<string, { active: boolean; weight: number }>
  const legacyUsedIds = legacyData.usedQuestionIds as Record<string, string[]>
  const legacyResults = legacyData.results as Record<string, { gotIt: number; missedIt: number }>
  for (const topic of ['Differential Calculus', 'Integral Calculus', 'Series and Multivariable Calculus']) {
    delete (legacyData.questionBanks as Record<string, unknown>)[topic]
    delete (legacyData.topicPreferences as Record<string, unknown>)[topic]
    delete (legacyData.usedQuestionIds as Record<string, unknown>)[topic]
    delete (legacyData.results as Record<string, unknown>)[topic]
  }
  legacyBanks['Calculus 1'] = [{ id: 'diff-1', text: 'Derivative question', seconds: 30 }]
  legacyBanks['Calculus 2'] = [{ id: 'int-1', text: 'Integral question', seconds: 60 }]
  legacyBanks['Calculus 3'] = [{ id: 'series-1', text: 'Series question', seconds: 90 }]
  legacyPreferences['Calculus 1'] = { active: false, weight: 3 }
  legacyUsedIds['Calculus 2'] = ['int-1']
  legacyResults['Calculus 3'] = { gotIt: 2, missedIt: 1 }

  const restored = parseStudyBackup(legacyData)

  expect(restored.questionBanks['Differential Calculus']).toEqual(legacyBanks['Calculus 1'])
  expect(restored.questionBanks['Integral Calculus']).toEqual(legacyBanks['Calculus 2'])
  expect(restored.questionBanks['Series and Multivariable Calculus']).toEqual(legacyBanks['Calculus 3'])
  expect(restored.topicPreferences['Differential Calculus']).toEqual({ active: false, weight: 3 })
  expect(restored.usedQuestionIds['Integral Calculus']).toEqual(['int-1'])
  expect(restored.results['Series and Multivariable Calculus']).toEqual({ gotIt: 2, missedIt: 1 })
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

  it('parses the topic study JSON format from a fenced AI response', () => {
    const questions = parseQuestionLines(`\`\`\`json
[
  {
    "question": "Find $2+2$.",
    "questionReadAloud": "Find two plus two.",
    "timeSeconds": 20,
    "answer": "$4$",
    "answerReadAloud": "Four.",
    "solution": "Add two and two to get $4$."
  }
]
\`\`\``, 60)

    expect(questions).toEqual([
      expect.objectContaining({
        text: 'Find $2+2$.',
        spokenText: 'Find two plus two.',
        seconds: 20,
        answer: '$4$',
        spokenAnswer: 'Four.',
        solution: 'Add two and two to get $4$.',
      }),
    ])
  })

  it('rejects JSON questions without a spoken answer and worked solution', () => {
    expect(() => parseQuestionLines(JSON.stringify([{
      question: 'Find $2+2$.',
      questionReadAloud: 'Find two plus two.',
      timeSeconds: 20,
      answer: '$4$',
      solution: 'Add two and two.',
    }]), 60)).toThrow('Question 1 needs question, questionReadAloud, answer, answerReadAloud, and solution text.')
  })

  it('announces compound durations naturally', () => {
    expect(spokenDuration(20)).toBe('twenty seconds')
    expect(spokenDuration(120)).toBe('two minutes')
    expect(spokenDuration(150)).toBe('two minutes thirty seconds')
  })
})

describe('study backup compatibility', () => {
  it('preserves spoken question text, answers, and solutions in backups', () => {
    const data = createInitialStudyData()
    data.questionBanks['Foundational Math'][0] = {
      id: 'with-answer',
      text: 'Find $2+2$.',
      spokenText: 'Find two plus two.',
      seconds: 20,
      answer: '$4$',
      spokenAnswer: 'Four.',
      solution: 'Add two and two.',
      note: 'Shortcut: use $2+2=4$.',
    }

    expect(parseStudyBackup(data).questionBanks['Foundational Math'][0]).toEqual(data.questionBanks['Foundational Math'][0])
  })

  it('starts with no foundational math questions by default', () => {
    const data = createInitialStudyData()
    expect(data.questionBanks['Foundational Math']).toEqual([])
    expect(data.questionBanks['Power System Analysis']).toEqual([])
  })

  it('keeps existing banks when new topics are absent from an older backup', () => {
    const legacyData = createInitialStudyData()
    legacyData.questionBanks['Foundational Math'] = [{ id: 'legacy', text: 'Existing question', seconds: 30 }]
    const addedTopics = ['Mathematical Trivia', 'Algebra', 'Trigonometry', 'Analytical Geometry', 'Power Series & Fourier Series Analysis', 'Laplace Transform', 'Matrices', 'Probability and Statistics', ...EE_TOPICS]
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
    expect(restored.questionBanks['Laplace Transform']).toEqual([])
    expect(restored.questionBanks.Matrices).toEqual([])
    expect(restored.questionBanks['Probability and Statistics']).toEqual([])
    expect(restored.questionBanks['Power System Analysis']).toEqual([])
  })

  it('moves legacy EE banks and progress into their new subtopics', () => {
    const legacyData = createInitialStudyData()
    const banks = legacyData.questionBanks as Record<string, Question[]>
    const preferences = legacyData.topicPreferences as Record<string, { active: boolean; weight: number }>
    const usedIds = legacyData.usedQuestionIds as Record<string, string[]>
    const results = legacyData.results as Record<string, { gotIt: number; missedIt: number }>
    delete banks['Power System Analysis']
    delete preferences['Power System Analysis']
    delete usedIds['Power System Analysis']
    delete results['Power System Analysis']
    banks['Power Systems'] = [{ id: 'legacy-power', text: 'Legacy system question', seconds: 30 }]
    preferences['Power Systems'] = { active: false, weight: 3 }
    usedIds['Power Systems'] = ['legacy-power']
    results['Power Systems'] = { gotIt: 2, missedIt: 1 }

    const restored = parseStudyBackup(legacyData)

    expect(restored.questionBanks['Power System Analysis']).toEqual([
      { id: 'legacy-power', text: 'Legacy system question', seconds: 30 },
    ])
    expect(restored.topicPreferences['Power System Analysis']).toEqual({ active: false, weight: 3 })
    expect(restored.usedQuestionIds['Power System Analysis']).toEqual(['legacy-power'])
    expect(restored.results['Power System Analysis']).toEqual({ gotIt: 2, missedIt: 1 })
  })

  it('moves legacy control-system banks into Feedback & Control Systems', () => {
    const legacyData = createInitialStudyData()
    const banks = legacyData.questionBanks as Record<string, Question[]>
    const preferences = legacyData.topicPreferences as Record<string, { active: boolean; weight: number }>
    const usedIds = legacyData.usedQuestionIds as Record<string, string[]>
    const results = legacyData.results as Record<string, { gotIt: number; missedIt: number }>
    delete banks['Feedback & Control Systems']
    delete preferences['Feedback & Control Systems']
    delete usedIds['Feedback & Control Systems']
    delete results['Feedback & Control Systems']
    banks['Control Systems'] = [{ id: 'legacy-control', text: 'Legacy control question', seconds: 45 }]

    const restored = parseStudyBackup(legacyData)

    expect(restored.questionBanks['Feedback & Control Systems']).toEqual([
      { id: 'legacy-control', text: 'Legacy control question', seconds: 45 },
    ])
  })

  it('moves Polyphase Circuits banks and progress into AC Polyphase', () => {
    const legacyData = createInitialStudyData()
    const banks = legacyData.questionBanks as Record<string, Question[]>
    const preferences = legacyData.topicPreferences as Record<string, { active: boolean; weight: number }>
    const usedIds = legacyData.usedQuestionIds as Record<string, string[]>
    const results = legacyData.results as Record<string, { gotIt: number; missedIt: number }>
    delete banks['AC Polyphase']
    delete preferences['AC Polyphase']
    delete usedIds['AC Polyphase']
    delete results['AC Polyphase']
    banks['Polyphase Circuits'] = [{ id: 'legacy-polyphase', text: 'Legacy polyphase question', seconds: 30 }]
    preferences['Polyphase Circuits'] = { active: false, weight: 3 }
    usedIds['Polyphase Circuits'] = ['legacy-polyphase']
    results['Polyphase Circuits'] = { gotIt: 2, missedIt: 1 }

    const restored = parseStudyBackup(legacyData)

    expect(restored.questionBanks['AC Polyphase']).toEqual([
      { id: 'legacy-polyphase', text: 'Legacy polyphase question', seconds: 30 },
    ])
    expect(restored.topicPreferences['AC Polyphase']).toEqual({ active: false, weight: 3 })
    expect(restored.usedQuestionIds['AC Polyphase']).toEqual(['legacy-polyphase'])
    expect(restored.results['AC Polyphase']).toEqual({ gotIt: 2, missedIt: 1 })
  })

  it('keeps math and electrical engineering in separate topic groups', () => {
    expect(TOPIC_GROUPS.map((group) => group.name)).toEqual(['Math', 'Electrical Engineering', 'ESAS'])
    expect(TOPIC_GROUPS[0].topics).toContain('Laplace Transform')
    expect(TOPIC_GROUPS[0].topics).toContain('Matrices')
    expect(TOPIC_GROUPS[0].topics.indexOf('Matrices')).toBe(TOPIC_GROUPS[0].topics.indexOf('Laplace Transform') + 1)
    expect(EE_TOPICS).toContain('Illumination')
    expect(EE_TOPIC_SECTIONS.map(({ name }) => name)).toEqual([
      'Circuits & Measurements',
      'Electrical Machines',
      'Power Systems',
      'Energy Storage & Renewables',
      'Electronics, Digital & Control',
      'Electrical Design & Utilization',
    ])
    expect(EE_TOPICS).toEqual([
      'Electricity: Basic Principles',
      'Electrostatics',
      'Magnetic Circuits',
      'Network Laws',
      'DC Circuits',
      'AC Circuits',
      'AC Polyphase',
      'Electrical Transients',
      'Instruments & Measurements',
      'DC Generators',
      'DC Motors',
      'Transformers',
      'AC Generators (Alternators)',
      'AC Motors',
      'Power Plant',
      'Transmission Lines',
      'Power System Analysis',
      'Distribution Systems',
      'Power System Protection',
      'Power System Operation',
      'Power System Transients',
      'BESS',
      'Solar PV & Wind',
      'Electronics',
      'Power Electronics',
      'Digital Design',
      'Feedback & Control Systems',
      'Instrumentation & Control',
      'Illumination',
      'PEC & Wiring Design',
    ])
    expect(EE_TOPICS).toContain('Power System Operation')
    expect(ESAS_TOPICS).toEqual([
      'Physics',
      'Fluid Mechanics',
      'Deformable Bodies',
      'Engineering Mechanics',
      'EE Laws',
      'Engineering Economics',
      'Numerical Methods',
      'Engineering Management',
      'BOSH',
      'Chemistry',
      'Computer Programming',
      'Thermodynamics',
      'Materials Science and Engineering',
    ])
    expect(TOPICS).toEqual([...TOPIC_GROUPS[0].topics, ...TOPIC_GROUPS[1].topics, ...TOPIC_GROUPS[2].topics])
  })
})

function bankWithTopics(entries: Partial<Record<Topic, Question[]>>) {
  const data = createInitialStudyData()
  for (const topic of TOPICS) {
    data.topicPreferences[topic] = {
      active: Object.hasOwn(entries, topic),
      weight: topic === 'Differential Calculus' ? 3 : 1,
    }
    data.questionBanks[topic] = entries[topic] ?? []
  }
  return data
}

describe('weighted question draws', () => {
  it('draws only from the currently selected topic group', () => {
    const data = bankWithTopics({
      'Foundational Math': [{ id: 'math-question', text: 'A math question', seconds: 30 }],
      'Power System Analysis': [{ id: 'ee-question', text: 'An EE question', seconds: 30 }],
    })

    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(drawQuestion(data, 'Math')?.topic).toBe('Foundational Math')
    expect(drawQuestion(data, 'Electrical Engineering')?.topic).toBe('Power System Analysis')
    expect(topicChances(data, 'Math')['Power System Analysis']).toBe(0)
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
      'Differential Calculus': [
        { id: 'calculus-a', text: 'Calculus question one', seconds: 20 },
        { id: 'calculus-b', text: 'Calculus question two', seconds: 20 },
      ],
    })
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0).mockReturnValueOnce(0.3).mockReturnValueOnce(0)

    expect(drawQuestion(data)?.topic).toBe('Foundational Math')
    expect(drawQuestion(data)?.topic).toBe('Differential Calculus')
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

describe('written test question selection', () => {
  it('weights random topics by priority and includes each matching question once', () => {
    const data = createInitialStudyData()
    data.questionBanks['Foundational Math'] = Array.from({ length: 12 }, (_, index) => ({
      id: `foundation-${index}`,
      text: `Foundation ${index}`,
      seconds: 30,
    }))
    data.questionBanks.Algebra = Array.from({ length: 12 }, (_, index) => ({
      id: `algebra-${index}`,
      text: `Algebra ${index}`,
      seconds: 30,
    }))
    data.questionBanks['Power System Analysis'] = [{ id: 'inactive-ee', text: 'Inactive EE', seconds: 30 }]
    data.topicPreferences['Foundational Math'] = { active: true, weight: 1 }
    data.topicPreferences.Algebra = { active: true, weight: 5 }
    data.topicPreferences['Power System Analysis'] = { active: false, weight: 5 }

    const questions = writtenTestQuestions(data, 'random', 1)

    expect(questions).toHaveLength(24)
    expect(new Set(questions.map(({ key }) => key)).size).toBe(24)
    const earlyAlgebraShare = Array.from({ length: 200 }, (_, seed) => (
      writtenTestQuestions(data, 'random', seed + 1).slice(0, 6).filter(({ topic }) => topic === 'Algebra').length / 6
    )).reduce((total, share) => total + share, 0) / 200
    expect(earlyAlgebraShare).toBeGreaterThan(0.75)
    expect(earlyAlgebraShare).toBeLessThan(0.9)
    expect(questions.some(({ topic }) => topic === 'Power System Analysis')).toBe(false)
  })

  it('limits random written questions to the selected Math or EE group', () => {
    const data = createInitialStudyData()
    data.questionBanks['Foundational Math'] = [{ id: 'math-question', text: 'Math question', seconds: 30 }]
    data.questionBanks['Power System Analysis'] = [{ id: 'ee-question', text: 'EE question', seconds: 30 }]

    expect(writtenTestQuestions(data, 'random', 1, 'Math').map(({ topic }) => topic)).toEqual(['Foundational Math'])
    expect(writtenTestQuestions(data, 'random', 1, 'Electrical Engineering').map(({ topic }) => topic)).toEqual(['Power System Analysis'])
  })

  it('shows a specifically selected topic even when it is disabled for random selection', () => {
    const data = createInitialStudyData()
    data.questionBanks['Power System Analysis'] = [{ id: 'ee-question', text: 'EE question', seconds: 30 }]
    data.topicPreferences['Power System Analysis'] = { active: false, weight: 0 }

    expect(writtenTestQuestions(data, 'Power System Analysis', 1)).toEqual([
      { topic: 'Power System Analysis', question: data.questionBanks['Power System Analysis'][0], key: 'Power System Analysis:ee-question' },
    ])
  })

  it('can include every question from a topic regardless of the configured time filter', () => {
    const data = createInitialStudyData()
    data.settings.timeFilter = 30
    data.questionBanks.Algebra = [
      { id: 'short-question', text: 'Short question', seconds: 30 },
      { id: 'long-question', text: 'Long question', seconds: 90 },
    ]

    expect(writtenTestQuestions(data, 'Algebra', 1).map(({ key }) => key)).toEqual(['Algebra:short-question'])
    expect(writtenTestQuestions(data, 'Algebra', 1, undefined, true).map(({ key }) => key)).toEqual([
      'Algebra:short-question',
      'Algebra:long-question',
    ])
  })

  it('reorders a specific topic when the written test is reloaded with a new seed', () => {
    const data = createInitialStudyData()
    data.questionBanks.Algebra = Array.from({ length: 10 }, (_, index) => ({
      id: `algebra-${index}`,
      text: `Algebra ${index}`,
      seconds: 30,
    }))

    const firstOrder = writtenTestQuestions(data, 'Algebra', 1).map(({ key }) => key)
    const reloadedOrder = writtenTestQuestions(data, 'Algebra', 2).map(({ key }) => key)

    expect(new Set(firstOrder)).toEqual(new Set(reloadedOrder))
    expect(reloadedOrder).not.toEqual(firstOrder)
  })

  it('keeps the written order when questions are added, deleted, or filtered', () => {
    const data = createInitialStudyData()
    data.questionBanks.Algebra = Array.from({ length: 10 }, (_, index) => ({
      id: `algebra-${index}`,
      text: `Algebra ${index}`,
      seconds: index % 2 ? 90 : 30,
    }))
    const order = writtenTestQuestions(data, 'Algebra', 7, undefined, true).map(({ key }) => key)

    data.questionBanks.Algebra = [
      ...data.questionBanks.Algebra.filter(({ id }) => id !== 'algebra-3'),
      { id: 'algebra-new', text: 'New', seconds: 30 },
    ]
    const changedOrder = writtenTestQuestions(data, 'Algebra', 7, undefined, true).map(({ key }) => key)
    expect(changedOrder.filter((key) => key !== 'Algebra:algebra-new')).toEqual(order.filter((key) => key !== 'Algebra:algebra-3'))

    data.settings.timeFilter = 30
    const filteredOrder = writtenTestQuestions(data, 'Algebra', 7).map(({ key }) => key)
    expect(filteredOrder).toEqual(changedOrder.filter((key) => filteredOrder.includes(key)))
  })

  it('preserves Study source metadata in the shared favorites backup format', () => {
    const favorite = {
      id: 'study:Algebra:algebra-question',
      sourceVersionId: 'study',
      questionId: 'algebra-question',
      source: 'study',
      studyTopic: 'Algebra',
      competitionName: 'Study',
      round: 1,
      number: 1,
      category: 'Algebra',
      difficulty: 'Easy',
      points: 1,
      type: 'Identification',
      question: 'Find x.',
      choices: null,
      answer: '2',
      solution: 'Solve the equation.',
      timeSeconds: 30,
      savedAt: 100,
    }
    const parsed = parseCompetitionBackup(JSON.stringify({
      format: 'lets-studee-competition-backup',
      version: 1,
      exportedAt: 100,
      competitions: [],
      history: [],
      favorites: [favorite],
    }))

    expect(parsed.favorites[0]).toMatchObject({
      id: favorite.id,
      source: 'study',
      studyTopic: 'Algebra',
      question: favorite.question,
      answer: favorite.answer,
    })
  })
})

describe('topic picking ignores how many questions a topic has', () => {
  function bank(topic: Topic, count: number): Question[] {
    return Array.from({ length: count }, (_, index) => ({ id: `${topic}-${index}`, text: `Q${index}`, seconds: 30 as const }))
  }

  function setup(weights: { big: number; small: number }) {
    const data = createInitialStudyData()
    const [big, small] = TOPIC_GROUPS[0].topics
    for (const topic of TOPIC_GROUPS[0].topics) data.topicPreferences[topic] = { active: false, weight: 1 }
    data.topicPreferences[big] = { active: true, weight: weights.big }
    data.topicPreferences[small] = { active: true, weight: weights.small }
    data.questionBanks[big] = bank(big, 500)
    data.questionBanks[small] = bank(small, 10)
    return { data, big, small }
  }

  function share(weights: { big: number; small: number }) {
    const { data, small } = setup(weights)
    let smallPicks = 0
    const trials = 20000
    // Each trial is a fresh first draw, so neither topic has run out of unused questions.
    for (let trial = 0; trial < trials; trial += 1) {
      if (drawQuestion(data, 'Math')?.topic === small) smallPicks += 1
    }
    return smallPicks / trials
  }

  it('gives a 10-question topic the same chance as a 500-question topic at 1x each', () => {
    const smallShare = share({ big: 1, small: 1 })
    expect(smallShare).toBeGreaterThan(0.47)
    expect(smallShare).toBeLessThan(0.53)
    const { data, big, small } = setup({ big: 1, small: 1 })
    const chances = topicChances(data, 'Math')
    expect(chances[big]).toBe(50)
    expect(chances[small]).toBe(50)
  })

  it('follows the priority, not the bank size, at 1x vs 3x', () => {
    const smallShare = share({ big: 1, small: 3 })
    expect(smallShare).toBeGreaterThan(0.72)
    expect(smallShare).toBeLessThan(0.78)
  })
})
