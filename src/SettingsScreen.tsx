import { accuracy, formatDuration } from './questionLogic'
import { PREFERRED_VOICE_URI } from './speechVoice'
import { ALLOWED_DURATIONS, TOPICS, type StudyData, type StudySettings } from './studyTypes'

interface SettingsScreenProps {
  data: StudyData
  voices: SpeechSynthesisVoice[]
  onChangeSettings: (settings: StudySettings) => void
}

export default function SettingsScreen({ data, voices, onChangeSettings }: SettingsScreenProps) {
  const englishVoices = voices.filter((voice) => /^en([_-]|$)/i.test(voice.lang))
  const voiceOptions = englishVoices.length ? englishVoices : voices

  return (
    <section className="secondary-view" aria-labelledby="settings-heading">
      <div className="view-heading">
        <p className="eyebrow">Personalize the session</p>
        <h1 id="settings-heading">Settings</h1>
      </div>

      <div className="settings-list">
        <label className="setting-row" htmlFor="default-seconds">
          <span><strong>Default time</strong><small>Used when a question line has no time prefix.</small></span>
          <select
            id="default-seconds"
            value={data.settings.defaultSeconds}
            onChange={(event) => onChangeSettings({ ...data.settings, defaultSeconds: Number(event.currentTarget.value) as StudySettings['defaultSeconds'] })}
          >
            {ALLOWED_DURATIONS.map((seconds) => <option key={seconds} value={seconds}>{formatDuration(seconds)}</option>)}
          </select>
        </label>

        <fieldset className="setting-row speed-setting">
          <legend><strong>Speech speed</strong></legend>
          <div className="segmented-control">
            {(['slow', 'normal', 'fast'] as const).map((speed) => (
              <button
                key={speed}
                type="button"
                aria-pressed={data.settings.speechSpeed === speed}
                onClick={() => onChangeSettings({ ...data.settings, speechSpeed: speed })}
              >
                {speed[0].toUpperCase() + speed.slice(1)}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="setting-row" htmlFor="voice-select">
          <span><strong>Voice</strong><small>Prefers Microsoft Liam in English (Canada); uses another English voice if unavailable.</small></span>
          <select
            id="voice-select"
            value={data.settings.voiceURI}
            onChange={(event) => onChangeSettings({ ...data.settings, voiceURI: event.currentTarget.value })}
          >
            <option value="">English voice (automatic)</option>
            <option value={PREFERRED_VOICE_URI}>Microsoft Liam Online (Natural) · English (Canada) (preferred)</option>
            {voiceOptions.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
          </select>
        </label>

        <label className="setting-row toggle-setting" htmlFor="announce-time">
          <span><strong>Announce time limit</strong><small>Voice says the time before each question.</small></span>
          <input
            id="announce-time"
            type="checkbox"
            checked={data.settings.announceDuration}
            onChange={(event) => onChangeSettings({ ...data.settings, announceDuration: event.currentTarget.checked })}
          />
        </label>
      </div>

      <section className="accuracy-section" aria-labelledby="accuracy-heading">
        <h2 id="accuracy-heading">Topic accuracy</h2>
        {TOPICS.map((topic) => {
          const result = data.results[topic]
          const attempts = result.gotIt + result.missedIt
          const score = accuracy(result)
          return (
            <div className="accuracy-row" key={topic}>
              <span>{topic}</span>
              <span className="accuracy-bar"><span style={{ width: `${score ?? 0}%` }} /></span>
              <span>{score === null ? '—' : `${Math.round(score)}%`}</span>
              <small>{attempts} {attempts === 1 ? 'try' : 'tries'}</small>
            </div>
          )
        })}
      </section>
    </section>
  )
}
