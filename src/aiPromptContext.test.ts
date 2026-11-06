import { describe, expect, it } from 'vitest'
import { contestPreparationContext, noteDetailsPrompt, shortcutGuidanceInstruction, STUDY_BANK_CHOICE_POLICY, stripOuterCodeFence, topicScopeInstruction } from './aiPromptContext'

describe('question note prompt', () => {
  const prompt = noteDetailsPrompt({ Topic: 'Linear Algebra', Question: 'Find $k$.', Answer: '$k=2$', Solution: 'Dot product.' })

  it('asks for an English note in one copyable text block that keeps raw LaTeX', () => {
    expect(prompt).toContain('Write the note in English.')
    expect(prompt).toContain('exactly one ```text code block')
    expect(prompt).toContain('raw source')
  })

  it('passes along the question details and no study instructions', () => {
    expect(prompt.endsWith('Topic: Linear Algebra\nQuestion: Find $k$.\nAnswer: $k=2$\nSolution: Dot product.')).toBe(true)
    expect(prompt).not.toContain('CONTEST PREPARATION')
    expect(prompt).not.toContain('STRICT TOPIC SCOPE')
    expect(prompt).not.toContain('USEFUL SHORTCUTS')
  })
})

describe('stripOuterCodeFence', () => {
  it.each([
    ['```text\nUse $V=IR$.\n```', 'Use $V=IR$.'],
    ['```\nUse $V=IR$.\n```\n', 'Use $V=IR$.'],
    ['\r\n```markdown\r\nLine one\r\n\r\nLine two\r\n```\r\n', 'Line one\r\n\r\nLine two'],
    ['  Use $V=IR$.  ', 'Use $V=IR$.'],
  ])('removes only the outer fence from %j', (pasted, saved) => {
    expect(stripOuterCodeFence(pasted)).toBe(saved)
  })

  it('leaves a code block inside a longer note alone', () => {
    const note = 'Before\n```text\ncode\n```\nAfter'
    expect(stripOuterCodeFence(note)).toBe(note)
  })
})

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
