import { useCallback, useEffect, useRef, useState } from 'react'
import { startCelebrationAudio, type CelebrationAudio, type ExplosionStyle } from './celebrationAudio'
import { screenScale, toPagePx } from './appScale'

type FireworkStyle = ExplosionStyle
type Color = { hue: number; saturation: number; lightness: number }
type Point = { x: number; y: number }

interface Rocket {
  x: number
  y: number
  vx: number
  vy: number
  targetY: number
  color: Color
  style: FireworkStyle
  age: number
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  trail: Point[]
  life: number
  maxLife: number
  color: Color
  radius: number
  gravity: number
  drag: number
}

interface Flash {
  x: number
  y: number
  life: number
  color: Color
}

interface Star {
  x: number
  y: number
  radius: number
  phase: number
  twinkleSpeed: number
}

interface FireworksCelebrationProps {
  audioContext: AudioContext | null
  muted: boolean
  volume: number
  onToggleMute: () => void
  onDismiss: () => void
  onSaveScore: () => void
  onSuddenDeath: () => void
  competitionName: string
  score: number
  maxScore: number
  hasSuddenDeath: boolean
}

const HUES = [2, 42, 54, 128, 184, 300, 332]
const GOLD: Color = { hue: 47, saturation: 96, lightness: 70 }

function burstColor(hue: number): Color {
  return {
    hue: (hue + 360) % 360,
    saturation: Math.random() < 0.1 ? 18 : 92,
    lightness: 66 + Math.random() * 14,
  }
}

function stereoPosition(x: number, width: number): number {
  return Math.max(-0.8, Math.min(0.8, (x / width) * 2 - 1))
}

function colorValue(color: Color): string {
  return `hsl(${color.hue} ${color.saturation}% ${color.lightness}%)`
}

export default function FireworksCelebration({
  audioContext,
  muted,
  volume,
  onToggleMute,
  onDismiss,
  onSaveScore,
  onSuddenDeath,
  competitionName,
  score,
  maxScore,
  hasSuddenDeath,
}: FireworksCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const soundRef = useRef<CelebrationAudio | null>(null)
  const dismissTimerRef = useRef<number | null>(null)
  const isDismissingRef = useRef(false)
  const [isDismissing, setIsDismissing] = useState(false)

  const dismiss = useCallback((action = onDismiss) => {
    if (isDismissingRef.current) return
    isDismissingRef.current = true
    setIsDismissing(true)
    soundRef.current?.fadeOut(0.45)
    dismissTimerRef.current = window.setTimeout(action, 480)
  }, [onDismiss])

  useEffect(() => {
    const dismissOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return
      if (event.key !== 'Escape' && event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) return
      dismiss()
    }
    window.addEventListener('keydown', dismissOnKey)
    return () => {
      window.removeEventListener('keydown', dismissOnKey)
      if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current)
    }
  }, [dismiss])

  useEffect(() => {
    if (muted || volume <= 0 || !audioContext || audioContext.state === 'closed') return

    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {})
    const sound = startCelebrationAudio(audioContext, volume)
    soundRef.current = sound
    return () => {
      sound.dispose()
      if (soundRef.current === sound) soundRef.current = null
    }
  }, [audioContext, muted, volume])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    let width = toPagePx(window.innerWidth)
    let height = toPagePx(window.innerHeight)
    let pixelRatio = 1
    let frame = 0
    let startedAt = 0
    let lastFrame = 0
    let nextLaunchAt = 0
    let stars: Star[] = []
    const rockets: Rocket[] = []
    const sparks: Spark[] = []
    const flashes: Flash[] = []

    const resize = () => {
      width = toPagePx(window.innerWidth)
      height = toPagePx(window.innerHeight)
      pixelRatio = Math.min((window.devicePixelRatio || 1) * screenScale(), 1.5 * screenScale())
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      const starCount = Math.min(72, Math.max(32, Math.floor((width * height) / 24000)))
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.35 + Math.random() * 1.15,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.001 + Math.random() * 0.003,
      }))
    }

    const launchRocket = (finale = false) => {
      const targetX = width * (0.12 + Math.random() * 0.76)
      const targetY = height * (finale ? 0.13 + Math.random() * 0.31 : 0.15 + Math.random() * 0.43)
      const drift = (Math.random() - 0.5) * 1.5
      const travelFrames = 54 + Math.random() * 14
      const styles: FireworkStyle[] = ['sphere', 'ring', 'heart', 'willow', 'double', 'crackle']
      const style = finale && Math.random() < 0.42
        ? 'willow'
        : styles[Math.floor(Math.random() * styles.length)]
      const hue = HUES[Math.floor(Math.random() * HUES.length)] + (Math.random() - 0.5) * 34
      const color = finale && Math.random() < 0.35 ? GOLD : burstColor(hue)
      rockets.push({
        x: Math.max(10, Math.min(width - 10, targetX - drift * travelFrames)),
        y: height + 16,
        vx: drift,
        vy: -(height + 16 - targetY) / travelFrames,
        targetY,
        color,
        style,
        age: 0,
      })
      soundRef.current?.launch(stereoPosition(targetX, width))
    }

    const explode = (rocket: Rocket) => {
      flashes.push({ x: rocket.x, y: rocket.y, life: 1, color: rocket.color })
      soundRef.current?.explode(rocket.style, stereoPosition(rocket.x, width))
      const particleCount = width < 520 ? 38 : 54
      const offset = Math.random() * Math.PI * 2
      for (let index = 0; index < particleCount; index += 1) {
        const angle = offset + (Math.PI * 2 * index) / particleCount + (Math.random() - 0.5) * 0.07
        const layer = rocket.style === 'double' && index % 2 === 0
        const speed = rocket.style === 'ring'
          ? 4.4 + Math.random() * 0.55
          : rocket.style === 'willow'
            ? 2.5 + Math.random() * 3.8
            : rocket.style === 'double'
              ? layer ? 4.8 + Math.random() * 0.8 : 2.1 + Math.random() * 0.8
              : rocket.style === 'crackle'
                ? 2 + Math.random() * 4.8
                : 2.1 + Math.random() * 5.1
        let directionX = Math.cos(angle)
        let directionY = Math.sin(angle)
        if (rocket.style === 'heart') {
          const heartAngle = (Math.PI * 2 * index) / particleCount
          directionX = (16 * Math.sin(heartAngle) ** 3) / 17
          directionY = -(13 * Math.cos(heartAngle) - 5 * Math.cos(2 * heartAngle) - 2 * Math.cos(3 * heartAngle) - Math.cos(4 * heartAngle)) / 17
        }
        const color = rocket.style === 'willow' && Math.random() < 0.76
          ? GOLD
          : rocket.style === 'double' && layer
            ? burstColor(rocket.color.hue + 42)
            : rocket.style === 'crackle' && Math.random() < 0.35
              ? GOLD
              : rocket.color
        const life = rocket.style === 'willow' ? 85 + Math.random() * 55 : rocket.style === 'crackle' ? 52 + Math.random() * 28 : 60 + Math.random() * 52
        sparks.push({
          x: rocket.x,
          y: rocket.y,
          vx: directionX * speed,
          vy: directionY * speed,
          trail: [],
          life,
          maxLife: life,
          color,
          radius: rocket.style === 'willow' ? 1.2 + Math.random() * 1.2 : 0.9 + Math.random() * 1.5,
          gravity: rocket.style === 'willow' ? 0.068 : rocket.style === 'ring' ? 0.024 : 0.04,
          drag: rocket.style === 'willow' ? 0.992 : rocket.style === 'ring' ? 0.99 : 0.984,
        })
      }
      if (rocket.style === 'crackle') {
        for (let index = 0; index < 16; index += 1) {
          const angle = Math.random() * Math.PI * 2
          const speed = 1 + Math.random() * 4
          const life = 18 + Math.random() * 22
          sparks.push({
            x: rocket.x,
            y: rocket.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            trail: [],
            life,
            maxLife: life,
            color: Math.random() < 0.65 ? GOLD : rocket.color,
            radius: 0.7 + Math.random(),
            gravity: 0.055,
            drag: 0.96,
          })
        }
      }
    }

    const draw = (now: number) => {
      if (!startedAt) {
        startedAt = now
        nextLaunchAt = now + 60
      }
      const elapsed = now - startedAt
      const frameScale = lastFrame === 0 ? 1 : Math.min((now - lastFrame) / (1000 / 60), 2.5)
      lastFrame = now
      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = 'lighter'

      for (const star of stars) {
        const alpha = 0.2 + (Math.sin(elapsed * star.twinkleSpeed + star.phase) + 1) * 0.32
        context.globalAlpha = alpha
        context.fillStyle = '#fff8dc'
        context.beginPath()
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
        context.fill()
      }

      if (elapsed < 7000 && now >= nextLaunchAt && sparks.length < 240 && rockets.length < 2) {
        const finale = elapsed >= 4600
        launchRocket(finale)
        if (finale && Math.random() < 0.28 && sparks.length < 170) {
          launchRocket(true)
        }
        nextLaunchAt = now + (finale ? 660 + Math.random() * 260 : 820 + Math.random() * 420)
      }

      for (let index = rockets.length - 1; index >= 0; index -= 1) {
        const rocket = rockets[index]
        rocket.x += rocket.vx * frameScale
        rocket.y += rocket.vy * frameScale
        rocket.vy += 0.026 * frameScale
        rocket.age += frameScale

        context.globalAlpha = Math.max(0, 1 - rocket.age / 66)
        context.strokeStyle = colorValue(rocket.color)
        context.lineWidth = 2.6
        context.shadowBlur = 0
        context.beginPath()
        context.moveTo(rocket.x - rocket.vx * 4, rocket.y - rocket.vy * 4)
        context.lineTo(rocket.x, rocket.y)
        context.stroke()
        context.fillStyle = '#fffdf1'
        context.beginPath()
        context.arc(rocket.x, rocket.y, 3, 0, Math.PI * 2)
        context.fill()

        if (rocket.y <= rocket.targetY || rocket.age > 72) {
          explode(rocket)
          rockets.splice(index, 1)
        }
      }

      for (let index = sparks.length - 1; index >= 0; index -= 1) {
        const spark = sparks[index]
        spark.trail.push({ x: spark.x, y: spark.y })
        if (spark.trail.length > 4) spark.trail.shift()
        spark.x += spark.vx * frameScale
        spark.y += spark.vy * frameScale
        spark.vx *= spark.drag ** frameScale
        spark.vy = spark.vy * (spark.drag ** frameScale) + spark.gravity * frameScale
        spark.life -= frameScale

        const alpha = Math.max(0, spark.life / spark.maxLife)
        context.globalAlpha = alpha * 0.88
        context.strokeStyle = colorValue(spark.color)
        context.lineWidth = spark.radius
        context.shadowBlur = 0
        context.beginPath()
        if (spark.trail.length) {
          context.moveTo(spark.trail[0].x, spark.trail[0].y)
          for (const point of spark.trail) context.lineTo(point.x, point.y)
        }
        context.lineTo(spark.x, spark.y)
        context.stroke()
        context.globalAlpha = alpha
        context.fillStyle = '#fff'
        context.beginPath()
        context.arc(spark.x, spark.y, spark.radius * 0.72, 0, Math.PI * 2)
        context.fill()
        if (Math.random() < 0.035) {
          context.globalAlpha = alpha * 0.8
          context.fillStyle = colorValue(spark.color)
          context.beginPath()
          context.arc(spark.x + (Math.random() - 0.5) * 12, spark.y + (Math.random() - 0.5) * 12, 1 + Math.random() * 1.5, 0, Math.PI * 2)
          context.fill()
        }
        if (spark.life <= 0) sparks.splice(index, 1)
      }

      for (let index = flashes.length - 1; index >= 0; index -= 1) {
        const flash = flashes[index]
        flash.life -= 0.052 * frameScale
        const life = Math.max(0, flash.life)
        context.globalAlpha = life * 0.025
        context.fillStyle = colorValue(flash.color)
        context.fillRect(0, 0, width, height)
        context.globalAlpha = life * 0.9
        context.fillStyle = '#fff'
        context.shadowColor = colorValue(flash.color)
        context.shadowBlur = 18
        context.beginPath()
        context.arc(flash.x, flash.y, 3 + (1 - life) * 12, 0, Math.PI * 2)
        context.fill()
        context.globalAlpha = life * 0.78
        context.strokeStyle = colorValue(flash.color)
        context.lineWidth = 3
        context.beginPath()
        context.arc(flash.x, flash.y, 6 + (1 - life) * 72, 0, Math.PI * 2)
        context.stroke()
        if (flash.life <= 0) flashes.splice(index, 1)
      }

      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
      context.shadowBlur = 0
      if (elapsed < 9200 || rockets.length || sparks.length || flashes.length) frame = window.requestAnimationFrame(draw)
    }

    resize()
    frame = window.requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [audioContext, muted, volume])

  return <div
    className={`competition-celebration${isDismissing ? ' is-dismissing' : ''}`}
    role="dialog"
    aria-modal="true"
    aria-labelledby="competition-celebration-title"
    onClick={() => dismiss()}
  >
    <canvas className="competition-fireworks-canvas" ref={canvasRef} aria-hidden="true" />
    <div className="competition-celebration-message">
      <p className="eyebrow">Competition complete</p>
      <h2 id="competition-celebration-title">{competitionName}</h2>
      <p className="competition-score-large">{score} <span>/ {maxScore}</span></p>
      <p className="competition-celebration-prompt">Save your score, or keep the challenge going.</p>
      <div className="competition-celebration-actions">
        <button className="primary-action" type="button" onClick={(event) => { event.stopPropagation(); dismiss(onSaveScore) }}>Save my score</button>
        <button className="secondary-action" type="button" disabled={!hasSuddenDeath} onClick={(event) => { event.stopPropagation(); dismiss(onSuddenDeath) }}>Go to Sudden Death</button>
      </div>
      {!hasSuddenDeath && <span className="competition-celebration-note">No Sudden Death questions in this competition</span>}
      <span className="competition-celebration-dismiss">Click anywhere or press any key to continue</span>
    </div>
    <button
      className="competition-fireworks-sound"
      type="button"
      aria-pressed={!muted}
      aria-label={muted ? 'Turn fireworks sound on' : 'Turn fireworks sound off'}
      onClick={(event) => { event.stopPropagation(); onToggleMute() }}
    >
      {muted ? 'Sound off' : 'Sound on'}
    </button>
  </div>
}
