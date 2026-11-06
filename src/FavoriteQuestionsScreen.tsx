import { useEffect, useRef, useState } from 'react'
import MathText from './MathText'
import NoteText from './NoteText'
import { useCollapseOnOutsidePress } from './useCollapseOnOutsidePress'
import { noteDetailsPrompt, stripOuterCodeFence } from './aiPromptContext'
import { defaultCompetitionSettings, defaultCompetitionSubjects, loadCompetitionStorage, saveCompetitionStorage, type CompetitionQuestion, type CompetitionStorage } from './competitionData'
import { LEGACY_TOPIC_ALIASES, TOPICS, TOPIC_GROUPS, type StudyData, type Topic } from './studyTypes'
import './favorites.css'

type NoteTarget =
  | { source: 'study'; topic: Topic; questionId: string; question: string; answer?: string; solution?: string; note: string }
  | { source: 'competition'; versionId: string; competitionName: string; question: CompetitionQuestion }

const MY_QUESTIONS_SECTION_STORAGE_KEY = 'lets-studee-my-questions-section-v1'

function initialStorage(): CompetitionStorage {
  if (typeof window === 'undefined') return { versions: [], history: [], favorites: [], settings: defaultCompetitionSettings(), subjects: defaultCompetitionSubjects(), activeSubject: 'Math' }
  return loadCompetitionStorage()
}

function loadActiveSection(): 'favorites' | 'notes' {
  try {
    return window.localStorage.getItem(MY_QUESTIONS_SECTION_STORAGE_KEY) === 'notes' ? 'notes' : 'favorites'
  } catch (error) {
    console.error('Could not restore the selected My Questions section.', error)
    return 'favorites'
  }
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function noteEditingPrompt(target: NoteTarget): string {
  if (target.source === 'study') {
    return noteDetailsPrompt({
      Topic: target.topic,
      Question: target.question,
      Answer: target.answer ?? 'Not provided',
      Solution: target.solution ?? 'Not provided',
    })
  }
  return noteDetailsPrompt({
    Topic: target.question.category,
    Question: target.question.question,
    Answer: target.question.answer,
    Solution: target.question.solution,
  })
}

export default function FavoriteQuestionsScreen({ data, onChangeData }: { data: StudyData; onChangeData: (data: StudyData) => void }) {
  const [storage, setStorage] = useState<CompetitionStorage>(initialStorage)
  const [notice, setNotice] = useState('')
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null)
  const [noteMode, setNoteMode] = useState<'preview' | 'edit'>('preview')
  const [noteDraft, setNoteDraft] = useState('')
  const [noteNotice, setNoteNotice] = useState('')
  const [noteSubjectFilter, setNoteSubjectFilter] = useState('all')
  const [noteSubtopicFilter, setNoteSubtopicFilter] = useState('all')
  const [favoriteSubjectFilter, setFavoriteSubjectFilter] = useState('all')
  const [favoriteSubtopicFilter, setFavoriteSubtopicFilter] = useState('all')
  const [activeSection, setActiveSection] = useState<'favorites' | 'notes'>(loadActiveSection)
  const noteDialogRef = useRef<HTMLDialogElement>(null)
  const notePromptRef = useCollapseOnOutsidePress()
  const notedQuestions = TOPICS.flatMap((topic) => data.questionBanks[topic]
    .filter((question) => question.note)
    .map((question) => ({ topic, question })))
  const notedCompetitionQuestions = storage.versions.flatMap((version) => [
    ...version.competition.rounds.flatMap((round) => round.questions),
    ...version.competition.suddenDeath,
  ]
    .filter((question) => question.note)
    .map((question) => ({ version, question })))
  const notedCount = notedQuestions.length + notedCompetitionQuestions.length
  const normalizeStudyTopic = (topic: string) => TOPICS.find((item) => item === topic) ?? LEGACY_TOPIC_ALIASES[topic]
  const studySubject = (topic: string) => {
    const normalizedTopic = normalizeStudyTopic(topic)
    return TOPIC_GROUPS.find((group) => group.topics.some((item) => item === normalizedTopic))?.name ?? 'ESAS'
  }
  const notedSubjects = [...new Set([
    ...notedQuestions.map(({ topic }) => studySubject(topic)),
    ...notedCompetitionQuestions.map(({ version }) => version.subject),
  ])].sort()
  const notedSubtopics = [...new Set([
    ...notedQuestions
      .filter(({ topic }) => noteSubjectFilter === 'all' || studySubject(topic) === noteSubjectFilter)
      .map(({ topic }) => topic),
    ...notedCompetitionQuestions
      .filter(({ version }) => noteSubjectFilter === 'all' || version.subject === noteSubjectFilter)
      .map(({ question }) => question.category),
  ])].sort()
  const visibleNotedQuestions = notedQuestions.filter(({ topic }) => (
    (noteSubjectFilter === 'all' || studySubject(topic) === noteSubjectFilter)
    && (noteSubtopicFilter === 'all' || topic === noteSubtopicFilter)
  ))
  const visibleNotedCompetitionQuestions = notedCompetitionQuestions.filter(({ version, question }) => (
    (noteSubjectFilter === 'all' || version.subject === noteSubjectFilter)
    && (noteSubtopicFilter === 'all' || question.category === noteSubtopicFilter)
  ))
  const favoriteSubject = (favorite: CompetitionStorage['favorites'][number]) => {
    if (favorite.source === 'study') return studySubject(favorite.studyTopic ?? favorite.category)
    return storage.versions.find((version) => version.id === favorite.sourceVersionId)?.subject ?? favorite.competitionName
  }
  const favoriteSubtopic = (favorite: CompetitionStorage['favorites'][number]) => (
    favorite.source === 'study'
      ? normalizeStudyTopic(favorite.studyTopic ?? favorite.category) ?? favorite.studyTopic ?? favorite.category
      : favorite.category
  )
  const favoriteSubjects = [...new Set(storage.favorites.map(favoriteSubject))].sort()
  const favoriteSubtopics = [...new Set(storage.favorites
    .filter((favorite) => favoriteSubjectFilter === 'all' || favoriteSubject(favorite) === favoriteSubjectFilter)
    .map(favoriteSubtopic))].sort()
  const visibleFavorites = storage.favorites.filter((favorite) => (
    (favoriteSubjectFilter === 'all' || favoriteSubject(favorite) === favoriteSubjectFilter)
    && (favoriteSubtopicFilter === 'all' || favoriteSubtopic(favorite) === favoriteSubtopicFilter)
  ))
  const studyQuestionFavorite = (topic: Topic, questionId: string) => storage.favorites.some((favorite) => (
    favorite.source === 'study' && favorite.studyTopic === topic && favorite.questionId === questionId
  ))
  const competitionQuestionFavorite = (versionId: string, questionId: string) => storage.favorites.some((favorite) => (
    favorite.source !== 'study' && favorite.sourceVersionId === versionId && favorite.questionId === questionId
  ))
  const studyFavoriteNote = (favorite: CompetitionStorage['favorites'][number]) => {
    if (favorite.source !== 'study') return null
    const topic = favorite.studyTopic ? normalizeStudyTopic(favorite.studyTopic) : undefined
    if (!topic) return null
    const question = data.questionBanks[topic].find((item) => item.id === favorite.questionId)
    return question?.note ? { topic, question } : null
  }
  const competitionFavoriteNote = (favorite: CompetitionStorage['favorites'][number]) => {
    if (favorite.source === 'study') return null
    const version = storage.versions.find((item) => item.id === favorite.sourceVersionId)
    if (!version) return null
    const question = [
      ...version.competition.rounds.flatMap((round) => round.questions),
      ...version.competition.suddenDeath,
    ].find((item) => item.id === favorite.questionId)
    return question?.note ? { version, question } : null
  }
  const visibleNotedCount = visibleNotedQuestions.length + visibleNotedCompetitionQuestions.length
  const noteQuestionText = !noteTarget
    ? ''
    : noteTarget.source === 'study' ? noteTarget.question : noteTarget.question.question
  const savedNoteText = !noteTarget
    ? ''
    : noteTarget.source === 'study' ? noteTarget.note : noteTarget.question.note ?? ''
  const activeNotePrompt = noteTarget ? noteEditingPrompt(noteTarget) : ''

  function changeActiveSection(section: 'favorites' | 'notes') {
    setActiveSection(section)
    try {
      window.localStorage.setItem(MY_QUESTIONS_SECTION_STORAGE_KEY, section)
    } catch (error) {
      console.error('Could not save the selected My Questions section.', error)
    }
  }

  useEffect(() => {
    const dialog = noteDialogRef.current
    if (!dialog) return
    if (noteTarget && !dialog.open) dialog.showModal()
    else if (!noteTarget && dialog.open) dialog.close()
  }, [noteTarget])

  function openStudyNote(topic: Topic, question: { id: string; text: string; answer?: string; solution?: string; note?: string }) {
    if (!question.note) return
    setNoteTarget({ source: 'study', topic, questionId: question.id, question: question.text, answer: question.answer, solution: question.solution, note: question.note })
    setNoteDraft(question.note)
    setNoteMode('preview')
    setNoteNotice('')
  }

  function openCompetitionNote(versionId: string, competitionName: string, question: CompetitionQuestion) {
    if (!question.note) return
    setNoteTarget({ source: 'competition', versionId, competitionName, question })
    setNoteDraft(question.note)
    setNoteMode('preview')
    setNoteNotice('')
  }

  function closeNoteDialog() {
    setNoteTarget(null)
    if (noteDialogRef.current?.open) noteDialogRef.current.close()
  }

  async function copyNotePrompt() {
    if (!activeNotePrompt) return
    try {
      await navigator.clipboard.writeText(activeNotePrompt)
      setNoteNotice('AI note prompt copied.')
    } catch {
      setNoteNotice('Could not copy the prompt. Select and copy the prompt text below.')
    }
  }

  function saveNote(remove = false) {
    if (!noteTarget) return
    const note = remove ? '' : stripOuterCodeFence(noteDraft)
    if (noteTarget.source === 'study') {
      onChangeData({
        ...data,
        questionBanks: {
          ...data.questionBanks,
          [noteTarget.topic]: data.questionBanks[noteTarget.topic].map((question) => {
            if (question.id !== noteTarget.questionId) return question
            const updated = { ...question }
            if (note) updated.note = note
            else delete updated.note
            return updated
          }),
        },
      })
    } else {
      if (!storage.versions.some((version) => version.id === noteTarget.versionId)) {
        setNoteNotice('This saved competition is no longer available. Reload Favorites and try again.')
        return
      }
      const updatedStorage: CompetitionStorage = {
        ...storage,
        versions: storage.versions.map((version) => {
          if (version.id !== noteTarget.versionId) return version
          const updateQuestion = (question: CompetitionQuestion) => {
            if (question.id !== noteTarget.question.id) return question
            const updated = { ...question }
            if (note) updated.note = note
            else delete updated.note
            return updated
          }
          return {
            ...version,
            competition: {
              ...version.competition,
              rounds: version.competition.rounds.map((round) => ({
                ...round,
                questions: round.questions.map(updateQuestion),
              })),
              suddenDeath: version.competition.suddenDeath.map(updateQuestion),
            },
            updatedAt: Date.now(),
          }
        }),
      }
      if (!saveCompetitionStorage(updatedStorage)) {
        setNoteNotice('Could not save this note. Check browser storage and try again.')
        return
      }
      setStorage(updatedStorage)
    }
    setNotice(remove ? 'Note removed.' : 'Note saved.')
    closeNoteDialog()
  }

  function removeFavorite(id: string) {
    const updated = { ...storage, favorites: storage.favorites.filter((favorite) => favorite.id !== id) }
    if (!saveCompetitionStorage(updated)) {
      setNotice('Could not update Favorites. Check browser storage and try again.')
      return
    }
    setStorage(updated)
    setNotice('Question removed from Favorites.')
  }

  function removeNoteFromQuestion(target: NoteTarget) {
    if (target.source === 'study') {
      onChangeData({
        ...data,
        questionBanks: {
          ...data.questionBanks,
          [target.topic]: data.questionBanks[target.topic].map((question) => {
            if (question.id !== target.questionId) return question
            const updated = { ...question }
            delete updated.note
            return updated
          }),
        },
      })
    } else {
      if (!storage.versions.some((version) => version.id === target.versionId)) {
        setNotice('This saved competition is no longer available. Reload Favorites and try again.')
        return
      }
      const updatedStorage: CompetitionStorage = {
        ...storage,
        versions: storage.versions.map((version) => {
          if (version.id !== target.versionId) return version
          const updateQuestion = (question: CompetitionQuestion) => {
            if (question.id !== target.question.id) return question
            const updated = { ...question }
            delete updated.note
            return updated
          }
          return {
            ...version,
            competition: {
              ...version.competition,
              rounds: version.competition.rounds.map((round) => ({
                ...round,
                questions: round.questions.map(updateQuestion),
              })),
              suddenDeath: version.competition.suddenDeath.map(updateQuestion),
            },
            updatedAt: Date.now(),
          }
        }),
      }
      if (!saveCompetitionStorage(updatedStorage)) {
        setNotice('Could not remove this note. Check browser storage and try again.')
        return
      }
      setStorage(updatedStorage)
    }
    setNotice('Note removed. The question is still saved.')
  }

  return <section className="secondary-view favorites-view" aria-labelledby="favorites-heading">
    <div className="view-heading">
      <p className="eyebrow">Saved from Study and Mock Competition</p>
      <h1 id="favorites-heading">My Questions</h1>
      <p className="topic-priority-help">Choose between your favorite questions and questions with notes.</p>
    </div>
    {notice && <p className="session-notice" role="status">{notice}</p>}

    <div className="saved-question-tabs" role="tablist" aria-label="Saved question collections">
      <button id="favorite-questions-tab" type="button" role="tab" aria-selected={activeSection === 'favorites'} aria-controls="favorite-questions-panel" onClick={() => changeActiveSection('favorites')}>
        Favorite questions <span>{storage.favorites.length}</span>
      </button>
      <button id="noted-questions-tab" type="button" role="tab" aria-selected={activeSection === 'notes'} aria-controls="noted-questions-panel" onClick={() => changeActiveSection('notes')}>
        Questions with notes <span>{notedCount}</span>
      </button>
    </div>

    <section id="noted-questions-panel" className="competition-favorites noted-questions" role="tabpanel" aria-labelledby="noted-questions-tab" hidden={activeSection !== 'notes'}>
      <div className="competition-library-heading"><h2 id="noted-questions-heading">Questions with notes</h2><span>{visibleNotedCount} of {notedCount} noted</span></div>
      {!notedCount && <p className="empty-state">Questions you add notes to in Oral Practice, Written Test, or Mock Competition will appear here, separate from your favorites.</p>}
      {notedCount > 0 && <div className="favorite-filters" aria-label="Filter questions with notes">
        <label>
          <span>Topic</span>
          <select value={noteSubjectFilter} onChange={(event) => { setNoteSubjectFilter(event.currentTarget.value); setNoteSubtopicFilter('all') }}>
            <option value="all">All topics</option>
            {notedSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
          </select>
        </label>
        <label>
          <span>Subtopic</span>
          <select value={noteSubtopicFilter} onChange={(event) => setNoteSubtopicFilter(event.currentTarget.value)}>
            <option value="all">All subtopics</option>
            {notedSubtopics.map((subtopic) => <option key={subtopic} value={subtopic}>{subtopic}</option>)}
          </select>
        </label>
      </div>}
      <div className="competition-favorite-list">
        {visibleNotedQuestions.map(({ topic, question }) => (
          <article className="competition-favorite-card noted-question-card" key={`${topic}:${question.id}`}>
            <div className="competition-favorite-heading">
              <div>
                <p className="eyebrow">Study · {topic}</p>
                <h3>{topic}</h3>
              </div>
              <div className="noted-question-actions">
                {studyQuestionFavorite(topic, question.id) && <span className="favorite-status-heart" role="img" aria-label="Favorited" title="Favorited"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></svg></span>}
                <a className="secondary-action" href={`https://www.google.com/search?q=${encodeURIComponent(question.text)}`} target="_blank" rel="noopener noreferrer" aria-label={`Search the web for ${topic} question`}>
                  Search web
                </a>
                <button className="text-action remove-question-note" type="button" onClick={() => removeNoteFromQuestion({ source: 'study', topic, questionId: question.id, question: question.text, note: question.note ?? '' })}>
                  Remove note
                </button>
              </div>
            </div>
            <MathText text={question.text} className="competition-favorite-question" />
            <button className="noted-question-note" type="button" onClick={() => openStudyNote(topic, question)} aria-label={`Edit note for ${topic} question`}>
              <strong>Note</strong>
              <NoteText text={question.note ?? ''} />
              <span className="noted-question-edit-hint">Tap note to edit</span>
            </button>
            <details className="competition-favorite-answer">
              <summary>Show answer &amp; solution</summary>
              <div><strong>Answer</strong><MathText text={question.answer ?? 'No answer was included for this question.'} /></div>
              <div><strong>Solution</strong><MathText text={question.solution ?? 'No worked solution was included for this question.'} /></div>
            </details>
          </article>
        ))}
        {visibleNotedCompetitionQuestions.map(({ version, question }) => (
          <article className="competition-favorite-card noted-question-card" key={`${version.id}:${question.id}`}>
            <div className="competition-favorite-heading">
              <div>
                <p className="eyebrow">Mock Competition · {version.name} · {question.round === 'Sudden Death' ? 'Sudden Death' : `Round ${question.round}`} · Question {question.number}</p>
                <h3>{question.category}</h3>
              </div>
              <div className="noted-question-actions">
                {competitionQuestionFavorite(version.id, question.id) && <span className="favorite-status-heart" role="img" aria-label="Favorited" title="Favorited"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></svg></span>}
                <a className="secondary-action" href={`https://www.google.com/search?q=${encodeURIComponent(question.question)}`} target="_blank" rel="noopener noreferrer" aria-label={`Search the web for question ${question.number}`}>
                  Search web
                </a>
                <button className="text-action remove-question-note" type="button" onClick={() => removeNoteFromQuestion({ source: 'competition', versionId: version.id, competitionName: version.name, question })}>
                  Remove note
                </button>
              </div>
            </div>
            <MathText text={question.question} className="competition-favorite-question" />
            <button className="noted-question-note" type="button" onClick={() => openCompetitionNote(version.id, version.name, question)} aria-label={`Edit note for ${question.category} question ${question.number}`}>
              <strong>Note</strong>
              <NoteText text={question.note ?? ''} />
              <span className="noted-question-edit-hint">Tap note to edit</span>
            </button>
            <details className="competition-favorite-answer">
              <summary>Show answer &amp; solution</summary>
              <div><strong>Answer</strong><MathText text={question.answer} /></div>
              <div><strong>Solution</strong><MathText text={question.solution} /></div>
            </details>
          </article>
        ))}
        {notedCount > 0 && !visibleNotedCount && <p className="empty-state">No noted questions match these filters.</p>}
      </div>
    </section>

    <dialog
      ref={noteDialogRef}
      className="question-note-dialog"
      aria-labelledby="favorite-note-title"
      onClose={() => setNoteTarget(null)}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeNoteDialog()
      }}
    >
      <div className="question-note-heading">
        <div>
          <p className="eyebrow">{noteTarget?.source === 'study' ? `Study · ${noteTarget.topic}` : `Mock Competition · ${noteTarget?.source === 'competition' ? noteTarget.competitionName : ''}`}</p>
          <h2 id="favorite-note-title">{noteMode === 'preview' ? 'Question note' : 'Edit question note'}</h2>
        </div>
        <button className="text-action" type="button" onClick={closeNoteDialog}>Close</button>
      </div>
      {noteTarget && <MathText text={noteQuestionText} className="question-note-prompt-question" />}
      {noteMode === 'preview' && noteTarget ? (
        <button
          className="question-note-preview"
          type="button"
          aria-label="Edit this note"
          onClick={() => setNoteMode('edit')}
        >
          <strong>Click note to edit</strong>
          <NoteText text={savedNoteText} />
        </button>
      ) : (
        <>
          <label className="question-note-label" htmlFor="favorite-question-note-text">Formula shortcut or note</label>
          <textarea
            id="favorite-question-note-text"
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.currentTarget.value)}
            placeholder="Add a shortcut, formula, or reminder. LaTeX such as $E=mc^2$ is supported."
            rows={4}
          />
          <details ref={notePromptRef} className="question-note-ai-prompt">
            <summary>AI prompt for this note</summary>
            <textarea aria-label="AI prompt for this note" readOnly rows={8} value={activeNotePrompt} />
            <button className="secondary-action" type="button" onClick={() => { void copyNotePrompt() }}>Copy AI prompt</button>
          </details>
        </>
      )}
      {noteNotice && <p className="session-notice" role="alert">{noteNotice}</p>}
      <div className="question-note-actions">
        {noteMode === 'preview' ? (
          <button className="text-action" type="button" onClick={closeNoteDialog}>Close</button>
        ) : (
          <>
            <button className="text-action" type="button" onClick={closeNoteDialog}>Cancel</button>
            <button className="text-action remove-question-note" type="button" onClick={() => saveNote(true)}>Remove note</button>
            <button className="primary-action" type="button" onClick={() => saveNote()}>Save note</button>
          </>
        )}
      </div>
    </dialog>

    <section id="favorite-questions-panel" className="competition-favorites" role="tabpanel" aria-labelledby="favorite-questions-tab" hidden={activeSection !== 'favorites'}>
      <div className="competition-library-heading"><h2 id="favorite-questions-heading">Saved questions</h2><span>{visibleFavorites.length} of {storage.favorites.length} saved</span></div>
      {!storage.favorites.length && <p className="empty-state">No saved questions yet. Tap the heart beside a question in Study or Mock Competition to collect it here.</p>}
      {storage.favorites.length > 0 && <div className="favorite-filters" aria-label="Filter saved questions">
        <label>
          <span>Topic</span>
          <select value={favoriteSubjectFilter} onChange={(event) => { setFavoriteSubjectFilter(event.currentTarget.value); setFavoriteSubtopicFilter('all') }}>
            <option value="all">All topics</option>
            {favoriteSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
          </select>
        </label>
        <label>
          <span>Subtopic</span>
          <select value={favoriteSubtopicFilter} onChange={(event) => setFavoriteSubtopicFilter(event.currentTarget.value)}>
            <option value="all">All subtopics</option>
            {favoriteSubtopics.map((subtopic) => <option key={subtopic} value={subtopic}>{subtopic}</option>)}
          </select>
        </label>
      </div>}
      <div className="competition-favorite-list">
        {visibleFavorites.map((favorite) => {
          const studyNote = studyFavoriteNote(favorite)
          const competitionNote = competitionFavoriteNote(favorite)
          const note = studyNote?.question.note ?? competitionNote?.question.note
          return <article className="competition-favorite-card" key={favorite.id} data-search-id={`favorite-${favorite.id}`}>
          <div className="competition-favorite-heading">
            <div>
              <p className="eyebrow">
                {favorite.source === 'study'
                  ? <>Study · {favorite.studyTopic ?? favorite.category} · Question {favorite.number} · <span className="favorite-study-time">Time {formatClock(favorite.timeSeconds)}</span></>
                  : `${favorite.competitionName} · ${favorite.round === 'Sudden Death' ? 'Sudden Death' : `Round ${favorite.round}`} · Question ${favorite.number}`}
              </p>
              <h3>{favorite.category}</h3>
            </div>
            <div className="favorite-card-actions">
              <a className="text-action favorite-search-web" href={`https://www.google.com/search?q=${encodeURIComponent(favorite.question)}`} target="_blank" rel="noopener noreferrer" aria-label={`Search the web for favorite question ${favorite.number}`}>
                Search web
              </a>
              <button className="text-action competition-favorite-remove" type="button" onClick={() => removeFavorite(favorite.id)} aria-label={`Remove question ${favorite.number} from favorites`}>Remove <span aria-hidden="true">♥</span></button>
            </div>
          </div>
          {favorite.source !== 'study' && <div className="competition-question-meta">
            <span>{favorite.difficulty}</span><span>{favorite.points} {favorite.points === 1 ? 'point' : 'points'}</span><span>{favorite.type}</span><span>Time {formatClock(favorite.timeSeconds)}</span>
          </div>}
          <MathText text={favorite.question} className="competition-favorite-question" />
          {favorite.choices && <ol className="competition-choice-list" type="A">{(Object.entries(favorite.choices) as Array<[string, string]>).map(([letter, choice]) => <li key={letter}><span className="choice-letter">{letter}.</span><MathText text={choice} /></li>)}</ol>}
          {note && <button className="noted-question-note favorite-card-note" type="button" onClick={() => {
            if (studyNote) openStudyNote(studyNote.topic, studyNote.question)
            else if (competitionNote) openCompetitionNote(competitionNote.version.id, competitionNote.version.name, competitionNote.question)
          }}>
            <strong>Note</strong>
            <NoteText text={note} />
            <span className="noted-question-edit-hint">Tap note to edit</span>
          </button>}
          <details className="competition-favorite-answer">
            <summary>Show answer and solution</summary>
            <div><strong>Answer</strong><MathText text={favorite.answer} /></div>
            <div><strong>Solution</strong><MathText text={favorite.solution} /></div>
          </details>
        </article>
        })}
        {storage.favorites.length > 0 && !visibleFavorites.length && <p className="empty-state">No saved questions match these filters.</p>}
      </div>
    </section>
  </section>
}
