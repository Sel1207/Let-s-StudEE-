import { useState, type ChangeEvent } from 'react'
import { formatDuration } from './questionLogic'
import { createFullAppBackup, parseFullAppBackup, restoreFullAppBackup } from './appBackup'
import { ALLOWED_DURATIONS, PREFERRED_VOICE_NAME, type StudyData, type StudySettings } from './studyTypes'
import type { ThemePreference } from './themePreference'

interface SettingsScreenProps {
  data: StudyData
  voices: SpeechSynthesisVoice[]
  theme: ThemePreference
  onChangeTheme: (theme: ThemePreference) => void
  onChangeSettings: (settings: StudySettings) => void
}

export default function SettingsScreen({ data, voices, theme, onChangeTheme, onChangeSettings }: SettingsScreenProps) {
  const [backupNotice, setBackupNotice] = useState('')
  const [backupError, setBackupError] = useState('')
  const englishVoices = voices.filter((voice) => /^en([_-]|$)/i.test(voice.lang))
  const voiceOptions = englishVoices.length ? englishVoices : voices
  const defaultVoice = voiceOptions.find((voice) => voice.name.includes(PREFERRED_VOICE_NAME)) ?? voiceOptions[0]

  function updateApp() {
    const url = new URL(window.location.href)
    url.searchParams.set('__app_update', `settings-${Date.now()}`)
    window.location.replace(url.toString())
  }

  function exportFullBackup() {
    try {
      const backup = createFullAppBackup(data, theme)
      const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `lets-studee-full-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setBackupError('')
      setBackupNotice('Full backup downloaded. Keep the file somewhere safe.')
    } catch (error) {
      console.error('Could not export the full app backup.', error)
      setBackupNotice('')
      setBackupError('Could not create the backup. Check that browser storage is available and try again.')
    }
  }

  async function importFullBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const backupStorage = parseFullAppBackup(await file.text())
      if (!window.confirm('Restoring this full backup will replace all Let’s StudEE! data currently saved in this browser. Continue?')) return
      restoreFullAppBackup(backupStorage)
      setBackupError('')
      setBackupNotice('Full backup restored. Reloading the app…')
      window.setTimeout(() => window.location.reload(), 250)
    } catch (error) {
      console.error('Could not restore the full app backup.', error)
      setBackupNotice('')
      setBackupError(error instanceof Error ? error.message : 'Could not restore this full backup.')
    } finally {
      input.value = ''
    }
  }

  return (
    <section className="secondary-view" aria-labelledby="settings-heading">
      <div className="view-heading">
        <p className="eyebrow">Personalize the session</p>
        <h1 id="settings-heading">Settings</h1>
      </div>

      <div className="settings-list">
        <label className="setting-row" htmlFor="default-seconds" data-search-id="setting-default-seconds">
          <span><strong>Default time</strong><small>Used when a question line has no time prefix.</small></span>
          <select
            id="default-seconds"
            value={data.settings.defaultSeconds}
            onChange={(event) => onChangeSettings({ ...data.settings, defaultSeconds: Number(event.currentTarget.value) as StudySettings['defaultSeconds'] })}
          >
            {ALLOWED_DURATIONS.map((seconds) => <option key={seconds} value={seconds}>{formatDuration(seconds)}</option>)}
          </select>
        </label>

        <fieldset className="setting-row speed-setting" data-search-id="setting-speech-speed">
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

        <label className="setting-row" htmlFor="voice-select" data-search-id="setting-voice">
          <span><strong>Voice</strong><small>Prefers Microsoft Liam Online (Natural) when available.</small></span>
          <select
            id="voice-select"
            value={data.settings.voiceURI || defaultVoice?.voiceURI || ''}
            onChange={(event) => onChangeSettings({ ...data.settings, voiceURI: event.currentTarget.value })}
          >
            <option value="">English voice (automatic)</option>
            {voiceOptions.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
          </select>
        </label>

        <label className="setting-row toggle-setting" htmlFor="announce-time" data-search-id="setting-announce">
          <span><strong>Announce time limit</strong><small>Voice says the time before each question.</small></span>
          <input
            id="announce-time"
            type="checkbox"
            checked={data.settings.announceDuration}
            onChange={(event) => onChangeSettings({ ...data.settings, announceDuration: event.currentTarget.checked })}
          />
        </label>
        <div className="setting-row toggle-setting theme-setting" data-search-id="setting-theme">
          <span><strong>Dark mode</strong><small>Switch to a darker color theme across the app.</small></span>
          <button
            className="theme-switch"
            type="button"
            role="switch"
            id="dark-mode"
            aria-checked={theme === 'dark'}
            aria-label="Dark mode"
            onClick={() => onChangeTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <span className="theme-switch-thumb" aria-hidden="true" />
          </button>
        </div>
      </div>

      <section className="app-backup-section" aria-labelledby="full-backup-heading" data-search-id="setting-backup">
        <div className="app-backup-heading">
          <div>
            <h2 id="full-backup-heading">Full app backup</h2>
            <p>Download or restore your Study banks and progress, Mock Competitions, score history, favorites, lecture notes, and settings in one file.</p>
          </div>
        </div>
        <div className="app-backup-actions">
          <button className="secondary-action" type="button" onClick={exportFullBackup}>Download full backup</button>
          <label className="file-import">
            Restore full backup
            <input type="file" accept=".json,application/json" onChange={(event) => { void importFullBackup(event) }} />
          </label>
        </div>
        {backupNotice && <p className="manage-message" role="status">{backupNotice}</p>}
        {backupError && <p className="form-error" role="alert">{backupError}</p>}
        <p className="app-backup-warning">Restoring replaces all Let’s StudEE! data in this browser. It does not affect unrelated websites.</p>
      </section>

      <section className="app-update-section" aria-labelledby="app-update-heading" data-search-id="setting-update">
        <div>
          <h2 id="app-update-heading">Website update</h2>
          <p>Load the latest published version. Your bookmark and saved study data will stay in place.</p>
        </div>
        <button className="secondary-action" type="button" onClick={updateApp}>Update app</button>
      </section>

    </section>
  )
}
