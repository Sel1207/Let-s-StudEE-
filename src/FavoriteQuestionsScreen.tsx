import { useState } from 'react'
import MathText from './MathText'
import { defaultCompetitionSettings, loadCompetitionStorage, saveCompetitionStorage, type CompetitionStorage } from './competitionData'
import './favorites.css'

function initialStorage(): CompetitionStorage {
  if (typeof window === 'undefined') return { versions: [], history: [], favorites: [], settings: defaultCompetitionSettings() }
  return loadCompetitionStorage()
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function FavoriteQuestionsScreen() {
  const [storage, setStorage] = useState<CompetitionStorage>(initialStorage)

  function removeFavorite(id: string) {
    const updated = { ...storage, favorites: storage.favorites.filter((favorite) => favorite.id !== id) }
    saveCompetitionStorage(updated)
    setStorage(updated)
  }

  return <section className="secondary-view favorites-view" aria-labelledby="favorites-heading">
    <div className="view-heading">
      <p className="eyebrow">Saved from mock competitions</p>
      <h1 id="favorites-heading">Favorite questions</h1>
      <p className="topic-priority-help">Your saved questions in one place, with the competition, round, topic, difficulty, and time for each.</p>
    </div>

    <section className="competition-favorites" aria-labelledby="favorite-questions-heading">
      <div className="competition-library-heading"><h2 id="favorite-questions-heading">Saved questions</h2><span>{storage.favorites.length} saved</span></div>
      {!storage.favorites.length && <p className="empty-state">No saved questions yet. Tap the heart beside a question during a mock competition to collect it here.</p>}
      <div className="competition-favorite-list">
        {storage.favorites.map((favorite) => <article className="competition-favorite-card" key={favorite.id}>
          <div className="competition-favorite-heading">
            <div><p className="eyebrow">{favorite.competitionName} · {favorite.round === 'Sudden Death' ? 'Sudden Death' : `Round ${favorite.round}`} · Question {favorite.number}</p><h3>{favorite.category}</h3></div>
            <button className="text-action competition-favorite-remove" type="button" onClick={() => removeFavorite(favorite.id)} aria-label={`Remove question ${favorite.number} from favorites`}>Remove <span aria-hidden="true">♥</span></button>
          </div>
          <div className="competition-question-meta">
            <span>{favorite.difficulty}</span><span>{favorite.points} {favorite.points === 1 ? 'point' : 'points'}</span><span>{favorite.type}</span><span>Time {formatClock(favorite.timeSeconds)}</span>
          </div>
          <MathText text={favorite.question} className="competition-favorite-question" />
          {favorite.choices && <ol className="competition-choice-list" type="A">{(Object.entries(favorite.choices) as Array<[string, string]>).map(([letter, choice]) => <li key={letter}><span className="choice-letter">{letter}.</span><MathText text={choice} /></li>)}</ol>}
          <details className="competition-favorite-answer">
            <summary>Show answer and solution</summary>
            <div><strong>Answer</strong><MathText text={favorite.answer} /></div>
            <div><strong>Solution</strong><MathText text={favorite.solution} /></div>
          </details>
        </article>)}
      </div>
    </section>
  </section>
}
