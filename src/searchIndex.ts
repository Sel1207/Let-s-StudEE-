import type { CompetitionStorage } from './competitionData'
import { TOPIC_GROUPS, TOPICS, type StudyData, type Topic } from './studyTypes'

export type SearchView = 'study' | 'manage' | 'settings' | 'competitions' | 'favorites'

export type SearchKind = 'page' | 'setting' | 'topic' | 'question' | 'competition' | 'competition-question' | 'favorite' | 'lecture'

export type SearchGroup = 'Go to' | 'Topics' | 'Study questions' | 'Mock competitions' | 'My Questions' | 'Lecture notes'

export interface SearchTarget {
  view: SearchView
  manageTopic?: Topic
  lectureTopic?: Topic
  competitionSubject?: string
  favoritesSection?: 'favorites' | 'notes'
  focusId?: string
  competitionQuestion?: { versionId: string; round: number | 'Sudden Death'; questionId: string }
}

export interface SearchEntry {
  id: string
  kind: SearchKind
  group: SearchGroup
  title: string
  subtitle: string
  /** Extra searchable text that is not shown in the title (answers, solutions, notes). */
  body: string
  keywords?: string
  target: SearchTarget
}

export interface SearchResult {
  entry: SearchEntry
  score: number
  /** The title, windowed so the matched words are visible instead of cut off. */
  displayTitle: string
  /** A short excerpt around the match when it was found outside the title. */
  excerpt: string
}

export interface SearchResultGroup {
  group: SearchGroup
  results: SearchResult[]
}

const GROUP_ORDER: SearchGroup[] = ['Go to', 'Topics', 'Study questions', 'Mock competitions', 'My Questions', 'Lecture notes']
const KIND_WEIGHT: Record<SearchKind, number> = {
  page: 30,
  setting: 24,
  topic: 26,
  competition: 18,
  question: 10,
  'competition-question': 8,
  favorite: 12,
  lecture: 9,
}

/** Turns LaTeX, HTML, and Markdown-ish source into readable plain text. */
export function plainText(source: string): string {
  return source
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|textbf|textit)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\(?:left|right|displaystyle|,|;|!|quad|qquad)/g, ' ')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/[$`{}]|\\\\/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_]{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function searchTokens(query: string): string[] {
  return normalize(query).split(/\s+/).map((token) => token.trim()).filter(Boolean)
}

function groupNameForTopic(topic: Topic): string {
  const group = TOPIC_GROUPS.find((item) => item.topics.some((candidate) => candidate === topic))?.name ?? 'Study'
  return group === 'Electrical Engineering' ? 'EE' : group
}

const PAGE_ENTRIES: SearchEntry[] = [
  { id: 'page:study', kind: 'page', group: 'Go to', title: 'Study', subtitle: 'Oral practice, written tests, and lecture notes', body: '', keywords: 'home oral practice written test timer read question choose topics', target: { view: 'study' } },
  { id: 'page:competitions', kind: 'page', group: 'Go to', title: 'Mock Competition', subtitle: 'Saved competitions, randomized rounds, and score history', body: '', keywords: 'compete contest quiz bee rounds score history randomized', target: { view: 'competitions' } },
  { id: 'page:favorites', kind: 'page', group: 'Go to', title: 'My Questions', subtitle: 'Favorite questions', body: '', keywords: 'saved favorites hearts bookmarks', target: { view: 'favorites', favoritesSection: 'favorites' } },
  { id: 'page:notes', kind: 'page', group: 'Go to', title: 'Questions with notes', subtitle: 'My Questions', body: '', keywords: 'notes annotations my questions', target: { view: 'favorites', favoritesSection: 'notes' } },
  { id: 'page:manage', kind: 'page', group: 'Go to', title: 'Manage questions', subtitle: 'Add, edit, and import question banks', body: '', keywords: 'question bank import paste add edit delete prompt', target: { view: 'manage' } },
  { id: 'page:settings', kind: 'page', group: 'Go to', title: 'Settings', subtitle: 'Voice, timing, theme, and backups', body: '', keywords: 'preferences options configuration', target: { view: 'settings' } },
  { id: 'setting:default-seconds', kind: 'setting', group: 'Go to', title: 'Default time limit', subtitle: 'Settings', body: '', keywords: 'timer seconds duration countdown', target: { view: 'settings', focusId: 'setting-default-seconds' } },
  { id: 'setting:speech-speed', kind: 'setting', group: 'Go to', title: 'Speech speed', subtitle: 'Settings', body: '', keywords: 'voice rate slow fast normal reading', target: { view: 'settings', focusId: 'setting-speech-speed' } },
  { id: 'setting:voice', kind: 'setting', group: 'Go to', title: 'Voice', subtitle: 'Settings', body: '', keywords: 'speech narrator text to speech tts', target: { view: 'settings', focusId: 'setting-voice' } },
  { id: 'setting:announce', kind: 'setting', group: 'Go to', title: 'Announce time limit', subtitle: 'Settings', body: '', keywords: 'duration speak seconds', target: { view: 'settings', focusId: 'setting-announce' } },
  { id: 'setting:theme', kind: 'setting', group: 'Go to', title: 'Dark mode', subtitle: 'Settings', body: '', keywords: 'theme appearance light night', target: { view: 'settings', focusId: 'setting-theme' } },
  { id: 'setting:backup', kind: 'setting', group: 'Go to', title: 'Full app backup', subtitle: 'Settings', body: '', keywords: 'export import restore save progress download', target: { view: 'settings', focusId: 'setting-backup' } },
  { id: 'setting:display-size', kind: 'setting', group: 'Go to', title: 'Display size', subtitle: 'Settings', body: '', keywords: 'zoom scale bigger smaller text size font', target: { view: 'settings', focusId: 'setting-display-size' } },
  { id: 'setting:update', kind: 'setting', group: 'Go to', title: 'Website update', subtitle: 'Settings', body: '', keywords: 'refresh new version reload app', target: { view: 'settings', focusId: 'setting-update' } },
]

export function buildSearchIndex(
  data: StudyData,
  competitions: Pick<CompetitionStorage, 'versions' | 'favorites'>,
  lectureNotes: Partial<Record<Topic, string>>,
): SearchEntry[] {
  const entries: SearchEntry[] = [...PAGE_ENTRIES]

  for (const topic of TOPICS) {
    const questions = data.questionBanks[topic] ?? []
    const group = groupNameForTopic(topic)
    entries.push({
      id: `topic:${topic}`,
      kind: 'topic',
      group: 'Topics',
      title: topic,
      subtitle: `${group} · ${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`,
      body: '',
      keywords: group,
      target: { view: 'manage', manageTopic: topic },
    })
    for (const question of questions) {
      const text = plainText(question.text)
      if (!text) continue
      entries.push({
        id: `question:${topic}:${question.id}`,
        kind: 'question',
        group: 'Study questions',
        title: text,
        subtitle: `Manage questions › ${topic}`,
        body: [question.answer, question.note, question.solution].filter(Boolean).map((part) => plainText(part ?? '')).join(' · '),
        target: { view: 'manage', manageTopic: topic, focusId: `study-${question.id}` },
      })
    }
    const note = plainText(lectureNotes[topic] ?? '')
    if (note) {
      entries.push({
        id: `lecture:${topic}`,
        kind: 'lecture',
        group: 'Lecture notes',
        title: `${topic} lecture notes`,
        subtitle: `Study › Lecture notebook · ${group}`,
        body: note,
        target: { view: 'study', lectureTopic: topic },
      })
    }
  }

  for (const version of competitions.versions) {
    const questions = [
      ...version.competition.rounds.flatMap((round) => round.questions),
      ...version.competition.suddenDeath,
    ]
    const target: SearchTarget = { view: 'competitions', competitionSubject: version.subject, focusId: `version-${version.id}` }
    entries.push({
      id: `competition:${version.id}`,
      kind: 'competition',
      group: 'Mock competitions',
      title: version.name,
      subtitle: `Mock Competition › ${version.subject} · ${questions.length} questions`,
      body: '',
      keywords: version.subject,
      target,
    })
    for (const question of questions) {
      const text = plainText(question.question)
      if (!text) continue
      const place = question.round === 'Sudden Death' ? 'Sudden death' : `Round ${question.round}`
      entries.push({
        id: `competition-question:${version.id}:${question.id}`,
        kind: 'competition-question',
        group: 'Mock competitions',
        title: text,
        subtitle: `${version.name} › ${place} · Q${question.number}${question.category ? ` · ${question.category}` : ''}`,
        body: [question.answer, question.note, question.solution, ...Object.values(question.choices ?? {})].filter(Boolean).map((part) => plainText(part ?? '')).join(' · '),
        keywords: version.subject,
        target: {
          view: 'competitions',
          competitionSubject: version.subject,
          competitionQuestion: { versionId: version.id, round: question.round, questionId: question.id },
        },
      })
    }
  }

  for (const favorite of competitions.favorites) {
    const text = plainText(favorite.question)
    if (!text) continue
    entries.push({
      id: `favorite:${favorite.id}`,
      kind: 'favorite',
      group: 'My Questions',
      title: text,
      subtitle: `My Questions › ${favorite.studyTopic ?? favorite.competitionName}`,
      body: [favorite.answer, favorite.solution].filter(Boolean).map((part) => plainText(part)).join(' · '),
      keywords: favorite.category,
      target: { view: 'favorites', favoritesSection: 'favorites', focusId: `favorite-${favorite.id}` },
    })
  }

  return entries
}

/** Finds where the match is: the whole phrase if present, otherwise the longest matching word. */
export function matchIndex(text: string, tokens: string[]): number {
  const normalized = normalize(text)
  const phraseIndex = normalized.indexOf(tokens.join(' '))
  if (phraseIndex >= 0) return phraseIndex
  const longestFirst = [...tokens].sort((a, b) => b.length - a.length)
  for (const token of longestFirst) {
    const index = normalized.indexOf(token)
    if (index >= 0) return index
  }
  return -1
}

/** Cuts a window of text that starts a little before the match, so the match is always on screen. */
export function windowAround(text: string, index: number, before = 32, maxLength = 220): string {
  let start = index > before ? index - before : 0
  if (start > 0) {
    const space = text.indexOf(' ', start)
    if (space >= 0 && space < index) start = space + 1
  }
  const end = Math.min(text.length, start + maxLength)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

interface PreparedEntry {
  entry: SearchEntry
  title: string
  all: string
}

export function prepareSearchIndex(entries: SearchEntry[]): PreparedEntry[] {
  return entries.map((entry) => {
    const title = normalize(entry.title)
    return { entry, title, all: `${title} ${normalize(entry.subtitle)} ${normalize(entry.keywords ?? '')} ${normalize(entry.body)}` }
  })
}

export function runSearch(prepared: PreparedEntry[], query: string, perGroup = 5): SearchResultGroup[] {
  const tokens = searchTokens(query)
  if (!tokens.length) {
    return [{ group: 'Go to', results: prepared.filter(({ entry }) => entry.kind === 'page').map(({ entry }) => ({ entry, score: 0, displayTitle: entry.title, excerpt: '' })) }]
  }
  const phrase = tokens.join(' ')
  const matches: SearchResult[] = []
  for (const item of prepared) {
    if (!tokens.every((token) => item.all.includes(token))) continue
    let score = KIND_WEIGHT[item.entry.kind]
    if (item.title === phrase) score += 60
    else if (item.title.startsWith(phrase)) score += 45
    else if (new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(item.title)) score += 32
    else if (item.title.includes(phrase)) score += 22
    const titleTokenHits = tokens.filter((token) => item.title.includes(token)).length
    score += titleTokenHits * 6
    const inTitle = titleTokenHits === tokens.length
    const titleIndex = titleTokenHits ? matchIndex(item.entry.title, tokens) : -1
    const displayTitle = titleIndex >= 0 ? windowAround(item.entry.title, titleIndex) : windowAround(item.entry.title, 0)
    const bodyText = item.entry.body || item.entry.subtitle
    const bodyIndex = inTitle ? -1 : matchIndex(bodyText, tokens.filter((token) => !item.title.includes(token)))
    matches.push({ entry: item.entry, score, displayTitle, excerpt: bodyIndex >= 0 ? windowAround(bodyText, bodyIndex) : '' })
  }
  const groups = GROUP_ORDER
    .map((group) => ({
      group,
      results: matches.filter((match) => match.entry.group === group).sort((a, b) => b.score - a.score).slice(0, perGroup),
    }))
    .filter((group) => group.results.length > 0)
  return groups.sort((a, b) => b.results[0].score - a.results[0].score)
}
