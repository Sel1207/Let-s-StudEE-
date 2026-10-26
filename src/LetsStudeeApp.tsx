import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState } from 'react'
import './layout.css'
import ManageScreen from './ManageScreen'
import SettingsScreen from './SettingsScreen'
import StudyScreen from './StudyScreen'
import { drawQuestion, spokenDuration } from './questionLogic'
import { loadStudyData, saveStudyData } from './studyStorage'
import { speechRate } from './speechRate'
import { mathToSpeech } from './mathSpeech'
import { loadThemePreference, saveThemePreference, type ThemePreference } from './themePreference'
import { PREFERRED_VOICE_NAME, type Question, type SpeechSpeed, type StudyData, type StudySettings, type Topic, type TopicGroupName } from './studyTypes'

type View = 'study' | 'manage' | 'settings' | 'competitions' | 'favorites'
type SessionPhase = 'ready' | 'speaking' | 'countdown' | 'paused' | 'time-up' | 'revealed' | 'rated'
type Rating = 'gotIt' | 'missedIt'
interface SpeechLine {
  text: string
  speed?: SpeechSpeed
}

let speechRun = 0
const MockCompetitionScreen = lazy(() => import('./MockCompetitionScreen'))
const FavoriteQuestionsScreen = lazy(() => import('./FavoriteQuestionsScreen'))

function speakLines(
  lines: SpeechLine[],
  settings: StudySettings,
  voices: SpeechSynthesisVoice[],
  onComplete: () => void,
): boolean {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false

  const selectedVoice = voices.find((voice) => voice.voiceURI === settings.voiceURI)
    ?? voices.find((voice) => voice.name.includes(PREFERRED_VOICE_NAME))
    ?? voices.find((voice) => /^en([_-]|$)/i.test(voice.lang))
  const fallbackVoice = voices.find((voice) => /^en([_-]|$)/i.test(voice.lang) && voice !== selectedVoice)
  const run = ++speechRun
  let index = 0
  let nextScheduled = false
  let completed = false
  let attempt = 0
  let attemptId = 0
  let watchdogId = 0
  let startedAt = 0
  let queuedAt = 0
  let expectedDuration = 0
  let utteranceText = ''
  let currentSpeed: SpeechSpeed = 'fast'
  const finish = () => {
    if (completed) return
    completed = true
    window.clearTimeout(watchdogId)
    onComplete()
  }
  const scheduleNext = () => {
    if (run !== speechRun || nextScheduled) return
    window.clearTimeout(watchdogId)
    nextScheduled = true
    window.setTimeout(() => {
      if (run !== speechRun) return
      nextScheduled = false
      attempt = 0
      speakNext()
    }, 80)
  }
  const recoverPlayback = () => {
    if (run !== speechRun) return
    if (window.speechSynthesis.paused) {
      watchdogId = window.setTimeout(recoverPlayback, 1500)
      return
    }
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      if (Date.now() - queuedAt > expectedDuration + 10000) {
        attemptId += 1
        window.speechSynthesis.cancel()
        if (attempt < 1) {
          attempt += 1
          speakCurrent(currentSpeed)
        } else {
          scheduleNext()
        }
        return
      }
      watchdogId = window.setTimeout(recoverPlayback, 1500)
      return
    }

    const elapsed = Date.now() - startedAt
    if (startedAt && elapsed >= expectedDuration) {
      scheduleNext()
      return
    }
    if (startedAt) {
      watchdogId = window.setTimeout(recoverPlayback, Math.min(1500, expectedDuration - elapsed))
      return
    }
    if (attempt < 1) {
      attempt += 1
      speakCurrent(currentSpeed)
      return
    }
    scheduleNext()
  }
  const speakNext = () => {
    if (run !== speechRun || nextScheduled) return
    if (index >= lines.length) {
      finish()
      return
    }
    const line = lines[index]
    index += 1
    utteranceText = mathToSpeech(line.text)
    currentSpeed = line.speed ?? 'fast'
    attempt = 0
    speakCurrent(currentSpeed)
  }
  const speakCurrent = (speed?: SpeechSpeed) => {
    if (run !== speechRun) return
    const currentAttemptId = ++attemptId
    startedAt = 0
    queuedAt = Date.now()
    const selectedSpeed = speed ?? currentSpeed
    expectedDuration = Math.max(2500, (utteranceText.trim().split(/\s+/).length * 60000) / (160 * speechRate(selectedSpeed)) + 2500)
    const utterance = new SpeechSynthesisUtterance(utteranceText)
    utterance.rate = speechRate(selectedSpeed)
    if (attempt === 0 && selectedVoice) utterance.voice = selectedVoice
    else if (fallbackVoice) utterance.voice = fallbackVoice
    const isCurrentAttempt = () => run === speechRun && currentAttemptId === attemptId
    utterance.onstart = () => {
      if (!isCurrentAttempt()) return
      startedAt = Date.now()
      watchdogId = window.setTimeout(recoverPlayback, 1500)
    }
    utterance.onend = () => {
      if (isCurrentAttempt()) scheduleNext()
    }
    utterance.onerror = () => {
      if (!isCurrentAttempt()) return
      window.clearTimeout(watchdogId)
      if (attempt < 1) {
        attempt += 1
        attemptId += 1
        window.speechSynthesis.cancel()
        window.setTimeout(() => speakCurrent(speed), 100)
      } else {
        scheduleNext()
      }
    }
    watchdogId = window.setTimeout(recoverPlayback, 5000)
    window.speechSynthesis.speak(utterance)
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
  const [theme, setTheme] = useState<ThemePreference>(loadThemePreference)
  const [view, setView] = useState<View>(() => (
    new URLSearchParams(window.location.search).get('__app_update')?.startsWith('settings-') ? 'settings' : 'study'
  ))
  const [activeTopicGroup, setActiveTopicGroup] = useState<TopicGroupName>('Math')
  const [phase, setPhase] = useState<SessionPhase>('ready')
  const [question, setQuestion] = useState<Question | null>(null)
  const [topic, setTopic] = useState<Topic | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(data.settings.defaultSeconds)
  const [questionVisible, setQuestionVisible] = useState(false)
  const [answerVisible, setAnswerVisible] = useState(false)
  const [timeIsUp, setTimeIsUp] = useState(false)
  const [rated, setRated] = useState(false)
  const [notice, setNotice] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const remainingRef = useRef<number>(remainingSeconds)
  const countdownDeadline = useRef<number | null>(null)
  const sessionToken = useRef(0)
  const audioContext = useRef<AudioContext | null>(null)
  const pausedFrom = useRef<'speaking' | 'countdown'>('countdown')
  const sessionPaused = useRef(false)
  const resumeSpeech = useRef(false)
  const pendingAnswerSpeech = useRef(false)

  useEffect(() => {
    saveStudyData(data)
  }, [data])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111214' : '#f7f8f5')
    saveThemePreference(theme)
  }, [theme])

  useEffect(() => {
    document.title = 'Lets StudEE!'
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('__app_update')) return
    url.searchParams.delete('__app_update')
    window.history.replaceState(window.history.state, '', url.toString())
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

  function playFiveSecondCue() {
    const context = audioContext.current
    if (!context) return
    void context.resume().then(() => {
      const oscillator = context.createOscillator()
      const volume = context.createGain()
      const startAt = context.currentTime
      volume.gain.setValueAtTime(0.001, startAt)
      volume.gain.exponentialRampToValueAtTime(0.09, startAt + 0.01)
      volume.gain.exponentialRampToValueAtTime(0.001, startAt + 0.13)
      oscillator.type = 'triangle'
      oscillator.frequency.value = 560
      oscillator.connect(volume)
      volume.connect(context.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.14)
    }).catch(() => {})
  }

  function stopSpeech() {
    sessionToken.current += 1
    speechRun += 1
    sessionPaused.current = false
    resumeSpeech.current = false
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  function announceTimeUp() {
    countdownDeadline.current = null
    setPhase('time-up')
    setTimeIsUp(true)
    setQuestionVisible(true)
    setRated(false)
    setNotice(question?.answer ? "Time's up! The answer and solution are ready." : "Time's up! This question has no saved answer yet.")
    beep()
    stopSpeech()
    const answerSpeech: SpeechLine[] = question?.answer
      ? [
        { text: 'Time is up.' },
        { text: 'The correct answer is.' },
        { text: question.answer, speed: 'normal' },
      ]
      : [{ text: "Time's up!" }]
    speakLines(answerSpeech, data.settings, voices, () => {})
  }

  const tickTimer = useEffectEvent(() => {
    if (phase !== 'countdown' || countdownDeadline.current === null) return
    const next = Math.max(0, Math.ceil((countdownDeadline.current - Date.now()) / 1000))
    if (next === remainingRef.current) return
    remainingRef.current = next
    setRemainingSeconds(next)
    if (next <= 5 && next > 0) playFiveSecondCue()
    if (next === 0) announceTimeUp()
  })

  useEffect(() => {
    if (phase !== 'countdown') return
    const timerId = window.setInterval(tickTimer, 250)
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') tickTimer()
    }
    document.addEventListener('visibilitychange', syncWhenVisible)
    return () => {
      window.clearInterval(timerId)
      document.removeEventListener('visibilitychange', syncWhenVisible)
    }
  }, [phase])

  function readQuestion() {
    const draw = drawQuestion(data, activeTopicGroup)
    if (!draw) {
      setNotice('No questions in the active pool. Add questions or adjust your topics and time filter.')
      return
    }

    setData(draw.data)
    setQuestion(draw.question)
    setTopic(draw.topic)
    setQuestionVisible(false)
    setAnswerVisible(false)
    setTimeIsUp(false)
    pendingAnswerSpeech.current = false
    setRated(false)
    setNotice('')
    sessionPaused.current = false
    countdownDeadline.current = null
    remainingRef.current = draw.question.seconds
    setRemainingSeconds(draw.question.seconds)
    const token = ++sessionToken.current
    setPhase('speaking')
    prepareAudio()
    const beginCountdown = () => {
      if (sessionToken.current !== token) return
      if (sessionPaused.current) {
        pausedFrom.current = 'countdown'
        return
      }
      countdownDeadline.current = Date.now() + remainingRef.current * 1000
      setPhase('countdown')
      playTimerStartCue()
      if (pendingAnswerSpeech.current) {
        pendingAnswerSpeech.current = false
        speakAnswer(draw.question)
      }
    }

    const topicAnnouncement = `Topic: ${draw.topic}${data.settings.announceDuration ? `. ${spokenDuration(draw.question.seconds)}` : ''}`
    const questionLine: SpeechLine = {
      text: draw.question.spokenText ?? draw.question.text,
      speed: data.settings.speechSpeed,
    }
    const speech: SpeechLine[] = [
      { text: topicAnnouncement },
      questionLine,
      { text: 'Again.' },
      questionLine,
      { text: 'Time starts now.' },
    ]
    const started = speakLines(speech, data.settings, voices, beginCountdown)

    if (!started) {
      setNotice('Speech synthesis is unavailable. The countdown has started.')
      beginCountdown()
    }
  }

  function repeatQuestion() {
    if (!question || phase !== 'countdown') return
    const token = ++sessionToken.current
    const started = speakLines([
      { text: `Topic: ${topic}` },
      { text: 'Again.' },
      { text: question.spokenText ?? question.text, speed: data.settings.speechSpeed },
    ], data.settings, voices, () => {
      if (sessionToken.current === token) setNotice('')
    })
    setNotice(started ? 'The timer keeps running.' : 'Speech synthesis is unavailable.')
  }

  function stopSession() {
    stopSpeech()
    countdownDeadline.current = null
    setPhase('ready')
    setQuestion(null)
    setTopic(null)
    setQuestionVisible(false)
    setAnswerVisible(false)
    setTimeIsUp(false)
    pendingAnswerSpeech.current = false
    setRated(false)
    setNotice('')
    remainingRef.current = data.settings.defaultSeconds
    setRemainingSeconds(data.settings.defaultSeconds)
  }

  function pauseSession() {
    if (phase !== 'speaking' && phase !== 'countdown') return
    if (phase === 'countdown') {
      const next = Math.max(0, Math.ceil(((countdownDeadline.current ?? Date.now()) - Date.now()) / 1000))
      countdownDeadline.current = null
      remainingRef.current = next
      setRemainingSeconds(next)
      if (next === 0) {
        announceTimeUp()
        return
      }
    }
    pausedFrom.current = phase
    sessionPaused.current = true
    resumeSpeech.current = phase === 'speaking'
      || ('speechSynthesis' in window && window.speechSynthesis.speaking)
    if (resumeSpeech.current && 'speechSynthesis' in window) window.speechSynthesis.pause()
    setPhase('paused')
    setNotice('Session paused.')
  }

  function resumeSession() {
    if (phase !== 'paused') return
    sessionPaused.current = false
    if (resumeSpeech.current && 'speechSynthesis' in window) window.speechSynthesis.resume()
    resumeSpeech.current = false
    if (pausedFrom.current === 'speaking') {
      setPhase('speaking')
    } else {
      countdownDeadline.current = Date.now() + remainingRef.current * 1000
      setPhase('countdown')
    }
    setNotice('Session resumed.')
  }

  function skipQuestion() {
    stopSpeech()
    readQuestion()
  }

  function toggleQuestionVisibility() {
    if (!question) return
    setQuestionVisible((visible) => !visible)
    setNotice('')
  }

  function toggleAnswerVisibility() {
    if (!question) return
    if (answerVisible) {
      setAnswerVisible(false)
      pendingAnswerSpeech.current = false
    } else {
      setQuestionVisible(true)
      setAnswerVisible(true)
      if (phase === 'speaking') {
        pendingAnswerSpeech.current = true
      } else {
        speakAnswer(question)
      }
    }
    setNotice('')
  }

  function speakAnswer(targetQuestion: Question) {
    speakLines([{
      text: targetQuestion.answer ? `The answer is. ${targetQuestion.answer}` : 'No answer was included for this question.',
      speed: 'normal',
    }], data.settings, voices, () => {})
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

  function previewQuestion(text: string, questionTopic: Topic): boolean {
    const token = ++sessionToken.current
    return speakLines([
      { text: `Topic: ${questionTopic}` },
      { text, speed: data.settings.speechSpeed },
    ], data.settings, voices, () => {
      if (sessionToken.current === token) setNotice('')
    })
  }

  function restoreBackup(backup: StudyData) {
    stopSpeech()
    countdownDeadline.current = null
    setData(backup)
    setPhase('ready')
    setQuestion(null)
    setTopic(null)
    setQuestionVisible(false)
    setAnswerVisible(false)
    setTimeIsUp(false)
    setRated(false)
    remainingRef.current = backup.settings.defaultSeconds
    setRemainingSeconds(backup.settings.defaultSeconds)
    setNotice('Backup restored.')
  }

  function navigate(nextView: View) {
    if (nextView !== 'study' && ['speaking', 'countdown', 'paused'].includes(phase)) stopSession()
    setView(nextView)
  }

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target
    if (target instanceof HTMLElement && target.closest('input, textarea, select, button, [contenteditable="true"]')) return
    if (event.altKey || event.ctrlKey || event.metaKey) return

    if (event.code === 'Space') {
      if (view === 'study' && ['ready', 'time-up', 'revealed', 'rated'].includes(phase)) {
        event.preventDefault()
        readQuestion()
      }
    } else if (event.key.toLowerCase() === 'r' && view === 'study' && phase === 'countdown') {
      event.preventDefault()
      repeatQuestion()
    } else if (event.key.toLowerCase() === 'q' && view === 'study' && ['speaking', 'countdown', 'paused', 'time-up'].includes(phase)) {
      event.preventDefault()
      toggleQuestionVisibility()
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
    answerVisible,
    timeIsUp,
    rated,
    notice,
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate('study') }}>Lets StudEE!</a>
        <nav className="main-nav" aria-label="Main navigation">
          {(['study', 'competitions', 'favorites', 'manage', 'settings'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-current={view === item ? 'page' : undefined}
              onClick={() => navigate(item)}
            >
              {item === 'study' ? 'Study' : item === 'competitions' ? 'Mock Competition' : item === 'favorites' ? 'Favorites' : item === 'manage' ? 'Manage questions' : 'Settings'}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {view === 'study' && (
          <StudyScreen
            data={data}
            activeGroup={activeTopicGroup}
            onGroupChange={setActiveTopicGroup}
            {...activeQuestionProps}
            onChangeData={updateData}
            onRead={readQuestion}
            onRepeat={repeatQuestion}
            onStop={stopSession}
            onPause={pauseSession}
            onResume={resumeSession}
            onSkip={skipQuestion}
            onToggleQuestion={toggleQuestionVisibility}
            onToggleAnswer={toggleAnswerVisibility}
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
          <SettingsScreen data={data} voices={voices} theme={theme} onChangeTheme={setTheme} onChangeSettings={updateSettings} />
        )}
        {view === 'competitions' && <Suspense fallback={<p className="session-notice">Loading Mock Competition…</p>}><MockCompetitionScreen voices={voices} /></Suspense>}
        {view === 'favorites' && <Suspense fallback={<p className="session-notice">Loading favorites…</p>}><FavoriteQuestionsScreen /></Suspense>}
      </main>

      <footer className="app-footer">
        <span>{view === 'competitions' || view === 'favorites' ? 'Competitions, favorites, and settings save automatically in this browser.' : 'Export a backup to keep a copy of your progress.'}</span>
        <span>Space read / next · R repeat · Q show question</span>
      </footer>
    </div>
  )
}

export default StudyApp
