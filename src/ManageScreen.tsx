import { useState, type ChangeEvent } from 'react'
import { accuracy, formatDuration, parseQuestionLines } from './questionLogic'
import { parseStudyBackup } from './studyStorage'
import { ALLOWED_DURATIONS, TOPIC_GROUPS, TOPICS, type Question, type StudyData, type Topic } from './studyTypes'

interface ManageScreenProps {
  data: StudyData
  onChangeData: (data: StudyData) => void
  onPreview: (text: string) => boolean
  onRestore: (data: StudyData) => void
}

interface EditingQuestion {
  id: string
  text: string
  seconds: number
}

export default function ManageScreen({ data, onChangeData, onPreview, onRestore }: ManageScreenProps) {
  const [activeTopic, setActiveTopic] = useState<Topic>(TOPICS[0])
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<EditingQuestion | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const questions = data.questionBanks[activeTopic]
  const score = accuracy(data.results[activeTopic])
  const attempts = data.results[activeTopic].gotIt + data.results[activeTopic].missedIt

  function updateQuestions(nextQuestions: Question[]) {
    onChangeData({
      ...data,
      questionBanks: { ...data.questionBanks, [activeTopic]: nextQuestions },
    })
  }

  function addQuestions() {
    try {
      const additions = parseQuestionLines(draft, data.settings.defaultSeconds)
      updateQuestions([...questions, ...additions])
      setDraft('')
      setMessage(`${additions.length} questions added to ${activeTopic}.`)
      setError('')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not add these questions.')
      setMessage('')
    }
  }

  function saveEdit() {
    if (!editing?.text.trim() || !ALLOWED_DURATIONS.includes(editing.seconds as typeof ALLOWED_DURATIONS[number])) return
    updateQuestions(questions.map((question) => question.id === editing.id
      ? { ...question, text: editing.text.trim(), seconds: editing.seconds as Question['seconds'] }
      : question))
    onChangeData({
      ...data,
      questionBanks: {
        ...data.questionBanks,
        [activeTopic]: questions.map((question) => question.id === editing.id
          ? { ...question, text: editing.text.trim(), seconds: editing.seconds as Question['seconds'] }
          : question),
      },
      usedQuestionIds: {
        ...data.usedQuestionIds,
        [activeTopic]: data.usedQuestionIds[activeTopic].filter((id) => id !== editing.id),
      },
    })
    setEditing(null)
    setMessage('Question updated.')
    setError('')
  }

  function deleteQuestion(questionId: string) {
    onChangeData({
      ...data,
      questionBanks: { ...data.questionBanks, [activeTopic]: questions.filter((question) => question.id !== questionId) },
      usedQuestionIds: {
        ...data.usedQuestionIds,
        [activeTopic]: data.usedQuestionIds[activeTopic].filter((id) => id !== questionId),
      },
    })
    setMessage('Question deleted.')
    setEditing(null)
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'lets-studee-backup.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const imported = parseStudyBackup(JSON.parse(await file.text()) as unknown)
      onRestore(imported)
      setMessage('Backup restored.')
      setError('')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not restore that backup.')
      setMessage('')
    } finally {
      input.value = ''
    }
  }

  return (
    <section className="secondary-view manage-view" aria-labelledby="manage-heading">
      <div className="view-heading">
        <p className="eyebrow">Question banks</p>
        <h1 id="manage-heading">Manage questions</h1>
      </div>

      <div className="backup-tools">
        <button className="secondary-action" type="button" onClick={exportBackup}>Export backup</button>
        <label className="file-import">
          Import backup
          <input type="file" accept=".json,application/json" onChange={importBackup} />
        </label>
        <span>Import replaces the banks and progress saved in this browser.</span>
      </div>
      {message && <p className="manage-message" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {TOPIC_GROUPS.map((group) => (
        <section className="topic-tab-group" key={group.name} aria-label={`${group.name} question banks`}>
          <h2>{group.name}</h2>
          <div className="topic-tabs" role="tablist" aria-label={`${group.name} topics`}>
            {group.topics.map((topic) => (
              <button
                key={topic}
                type="button"
                role="tab"
                aria-selected={activeTopic === topic}
                aria-controls="topic-panel"
                id={`topic-tab-${TOPICS.indexOf(topic)}`}
                onClick={() => { setActiveTopic(topic); setEditing(null); setMessage(''); setError('') }}
              >
                {topic} <span>{data.questionBanks[topic].length}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <div id="topic-panel" className="topic-panel" role="tabpanel" aria-labelledby={`topic-tab-${TOPICS.indexOf(activeTopic)}`}>
        <div className="topic-summary">
          <h2>{activeTopic}</h2>
          <span>{questions.length} questions</span>
          <span>{score === null ? 'No results yet' : `${Math.round(score)}% accuracy · ${attempts} tries`}</span>
        </div>

        <label className="paste-label" htmlFor="question-lines">Paste one question per line</label>
        <textarea
          id="question-lines"
          className="question-paste"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder={'20 | What is seven times eight?\n2m | Find the derivative of x squared.'}
          rows={4}
        />
        <p className="question-hint">Start a line with a time and |, such as 20 | or 2m |. Without a time, the default applies. Write it how it sounds: “x squared,” not “x².”</p>
        <button className="primary-action add-questions" type="button" onClick={addQuestions}>Add questions</button>

        <ol className="question-list">
          {questions.map((question) => (
            <li className="question-item" key={question.id}>
              {editing?.id === question.id ? (
                <div className="edit-question">
                  <textarea aria-label="Edit question text" rows={2} value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.currentTarget.value })} />
                  <label>Time limit
                    <select value={editing.seconds} onChange={(event) => setEditing({ ...editing, seconds: Number(event.currentTarget.value) })}>
                      {ALLOWED_DURATIONS.map((seconds) => <option value={seconds} key={seconds}>{formatDuration(seconds)}</option>)}
                    </select>
                  </label>
                  <button className="secondary-action" type="button" onClick={saveEdit}>Save</button>
                  <button className="text-action" type="button" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <span className="question-time">{formatDuration(question.seconds)}</span>
                  <p>{question.text}</p>
                  <div className="question-actions">
                    <button className="text-action" type="button" onClick={() => {
                      if (!onPreview(question.text)) setError('Speech synthesis is not available in this browser.')
                      else setMessage('Previewing question.')
                    }}>Preview voice</button>
                    <button className="text-action" type="button" onClick={() => setEditing({ id: question.id, text: question.text, seconds: question.seconds })}>Edit</button>
                    <button className="text-action" type="button" onClick={() => deleteQuestion(question.id)}>Delete</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
        {!questions.length && <p className="empty-state">No questions in this topic yet.</p>}
      </div>
    </section>
  )
}
