export const PREFERRED_VOICE_URI = 'preferred:microsoft-liam-online-en-ca'

function isCanadianEnglish(voice: SpeechSynthesisVoice): boolean {
  return /^en[-_]ca$/i.test(voice.lang)
}

export function preferredSpeechVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return voices.find((voice) => isCanadianEnglish(voice)
    && /microsoft liam online/i.test(voice.name)
    && /natural/i.test(voice.name))
    ?? voices.find((voice) => isCanadianEnglish(voice) && /microsoft liam online/i.test(voice.name))
    ?? voices.find(isCanadianEnglish)
    ?? voices.find((voice) => /^en([_-]|$)/i.test(voice.lang))
    ?? voices[0]
}

export function resolveSpeechVoice(
  voices: SpeechSynthesisVoice[],
  voiceURI: string,
): SpeechSynthesisVoice | undefined {
  if (voiceURI && voiceURI !== PREFERRED_VOICE_URI) {
    const selected = voices.find((voice) => voice.voiceURI === voiceURI)
    if (selected) return selected
  }
  return preferredSpeechVoice(voices)
}