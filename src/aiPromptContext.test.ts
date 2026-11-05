import { describe, expect, it } from 'vitest'
import { contestPreparationContext, shortcutGuidanceInstruction, STUDY_BANK_CHOICE_POLICY, topicScopeInstruction } from './aiPromptContext'

describe('contest preparation context', () => {
  it.each([
    ['Math', 'IIEE National Math Wizard'],
    ['Foundational Math', 'IIEE National Math Wizard'],
    ['EE', 'IIEE National Quiz Show'],
    ['Electrical Engineering', 'IIEE National Quiz Show'],
    ['AC Circuits', 'IIEE National Quiz Show'],
    ['ESAS', 'IIEE ESAS'],
    ['Physics', 'IIEE ESAS'],
  ])('uses the %s event for its prompt context', (subject, eventName) => {
    expect(contestPreparationContext(subject)).toContain(`upcoming ${eventName}`)
  })

  it('sets strict boundaries for topic-specific extraction and notes', () => {
    const instructions = topicScopeInstruction('AC Circuits')
    expect(instructions).toContain('The only requested topic is "AC Circuits"')
    expect(instructions).toContain('A passing mention, shared formula, or incidental use')
    expect(instructions).toContain('return an empty array')
    expect(instructions).toContain('Never move out-of-scope material into a note')
  })

  it('guides notes to explain applicable shortcuts through their case and conditions', () => {
    const instructions = shortcutGuidanceInstruction('AC Circuits')
    expect(instructions).toContain('valid, time-saving shortcut')
    expect(instructions).toContain('recognizable given case or conditions')
    expect(instructions).toContain('do not force one or invent a rule')
    expect(instructions).toContain('assumptions or limits')
  })

  it('removes choices from problem-solving questions but allows useful conceptual choices', () => {
    expect(STUDY_BANK_CHOICE_POLICY).toContain('For problem-solving questions')
    expect(STUDY_BANK_CHOICE_POLICY).toContain('remove every choice')
    expect(STUDY_BANK_CHOICE_POLICY).toContain('For conceptual, definition, or identification questions')
    expect(STUDY_BANK_CHOICE_POLICY).toContain('Do not include choices just because the source has them')
  })
})
