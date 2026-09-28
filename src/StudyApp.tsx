import { useEffect, useEffectEvent, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import './study.css'
import { loadQuestionBank, parseQuestionBank, pickRandomQuestion, saveQuestionBank } from './questionBank'
import { SUBJECTS, TIMER_OPTIONS, type PracticeQuestion, type Subject } from './types'

type SessionPhase = 'ready' | 'reading' | 'thinking' | 'revealed'

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function speak(text: string, onEnd: () => void): boolean {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.92
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    onEnd()
  }
  utterance.onend = finish
  utterance.onerror = finish
  window.speechSynthesis.speak(utterance)
  return true
}

function StudyApp() {
  const [questionBank, setQuestionBank] = useState<PracticeQuestion[]>(loadQuestionBank)
  const [selectedSubjects, setSelectedSubjects] = useState<Set<Subject>>(() => new Set(SUBJECTS))
  const [selectedDuration, setSelectedDuration] = useState(60)
  const [remainingSeconds, setRemainingSeconds] = useState(60)
  const [phase, setPhase] = useState<SessionPhase>('ready')
  const [currentQuestion, setCurrentQuestion] = useState<PracticeQuestion | null>(null)
  const [bankStatus, setBankStatus] = useState(() => {
    const savedCount = loadQuestionBank().length
    return savedCount ? `${savedCount} questions saved on this device.` : 'No question bank loaded.'
  })
  const [sessionStatus, setSessionStatus] = useState('Choose sections and load a question bank to begin.')
  const [errorMessage, setErrorMessage] = useState('')
  const previousQuestion = useRef<PracticeQuestion | null>(null)
  const sessionToken = useRef(0)
  const secondsLeft = useRef(60)

  const eligibleQuestions = questionBank.filter((question) => selectedSubjects.has(question.subject))
  const isSessionActive = phase === 'reading' || phase === 'thinking'
  const progress = selectedDuration > 0 ? 1 - remainingSeconds / selectedDuration : 0
  const timerStyle = { '--progress': `${progress * 360}deg` } as CSSProperties

  function revealAnswer(timeIsUp = false) {
    if (!currentQuestion) return

    sessionToken.current += 1
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setPhase('revealed')
    setRemainingSeconds(timeIsUp ? 0 : secondsLeft.current)
    setSessionStatus(timeIsUp ? 'Time is up. Check your answer.' : 'Answer revealed.')
    if (timeIsUp) speak('Time is up.', () => {})
  }

  const tickTimer = useEffectEvent(() => {
    if (secondsLeft.current <= 0) return
    secondsLeft.current -= 1
    setRemainingSeconds(secondsLeft.current)
    if (secondsLeft.current === 0) revealAnswer(true)
  })

  useEffect(() => {
    if (phase !== 'thinking') return

    const timerId = window.setInterval(tickTimer, 1000)
    return () => window.clearInterval(timerId)
  }, [phase])

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    try {
      const imported = parseQuestionBank(JSON.parse(await file.text()) as unknown)
      setQuestionBank(imported)
      const saved = saveQuestionBank(imported)
      setBankStatus(`${imported.length} questions loaded${saved ? ' and saved on this device' : '; unable to save them for later in this browser'}.`)
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(error instanceof SyntaxError
        ? 'That file is not valid JSON.'
        : error instanceof Error ? error.message : 'Could not load that question bank.')
    } finally {
      input.value = ''
    }
  }

  function toggleSubject(subject: Subject) {
    setSelectedSubjects((current) => {
      const updated = new Set(current)
      if (updated.has(subject)) updated.delete(subject)
      else updated.add(subject)
      return updated
    })
  }

  function startSession() {
    const nextQuestion = pickRandomQuestion(questionBank, selectedSubjects, previousQuestion.current)
    if (!nextQuestion) return

    const token = ++sessionToken.current
    previousQuestion.current = nextQuestion
    secondsLeft.current = selectedDuration
    setCurrentQuestion(nextQuestion)
    setRemainingSeconds(selectedDuration)
    setPhase('reading')
    setSessionStatus('Listen closely. The question stays hidden.')

    const startedSpeaking = speak(nextQuestion.question, () => {
      if (sessionToken.current === token) setPhase('thinking')
    })

    if (!startedSpeaking) {
      setSessionStatus('Speech is unavailable in this browser. The timer has started.')
      setPhase('thinking')
    }
  }

  function repeatQuestion() {
    if (!currentQuestion || !isSessionActive) return
    const token = sessionToken.current
    const startedSpeaking = speak(currentQuestion.question, () => {
      if (sessionToken.current === token) setSessionStatus('Question repeated. Keep thinking.')
    })
    if (!startedSpeaking) setSessionStatus('Speech is unavailable in this browser.')
    else setSessionStatus('Listen closely. The timer keeps running.')
  }

  const subjectCounts = new Map<Subject, number>(SUBJECTS.map((subject) => [
    subject,
    questionBank.filter((question) => question.subject === subject).length,
  ]))

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Lets StudEE! home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Lets StudEE!</span>
        </a>
        <span className="privacy-note">Saved on this device</span>
      </header>

      <main>
        <div className="page-heading">
          <p className="eyebrow">Regional Math Wizard + EE Quiz Show</p>
          <h1>Listen. Think. Recall.</h1>
        </div>

        <div className="workspace">
          <section className="setup-panel" aria-labelledby="bank-heading">
            <div className="section-heading">
              <span className="step-number">01</span>
              <h2 id="bank-heading">Question bank</h2>
            </div>

            <label className="upload-label" htmlFor="question-file">Upload questions and answers</label>
            <div className="upload-row">
              <input
                id="question-file"
                type="file"
                accept=".json,application/json"
                disabled={isSessionActive}
                onChange={handleUpload}
              />
              <a className="template-link" href="/questions-template.json" download>Download template</a>
            </div>
            <p className="bank-status" role="status">{bankStatus}</p>
            {errorMessage && <p className="error-message" role="alert">{errorMessage}</p>}

            <fieldset className="subject-fieldset" disabled={isSessionActive}>
              <legend className="subject-legend"><span className="step-number">02</span>Choose sections</legend>
              <div className="subject-tools">
                <span>Random question from</span>
                <div>
                  <button type="button" onClick={() => setSelectedSubjects(new Set(SUBJECTS))}>All</button>
                  <button type="button" onClick={() => setSelectedSubjects(new Set<Subject>())}>None</button>
                </div>
              </div>
              <div className="subject-list">
                {SUBJECTS.map((subject) => (
                  <label className="subject-option" key={subject}>
                    <input
                      type="checkbox"
                      checked={selectedSubjects.has(subject)}
                      onChange={() => toggleSubject(subject)}
                    />
                    <span>{subject}</span>
                    <span className="subject-count">{subjectCounts.get(subject)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="pool-status" aria-live="polite">
              {eligibleQuestions.length} question{eligibleQuestions.length === 1 ? '' : 's'} in the selected pool
            </p>

            <div className="duration-section">
              <div className="section-heading">
                <span className="step-number">03</span>
                <h2>Thinking time</h2>
              </div>
              <div className="duration-options" role="group" aria-label="Choose thinking time">
                {TIMER_OPTIONS.map((option) => (
                  <button
                    className="duration-option"
                    type="button"
                    aria-pressed={selectedDuration === option.seconds}
                    disabled={isSessionActive}
                    key={option.seconds}
                    onClick={() => {
                      secondsLeft.current = option.seconds
                      setSelectedDuration(option.seconds)
                      setRemainingSeconds(option.seconds)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="start-button"
              type="button"
              disabled={!eligibleQuestions.length || isSessionActive}
              onClick={startSession}
            >
              Hear random question
            </button>
          </section>

          <section className={`session-panel${phase === 'revealed' && remainingSeconds === 0 ? ' is-done' : ''}`} aria-labelledby="session-heading">
            <div className="session-content">
              <p className="session-kicker" id="session-heading">
                {phase === 'ready' ? 'READY' : phase === 'reading' ? `${currentQuestion?.subject} · LISTEN` : phase === 'thinking' ? 'THINK IT THROUGH' : remainingSeconds === 0 ? 'TIME IS UP' : 'ANSWER'}
              </p>
              <div className="timer-face" style={timerStyle} role="timer" aria-label={`${formatTime(remainingSeconds)} remaining`}>
                <div className="timer-core">
                  <span className="time-display">{formatTime(remainingSeconds)}</span>
                  <span className="timer-caption">{phase === 'reading' ? 'question playing' : phase === 'revealed' ? 'answer ready' : 'thinking time'}</span>
                </div>
              </div>
              <p className="session-status" aria-live="polite">{sessionStatus}</p>

              {phase === 'revealed' && currentQuestion && (
                <div className="answer-reveal">
                  <p className="answer-label">Answer</p>
                  <p className="answer-text">{currentQuestion.answer}</p>
                </div>
              )}

              <div className="session-actions">
                <button className="secondary-button" type="button" disabled={!isSessionActive} onClick={repeatQuestion}>
                  Repeat question
                </button>
                <button className="secondary-button" type="button" disabled={!isSessionActive} onClick={() => revealAnswer()}>
                  Reveal answer
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="page-footer">
        <span>Your question bank stays in this browser.</span>
        <span>Lets StudEE!</span>
      </footer>
    </div>
  )
}

export default StudyApp
