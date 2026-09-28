import type { CSSProperties } from 'react'
import { accuracy, applyPreset, questionCounts, topicChances } from './questionLogic'
import { TOPICS, type Preset, type Question, type StudyData, type Topic } from './studyTypes'

type SessionPhase = 'ready' | 'speaking' | 'countdown' | 'time-up' | 'revealed' | 'rated'
type Rating = 'gotIt' | 'missedIt'

interface StudyScreenProps {
  data: StudyData
  phase: SessionPhase
  remainingSeconds: number
  currentQuestion: Question | null
  currentTopic: Topic | null
  questionVisible: boolean
  timeIsUp: boolean
  rated: boolean
  notice: string
  onChangeData: (data: StudyData) => void
  onRead: () => void
  onRepeat: () => void
  onStop: () => void
  onSkip: () => void
  onShowQuestion: () => void
  onNext: () => void
  onRate: (rating: Rating) => void
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function StudyScreen({
  data,
  phase,
  remainingSeconds,
  currentQuestion,
  currentTopic,
  questionVisible,
  timeIsUp,
  rated,
  notice,
  onChangeData,
  onRead,
  onRepeat,
  onStop,
  onSkip,
  onShowQuestion,
  onNext,
  onRate,
}: StudyScreenProps) {
  const chances = topicChances(data)
  const counts = questionCounts(data)
  const selectedCount = TOPICS.reduce((total, topic) => {
    const preference = data.topicPreferences[topic]
    return total + (preference.active && preference.weight > 0 ? counts[topic] : 0)
  }, 0)
  const active = phase === 'speaking' || phase === 'countdown'
  const ended = phase === 'time-up' || phase === 'revealed' || phase === 'rated'
  const timeStyle = { '--time-progress': `${Math.max(0, Math.min(1, remainingSeconds / (currentQuestion?.seconds ?? data.settings.defaultSeconds))) * 100}%` } as CSSProperties

  function changePreference(topic: Topic, preference: StudyData['topicPreferences'][Topic]) {
    onChangeData({ ...data, topicPreferences: { ...data.topicPreferences, [topic]: preference } })
  }

  function choosePreset(preset: Preset) {
    onChangeData(applyPreset(data, preset))
  }

  return (
    <div className="study-layout">
      <section className="topic-panel" aria-labelledby="topics-heading">
        <div className="view-heading">
          <p className="eyebrow">Build your round</p>
          <h1 id="topics-heading">Choose topics</h1>
          <p className="topic-priority-help" id="topic-priority-help">
            Priority controls how often a topic is picked: 1x is standard, 5x is five times as likely, and 0 is off. The percentage shows its share of the active pool.
          </p>
        </div>

        <div className="topic-list">
          {TOPICS.map((topic) => {
            const preference = data.topicPreferences[topic]
            const score = accuracy(data.results[topic])
            return (
              <div className="topic-row" key={topic}>
                <label className="topic-switch">
                  <input
                    type="checkbox"
                    checked={preference.active}
                    onChange={(event) => changePreference(topic, { ...preference, active: event.currentTarget.checked })}
                  />
                  <span className="topic-name">{topic}</span>
                  <span className="topic-count">{counts[topic]}</span>
                </label>
                <div className="topic-weight">
                  <label className="visually-hidden" htmlFor={`weight-${TOPICS.indexOf(topic)}`}>{topic} priority</label>
                  <input
                    id={`weight-${TOPICS.indexOf(topic)}`}
                    aria-label={`${topic} priority`}
                    aria-describedby="topic-priority-help"
                    aria-valuetext={preference.weight === 0 ? 'Off' : `${preference.weight} times standard priority`}
                    type="range"
                    min="0"
                    max="5"
                    step="1"
                    value={preference.weight}
                    disabled={!preference.active}
                    onChange={(event) => changePreference(topic, { ...preference, weight: Number(event.currentTarget.value) })}
                  />
                  <span className="weight-value">{preference.weight === 0 ? 'Off' : `${preference.weight}x`}</span>
                  <span className="topic-chance">{Math.round(chances[topic])}%</span>
                </div>
                <div className="topic-accuracy" aria-label={score === null ? 'No results yet' : `${Math.round(score)} percent accuracy`}>
                  <span className="accuracy-track"><span style={{ width: `${score ?? 0}%` }} /></span>
                  <span>{score === null ? 'New' : `${Math.round(score)}%`}</span>
                </div>
              </div>
            )
          })}
        </div>

        <details className="study-options">
          <summary>Weights and time filter</summary>
          <div className="preset-list" aria-label="Topic presets">
            <button type="button" onClick={() => choosePreset('all-equal')}>All equal</button>
            <button type="button" onClick={() => choosePreset('only-selected')}>Only selected</button>
            <button type="button" onClick={() => choosePreset('focus-weakest')}>Focus on weakest</button>
          </div>
          <label className="filter-label" htmlFor="time-filter">Question time</label>
          <select
            id="time-filter"
            value={data.settings.timeFilter}
            onChange={(event) => onChangeData({ ...data, settings: { ...data.settings, timeFilter: event.currentTarget.value === 'any' ? 'any' : Number(event.currentTarget.value) as 20 | 30 | 60 | 120 } })}
          >
            <option value="any">Any</option>
            <option value="20">Only 20s</option>
            <option value="30">Only 30s</option>
            <option value="60">Only 60s</option>
            <option value="120">Only 2m</option>
          </select>
        </details>
      </section>

      <section className="session-panel" aria-label="Question session">
        <div className="timer-wrap">
          <p className={`session-state${timeIsUp ? ' is-alert' : ''}`} aria-live="polite">
            {timeIsUp ? "Time's up!" : phase === 'speaking' ? 'Listen' : phase === 'countdown' ? '' : phase === 'revealed' || phase === 'rated' ? 'Question' : 'Ready'}
          </p>
          <div className={`timer${phase === 'countdown' && remainingSeconds <= 10 ? ' timer-urgent' : ''}`} role="timer" aria-live="off" aria-label={`${formatTime(remainingSeconds)} remaining`} style={timeStyle}>
            {formatTime(remainingSeconds)}
          </div>
          <div className="timer-track" aria-hidden="true"><span /></div>
          {currentTopic && phase !== 'countdown' && <p className="current-topic">{currentTopic}</p>}
          {questionVisible && currentQuestion && <p className="revealed-question">{currentQuestion.text}</p>}
          {notice && <p className="session-notice" role="status">{notice}</p>}

          {!active && !ended && (
            <button className="primary-action" type="button" disabled={selectedCount === 0} onClick={onRead}>
              Read question
            </button>
          )}

          {phase === 'speaking' && (
            <div className="action-row">
              <button className="secondary-action" type="button" onClick={onStop}>Stop</button>
              <button className="secondary-action" type="button" onClick={onSkip}>Skip</button>
            </div>
          )}

          {phase === 'countdown' && (
            <div className="action-grid">
              <button className="secondary-action" type="button" onClick={onRepeat}>Hear it again</button>
              <button className="secondary-action" type="button" onClick={onShowQuestion}>Show question</button>
              <button className="secondary-action" type="button" onClick={onStop}>Stop</button>
              <button className="secondary-action" type="button" onClick={onSkip}>Skip</button>
            </div>
          )}

          {phase === 'time-up' && (
            <div className="action-grid">
              {!questionVisible && <button className="secondary-action" type="button" onClick={onShowQuestion}>Show question</button>}
              {questionVisible && !rated && <>
                <button className="secondary-action" type="button" onClick={() => onRate('gotIt')}>Got it</button>
                <button className="secondary-action" type="button" onClick={() => onRate('missedIt')}>Missed it</button>
              </>}
              <button className="primary-action" type="button" onClick={onNext}>Next question</button>
            </div>
          )}

          {(phase === 'revealed' || phase === 'rated') && (
            <div className="action-grid">
              {timeIsUp && !rated && <>
                <button className="secondary-action" type="button" onClick={() => onRate('gotIt')}>Got it</button>
                <button className="secondary-action" type="button" onClick={() => onRate('missedIt')}>Missed it</button>
              </>}
              <button className="primary-action" type="button" onClick={onNext}>Next question</button>
            </div>
          )}

          <p className="shortcut-note">Space read / next · R repeat · Q show</p>
        </div>
      </section>
    </div>
  )
}
