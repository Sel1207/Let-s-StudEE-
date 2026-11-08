import { accuracy } from './questionLogic'
import { TOPICS, type StudyData, type Topic, type TopicPreference } from './studyTypes'

export type TopicPreferences = StudyData['topicPreferences']

export const MAX_PRIORITY = 5

/** A topic is in the pool only when it is switched on and has some priority. */
export function isTopicOn(preference: TopicPreference): boolean {
  return preference.active && preference.weight > 0
}

/** Priority shown on the meter: an old "on at 0" topic shows as 1 so turning it on is never a no-op. */
export function displayPriority(preference: TopicPreference): number {
  return Math.max(1, Math.min(MAX_PRIORITY, Math.round(preference.weight) || 1))
}

/** Switching off keeps the priority, so switching back on restores the topic exactly as it was. */
export function switchTopic(preference: TopicPreference, on: boolean): TopicPreference {
  return on ? { active: true, weight: displayPriority(preference) } : { ...preference, active: false }
}

/** Setting a priority also switches the topic on, so the bars work even on an off topic. */
export function setPriority(weight: number): TopicPreference {
  return { active: true, weight: Math.max(1, Math.min(MAX_PRIORITY, Math.round(weight))) }
}

function mapTopics(preferences: TopicPreferences, topics: readonly Topic[], change: (preference: TopicPreference, topic: Topic) => TopicPreference): TopicPreferences {
  const next = { ...preferences }
  for (const topic of topics) next[topic] = change(preferences[topic], topic)
  return next
}

export function switchTopics(preferences: TopicPreferences, topics: readonly Topic[], on: boolean): TopicPreferences {
  return mapTopics(preferences, topics, (preference) => switchTopic(preference, on))
}

/** Turns every on topic off and every off topic on. */
export function invertTopics(preferences: TopicPreferences, topics: readonly Topic[]): TopicPreferences {
  return mapTopics(preferences, topics, (preference) => switchTopic(preference, !isTopicOn(preference)))
}

/** Puts every on topic back to standard (1x) priority; off topics stay off. */
export function resetPriorities(preferences: TopicPreferences, topics: readonly Topic[]): TopicPreferences {
  return mapTopics(preferences, topics, (preference) => isTopicOn(preference) ? { active: true, weight: 1 } : preference)
}

/** Raises the priority of on topics you miss most: 1x at 100% accuracy up to 5x near 0%. Untried topics get 2x. */
export function weakSpotPriorities(data: StudyData, topics: readonly Topic[]): TopicPreferences {
  return mapTopics(data.topicPreferences, topics, (preference, topic) => {
    if (!isTopicOn(preference)) return preference
    const score = accuracy(data.results[topic])
    const weight = score === null ? 2 : Math.max(1, Math.min(MAX_PRIORITY, 1 + Math.floor((100 - score) / 20)))
    return { active: true, weight }
  })
}

/** Turns on only the given topics and switches every other topic in the scope off. */
export function soloTopics(preferences: TopicPreferences, scope: readonly Topic[], keep: readonly Topic[]): TopicPreferences {
  const kept = new Set(keep)
  return mapTopics(preferences, scope, (preference, topic) => switchTopic(preference, kept.has(topic)))
}

export function countOn(preferences: TopicPreferences, topics: readonly Topic[]): number {
  return topics.filter((topic) => isTopicOn(preferences[topic])).length
}

/* Saved mixes: named snapshots of priorities you can switch between in one tap. */

export const TOPIC_MIXES_STORAGE_KEY = 'lets-studee-topic-mixes-v1'
export const MAX_TOPIC_MIXES = 8

export interface TopicMix {
  id: string
  name: string
  /** Only topics in the mix's group; others are left alone when it is applied. */
  preferences: Partial<Record<Topic, TopicPreference>>
}

function isPreference(value: unknown): value is TopicPreference {
  if (!value || typeof value !== 'object') return false
  const { active, weight } = value as Record<string, unknown>
  return typeof active === 'boolean' && typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 && weight <= MAX_PRIORITY
}

export function parseTopicMixes(raw: string | null): TopicMix[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const topicSet = new Set<string>(TOPICS)
    return parsed.flatMap((item): TopicMix[] => {
      if (!item || typeof item !== 'object') return []
      const { id, name, preferences } = item as Record<string, unknown>
      if (typeof id !== 'string' || typeof name !== 'string' || !name.trim() || !preferences || typeof preferences !== 'object') return []
      const clean: Partial<Record<Topic, TopicPreference>> = {}
      for (const [topic, preference] of Object.entries(preferences)) {
        if (topicSet.has(topic) && isPreference(preference)) clean[topic as Topic] = { active: preference.active, weight: preference.weight }
      }
      return Object.keys(clean).length ? [{ id, name: name.trim().slice(0, 40), preferences: clean }] : []
    }).slice(0, MAX_TOPIC_MIXES)
  } catch {
    return []
  }
}

export function loadTopicMixes(): TopicMix[] {
  try {
    return parseTopicMixes(window.localStorage.getItem(TOPIC_MIXES_STORAGE_KEY))
  } catch {
    return []
  }
}

export function saveTopicMixes(mixes: TopicMix[]): boolean {
  try {
    window.localStorage.setItem(TOPIC_MIXES_STORAGE_KEY, JSON.stringify(mixes.slice(0, MAX_TOPIC_MIXES)))
    return true
  } catch {
    return false
  }
}

export function createTopicMix(name: string, preferences: TopicPreferences, topics: readonly Topic[], id = `mix-${Date.now()}`): TopicMix {
  return {
    id,
    name: name.trim().slice(0, 40),
    preferences: Object.fromEntries(topics.map((topic) => [topic, { ...preferences[topic] }])),
  }
}

export function applyTopicMix(preferences: TopicPreferences, mix: TopicMix): TopicPreferences {
  return { ...preferences, ...mix.preferences }
}

/** True when the mix's topics are set exactly as they are now. */
export function mixMatches(preferences: TopicPreferences, mix: TopicMix): boolean {
  return Object.entries(mix.preferences).every(([topic, preference]) => {
    const current = preferences[topic as Topic]
    return isTopicOn(current) === isTopicOn(preference) && (!isTopicOn(current) || current.weight === preference.weight)
  })
}
