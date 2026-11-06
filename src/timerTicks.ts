const TICK_EVERY_SECONDS = 10
const FINAL_COUNTDOWN_SECONDS = 10
const URGENT_SECONDS = 5

export function shouldTick(remainingSeconds: number, limitSeconds: number): boolean {
  if (remainingSeconds <= 0) return false
  if (remainingSeconds <= FINAL_COUNTDOWN_SECONDS) return true
  const elapsedSeconds = limitSeconds - remainingSeconds
  return elapsedSeconds > 0 && elapsedSeconds % TICK_EVERY_SECONDS === 0
}

export function playTimerTick(context: AudioContext, remainingSeconds: number, peak: number) {
  void context.resume().then(() => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const startAt = context.currentTime
    const pitch = remainingSeconds <= URGENT_SECONDS ? 2100 : 1500
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(pitch, startAt)
    oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.55, startAt + 0.05)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), startAt + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.07)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + 0.08)
  }).catch(() => {})
}
