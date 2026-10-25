import { useState, type ChangeEvent } from 'react'
import { accuracy, formatDuration, parseQuestionLines } from './questionLogic'
import { parseStudyBackup } from './studyStorage'
import { ALLOWED_DURATIONS, TOPIC_GROUPS, TOPICS, type Question, type StudyData, type Topic } from './studyTypes'

const QUESTION_EXTRACTION_PROMPT = `Extract only the questions from the attached file for a text-to-speech app.

FORMAT
One line per question, exactly: time | question
Output only the questions in ONE code block. No choices, no answers, no asterisks, no numbering, no headers or footers. Join wrapped lines into one line.

TIME
15 = identification or recall (name it, state a definition or formula)
30 = quick, one-step
60 = standard, a few steps
2m = multi-step word problems (ages, mixtures, work, motion, towers)

SPEAKING STYLE
Write it as spoken: x^2 = "x squared", ° = "degrees", π = "pi", 3/5 = "3 over 5", sin = "sine of", ECE = "E C E". Fix garbled PDF symbols from context and list uncertain fixes after the code block.

SAMPLES
Input: 3. In the expansion of (x+4y)^12, the numerical coefficient of the 5th term is a. 63360 b. 126720*
Output: 60 | In the expansion of the quantity x plus 4y, raised to the 12th power, find the numerical coefficient of the 5th term.

Input: 27. A certain angle has an explement 5 times the supplement, find the angle. a. 67.5 b. 135*
Output: 30 | A certain angle has an explement 5 times its supplement. Find the angle.

Input: 12. What do you call a triangle with no equal sides? a. Scalene* b. Isosceles
Output: 15 | What do you call a triangle with no equal sides?`

interface ManageScreenProps {
  data: StudyData
  onChangeData: (data: StudyData) => void
  onPreview: (text: string, topic: Topic) => boolean
  onRestore: (data: StudyData) => void
}

interface EditingQuestion {
  id: string
  text: string
  seconds: number
}

export default function ManageScreen({ data, onChangeData, onPreview, onRestore }: ManageScreenProps) {
  const [activeTopic, setActiveTopic] = useState<Topic>(TOPICS[0])
  const [activeGroup, setActiveGroup] = useState<(typeof TOPIC_GROUPS)[number]['name']>('Math')
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

  async function copyExtractionPrompt() {
    try {
      await navigator.clipboard.writeText(QUESTION_EXTRACTION_PROMPT)
      setMessage('Question extraction prompt copied.')
      setError('')
    } catch {
      setError('Clipboard access is unavailable. Select the prompt text and copy it.')
      setMessage('')
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
      <details className="question-tutorial">
        <summary>Copy question-extraction instructions</summary>
        <div className="question-tutorial-content">
          <textarea aria-label="Question extraction instructions" readOnly value={QUESTION_EXTRACTION_PROMPT} rows={12} />
          <button className="secondary-action" type="button" onClick={copyExtractionPrompt}>Copy prompt</button>
        </div>
      </details>
      {message && <p className="manage-message" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="segmented-control topic-group-toggle" role="group" aria-label="Question bank group">
        {TOPIC_GROUPS.map((group) => (
          <button
            key={group.name}
            type="button"
            aria-label={group.name}
            aria-pressed={activeGroup === group.name}
            onClick={() => {
              setActiveGroup(group.name)
              setActiveTopic(group.topics[0])
              setEditing(null)
              setMessage('')
              setError('')
            }}
          >
            {group.name === 'Math' ? 'Math' : 'EE'}
          </button>
        ))}
      </div>
      <div className="topic-tabs" role="tablist" aria-label={`${activeGroup} topics`}>
        {TOPIC_GROUPS.find((group) => group.name === activeGroup)?.topics.map((topic) => (
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
                      if (!onPreview(question.text, activeTopic)) setError('Speech synthesis is not available in this browser.')
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
