import { describe, expect, it } from 'vitest'
import { createInitialStudyData } from './studyStorage'
import { MATH_TOPICS } from './studyTypes'
import {
  applyTopicMix, countOn, createTopicMix, displayPriority, invertTopics, isTopicOn, mixMatches, parseTopicMixes,
  resetPriorities, setPriority, soloTopics, switchTopic, switchTopics, weakSpotPriorities,
} from './topicPriority'

describe('topic priority', () => {
  it('keeps the priority when a topic is switched off and back on', () => {
    const off = switchTopic({ active: true, weight: 4 }, false)
    expect(off).toEqual({ active: false, weight: 4 })
    expect(isTopicOn(off)).toBe(false)
    expect(switchTopic(off, true)).toEqual({ active: true, weight: 4 })
  })

  it('turns an old "on at 0" topic on at 1x', () => {
    expect(isTopicOn({ active: true, weight: 0 })).toBe(false)
    expect(displayPriority({ active: true, weight: 0 })).toBe(1)
    expect(switchTopic({ active: true, weight: 0 }, true)).toEqual({ active: true, weight: 1 })
  })

  it('setting a priority switches the topic on and clamps it to 1–5', () => {
    expect(setPriority(3)).toEqual({ active: true, weight: 3 })
    expect(setPriority(9).weight).toBe(5)
    expect(setPriority(0).weight).toBe(1)
  })

  it('switches, inverts, solos and resets a whole group at once', () => {
    const data = createInitialStudyData()
    const topics = MATH_TOPICS.slice(0, 4)
    const allOff = switchTopics(data.topicPreferences, topics, false)
    expect(countOn(allOff, topics)).toBe(0)
    const allOn = switchTopics(allOff, topics, true)
    expect(countOn(allOn, topics)).toBe(4)

    const inverted = invertTopics({ ...allOn, [topics[0]]: { active: false, weight: 3 } }, topics)
    expect(inverted[topics[0]]).toEqual({ active: true, weight: 3 })
    expect(countOn(inverted, topics)).toBe(1)

    const solo = soloTopics(allOn, topics, [topics[2]])
    expect(topics.filter((topic) => isTopicOn(solo[topic]))).toEqual([topics[2]])

    const reset = resetPriorities({ ...allOn, [topics[1]]: { active: true, weight: 5 }, [topics[2]]: { active: false, weight: 4 } }, topics)
    expect(reset[topics[1]]).toEqual({ active: true, weight: 1 })
    expect(reset[topics[2]]).toEqual({ active: false, weight: 4 })
  })

  it('weights weak spots by accuracy and leaves off topics alone', () => {
    const data = createInitialStudyData()
    const [strong, weak, untried, off] = MATH_TOPICS
    data.topicPreferences[off] = { active: false, weight: 1 }
    data.results[strong] = { gotIt: 10, missedIt: 0 }
    data.results[weak] = { gotIt: 0, missedIt: 10 }
    const next = weakSpotPriorities(data, [strong, weak, untried, off])
    expect(next[strong].weight).toBe(1)
    expect(next[weak].weight).toBe(5)
    expect(next[untried].weight).toBe(2)
    expect(next[off]).toEqual({ active: false, weight: 1 })
  })

  it('saves, restores and validates topic mixes', () => {
    const data = createInitialStudyData()
    const topics = MATH_TOPICS.slice(0, 3)
    const tuned = { ...data.topicPreferences, [topics[0]]: { active: true, weight: 5 }, [topics[1]]: { active: false, weight: 2 } }
    const mix = createTopicMix('  Board week  ', tuned, topics, 'mix-1')
    expect(mix.name).toBe('Board week')
    expect(mixMatches(tuned, mix)).toBe(true)
    expect(mixMatches(data.topicPreferences, mix)).toBe(false)
    expect(applyTopicMix(data.topicPreferences, mix)[topics[0]]).toEqual({ active: true, weight: 5 })

    const parsed = parseTopicMixes(JSON.stringify([mix, { id: 'x', name: 'Bad', preferences: { Nope: { active: true, weight: 1 } } }, 'junk']))
    expect(parsed).toEqual([mix])
    expect(parseTopicMixes('not json')).toEqual([])
  })
})
