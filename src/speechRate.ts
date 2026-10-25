import type { SpeechSpeed } from './studyTypes'

const STANDARD_RATES: Record<SpeechSpeed, number> = {
  slow: 0.78,
  normal: 0.95,
  fast: 1.15,
}

// iOS maps Web Speech rates onto AVSpeechSynthesizer rates, where values below
// 1 are compressed toward its default. Use a slower baseline so Normal and the
// fixed competition announcements do not sound rushed on iPhone and iPad.
const IOS_RATES: Record<SpeechSpeed, number> = {
  slow: 0.58,
  normal: 0.78,
  fast: 1.1,
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function speechRate(speed: SpeechSpeed): number {
  return (isIOSDevice() ? IOS_RATES : STANDARD_RATES)[speed]
}
