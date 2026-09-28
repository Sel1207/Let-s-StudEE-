import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawQuestion, parseDurationToken, parseQuestionLines, questionCounts, resetQuestionUsage, spokenDuration } from './questionLogic'
import { createInitialStudyData, loadStudyData } from './studyStorage'
import { DEFAULT_FOUNDATIONAL_QUESTIONS } from './defaultFoundationalQuestions'
import { PREFERRED_VOICE_URI, preferredSpeechVoice, resolveSpeechVoice } from './speechVoice'
import { loadStudySessions, saveStudySessions, type StudySession } from './studySessions'
import { TOPICS, type Question, type Topic } from './studyTypes'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('default study data', () => {
  it('starts with the provided foundational questions and requested speech defaults', () => {
    const data = createInitialStudyData()

    expect(data.questionBanks['Foundational Math']).toHaveLength(30)
    expect(data.questionBanks['Foundational Math'].map(({ seconds }) => seconds))
      .toEqual(DEFAULT_FOUNDATIONAL_QUESTIONS.map(({ seconds }) => seconds))
    expect(data.settings.voiceURI).toBe(PREFERRED_VOICE_URI)
    expect(data.settings.speechSpeed).toBe('normal')
  })

  it('migrates an existing empty bank once without replacing later edits', () => {
    const storageKey = 'lets-studee-study-data-v1'
    const migrationKey = 'lets-studee-defaults-migration-v1'
    const saved = createInitialStudyData()
    saved.questionBanks['Foundational Math'] = []
    saved.settings.voiceURI = ''
    const values = new Map([[storageKey, JSON.stringify(saved)]])
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })

    const migrated = loadStudyData()
    expect(migrated.questionBanks['Foundational Math']).toHaveLength(30)
    expect(migrated.settings.voiceURI).toBe(PREFERRED_VOICE_URI)

    migrated.questionBanks['Foundational Math'] = []
    values.set(storageKey, JSON.stringify(migrated))
    expect(values.get(migrationKey)).toBe('complete')
    expect(loadStudyData().questionBanks['Foundational Math']).toHaveLength(0)
  })
})

describe('speech voice preference', () => {
  it('prefers Microsoft Liam Online Natural in Canadian English', () => {
    const liam = {
      name: 'Microsoft Liam Online (Natural) - English (Canada)',
      lang: 'en-CA',
      voiceURI: 'liam-en-ca',
    } as SpeechSynthesisVoice
    const englishFallback = {
      name: 'English fallback',
      lang: 'en-US',
      voiceURI: 'fallback-en-us',
    } as SpeechSynthesisVoice

    expect(preferredSpeechVoice([englishFallback, liam])).toBe(liam)
    expect(resolveSpeechVoice([englishFallback], PREFERRED_VOICE_URI)).toBe(englishFallback)
  })
})

describe('saved study sessions', () => {
  it('stores and restores session question history', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
    const sessions: StudySession[] = [{
      id: 'session-1',
      startedAt: '2026-09-28T12:00:00.000Z',
      endedAt: null,
      questions: [{
        id: 'question-1',
        text: 'What is two plus two?',
        topic: 'Foundational Math',
        seconds: 60,
        askedAt: '2026-09-28T12:01:00.000Z',
      }],
    }]

    expect(saveStudySessions(sessions)).toBe(true)
    expect(loadStudySessions()).toEqual(sessions)
  })
})

describe('question time limits', () => {
  it.each([
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

  it('announces compound durations naturally', () => {
    expect(spokenDuration(20)).toBe('twenty seconds')
    expect(spokenDuration(120)).toBe('two minutes')
    expect(spokenDuration(150)).toBe('two minutes thirty seconds')
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

  it('starts a fresh no-repeat pool when a new session begins', () => {
    const data = bankWithTopics({
      'Foundational Math': [
        { id: 'a', text: 'First question', seconds: 20 },
        { id: 'b', text: 'Second question', seconds: 30 },
      ],
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const first = drawQuestion(data)
    const second = drawQuestion(first!.data)
    const nextSession = resetQuestionUsage(second!.data)

    expect(first?.question.id).toBe('a')
    expect(second?.question.id).toBe('b')
    expect(drawQuestion(nextSession)?.question.id).toBe('a')
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
