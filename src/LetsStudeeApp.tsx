import { useEffect, useEffectEvent, useRef, useState } from 'react'
import './layout.css'
import ManageScreen from './ManageScreen'
import SettingsScreen from './SettingsScreen'
import StudyScreen from './StudyScreen'
import { drawQuestion, resetQuestionUsage, spokenDuration } from './questionLogic'
import { loadStudyData, saveStudyData } from './studyStorage'
import { resolveSpeechVoice } from './speechVoice'
import { loadStudySessions, saveStudySessions, type StudySession } from './studySessions'
import type { Question, SpeechSpeed, StudyData, StudySettings, Topic } from './studyTypes'

type View = 'study' | 'manage' | 'settings'
type SessionPhase = 'ready' | 'speaking' | 'countdown' | 'time-up' | 'revealed' | 'rated'
type Rating = 'gotIt' | 'missedIt'
let speechRun = 0

function rateValue(speed: SpeechSpeed): number {
  if (speed === 'slow') return 0.78
  if (speed === 'fast') return 1.15
  return 0.95
}

function speakLines(
  lines: string[],
  settings: StudySettings,
  voices: SpeechSynthesisVoice[],
  onComplete: () => void,
): boolean {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false

  const selectedVoice = resolveSpeechVoice(voices, settings.voiceURI)
  const run = ++speechRun
  let index = 0
  let completed = false
  const finish = () => {
    if (completed) return
    completed = true
    onComplete()
  }
  const speakNext = () => {
    if (run !== speechRun) return
    if (index >= lines.length) {
      finish()
      return
    }
    const utterance = new SpeechSynthesisUtterance(lines[index])
    utterance.rate = rateValue(settings.speechSpeed)
    if (selectedVoice) utterance.voice = selectedVoice
    utterance.onend = speakNext
    utterance.onerror = speakNext
    window.speechSynthesis.speak(utterance)
    index += 1
  }

  try {
    window.speechSynthesis.cancel()
    speakNext()
    return true
  } catch {
    return false
  }
}

function StudyApp() {
  const [data, setData] = useState<StudyData>(loadStudyData)
  const [sessions, setSessions] = useState<StudySession[]>(loadStudySessions)
  const [view, setView] = useState<View>('study')
  const [phase, setPhase] = useState<SessionPhase>('ready')
  const [question, setQuestion] = useState<Question | null>(null)
  const [topic, setTopic] = useState<Topic | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(data.settings.defaultSeconds)
  const [questionVisible, setQuestionVisible] = useState(false)
  const [timeIsUp, setTimeIsUp] = useState(false)
  const [rated, setRated] = useState(false)
  const [notice, setNotice] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const remainingRef = useRef<number>(remainingSeconds)
  const sessionToken = useRef(0)
  const audioContext = useRef<AudioContext | null>(null)
  const latestSession = sessions[sessions.length - 1]
  const currentSession = latestSession?.endedAt === null ? latestSession : null

  useEffect(() => {
    saveStudyData(data)
  }, [data])

  useEffect(() => {
    saveStudySessions(sessions)
  }, [sessions])

  useEffect(() => {
    document.title = 'Lets StudEE!'
  }, [])

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const refreshVoices = () => setVoices(window.speechSynthesis.getVoices())
    refreshVoices()
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices)
  }, [])

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (audioContext.current && audioContext.current.state !== 'closed') void audioContext.current.close()
  }, [])

  function prepareAudio() {
    try {
      audioContext.current ??= new AudioContext()
      void audioContext.current.resume().catch(() => {})
    } catch {
      audioContext.current = null
    }
  }

  function beep() {
    const context = audioContext.current
    if (!context) return
    void context.resume().then(() => {
      for (const startOffset of [0, 0.2]) {
        const oscillator = context.createOscillator()
        const volume = context.createGain()
        const startAt = context.currentTime + startOffset
        volume.gain.setValueAtTime(0.001, startAt)
        volume.gain.exponentialRampToValueAtTime(0.18, startAt + 0.015)
        volume.gain.exponentialRampToValueAtTime(0.001, startAt + 0.13)
        oscillator.frequency.value = 740
        oscillator.connect(volume)
        volume.connect(context.destination)
        oscillator.start(startAt)
        oscillator.stop(startAt + 0.14)
      }
    }).catch(() => {})
  }

  function playTimerStartCue() {
    const context = audioContext.current
    if (!context) return
    void context.resume().then(() => {
      const oscillator = context.createOscillator()
      const volume = context.createGain()
      const startAt = context.currentTime
      volume.gain.setValueAtTime(0.001, startAt)
      volume.gain.exponentialRampToValueAtTime(0.12, startAt + 0.012)
      volume.gain.exponentialRampToValueAtTime(0.001, startAt + 0.18)
      oscillator.frequency.value = 520
      oscillator.connect(volume)
      volume.connect(context.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.19)
    }).catch(() => {})
  }

  function stopSpeech() {
    sessionToken.current += 1
    speechRun += 1
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  function announceTimeUp() {
    setPhase('time-up')
    setTimeIsUp(true)
    setQuestionVisible(false)
    setRated(false)
    setNotice("Time's up!")
    beep()
    stopSpeech()
    speakLines(["Time's up!"], data.settings, voices, () => {})
  }

  const tickTimer = useEffectEvent(() => {
    if (phase !== 'countdown') return
    const next = Math.max(0, remainingRef.current - 1)
    remainingRef.current = next
    setRemainingSeconds(next)
    if (next === 0) announceTimeUp()
  })

  useEffect(() => {
    if (phase !== 'countdown') return
    const timerId = window.setInterval(tickTimer, 1000)
    return () => window.clearInterval(timerId)
  }, [phase])

  function readQuestion() {
    if (!currentSession) {
      setNotice('Start a session before reading a question.')
      return
    }

    const draw = drawQuestion(data)
    if (!draw) {
      setNotice('No questions in the active pool. Add questions or adjust your topics and time filter.')
      return
    }

    setData(draw.data)
    setSessions((savedSessions) => savedSessions.map((session) => session.id === currentSession.id
      ? {
        ...session,
        questions: [...session.questions, {
          id: draw.question.id,
          text: draw.question.text,
          topic: draw.topic,
          seconds: draw.question.seconds,
          askedAt: new Date().toISOString(),
        }],
      }
      : session))
    setQuestion(draw.question)
    setTopic(draw.topic)
    setQuestionVisible(false)
    setTimeIsUp(false)
    setRated(false)
    setNotice('')
    remainingRef.current = draw.question.seconds
    setRemainingSeconds(draw.question.seconds)
    const token = ++sessionToken.current
    setPhase('speaking')
    prepareAudio()
    const beginCountdown = () => {
      if (sessionToken.current !== token) return
      setPhase('countdown')
      playTimerStartCue()
    }

    const speech = data.settings.announceDuration
      ? [spokenDuration(draw.question.seconds), draw.question.text, draw.question.text]
      : [draw.question.text, draw.question.text]
    const started = speakLines(speech, data.settings, voices, beginCountdown)

    if (!started) {
      setNotice('Speech synthesis is unavailable. The countdown has started.')
      beginCountdown()
    }
  }

  function repeatQuestion() {
    if (!question || phase !== 'countdown') return
    const token = ++sessionToken.current
    const started = speakLines([question.text], data.settings, voices, () => {
      if (sessionToken.current === token) setNotice('')
    })
    setNotice(started ? 'The timer keeps running.' : 'Speech synthesis is unavailable.')
  }

  function stopQuestion() {
    stopSpeech()
    setPhase('ready')
    setQuestion(null)
    setTopic(null)
    setQuestionVisible(false)
    setTimeIsUp(false)
    setRated(false)
    setNotice('')
    remainingRef.current = data.settings.defaultSeconds
    setRemainingSeconds(data.settings.defaultSeconds)
  }

  function startStudySession() {
    if (currentSession) return
    stopQuestion()
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setSessions((savedSessions) => [...savedSessions, {
      id,
      startedAt: new Date().toISOString(),
      endedAt: null,
      questions: [],
    }])
    setData((current) => resetQuestionUsage(current))
    setNotice('Session started. Read a question when you are ready.')
  }

  function endStudySession() {
    if (!currentSession) return
    stopQuestion()
    setSessions((savedSessions) => savedSessions.map((session) => session.id === currentSession.id
      ? { ...session, endedAt: new Date().toISOString() }
      : session))
    setNotice('Session ended. Its questions are saved below.')
  }

  function skipQuestion() {
    stopSpeech()
    readQuestion()
  }

  function showQuestion() {
    if (!question || !['countdown', 'time-up'].includes(phase)) return
    if (phase === 'countdown') setPhase('revealed')
    setQuestionVisible(true)
    setNotice('')
    if (phase === 'countdown') stopSpeech()
  }

  function rateQuestion(rating: Rating) {
    if (!topic || !question || !timeIsUp || rated) return
    setData((current) => {
      const result = current.results[topic]
      return {
        ...current,
        results: {
          ...current.results,
          [topic]: {
            gotIt: result.gotIt + (rating === 'gotIt' ? 1 : 0),
            missedIt: result.missedIt + (rating === 'missedIt' ? 1 : 0),
          },
        },
      }
    })
    setRated(true)
    setPhase('rated')
    setNotice(rating === 'gotIt' ? 'Saved: got it.' : 'Saved: missed it.')
  }

  function updateData(updated: StudyData) {
    setData(updated)
  }

  function updateSettings(settings: StudySettings) {
    setData((current) => ({ ...current, settings }))
    if (phase === 'ready') {
      remainingRef.current = settings.defaultSeconds
      setRemainingSeconds(settings.defaultSeconds)
    }
  }

  function previewQuestion(text: string): boolean {
    const token = ++sessionToken.current
    return speakLines([text], data.settings, voices, () => {
      if (sessionToken.current === token) setNotice('')
    })
  }

  function restoreBackup(backup: StudyData) {
    stopSpeech()
    setData(backup)
    setPhase('ready')
    setQuestion(null)
    setTopic(null)
    setQuestionVisible(false)
    setTimeIsUp(false)
    setRated(false)
    remainingRef.current = backup.settings.defaultSeconds
    setRemainingSeconds(backup.settings.defaultSeconds)
    setNotice('Backup restored.')
  }

  function navigate(nextView: View) {
    if (nextView !== 'study' && (phase === 'speaking' || phase === 'countdown')) stopQuestion()
    setView(nextView)
  }

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target
    if (target instanceof HTMLElement && target.closest('input, textarea, select, button, [contenteditable="true"]')) return
    if (event.altKey || event.ctrlKey || event.metaKey) return

    if (event.code === 'Space') {
      if (view === 'study' && currentSession && ['ready', 'time-up', 'revealed', 'rated'].includes(phase)) {
        event.preventDefault()
        readQuestion()
      }
    } else if (event.key.toLowerCase() === 'r' && view === 'study' && phase === 'countdown') {
      event.preventDefault()
      repeatQuestion()
    } else if (event.key.toLowerCase() === 'q' && view === 'study' && ['countdown', 'time-up'].includes(phase)) {
      event.preventDefault()
      showQuestion()
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const activeQuestionProps = {
    phase,
    remainingSeconds,
    currentQuestion: question,
    currentTopic: topic,
    questionVisible,
    timeIsUp,
    rated,
    notice,
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate('study') }}>Lets StudEE!</a>
        <nav className="main-nav" aria-label="Main navigation">
          {(['study', 'manage', 'settings'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-current={view === item ? 'page' : undefined}
              onClick={() => navigate(item)}
            >
              {item === 'study' ? 'Study' : item === 'manage' ? 'Manage questions' : 'Settings'}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {view === 'study' && (
          <StudyScreen
            data={data}
            {...activeQuestionProps}
            onChangeData={updateData}
            isSessionActive={Boolean(currentSession)}
            sessions={sessions}
            onStartSession={startStudySession}
            onEndSession={endStudySession}
            onRead={readQuestion}
            onRepeat={repeatQuestion}
            onStop={stopQuestion}
            onSkip={skipQuestion}
            onShowQuestion={showQuestion}
            onNext={readQuestion}
            onRate={rateQuestion}
          />
        )}
        {view === 'manage' && (
          <ManageScreen
            data={data}
            onChangeData={updateData}
            onPreview={previewQuestion}
            onRestore={restoreBackup}
          />
        )}
        {view === 'settings' && (
          <SettingsScreen data={data} voices={voices} onChangeSettings={updateSettings} />
        )}
      </main>

      <footer className="app-footer">
        <span>Export a backup to keep a copy of your progress.</span>
        <span>Space read / next · R repeat · Q show question</span>
      </footer>
    </div>
  )
}

export default StudyApp
