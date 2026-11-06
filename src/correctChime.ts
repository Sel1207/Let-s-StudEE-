const NOTE_HZ = 1046.5
const PARTIALS = [
  { ratio: 1, level: 0.2, ring: 1.15 },
  { ratio: 2, level: 0.07, ring: 0.6 },
  { ratio: 3, level: 0.025, ring: 0.32 },
  { ratio: 4.2, level: 0.012, ring: 0.14 },
]

let context: AudioContext | null = null

export function playCorrectChime() {
  try {
    context ??= new AudioContext()
    const chime = context
    void chime.resume().then(() => {
      const start = chime.currentTime + 0.005
      for (const { ratio, level, ring } of PARTIALS) {
        const oscillator = chime.createOscillator()
        const gain = chime.createGain()
        oscillator.frequency.value = NOTE_HZ * ratio
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(level, start + 0.006)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + ring)
        oscillator.connect(gain)
        gain.connect(chime.destination)
        oscillator.start(start)
        oscillator.stop(start + ring + 0.02)
      }
    }).catch(() => {})
  } catch {
    context = null
  }
}
