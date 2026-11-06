import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { contestPreparationContext, STUDY_BANK_CHOICE_POLICY, topicScopeInstruction } from './aiPromptContext'
import { accuracy, formatDuration, parseQuestionLines } from './questionLogic'
import { loadManageTopic, parseStudyBackup, saveManageTopic } from './studyStorage'
import { loadCompetitionStorage, saveCompetitionStorage } from './competitionData'
import { ALLOWED_DURATIONS, EE_FOUNDATION_TOPICS, EE_TOPIC_GUIDANCE, EE_TOPIC_SECTIONS, TOPIC_GROUPS, TOPICS, type Question, type StudyData, type Topic } from './studyTypes'
import MathText from './MathText'

function questionExtractionPrompt(topic: Topic, group: string) {
  if (group === 'ESAS') {
    return `${contestPreparationContext(group)}

Extract every question for the Engineering Science and Allied Subjects (ESAS) study bank, specifically the ${topic} subtopic.

${topicScopeInstruction(topic)}

This is a self-paced, topic-based study bank, not a timed Mock Competition set. Preserve the source order of matching questions. Do not add competition rounds, difficulty labels, points, or competition metadata. Keep each included question self-contained and retain its needed context, data, units, and any text-based diagram description.

${STUDY_BANK_CHOICE_POLICY}

OUTPUT
Return the complete result as a JSON array inside exactly one \`\`\`json code block. Return no introduction or text outside the code block. Each array entry must have exactly these fields:
- "question": display-ready question text. Preserve engineering notation and wrap mathematical expressions in $...$ for KaTeX.
- "questionReadAloud": a natural spoken version of the complete question. Say symbols, units, and abbreviations clearly; do not include LaTeX or markup.
- "timeSeconds": an integer from 15, 20, 30, 45, 60, 90, 120, 150, or 180. Preserve a source time limit when provided; otherwise choose a suitable time based on the question's complexity.
- "answer": the correct answer in display-ready form, with units and mathematical expressions wrapped in $...$.
- "answerReadAloud": the complete answer rewritten as it should be spoken. Spell out symbols and units; do not include LaTeX or unexplained notation.
- "solution": a clear, complete worked explanation with the governing principles, substitutions, units, and result. Use $...$ for mathematical expressions.

Do not add a topic field: this question bank is already assigned to ${topic}. Include an answer and solution only for each in-scope question. Do not invent unreadable values or missing facts. If the source is unclear, preserve the uncertainty in a short note within the question rather than guessing.

SPEAKING AND ENGINEERING NOTATION
Keep display and spoken fields equivalent in meaning. Preserve engineering symbols such as j for the imaginary unit, phasor notation, subscripts, signs, prefixes, and SI units. Speak j omega as "j omega", RMS as "R M S", and units such as ohms, volts, amperes, watts, hertz, microfarads, and millihenries in words. Use "negative" for a leading negative sign and "minus" for subtraction. Never put dollar signs, LaTeX, or unexplained symbols in read-aloud fields.

TIME GUIDANCE
15 seconds = direct recall or a short definition
20–30 seconds = quick recall or a simple one-step question
45–90 seconds = standard engineering calculations or a few reasoning steps
120–180 seconds = challenging, multi-step analysis or an extended problem

EXAMPLE
\`\`\`json
[
  {
    "question": "A load draws $5\\,\\mathrm{A}$ from a $12\\,\\mathrm{V}$ source. Find its resistance.",
    "questionReadAloud": "A load draws five amperes from a twelve volt source. Find its resistance.",
    "timeSeconds": 30,
    "answer": "$R=2.4\\,\\Omega$",
    "answerReadAloud": "R equals two point four ohms.",
    "solution": "By Ohm's law, $R=V/I=12/5=2.4\\,\\Omega$."
  }
]
\`\`\``
  }
  return `${contestPreparationContext(group)}

Extract every question for the selected Lets StudEE! study topic: ${topic}.

${topicScopeInstruction(topic)}

This is a topic-based study bank, not a mock competition set. Preserve the source order of matching questions. Do not add questions from other topics just to make the bank longer.
${EE_TOPIC_GUIDANCE[topic] ? `For this topic, focus on: ${EE_TOPIC_GUIDANCE[topic]}` : ''}

${STUDY_BANK_CHOICE_POLICY}

OUTPUT
Return the complete result as a JSON array inside exactly one \`\`\`json code block. Return no introduction or text outside the code block. Each array entry must have exactly these fields:
- "question": display-ready question text, retaining all context and using $...$ around mathematical expressions for KaTeX.
- "questionReadAloud": natural spoken wording for the complete question. Use words rather than symbols or markup.
- "timeSeconds": a suitable integer from 15, 20, 30, 45, 60, 90, 120, 150, or 180. Preserve any time limit stated by the source; otherwise choose based on difficulty.
- "answer": the correct answer in display-ready form, using $...$ around mathematical expressions.
- "answerReadAloud": the complete answer rewritten exactly as it should be spoken aloud. Convert symbols into words; say "negative" for a leading negative sign and "minus" for subtraction. Do not leave hyphens, dashes, or LaTeX in this field.
- "solution": a clear, complete worked explanation, also using $...$ around mathematical expressions.

Do not add a subject/topic field; the app will save this bank under the selected topic. Include an answer and solution for each in-scope question only, following the question-format rules above. Include only the reasoning needed to solve each question in "solution". If no questions meet the scope, return an empty JSON array.

TIME
15 seconds = direct recall, definitions, or a short identification question
20–30 seconds = quick, one-step questions
45–90 seconds = standard questions requiring a few steps
120–180 seconds = challenging, multi-step problems

SPEAKING STYLE
Write "questionReadAloud" exactly as a person should say the complete question: x squared, x sub one, square root of, pi, sine of, three over five, degrees. Write "answerReadAloud" exactly as a person should say the complete answer. For example, write "negative five" for -5 and "five minus two" for 5 - 2. Expand abbreviations naturally (ECE as E C E). Never put LaTeX, dollar signs, or unexplained symbols in either read-aloud field. Preserve the meaning of the displayed question and answer exactly. Correct garbled PDF symbols only when the intended text is clear from context; do not guess at uncertain content.

EXAMPLE
\`\`\`json
[
  {
    "question": "Find the derivative of $f(x)=x^2+3x$.",
    "questionReadAloud": "Find the derivative of f of x equals x squared plus three x.",
    "timeSeconds": 30,
    "answer": "$f'(x)=2x+3$",
    "answerReadAloud": "f prime of x equals two x plus three.",
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
  spokenAnswer: string
  solution: string
}

export default function ManageScreen({ data, onChangeData, onPreview, onRestore }: ManageScreenProps) {
  const [activeTopic, setActiveTopic] = useState<Topic>(loadManageTopic)
  const [activeGroup, setActiveGroup] = useState<(typeof TOPIC_GROUPS)[number]['name']>(() => (
    TOPIC_GROUPS.find((group) => group.topics.some((topic) => topic === activeTopic))?.name ?? 'Math'
  ))
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<EditingQuestion | null>(null)
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(new Set())
  const [clearQuestionsOpen, setClearQuestionsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const clearQuestionsDialogRef = useRef<HTMLDialogElement>(null)
  const questions = data.questionBanks[activeTopic]
  const score = accuracy(data.results[activeTopic])
  const attempts = data.results[activeTopic].gotIt + data.results[activeTopic].missedIt

  useEffect(() => {
    saveManageTopic(activeTopic)
  }, [activeTopic])

  useEffect(() => {
    const dialog = clearQuestionsDialogRef.current
    if (!dialog) return
    if (clearQuestionsOpen && !dialog.open) dialog.showModal()
    else if (!clearQuestionsOpen && dialog.open) dialog.close()
  }, [clearQuestionsOpen])

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

  function toggleRevealed(questionId: string) {
    setRevealedIds((current) => {
      const next = new Set(current)
      if (!next.delete(questionId)) next.add(questionId)
      return next
    })
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
            spokenAnswer: editing.spokenAnswer.trim() || undefined,
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

  function clearTopicQuestions() {
    const storage = loadCompetitionStorage()
    const favorites = storage.favorites.filter((favorite) => !(
      favorite.source === 'study' && favorite.studyTopic === activeTopic
    ))
    if (favorites.length !== storage.favorites.length && !saveCompetitionStorage({ ...storage, favorites })) {
      setError('Could not clear this topic because its saved Favorites could not be updated. Try again.')
      setMessage('')
      setClearQuestionsOpen(false)
      return
    }

    onChangeData({
      ...data,
      questionBanks: { ...data.questionBanks, [activeTopic]: [] },
      usedQuestionIds: { ...data.usedQuestionIds, [activeTopic]: [] },
      results: { ...data.results, [activeTopic]: { gotIt: 0, missedIt: 0 } },
    })
    setEditing(null)
    setMessage(`Cleared ${questions.length} question${questions.length === 1 ? '' : 's'} from ${activeTopic}, along with its study progress and Favorites.`)
    setError('')
    setClearQuestionsOpen(false)
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
      await navigator.clipboard.writeText(questionExtractionPrompt(activeTopic, activeGroup))
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
          <textarea aria-label="Question extraction instructions" readOnly value={questionExtractionPrompt(activeTopic, activeGroup)} rows={12} />
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
              const firstTopic = group.topics[0]
              if (firstTopic) setActiveTopic(firstTopic)
              setEditing(null)
              setMessage('')
              setError('')
            }}
          >
            {group.name === 'Math' ? 'Math' : group.name === 'ESAS' ? 'ESAS' : 'EE'}
          </button>
        ))}
      </div>
      {activeGroup === 'Electrical Engineering' ? (
        <div className="ee-topic-groups">
          <section className="ee-topic-section">
            <h3>Electrical Fundamentals</h3>
            <div className="topic-tabs" role="tablist" aria-label="Core EE topics">
              {EE_FOUNDATION_TOPICS.map((topic) => (
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
          {EE_TOPIC_SECTIONS.map((section) => (
            <section className="ee-topic-section" key={section.name}>
              <h3>{section.name}</h3>
              <div className="topic-tabs" role="tablist" aria-label={`${section.name} topics`}>
                {section.topics.map((topic) => (
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
        </div>
      ) : (
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
      )}

      <div id="topic-panel" className="topic-panel" role="tabpanel" aria-labelledby={`topic-tab-${TOPICS.indexOf(activeTopic)}`}>
        <div className="topic-summary">
          <h2>{activeTopic}</h2>
          <span>{questions.length} questions</span>
          <span>{score === null ? 'No results yet' : `${Math.round(score)}% accuracy · ${attempts} tries`}</span>
          {questions.length > 0 && (
            <button className="text-action clear-topic-questions" type="button" onClick={() => setClearQuestionsOpen(true)}>
              Clear all questions
            </button>
          )}
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
        <p className="question-hint">Use the topic-specific JSON prompt above to add questions with spoken wording for both the question and answer, plus a worked solution. Legacy “time | question” lines are still supported.</p>
        <button className="primary-action add-questions" type="button" onClick={addQuestions}>Add questions</button>

        <ol className="question-list">
          {questions.map((question) => (
            <li className="question-item" key={question.id} data-search-id={`study-${question.id}`}>
              {editing?.id === question.id ? (
                <div className="edit-question">
                  <label>Question<textarea aria-label="Edit question text" rows={2} value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.currentTarget.value })} /></label>
                  <label>Question read aloud<textarea aria-label="Edit question read aloud" rows={2} value={editing.spokenText} onChange={(event) => setEditing({ ...editing, spokenText: event.currentTarget.value })} /></label>
                  <label>Answer<textarea aria-label="Edit answer" rows={2} value={editing.answer} onChange={(event) => setEditing({ ...editing, answer: event.currentTarget.value })} /></label>
                  <label>Answer read aloud<textarea aria-label="Edit answer read aloud" rows={2} value={editing.spokenAnswer} onChange={(event) => setEditing({ ...editing, spokenAnswer: event.currentTarget.value })} /></label>
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
                  <div className="question-actions">
                    <button
                      className="text-action"
                      type="button"
                      aria-expanded={revealedIds.has(question.id)}
                      onClick={() => toggleRevealed(question.id)}
                    >
                      {revealedIds.has(question.id) ? 'Hide' : 'Show'} solution & answer
                    </button>
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
                      spokenAnswer: question.spokenAnswer ?? '',
                      solution: question.solution ?? '',
                    })}>Edit</button>
                    <button className="text-action" type="button" onClick={() => deleteQuestion(question.id)}>Delete</button>
                  </div>
                  {revealedIds.has(question.id) && (
                    <div className="manage-question-answer">
                      <div>
                        <strong>Answer:</strong>{' '}
                        <MathText text={question.answer ?? 'No answer added yet.'} />
                      </div>
                      <div>
                        <strong>Solution:</strong>{' '}
                        <MathText text={question.solution ?? 'No solution added yet.'} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
        {!questions.length && <p className="empty-state">No questions in this topic yet.</p>}
      </div>
      <dialog
        ref={clearQuestionsDialogRef}
        className="written-delete-dialog"
        aria-labelledby="clear-topic-questions-title"
        onClose={() => setClearQuestionsOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) clearQuestionsDialogRef.current?.close()
        }}
      >
        <p className="eyebrow">Clear topic bank</p>
        <h2 id="clear-topic-questions-title">Delete all {questions.length} questions from {activeTopic}?</h2>
        <p className="written-delete-warning">This also clears this topic's study progress and saved Favorites. Other topics will not be changed. This cannot be undone.</p>
        <div className="written-delete-actions">
          <button className="text-action" type="button" onClick={() => clearQuestionsDialogRef.current?.close()}>Cancel</button>
          <button className="primary-action clear-topic-confirm" type="button" onClick={clearTopicQuestions}>Delete all questions</button>
        </div>
      </dialog>
    </section>
  )
}
