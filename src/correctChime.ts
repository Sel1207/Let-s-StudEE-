import correctDingUrl from './assets/correct-ding.mp3'

// MP3 encoding pads the start of the clip, so playback skips straight to the first audible sample.
const ENCODER_PADDING_SECONDS = 0.026

let context: AudioContext | null = null
let ding: AudioBuffer | null = null

export function preloadCorrectChime() {
  if (context) return
  try {
    const chime = new AudioContext({ latencyHint: 'interactive' })
    context = chime
    const wake = () => {
      if (chime.state === 'suspended') void chime.resume().catch(() => {})
    }
    for (const event of ['pointerdown', 'keydown', 'click']) document.addEventListener(event, wake, true)
    void fetch(correctDingUrl)
      .then((response) => response.arrayBuffer())
      .then((data) => chime.decodeAudioData(data))
      .then((buffer) => { ding = buffer })
      .catch(() => {})
  } catch {
    context = null
  }
}

export function playCorrectChime() {
  if (!context || !ding) return
  const source = context.createBufferSource()
  source.buffer = ding
  source.connect(context.destination)
  source.start(0, ENCODER_PADDING_SECONDS)
}
