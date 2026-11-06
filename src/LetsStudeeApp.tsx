import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState } from 'react'
import './layout.css'
import { playTimerTick, shouldTick } from './timerTicks'
import { useAutoHideHeader } from './useAutoHideHeader'
import ManageScreen from './ManageScreen'
import { saveManageTopic } from './studyStorage'
import SettingsScreen from './SettingsScreen'
import StudyScreen from './StudyScreen'
import MockCompetitionErrorBoundary from './MockCompetitionErrorBoundary'
import { drawQuestion, spokenDuration } from './questionLogic'
import { loadStudyData, saveStudyData } from './studyStorage'
import { competitionNameKey, loadCompetitionStorage, saveCompetitionStorage } from './competitionData'
import GlobalSearch, { SearchButton } from './GlobalSearch'
import CompetitionRoundViewer, { type CompetitionViewerRequest } from './CompetitionRoundViewer'
import type { SearchTarget } from './searchIndex'
import {
  daysUntilTarget,
  EE_TARGET_DATE,
  ESAS_TARGET_DATE,
  loadCompetitionDailyProgress,
  localDateKey,
  MATH_TARGET_DATE,
  recordDailyCorrectAnswer,
  type CompetitionDailyProgress,
} from './competitionProgress'
import { speechRate } from './speechRate'
import { mathToSpeech } from './mathSpeech'
import { loadThemePreference, saveThemePreference, type ThemePreference } from './themePreference'
import { PREFERRED_VOICE_NAME, TOPIC_GROUPS, type Question, type SpeechSpeed, type StudyData, type StudySettings, type Topic, type TopicGroupName } from './studyTypes'

type View = 'study' | 'manage' | 'settings' | 'competitions' | 'favorites'
type SessionPhase = 'ready' | 'speaking' | 'countdown' | 'paused' | 'time-up' | 'revealed' | 'rated'
type Rating = 'gotIt' | 'missedIt'
type SavedStudySession = {
  topic: Topic
  questionId: string
  phase: SessionPhase
  remainingSeconds: number
  questionVisible: boolean
  answerVisible: boolean
  timeIsUp: boolean
  rated: boolean
  topicGroup: TopicGroupName
}
interface SpeechLine {
  text: string
  speed?: SpeechSpeed
}

let speechRun = 0
const ACTIVE_VIEW_STORAGE_KEY = 'lets-studee-active-view-v1'
const STUDY_SESSION_STORAGE_KEY = 'lets-studee-active-study-session-v1'
const STUDY_GROUP_STORAGE_KEY = 'lets-studee-active-study-group-v1'
const TARGET_COMPETITION_STORAGE_KEY = 'lets-studee-target-competition-v1'
const MY_QUESTIONS_SECTION_STORAGE_KEY = 'lets-studee-my-questions-section-v1'

function revealSearchTarget(focusId: string) {
  let attempts = 0
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const find = () => {
    const element = document.querySelector<HTMLElement>(`[data-search-id="${CSS.escape(focusId)}"]`)
    if (element && element.offsetParent !== null) {
      element.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
      element.classList.remove('search-hit')
      void element.offsetWidth
      element.classList.add('search-hit')
      window.setTimeout(() => element.classList.remove('search-hit'), 2600)
      return
    }
    attempts += 1
    if (attempts < 120) window.requestAnimationFrame(find)
  }
  window.requestAnimationFrame(find)
}
type TargetCompetition = 'Math' | 'EE' | 'ESAS'
const MockCompetitionScreen = lazy(() => import('./MockCompetitionScreen'))
const FavoriteQuestionsScreen = lazy(() => import('./FavoriteQuestionsScreen'))

function loadTargetCompetition(): TargetCompetition {
  try {
    const saved = window.localStorage.getItem(TARGET_COMPETITION_STORAGE_KEY)
    return saved === 'EE' || saved === 'ESAS' ? saved : 'Math'
  } catch (error) {
    console.error('Could not restore the selected competition countdown.', error)
    return 'Math'
  }
}

function loadActiveView(): View {
  if (new URLSearchParams(window.location.search).get('__app_update')?.startsWith('settings-')) return 'settings'
  try {
    const savedView = window.localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY)
    if (savedView === 'study' || savedView === 'manage' || savedView === 'settings'
      || savedView === 'competitions' || savedView === 'favorites') return savedView
  } catch (error) {
    console.error('Could not read the saved app screen.', error)
    return 'study'
  }
  return 'study'
}

function loadActiveStudyGroup(): TopicGroupName {
  try {
    const savedGroup = window.localStorage.getItem(STUDY_GROUP_STORAGE_KEY)
    return TOPIC_GROUPS.find((group) => group.name === savedGroup)?.name ?? 'Math'
  } catch (error) {
    console.error('Could not restore the selected Study group.', error)
    return 'Math'
  }
}

function loadStudySession(data: StudyData): SavedStudySession | null {
  try {
    const raw = window.localStorage.getItem(STUDY_SESSION_STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<SavedStudySession>
    const phases: SessionPhase[] = ['ready', 'speaking', 'countdown', 'paused', 'time-up', 'revealed', 'rated']
    if (typeof saved.topic !== 'string' || !Object.prototype.hasOwnProperty.call(data.questionBanks, saved.topic)
      || typeof saved.questionId !== 'string' || !phases.includes(saved.phase as SessionPhase)
      || typeof saved.remainingSeconds !== 'number' || !Number.isFinite(saved.remainingSeconds)) return null
    const question = data.questionBanks[saved.topic as Topic]?.find((item) => item.id === saved.questionId)
    if (!question) return null
    const topicGroup = TOPIC_GROUPS.find((group) => group.name === saved.topicGroup)?.name
      ?? TOPIC_GROUPS.find((group) => group.topics.some((item) => item === saved.topic))?.name
      ?? 'Math'
    return {
      topic: saved.topic as Topic,
      questionId: question.id,
      phase: saved.phase as SessionPhase,
      remainingSeconds: Math.max(0, Math.floor(saved.remainingSeconds)),
      questionVisible: saved.questionVisible === true,
      answerVisible: saved.answerVisible === true,
      timeIsUp: saved.timeIsUp === true,
      rated: saved.rated === true,
      topicGroup,
    }
  } catch (error) {
    console.error('Could not restore the saved Study question.', error)
    return null
  }
}

function speakLines(
  lines: SpeechLine[],
  settings: StudySettings,
  voices: SpeechSynthesisVoice[],
  onComplete: () => void,
  onError: (message: string) => void,
  isPaused: () => boolean = () => false,
): boolean {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false

  const availableVoices = window.speechSynthesis.getVoices()
  const voiceList = availableVoices.length ? availableVoices : voices
  const selectedVoice = voiceList.find((voice) => voice.voiceURI === settings.voiceURI)
    ?? voiceList.find((voice) => voice.name.includes(PREFERRED_VOICE_NAME))
    ?? voiceList.find((voice) => /^en([_-]|$)/i.test(voice.lang))
  const run = ++speechRun
  let index = 0
  let nextScheduled = false
  let completed = false
  let attempt = 0
  let attemptId = 0
  let watchdogId = 0
  let startedAt = 0
  let queuedAt = 0
  let lastProgressAt = 0
  let idleSince = 0
  let expectedDuration = 0
  let utteranceText = ''
  let currentSpeed: SpeechSpeed = 'fast'
  const finish = () => {
    if (completed) return
    completed = true
    window.clearTimeout(watchdogId)
    onComplete()
  }
  const runWhenUnpaused = (action: () => void) => {
    if (run !== speechRun) return
    if (isPaused()) {
      watchdogId = window.setTimeout(() => runWhenUnpaused(action), 250)
      return
    }
    action()
  }
  const fail = () => {
    if (completed || run !== speechRun) return
    if (isPaused()) {
      watchdogId = window.setTimeout(fail, 250)
      return
    }
    completed = true
    window.clearTimeout(watchdogId)
    onError('Speech playback was interrupted after retrying. Check the selected voice and try again.')
  }
  const retryCurrent = () => {
    if (run !== speechRun || completed) return
    if (isPaused()) {
      watchdogId = window.setTimeout(retryCurrent, 250)
      return
    }
    if (attempt >= 2) {
      fail()
      return
    }
    attempt += 1
    attemptId += 1
    const retryId = attemptId
    window.clearTimeout(watchdogId)
    window.speechSynthesis.cancel()
    window.setTimeout(() => {
      if (run === speechRun && retryId === attemptId && !completed) {
        runWhenUnpaused(() => speakCurrent(currentSpeed))
      }
    }, 250)
  }
  const scheduleNext = () => {
    if (run !== speechRun || nextScheduled) return
    window.clearTimeout(watchdogId)
    nextScheduled = true
    window.setTimeout(() => {
      runWhenUnpaused(() => {
        nextScheduled = false
        attempt = 0
        speakNext()
      })
    }, 150)
  }
  const recoverPlayback = () => {
    if (run !== speechRun || completed) return
    if (isPaused()) {
      watchdogId = window.setTimeout(recoverPlayback, 250)
      return
    }
    if (window.speechSynthesis.paused) {
      watchdogId = window.setTimeout(recoverPlayback, 1500)
      return
    }
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      idleSince = 0
      if (Date.now() - Math.max(queuedAt, lastProgressAt) > Math.max(expectedDuration + 20000, 30000)) {
        retryCurrent()
        return
      }
      watchdogId = window.setTimeout(recoverPlayback, 1500)
      return
    }

    if (!idleSince) {
      idleSince = Date.now()
      watchdogId = window.setTimeout(recoverPlayback, 1500)
      return
    }
    if (Date.now() - idleSince < 2500) {
      watchdogId = window.setTimeout(recoverPlayback, 500)
      return
    }
    retryCurrent()
  }
  const speakNext = () => {
    if (run !== speechRun || nextScheduled) return
    if (isPaused()) {
      runWhenUnpaused(speakNext)
      return
    }
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
    if (isPaused()) {
      runWhenUnpaused(() => speakCurrent(speed))
      return
    }
    const currentAttemptId = ++attemptId
    startedAt = 0
    queuedAt = Date.now()
    lastProgressAt = queuedAt
    idleSince = 0
    const selectedSpeed = speed ?? currentSpeed
    expectedDuration = Math.max(2500, (utteranceText.trim().split(/\s+/).length * 60000) / (160 * speechRate(selectedSpeed)) + 2500)
    const utterance = new SpeechSynthesisUtterance(utteranceText)
    utterance.rate = speechRate(selectedSpeed)
    if (selectedVoice) utterance.voice = selectedVoice
    const isCurrentAttempt = () => run === speechRun && currentAttemptId === attemptId
    utterance.onstart = () => {
      if (!isCurrentAttempt()) return
      startedAt = Date.now()
      lastProgressAt = startedAt
      watchdogId = window.setTimeout(recoverPlayback, 1500)
    }
    utterance.onboundary = () => {
      if (!isCurrentAttempt()) return
      lastProgressAt = Date.now()
    }
    utterance.onend = () => {
      if (isCurrentAttempt()) scheduleNext()
    }
    utterance.onerror = () => {
      if (!isCurrentAttempt()) return
      retryCurrent()
    }
    watchdogId = window.setTimeout(recoverPlayback, 5000)
    try {
      window.speechSynthesis.speak(utterance)
    } catch {
      retryCurrent()
    }
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
  const [, setCompetitionSubject] = useState(() => loadCompetitionStorage().activeSubject)
  const [today, setToday] = useState(localDateKey)
  const [dailyProgress, setDailyProgress] = useState<CompetitionDailyProgress>(loadCompetitionDailyProgress)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const headerRef = useAutoHideHeader()
  const [targetCompetition, setTargetCompetition] = useState<TargetCompetition>(loadTargetCompetition)
  const [restoredSession] = useState(() => loadStudySession(data))
  const [view, setView] = useState<View>(loadActiveView)
  const [searchOpen, setSearchOpen] = useState(false)
  const [screenKeys, setScreenKeys] = useState({ manage: 0, competitions: 0, favorites: 0 })
  const [lectureRequest, setLectureRequest] = useState<{ topic: Topic; nonce: number } | null>(null)
  const [viewerRequest, setViewerRequest] = useState<CompetitionViewerRequest | null>(null)
  const [activeTopicGroup, setActiveTopicGroup] = useState<TopicGroupName>(
    () => restoredSession?.topicGroup ?? loadActiveStudyGroup(),
  )
  const restoredQuestion = restoredSession
    ? data.questionBanks[restoredSession.topic]?.find((item) => item.id === restoredSession.questionId) ?? null
    : null
  const restoredAsPaused = restoredSession !== null
    && (restoredSession.phase === 'speaking' || restoredSession.phase === 'countdown' || restoredSession.phase === 'paused')
  const [phase, setPhase] = useState<SessionPhase>(() => restoredAsPaused ? 'paused' : restoredSession?.phase ?? 'ready')
  const [question, setQuestion] = useState<Question | null>(restoredQuestion)
  const [topic, setTopic] = useState<Topic | null>(restoredQuestion ? restoredSession?.topic ?? null : null)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(restoredSession?.remainingSeconds ?? data.settings.defaultSeconds)
  const [questionVisible, setQuestionVisible] = useState(restoredSession?.questionVisible === true || restoredAsPaused)
  const [answerVisible, setAnswerVisible] = useState(restoredSession?.answerVisible ?? false)
  const [timeIsUp, setTimeIsUp] = useState(restoredSession?.timeIsUp ?? false)
  const [rated, setRated] = useState(restoredSession?.rated ?? false)
  const [notice, setNotice] = useState(() => restoredAsPaused ? 'Your previous question was restored. Resume when you’re ready.' : '')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const remainingRef = useRef<number>(remainingSeconds)
  const countdownDeadline = useRef<number | null>(null)
  const sessionToken = useRef(0)
  const audioContext = useRef<AudioContext | null>(null)
  const pausedFrom = useRef<'speaking' | 'countdown'>('countdown')
  const sessionPaused = useRef(restoredAsPaused)
  const resumeSpeech = useRef(false)

  useEffect(() => {
    saveStudyData(data)
  }, [data])

  useEffect(() => {
    try {
      window.localStorage.setItem(TARGET_COMPETITION_STORAGE_KEY, targetCompetition)
    } catch (error) {
      console.error('Could not save the selected competition countdown.', error)
    }
  }, [targetCompetition])

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, view)
    } catch (error) {
      console.error('Could not save the current app screen.', error)
    }
  }, [view])

  useEffect(() => {
    try {
      window.localStorage.setItem(STUDY_GROUP_STORAGE_KEY, activeTopicGroup)
    } catch (error) {
      console.error('Could not save the selected Study group.', error)
    }
  }, [activeTopicGroup])

  useEffect(() => {
    try {
      window.localStorage.setItem(STUDY_SESSION_STORAGE_KEY, JSON.stringify({
        topic,
        questionId: question?.id ?? null,
        phase,
        remainingSeconds,
        questionVisible,
        answerVisible,
        timeIsUp,
        rated,
        topicGroup: activeTopicGroup,
      }))
    } catch (error) {
      console.error('Could not save the current Study question.', error)
    }
  }, [activeTopicGroup, answerVisible, phase, question, questionVisible, rated, remainingSeconds, timeIsUp, topic])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111214' : '#f7f8f5')
    saveThemePreference(theme)
  }, [theme])

  useEffect(() => {
    document.title = 'Lets StudEE!'
  }, [])

  useEffect(() => {
    const updateToday = () => setToday(localDateKey())
    const interval = window.setInterval(updateToday, 60_000)
    window.addEventListener('focus', updateToday)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', updateToday)
    }
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

  function stopSpeech() {
    sessionToken.current += 1
    speechRun += 1
    sessionPaused.current = false
    resumeSpeech.current = false
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  function announceTimeUp() {
    const targetQuestion = question
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
    speakLines(answerSpeech, data.settings, voices, () => {}, (message) => {
      if (question?.id === targetQuestion?.id) setNotice(message)
    })
  }

  const tickTimer = useEffectEvent(() => {
    if (phase !== 'countdown' || countdownDeadline.current === null) return
    const next = Math.max(0, Math.ceil((countdownDeadline.current - Date.now()) / 1000))
    if (next === remainingRef.current) return
    remainingRef.current = next
    setRemainingSeconds(next)
    if (audioContext.current && shouldTick(next, question?.seconds ?? next)) playTimerTick(audioContext.current, next, 0.16)
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
    const started = speakLines(speech, data.settings, voices, beginCountdown, (message) => {
      if (sessionToken.current !== token) return
      setNotice(message)
      beginCountdown()
    }, () => sessionPaused.current)

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
    }, (message) => {
      if (sessionToken.current === token) setNotice(message)
    }, () => sessionPaused.current)
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
    setNotice('')
    if (answerVisible) {
      setAnswerVisible(false)
    } else {
      const interruptedSpeech = phase === 'speaking'
        || (phase === 'paused' && pausedFrom.current === 'speaking')
      if (phase === 'countdown') {
        setRemainingSeconds(remainingRef.current)
      }
      countdownDeadline.current = null
      setQuestionVisible(true)
      setAnswerVisible(true)
      setPhase('revealed')
      if (interruptedSpeech) stopSpeech()
      if (!speakAnswer(question)) setNotice('Speech synthesis is unavailable. The answer is shown.')
    }
  }

  function speakAnswer(
    targetQuestion: Question,
    onComplete: () => void = () => {},
    onError?: (message: string) => void,
  ): boolean {
    return speakLines([{
      text: targetQuestion.answer
        ? `The answer is. ${targetQuestion.spokenAnswer ?? targetQuestion.answer}`
        : 'No answer was included for this question.',
      speed: 'normal',
    }], data.settings, voices, onComplete, (message) => {
      if (onError) {
        onError(message)
      } else if (question?.id === targetQuestion.id) {
        setNotice(message)
      }
    })
  }

  function rateQuestion(rating: Rating) {
    if (!topic || !question || rated) return
    stopSpeech()
    countdownDeadline.current = null
    if (rating === 'gotIt') recordStudyCorrect()
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

  function deleteStudyQuestionFromRandomizedCompetition(topic: Topic, questionId: string, randomizedQuestionId: string): { deleted: boolean; message?: string } {
    if (!data.questionBanks[topic].some((question) => question.id === questionId)) {
      return { deleted: false, message: 'This Study question could not be found; nothing was deleted.' }
    }
    const updatedData: StudyData = {
      ...data,
      questionBanks: {
        ...data.questionBanks,
        [topic]: data.questionBanks[topic].filter((question) => question.id !== questionId),
      },
      usedQuestionIds: {
        ...data.usedQuestionIds,
        [topic]: data.usedQuestionIds[topic].filter((id) => id !== questionId),
      },
    }
    if (!saveStudyData(updatedData)) {
      return { deleted: false, message: 'Browser storage could not save the Study bank change; the question was not deleted.' }
    }

    const favoriteId = `study:${encodeURIComponent(topic)}:${encodeURIComponent(questionId)}`
    const competitionStorage = loadCompetitionStorage()
    const favorites = competitionStorage.favorites.filter((favorite) => favorite.id !== favoriteId
      && !(favorite.sourceVersionId === 'unassigned' && favorite.questionId === randomizedQuestionId))
    if (favorites.length !== competitionStorage.favorites.length
      && !saveCompetitionStorage({ ...competitionStorage, favorites })) {
      if (!saveStudyData(data)) {
        setData(updatedData)
        return { deleted: true, message: 'The question was removed from its Study bank, but its saved favorite could not be removed because browser storage failed.' }
      }
      return { deleted: false, message: 'Browser storage could not update Favorites, so the Study question was not deleted.' }
    }
    setData(updatedData)
    return { deleted: true }
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
    }, (message) => {
      if (sessionToken.current === token) setNotice(message)
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

  function changeActiveTopicGroup(group: TopicGroupName) {
    setActiveTopicGroup(group)
    try {
      window.localStorage.setItem(STUDY_GROUP_STORAGE_KEY, group)
    } catch (error) {
      console.error('Could not save the selected Study group.', error)
    }
  }

  function navigate(nextView: View) {
    if (nextView !== 'study' && ['speaking', 'countdown', 'paused'].includes(phase)) stopSession()
    setView(nextView)
  }

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((current) => !current)
        return
      }
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  function openSearchResult(target: SearchTarget) {
    if (target.manageTopic) saveManageTopic(target.manageTopic)
    if (target.favoritesSection) {
      try {
        window.localStorage.setItem(MY_QUESTIONS_SECTION_STORAGE_KEY, target.favoritesSection)
      } catch (error) {
        console.error('Could not open the My Questions section.', error)
      }
    }
    let competitionSubjectChanged = false
    if (target.competitionSubject) {
      const competitionStorage = loadCompetitionStorage()
      if (competitionNameKey(competitionStorage.activeSubject) !== competitionNameKey(target.competitionSubject)) {
        competitionSubjectChanged = saveCompetitionStorage({ ...competitionStorage, activeSubject: target.competitionSubject })
      }
    }
    if (target.lectureTopic) setLectureRequest({ topic: target.lectureTopic, nonce: Date.now() })
    if (view === target.view && (target.view === 'manage' || target.view === 'favorites' || (target.view === 'competitions' && competitionSubjectChanged))) {
      const remountView = target.view
      setScreenKeys((current) => ({ ...current, [remountView]: current[remountView] + 1 }))
    }
    navigate(target.view)
    if (target.competitionQuestion) setViewerRequest({ ...target.competitionQuestion, nonce: Date.now() })
    if (target.focusId) revealSearchTarget(target.focusId)
    else window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const updateBackToTopVisibility = () => setShowBackToTop(window.scrollY > 420)
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true })
    updateBackToTopVisibility()
    return () => window.removeEventListener('scroll', updateBackToTopVisibility)
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

  const targetDate = targetCompetition === 'Math'
    ? MATH_TARGET_DATE
    : targetCompetition === 'EE'
      ? EE_TARGET_DATE
      : ESAS_TARGET_DATE
  const targetDaysLeft = daysUntilTarget(targetDate, today)
  const recordStudyCorrect = () => {
    recordDailyCorrectAnswer(today)
    setDailyProgress(loadCompetitionDailyProgress())
  }

  return (
    <div className="app-shell">
      <header ref={headerRef} className="app-header">
        <div className="header-brand-row">
          <a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate('study') }}>
            <img className="wordmark-icon" src="/studee-icon.svg" alt="" />
            <span>Let's Stud<strong>EE</strong>!</span>
          </a>
          <label className="math-target-countdown">
            <strong>{targetDaysLeft}</strong>
            <span>{targetDaysLeft === 1 ? 'DAY LEFT' : 'DAYS LEFT'}</span>
            <select
              aria-label="Choose competition countdown"
              value={targetCompetition}
              onChange={(event) => {
                const value = event.currentTarget.value
                setTargetCompetition(value === 'EE' || value === 'ESAS' ? value : 'Math')
              }}
            >
              <option value="Math">Math · Nov 25</option>
              <option value="EE">EE · Nov 25</option>
              <option value="ESAS">ESAS · Nov 24</option>
            </select>
          </label>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          {(['study', 'competitions', 'favorites', 'manage', 'settings'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-label={item === 'competitions' ? 'Mock Competition' : item === 'manage' ? 'Manage questions' : item === 'favorites' ? 'My Questions' : item === 'study' ? 'Study' : 'Settings'}
              aria-current={view === item ? 'page' : undefined}
              onClick={() => navigate(item)}
            >
              <span className="nav-label-desktop">{item === 'competitions' ? 'Mock Competition' : item === 'study' ? 'Study' : item === 'favorites' ? 'My Questions' : item === 'manage' ? 'Manage questions' : 'Settings'}</span>
              <span className="nav-label-mobile">{item === 'competitions' ? 'Compete' : item === 'manage' ? 'Manage' : item === 'favorites' ? 'Saved' : item === 'study' ? 'Study' : 'Settings'}</span>
            </button>
          ))}
          <SearchButton onOpen={() => setSearchOpen(true)} />
        </nav>
      </header>

      <main className="app-main">
        <div hidden={view !== 'study'}>
          <StudyScreen
            data={data}
            dailyProgress={dailyProgress}
            activeGroup={activeTopicGroup}
            onGroupChange={changeActiveTopicGroup}
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
            onDailyCorrectAnswer={recordStudyCorrect}
            visible={view === 'study'}
            lectureRequest={lectureRequest}
            onManageTopic={(manageTopic) => {
              saveManageTopic(manageTopic)
              navigate('manage')
              window.scrollTo({ top: 0 })
            }}
          />
        </div>
        {view === 'manage' && (
          <ManageScreen
            key={screenKeys.manage}
            data={data}
            onChangeData={updateData}
            onPreview={previewQuestion}
            onRestore={restoreBackup}
          />
        )}
        {view === 'settings' && (
          <SettingsScreen data={data} voices={voices} theme={theme} onChangeTheme={setTheme} onChangeSettings={updateSettings} />
        )}
        {view === 'competitions' && <MockCompetitionErrorBoundary><Suspense fallback={<p className="session-notice">Loading Mock Competition…</p>}><MockCompetitionScreen key={screenKeys.competitions} onViewVersion={(versionId) => setViewerRequest({ versionId, nonce: Date.now() })} voices={voices} studyData={data} onDeleteStudyQuestion={deleteStudyQuestionFromRandomizedCompetition} onSubjectChange={setCompetitionSubject} onDailyProgressChange={setDailyProgress} /></Suspense></MockCompetitionErrorBoundary>}
        {view === 'favorites' && <Suspense fallback={<p className="session-notice">Loading saved questions…</p>}><FavoriteQuestionsScreen key={screenKeys.favorites} data={data} onChangeData={updateData} /></Suspense>}
      </main>

      <footer className="app-footer">
        <span>{view === 'competitions' || view === 'favorites' ? 'Competitions, favorites, and settings save automatically in this browser.' : 'Export a backup to keep a copy of your progress.'}</span>
      </footer>
      <CompetitionRoundViewer request={viewerRequest} onClose={() => setViewerRequest(null)} />
      <GlobalSearch open={searchOpen} data={data} onClose={() => setSearchOpen(false)} onSelect={openSearchResult} />
      {showBackToTop && <button className="back-to-top" type="button" aria-label="Back to top" title="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg>
      </button>}
    </div>
  )
}

export default StudyApp
