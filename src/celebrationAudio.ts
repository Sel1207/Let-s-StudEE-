import crowdCheerUrl from './assets/celebration/crowd-cheer.mp3'
import hellYeahUrl from './assets/celebration/hell-yeah.mp3'
import letsGoMaleUrl from './assets/celebration/lets-go-male.mp3'
import letsGoScreamUrl from './assets/celebration/lets-go-scream.mp3'
import woohooUrl from './assets/celebration/woohoo.mp3'

export type ExplosionStyle = 'sphere' | 'ring' | 'heart' | 'willow' | 'double' | 'crackle'

export interface CelebrationAudio {
  launch: (pan: number) => void
  explode: (style: ExplosionStyle, pan: number) => void
  fadeOut: (seconds: number) => void
  dispose: () => void
}

type ClipName = 'scream' | 'male' | 'hellYeah' | 'woohoo' | 'crowd'
type Clips = Partial<Record<ClipName, AudioBuffer>>

const CLIP_URLS: Record<ClipName, string> = {
  scream: letsGoScreamUrl,
  male: letsGoMaleUrl,
  hellYeah: hellYeahUrl,
  woohoo: woohooUrl,
  crowd: crowdCheerUrl,
}

const BEAT = 60 / 140
const BAR = BEAT * 4
const STEP = BEAT / 4
const LOOKAHEAD_SECONDS = 0.25
const MUSIC_SETTLES_AFTER_SECONDS = 9.5

const CHORDS = [
  [261.63, 329.63, 392, 523.25],
  [220, 261.63, 329.63, 440],
  [174.61, 220, 261.63, 349.23],
  [196, 246.94, 293.66, 392],
]
const ARPEGGIO = [0, 1, 2, 3, 2, 3, 1, 2]

const clipCache = new WeakMap<AudioContext, Promise<Clips>>()

export function preloadCelebrationAudio(context: AudioContext): Promise<Clips> {
  const cached = clipCache.get(context)
  if (cached) return cached
  const names = Object.keys(CLIP_URLS) as ClipName[]
  const loaded = Promise.all(names.map(async (name) => {
    try {
      const response = await fetch(CLIP_URLS[name])
      if (!response.ok) return null
      return [name, await context.decodeAudioData(await response.arrayBuffer())] as const
    } catch {
      return null
    }
  })).then((entries) => Object.fromEntries(entries.filter((entry) => entry !== null)) as Clips)
  clipCache.set(context, loaded)
  return loaded
}

function createNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1
  return buffer
}

function createStadiumImpulse(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 2.2)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      samples[index] = (Math.random() * 2 - 1) * Math.exp((-3.4 * index) / context.sampleRate)
    }
  }
  return buffer
}

function createDriveCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(1024 * 4))
  for (let index = 0; index < curve.length; index += 1) {
    curve[index] = Math.tanh(((index / (curve.length - 1)) * 2 - 1) * 2.4)
  }
  return curve
}

function pulse(param: AudioParam, when: number, peak: number, attack: number, decay: number) {
  param.setValueAtTime(0.0001, when)
  param.exponentialRampToValueAtTime(peak, when + attack)
  param.exponentialRampToValueAtTime(0.0001, when + attack + decay)
}

export function startCelebrationAudio(context: AudioContext, volume: number): CelebrationAudio {
  const start = context.currentTime + 0.05
  const drop = start + BAR
  const noise = createNoise(context)

  const output = context.createGain()
  const limiter = context.createDynamicsCompressor()
  const input = context.createGain()
  input.gain.value = volume
  limiter.threshold.value = -9
  limiter.knee.value = 4
  limiter.ratio.value = 14
  limiter.attack.value = 0.002
  limiter.release.value = 0.14
  input.connect(limiter)
  limiter.connect(output)
  output.connect(context.destination)

  const reverb = context.createConvolver()
  const reverbReturn = context.createGain()
  reverb.buffer = createStadiumImpulse(context)
  reverbReturn.gain.value = 0.12
  reverb.connect(reverbReturn)
  reverbReturn.connect(input)

  const voiceBus = context.createWaveShaper()
  voiceBus.curve = createDriveCurve()
  voiceBus.oversample = '2x'
  const voiceLevel = context.createGain()
  voiceLevel.gain.value = 1.15
  voiceBus.connect(voiceLevel)
  voiceLevel.connect(input)
  voiceLevel.connect(reverb)

  const music = context.createGain()
  const musicDuck = context.createGain()
  const chordBus = context.createGain()
  const chordFilter = context.createBiquadFilter()
  music.gain.value = 0.62
  music.gain.setValueAtTime(0.62, start + MUSIC_SETTLES_AFTER_SECONDS)
  music.gain.linearRampToValueAtTime(0.16, start + MUSIC_SETTLES_AFTER_SECONDS + 3)
  chordFilter.type = 'lowpass'
  chordFilter.frequency.value = 3400
  chordBus.connect(chordFilter)
  chordFilter.connect(music)
  music.connect(musicDuck)
  musicDuck.connect(input)

  const sfx = context.createGain()
  sfx.gain.value = 0.9
  sfx.connect(input)
  sfx.connect(reverb)

  const burst = (when: number, duration: number, peak: number, destination: AudioNode, filter: BiquadFilterType, frequency: number, endFrequency = frequency) => {
    const source = context.createBufferSource()
    const shape = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = noise
    shape.type = filter
    shape.frequency.setValueAtTime(frequency, when)
    if (endFrequency !== frequency) shape.frequency.exponentialRampToValueAtTime(endFrequency, when + duration)
    pulse(gain.gain, when, peak, 0.002, duration)
    source.connect(shape)
    shape.connect(gain)
    gain.connect(destination)
    source.start(when, Math.random() * 1.2, Math.min(duration + 0.02, 0.78))
  }

  const tone = (when: number, type: OscillatorType, frequency: number, endFrequency: number, duration: number, peak: number, destination: AudioNode, attack = 0.004) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, when)
    if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + duration)
    pulse(gain.gain, when, peak, attack, duration)
    oscillator.connect(gain)
    gain.connect(destination)
    oscillator.start(when)
    oscillator.stop(when + attack + duration + 0.02)
  }

  const scheduleBuild = () => {
    const riser = context.createBufferSource()
    const riserFilter = context.createBiquadFilter()
    const riserGain = context.createGain()
    riser.buffer = noise
    riser.loop = true
    riserFilter.type = 'bandpass'
    riserFilter.Q.value = 1.4
    riserFilter.frequency.setValueAtTime(320, start)
    riserFilter.frequency.exponentialRampToValueAtTime(7800, drop - 0.08)
    riserGain.gain.setValueAtTime(0.05, start)
    riserGain.gain.exponentialRampToValueAtTime(1.5, drop - 0.08)
    riserGain.gain.setValueAtTime(0.0001, drop - 0.07)
    riser.connect(riserFilter)
    riserFilter.connect(riserGain)
    riserGain.connect(sfx)
    riser.start(start)
    riser.stop(drop)

    const climb = context.createOscillator()
    const climbGain = context.createGain()
    climb.type = 'sawtooth'
    climb.frequency.setValueAtTime(130.81, start)
    climb.frequency.exponentialRampToValueAtTime(1046.5, drop - 0.08)
    climbGain.gain.setValueAtTime(0.03, start)
    climbGain.gain.exponentialRampToValueAtTime(0.3, drop - 0.08)
    climbGain.gain.setValueAtTime(0.0001, drop - 0.07)
    climb.connect(climbGain)
    climbGain.connect(music)
    climb.start(start)
    climb.stop(drop)

    // The snare roll doubles in speed each beat, then cuts out so the drop hits from silence.
    const divisions = [2, 4, 4, 8]
    divisions.forEach((division, beat) => {
      for (let hit = 0; hit < division; hit += 1) {
        const when = start + beat * BEAT + (hit * BEAT) / division
        if (when >= drop - 0.1) continue
        burst(when, 0.1, 0.45 + ((when - start) / BAR) * 0.75, music, 'bandpass', 2100)
      }
    })
  }

  const scheduleImpact = (when: number) => {
    tone(when, 'sine', 170, 30, 1.1, 1, sfx, 0.003)
    burst(when, 0.75, 0.62, sfx, 'highpass', 3000, 900)
  }

  const scheduleStep = (step: number) => {
    const when = drop + step * STEP
    const bar = Math.floor(step / 16)
    const chord = CHORDS[bar % CHORDS.length]

    if (step % 4 === 0) {
      tone(when, 'sine', 165, 44, 0.26, 0.95, music, 0.002)
      burst(when, 0.012, 0.24, music, 'highpass', 2600)
      chordBus.gain.setValueAtTime(0.3, when)
      chordBus.gain.linearRampToValueAtTime(1, when + BEAT * 0.72)
    }
    if (step % 8 === 4) burst(when, 0.14, 0.4, music, 'bandpass', 1900)
    if (step % 4 === 2) {
      burst(when, 0.05, 0.13, music, 'highpass', 8200)
      tone(when, 'sawtooth', chord[0] / 2, chord[0] / 2, BEAT * 0.42, 0.26, music)
    }
    if (step % 16 === 0) {
      for (const frequency of chord) {
        for (const detune of [-13, 0, 13]) {
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          oscillator.type = 'sawtooth'
          oscillator.frequency.value = frequency
          oscillator.detune.value = detune
          gain.gain.setValueAtTime(0.0001, when)
          gain.gain.exponentialRampToValueAtTime(0.038, when + 0.012)
          gain.gain.setValueAtTime(0.038, when + BAR - 0.06)
          gain.gain.exponentialRampToValueAtTime(0.0001, when + BAR)
          oscillator.connect(gain)
          gain.connect(chordBus)
          oscillator.start(when)
          oscillator.stop(when + BAR + 0.02)
        }
      }
    }
    if (step % 2 === 0) {
      const frequency = chord[ARPEGGIO[(step / 2) % ARPEGGIO.length]] * 2
      tone(when, 'square', frequency, frequency, 0.15, 0.075, music)
    }
  }

  const shout = (buffer: AudioBuffer, when: number, options: { offset: number; gain: number; rate?: number; duration?: number }) => {
    const rate = options.rate ?? 1
    const layers: Array<[number, number, number, number]> = [
      [1, 0, 0, 1],
      [1.012, 0.012, -0.65, 0.5],
      [0.988, 0.021, 0.65, 0.5],
    ]
    for (const [detune, delay, pan, level] of layers) {
      const source = context.createBufferSource()
      const panner = context.createStereoPanner()
      const gain = context.createGain()
      source.buffer = buffer
      source.playbackRate.value = rate * detune
      panner.pan.value = pan
      gain.gain.value = options.gain * level
      source.connect(gain)
      gain.connect(panner)
      panner.connect(voiceBus)
      const at = Math.max(when + delay, context.currentTime)
      source.start(at, options.offset, options.duration)
      if (options.duration) {
        const fadeAt = at + options.duration / rate - 0.08
        gain.gain.setValueAtTime(options.gain * level, fadeAt)
        gain.gain.linearRampToValueAtTime(0.0001, fadeAt + 0.07)
      }
    }
  }

  const duckMusic = (when: number, length: number) => {
    const at = Math.max(when, context.currentTime)
    musicDuck.gain.setValueAtTime(1, at)
    musicDuck.gain.linearRampToValueAtTime(0.5, at + 0.02)
    musicDuck.gain.setValueAtTime(0.5, at + length)
    musicDuck.gain.linearRampToValueAtTime(1, at + length + 0.3)
  }

  const letsGo = (clips: Clips, when: number) => {
    if (clips.scream) shout(clips.scream, when, { offset: 0.64, gain: 1.5, rate: 1.15, duration: 1.1 })
    if (clips.male) shout(clips.male, when, { offset: 0.34, gain: 0.5, rate: 0.8, duration: 0.6 })
    duckMusic(when, 1)
  }

  let disposed = false
  let speechTimer: number | null = null

  const shoutWithSpeech = () => {
    if (!('speechSynthesis' in window)) return
    speechTimer = window.setTimeout(() => {
      try {
        const hype = new SpeechSynthesisUtterance("Let's go!")
        hype.rate = 1.2
        hype.pitch = 1.5
        hype.volume = Math.min(1, volume)
        window.speechSynthesis.speak(hype)
      } catch {
        // The music and fireworks still play without speech synthesis.
      }
    }, Math.max(0, (drop - context.currentTime) * 1000))
  }

  void preloadCelebrationAudio(context).then((clips) => {
    if (disposed) return
    if (!clips.scream && !clips.male) {
      shoutWithSpeech()
      return
    }
    letsGo(clips, drop)
    letsGo(clips, drop + BAR * 2)
    if (clips.hellYeah) {
      shout(clips.hellYeah, drop + BAR, { offset: 0.2, gain: 0.8, rate: 1.06, duration: 1.5 })
      duckMusic(drop + BAR, 1.2)
    }
    if (clips.woohoo) shout(clips.woohoo, drop + BAR * 3, { offset: 0.12, gain: 0.9, duration: 0.6 })
    if (clips.crowd) {
      const crowd = context.createBufferSource()
      const crowdGain = context.createGain()
      const at = Math.max(drop, context.currentTime)
      crowd.buffer = clips.crowd
      crowdGain.gain.setValueAtTime(0.0001, at)
      crowdGain.gain.exponentialRampToValueAtTime(0.75, at + 0.06)
      crowdGain.gain.setValueAtTime(0.75, at + 5.5)
      crowdGain.gain.linearRampToValueAtTime(0.0001, at + 8)
      crowd.connect(crowdGain)
      crowdGain.connect(input)
      crowdGain.connect(reverb)
      crowd.start(at, 0.37)
    }
  })

  scheduleBuild()
  scheduleImpact(drop)
  scheduleImpact(drop + BAR * 2)

  let step = 0
  const scheduleAhead = () => {
    if (context.state === 'closed') return
    while (drop + step * STEP < context.currentTime + LOOKAHEAD_SECONDS) {
      scheduleStep(step)
      step += 1
    }
  }
  const scheduler = window.setInterval(scheduleAhead, 60)
  scheduleAhead()

  const fade = (seconds: number) => {
    const now = context.currentTime
    output.gain.cancelScheduledValues(now)
    output.gain.setValueAtTime(Math.max(0.0001, output.gain.value), now)
    output.gain.linearRampToValueAtTime(0.0001, now + seconds)
  }

  const silenceSpeech = () => {
    if (speechTimer !== null) window.clearTimeout(speechTimer)
    speechTimer = null
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  return {
    launch(pan) {
      if (disposed) return
      const when = context.currentTime
      const panner = context.createStereoPanner()
      panner.pan.value = pan
      panner.connect(sfx)
      burst(when, 0.72, 0.2, panner, 'bandpass', 500, 4200)
      tone(when, 'sine', 420, 2300, 0.68, 0.055, panner, 0.05)
    },
    explode(style, pan) {
      if (disposed) return
      const when = context.currentTime
      const panner = context.createStereoPanner()
      panner.pan.value = pan
      panner.connect(sfx)
      const deep = style === 'willow'
      tone(when, 'sine', deep ? 105 : 135, 30, 0.75, 0.95, panner, 0.003)
      burst(when, 0.07, 0.8, panner, 'highpass', 1400)
      burst(when, deep ? 0.78 : 0.6, 0.55, panner, 'lowpass', 2800, 180)
      if (style === 'crackle' || style === 'willow' || style === 'double') {
        const pops = style === 'crackle' ? 26 : 13
        for (let index = 0; index < pops; index += 1) {
          burst(when + 0.2 + Math.random() * 1.15, 0.018, 0.1 + Math.random() * 0.2, panner, 'highpass', 3000 + Math.random() * 3500)
        }
      }
    },
    fadeOut(seconds) {
      silenceSpeech()
      fade(seconds)
    },
    dispose() {
      if (disposed) return
      disposed = true
      window.clearInterval(scheduler)
      silenceSpeech()
      if (context.state === 'closed') return
      fade(0.35)
      window.setTimeout(() => {
        output.disconnect()
        input.disconnect()
      }, 420)
    },
  }
}
