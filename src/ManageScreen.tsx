import { useState, type ChangeEvent } from 'react'
import { accuracy, formatDuration, parseQuestionLines } from './questionLogic'
import { parseStudyBackup } from './studyStorage'
import { ALLOWED_DURATIONS, TOPIC_GROUPS, TOPICS, type Question, type StudyData, type Topic } from './studyTypes'
import MathText from './MathText'

function questionExtractionPrompt(topic: Topic) {
  return `Extract every question for the selected Lets StudEE! study topic: ${topic}.

This is a topic-based study bank, not a mock competition set. Include only questions that belong to the selected topic. Preserve the source's question order. Do not omit a question. Keep each question self-contained.

OUTPUT
Return the complete result as a JSON array inside exactly one \`\`\`json code block. Return no introduction or text outside the code block. Each array entry must have exactly these fields:
- "question": display-ready question text, retaining all context and using $...$ around mathematical expressions for KaTeX.
- "questionReadAloud": natural spoken wording for the complete question. Use words rather than symbols or markup.
- "timeSeconds": a suitable integer from 15, 20, 30, 45, 60, 90, 120, 150, or 180. Preserve any time limit stated by the source; otherwise choose based on difficulty.
- "answer": the correct answer in display-ready form, using $...$ around mathematical expressions.
- "solution": a clear, complete worked explanation, also using $...$ around mathematical expressions.

Do not add a subject/topic field; the app will save this bank under the selected topic. Include every question's answer and solution. If the source has multiple-choice questions, include the complete question and choices in "question", identify the correct answer in "answer", and include all necessary reasoning in "solution".

TIME
15 seconds = direct recall, definitions, or a short identification question
20–30 seconds = quick, one-step questions
45–90 seconds = standard questions requiring a few steps
120–180 seconds = challenging, multi-step problems

SPEAKING STYLE
Write "questionReadAloud" exactly as a person should say it: x squared, x sub one, square root of, pi, sine of, three over five, degrees. Expand abbreviations naturally (ECE as E C E). Never put LaTeX, dollar signs, or unexplained symbols in this field. Keep its meaning identical to "question". Correct garbled PDF symbols only when the intended text is clear from context; do not guess at uncertain content.

EXAMPLE
\`\`\`json
[
  {
    "question": "Find the derivative of $f(x)=x^2+3x$.",
    "questionReadAloud": "Find the derivative of f of x equals x squared plus three x.",
    "timeSeconds": 30,
    "answer": "$f'(x)=2x+3$",
    "solution": "Apply the power rule term by term: $\\frac{d}{dx}(x^2)=2x$ and $\\frac{d}{dx}(3x)=3$. Therefore, $f'(x)=2x+3$."
  }
]
\`\`\``
}

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
  spokenText: string
  answer: string
  solution: string
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
    onChangeData({
      ...data,
      questionBanks: {
        ...data.questionBanks,
        [activeTopic]: questions.map((question) => question.id === editing.id
          ? {
            ...question,
            text: editing.text.trim(),
            seconds: editing.seconds as Question['seconds'],
            spokenText: editing.spokenText.trim() || undefined,
            answer: editing.answer.trim() || undefined,
            solution: editing.solution.trim() || undefined,
          }
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
      await navigator.clipboard.writeText(questionExtractionPrompt(activeTopic))
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
          <textarea aria-label="Question extraction instructions" readOnly value={questionExtractionPrompt(activeTopic)} rows={12} />
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

        <label className="paste-label" htmlFor="question-lines">Paste questions for {activeTopic}</label>
        <textarea
          id="question-lines"
          className="question-paste"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder={'Paste the JSON array from the AI prompt, or enter legacy questions one per line:\n20 | What is seven times eight?'}
          rows={4}
        />
        <p className="question-hint">Use the topic-specific JSON prompt above to add questions with spoken wording, an answer, and a worked solution. Legacy “time | question” lines are still supported.</p>
        <button className="primary-action add-questions" type="button" onClick={addQuestions}>Add questions</button>

        <ol className="question-list">
          {questions.map((question) => (
            <li className="question-item" key={question.id}>
              {editing?.id === question.id ? (
                <div className="edit-question">
                  <label>Question<textarea aria-label="Edit question text" rows={2} value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.currentTarget.value })} /></label>
                  <label>Question read aloud<textarea aria-label="Edit question read aloud" rows={2} value={editing.spokenText} onChange={(event) => setEditing({ ...editing, spokenText: event.currentTarget.value })} /></label>
                  <label>Answer<textarea aria-label="Edit answer" rows={2} value={editing.answer} onChange={(event) => setEditing({ ...editing, answer: event.currentTarget.value })} /></label>
                  <label>Solution<textarea aria-label="Edit solution" rows={3} value={editing.solution} onChange={(event) => setEditing({ ...editing, solution: event.currentTarget.value })} /></label>
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
                  <MathText text={question.text} className="manage-question-text" />
                  <div className="manage-question-answer">
                    <strong>Answer:</strong>{' '}
                    <MathText text={question.answer ?? 'No answer added yet.'} />
                  </div>
                  <div className="question-actions">
                    <button className="text-action" type="button" onClick={() => {
                      if (!onPreview(question.spokenText ?? question.text, activeTopic)) setError('Speech synthesis is not available in this browser.')
                      else setMessage('Previewing question.')
                    }}>Preview voice</button>
                    <button className="text-action" type="button" onClick={() => setEditing({
                      id: question.id,
                      text: question.text,
                      seconds: question.seconds,
                      spokenText: question.spokenText ?? '',
                      answer: question.answer ?? '',
                      solution: question.solution ?? '',
                    })}>Edit</button>
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
