import { describe, expect, it } from 'vitest'
import { mathToSpeech } from './mathSpeech'

describe('mathToSpeech', () => {
  it('speaks a leading negative value as negative', () => {
    expect(mathToSpeech('-11')).toBe('negative 11')
  })

  it('speaks subtraction as minus', () => {
    expect(mathToSpeech('5 - 2')).toBe('5 minus 2')
    expect(mathToSpeech('5−2')).toBe('5 minus 2')
  })

  it('speaks a negative value in an equation as negative', () => {
    expect(mathToSpeech('x = -3')).toBe('x equals negative 3')
  })
})
