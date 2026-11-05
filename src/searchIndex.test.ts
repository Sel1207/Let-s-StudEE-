import { describe, expect, it } from 'vitest'
import { buildSearchIndex, plainText, prepareSearchIndex, runSearch } from './searchIndex'
import { createInitialStudyData } from './studyStorage'
import type { Competition, CompetitionVersion } from './competitionData'

function studyData() {
  const data = createInitialStudyData()
  data.questionBanks['DC Generators'] = [{
    id: 'dcg-1',
    text: 'A shunt generator delivers $50\\,\\text{A}$ at 250 V. Find the armature current.',
    seconds: 60,
    answer: '52.5 A',
    solution: 'Field current is 2.5 A, so armature current is 52.5 A.',
  }]
  return data
}

const competition: Competition = {
  competitionName: 'Regional Quiz Bee',
  rounds: [{
    round: 1,
    questions: [{
      id: 'cq-1',
      round: 1,
      number: 3,
      category: 'Thermodynamics',
      difficulty: 'Average',
      points: 3,
      type: 'Identification',
      question: 'What is the Carnot efficiency between 600 K and 300 K?',
      spokenQuestion: null,
      choices: null,
      spokenChoices: null,
      answer: '50 percent',
      spokenAnswer: null,
      solution: '1 - 300/600',
      timeSeconds: 30,
    }],
  }],
  suddenDeath: [],
}

const version: CompetitionVersion = { id: 'v1', name: 'Regional Quiz Bee', subject: 'ESAS', competition, createdAt: 0, updatedAt: 0 }

function search(query: string) {
  const index = prepareSearchIndex(buildSearchIndex(studyData(), { versions: [version], favorites: [] }, { Thermodynamics: '<h2>Carnot cycle</h2><p>Reversible engines.</p>' }))
  return runSearch(index, query)
}

describe('global search', () => {
  it('cleans LaTeX and HTML into readable text', () => {
    expect(plainText('$50\\,\\text{A}$ <b>at</b> \\frac{1}{2}')).toBe('50 A at 1/2')
  })

  it('shows pages when the query is empty', () => {
    const groups = search('')
    expect(groups).toHaveLength(1)
    expect(groups[0].results.map(({ entry }) => entry.title)).toContain('Mock Competition')
  })

  it('finds study questions and links to their Manage questions source', () => {
    const result = search('shunt armature').flatMap((group) => group.results).find(({ entry }) => entry.kind === 'question')
    expect(result?.entry.target).toEqual({ view: 'manage', manageTopic: 'DC Generators', focusId: 'study-dcg-1' })
  })

  it('matches answers and returns an excerpt around the hit', () => {
    const result = search('52.5').flatMap((group) => group.results).find(({ entry }) => entry.kind === 'question')
    expect(result?.excerpt).toContain('52.5')
  })

  it('finds mock competition questions and links to the saved competition', () => {
    const result = search('carnot efficiency').flatMap((group) => group.results).find(({ entry }) => entry.kind === 'competition-question')
    expect(result?.entry.subtitle).toContain('Round 1 · Q3')
    expect(result?.entry.target).toEqual({
      view: 'competitions',
      competitionSubject: 'ESAS',
      competitionQuestion: { versionId: 'v1', round: 1, questionId: 'cq-1' },
    })
  })

  it('finds lecture notes and opens the lecture', () => {
    const result = search('reversible').flatMap((group) => group.results).find(({ entry }) => entry.kind === 'lecture')
    expect(result?.entry.target).toEqual({ view: 'study', lectureTopic: 'Thermodynamics' })
  })

  it('ranks an exact topic name first', () => {
    expect(search('transformers')[0].results[0].entry.title).toBe('Transformers')
  })

  it('windows long question titles so a match near the end is visible', () => {
    const data = studyData()
    const long = `${'Background sentence about generators and loads. '.repeat(8)}Determine the regulation of the alternator.`
    data.questionBanks['DC Generators'].push({ id: 'long-1', text: long, seconds: 60, answer: 'a', solution: 's' })
    const groups = runSearch(prepareSearchIndex(buildSearchIndex(data, { versions: [], favorites: [] }, {})), 'regulation of the alternator')
    const result = groups.flatMap((group) => group.results).find(({ entry }) => entry.id.endsWith('long-1'))
    expect(result?.displayTitle.startsWith('…')).toBe(true)
    expect(result?.displayTitle.indexOf('regulation')).toBeLessThan(40)
  })

  it('shows an answer excerpt that starts near the match', () => {
    const result = search('52.5').flatMap((group) => group.results).find(({ entry }) => entry.kind === 'question')
    expect(result?.excerpt.indexOf('52.5')).toBeLessThan(40)
  })

  it('requires every word to match', () => {
    expect(search('carnot zebra')).toHaveLength(0)
  })
})
