import { useEffect, useMemo, useRef, useState } from 'react'
import MathText from './MathText'
import { loadCompetitionStorage, type CompetitionQuestion, type CompetitionVersion } from './competitionData'
import './competition.css'
import './competitionViewer.css'

export type ViewerRound = number | 'Sudden Death'

export interface CompetitionViewerRequest {
  versionId: string
  round?: ViewerRound
  questionId?: string
  nonce: number
}

function roundLabel(round: ViewerRound): string {
  return round === 'Sudden Death' ? 'Sudden Death' : `Round ${round}`
}

function roundsOf(version: CompetitionVersion): Array<{ round: ViewerRound; questions: CompetitionQuestion[] }> {
  const rounds: Array<{ round: ViewerRound; questions: CompetitionQuestion[] }> = version.competition.rounds.map((round) => ({ round: round.round, questions: round.questions }))
  if (version.competition.suddenDeath.length) rounds.push({ round: 'Sudden Death', questions: version.competition.suddenDeath })
  return rounds
}

function QuestionCard({ question, highlighted }: { question: CompetitionQuestion; highlighted: boolean }) {
  return (
    <li className={`viewer-question${highlighted ? ' is-target' : ''}`} data-viewer-question={question.id}>
      <div className="viewer-question-meta">
        <span className="viewer-question-number">Q{question.number}</span>
        {question.category && <span>{question.category}</span>}
        <span>{question.difficulty}</span>
        <span>{question.points} {question.points === 1 ? 'pt' : 'pts'}</span>
        {question.timeSeconds !== null && <span>{question.timeSeconds}s</span>}
        {highlighted && <span className="viewer-question-badge">Search match</span>}
      </div>
      <MathText text={question.question} className="viewer-question-text" />
      {question.choices && (
        <ol className="competition-choice-list viewer-choices" type="A">
          {(Object.entries(question.choices) as Array<[string, string]>).map(([letter, choice]) => (
            <li key={letter}><span className="choice-letter">{letter}.</span><MathText text={choice} /></li>
          ))}
        </ol>
      )}
      <details className="viewer-answer">
        <summary>Show answer and solution</summary>
        <div className="competition-history-question-answer"><strong>Answer</strong><MathText text={question.answer} /></div>
        {question.solution && <div className="competition-history-question-answer"><strong>Solution</strong><MathText text={question.solution} /></div>}
      </details>
    </li>
  )
}

export default function CompetitionRoundViewer({ request, onClose }: { request: CompetitionViewerRequest | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const version = useMemo(() => (
    request ? loadCompetitionStorage().versions.find((item) => item.id === request.versionId) ?? null : null
  ), [request])
  const rounds = useMemo(() => (version ? roundsOf(version) : []), [version])
  const [selection, setSelection] = useState<{ nonce: number; round: ViewerRound } | null>(null)
  const requestedRound = request?.round ?? rounds[0]?.round ?? 1
  const activeRound = selection && selection.nonce === request?.nonce ? selection.round : requestedRound
  const active = rounds.find((item) => item.round === activeRound) ?? rounds[0]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (request && version && !dialog.open) dialog.showModal()
    if ((!request || !version) && dialog.open) dialog.close()
  }, [request, version])

  // Bring the matched question into view whenever its round is showing.
  useEffect(() => {
    if (!request?.questionId || !active) return
    const frame = window.requestAnimationFrame(() => {
      const target = listRef.current?.querySelector<HTMLElement>(`[data-viewer-question="${CSS.escape(request.questionId ?? '')}"]`)
      target?.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [request, active])

  if (!request || !version) return null

  return (
    <dialog
      ref={dialogRef}
      className="competition-viewer"
      aria-labelledby="competition-viewer-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close() }}
    >
      <header className="competition-viewer-header">
        <div>
          <p className="eyebrow">Mock Competition · {version.subject}</p>
          <h2 id="competition-viewer-title">{version.name}</h2>
        </div>
        <button className="text-action" type="button" onClick={() => dialogRef.current?.close()}>Close</button>
      </header>
      <div className="competition-viewer-tabs" role="tablist" aria-label="Rounds">
        {rounds.map((item) => {
          const hasTarget = !!request.questionId && item.questions.some((question) => question.id === request.questionId)
          return (
            <button
              key={String(item.round)}
              type="button"
              role="tab"
              aria-selected={item.round === active?.round}
              className={hasTarget ? 'has-target' : undefined}
              onClick={() => setSelection({ nonce: request.nonce, round: item.round })}
            >
              {roundLabel(item.round)}
              <span>{item.questions.length}</span>
            </button>
          )
        })}
      </div>
      {active && (
        <ol className="competition-viewer-list" ref={listRef} role="tabpanel" aria-label={roundLabel(active.round)}>
          {active.questions.map((question) => (
            <QuestionCard key={question.id} question={question} highlighted={question.id === request.questionId} />
          ))}
        </ol>
      )}
    </dialog>
  )
}
