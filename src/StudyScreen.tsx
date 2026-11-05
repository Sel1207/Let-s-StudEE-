import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { applyPreset, questionCounts, topicChances, writtenTestQuestions } from './questionLogic'
import { EE_FOUNDATION_TOPICS, EE_TOPIC_SECTIONS, TOPIC_GROUPS, TOPICS, type Preset, type Question, type StudyData, type Topic, type TopicGroupName } from './studyTypes'
import { loadCompetitionStorage, saveCompetitionStorage, type CompetitionFavorite } from './competitionData'
import { currentDailyStreak, DAILY_CORRECT_GOAL, localDateKey, type CompetitionDailyProgress } from './competitionProgress'
import { mathToSpeech } from './mathSpeech'
import MathText from './MathText'
import LectureScreen from './LectureScreen'
import { loadLectureNotes } from './lectureNotesStorage'
import { contestPreparationContext, shortcutGuidanceInstruction, topicScopeInstruction } from './aiPromptContext'

type SessionPhase = 'ready' | 'speaking' | 'countdown' | 'paused' | 'time-up' | 'revealed' | 'rated'
type Rating = 'gotIt' | 'missedIt'
type WrittenTopicSelection = 'random' | Topic
interface SavedWrittenTest {
  enabled: boolean
  topic: WrittenTopicSelection
  questionLimit: number | 'all'
  includeAllTopicQuestions: boolean
  returnToLectureTopic: Topic | null
  shuffleSeeds: Partial<Record<WrittenTopicSelection, number>>
  visibleAnswers: string[]
  visibleSolutions: string[]
  outcomes: Record<string, Rating>
}
interface WrittenQuestionDeletion {
  topic: Topic
  id: string
  text: string
  source: 'oral' | 'written'
}
interface QuestionNoteTarget {
  topic: Topic
  question: Question
}

const WRITTEN_TEST_STORAGE_KEY = 'lets-studee-written-test-v1'
const WRITTEN_SCROLL_STORAGE_KEY = 'lets-studee-written-scroll-v1'
const LECTURE_TOPIC_STORAGE_KEY = 'lets-studee-open-lecture-topic-v1'
const WRITTEN_QUESTION_LIMITS: Array<number | 'all'> = [5, 10, 20, 30, 50, 'all']

function isTopic(value: string): value is Topic {
  return TOPICS.some((topic) => topic === value)
}

function loadLectureTopic(): Topic | null {
  try {
    const saved = window.localStorage.getItem(LECTURE_TOPIC_STORAGE_KEY)
    return saved && isTopic(saved) ? saved : null
  } catch (error) {
    console.error('Could not restore the open lecture topic.', error)
    return null
  }
}

function questionSearchText(question: Question): string {
  return mathToSpeech(question.spokenText?.trim() || question.text)
    .replace(/\\(?:mathrm|text|textrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1')
    .replace(/[$\\{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function loadWrittenTest(): SavedWrittenTest {
  const defaults: SavedWrittenTest = {
    enabled: false,
    topic: 'random',
    questionLimit: 'all',
    includeAllTopicQuestions: false,
    returnToLectureTopic: null,
    shuffleSeeds: {},
    visibleAnswers: [],
    visibleSolutions: [],
    outcomes: {},
  }
  if (typeof window === 'undefined') return defaults
  try {
    const raw = window.localStorage.getItem(WRITTEN_TEST_STORAGE_KEY)
    if (!raw) return defaults
    const saved = JSON.parse(raw) as Partial<SavedWrittenTest> & { shuffleSeed?: unknown }
    const topic = saved.topic === 'random' || (typeof saved.topic === 'string' && isTopic(saved.topic))
      ? saved.topic
      : defaults.topic
    const shuffleSeeds = saved.shuffleSeeds && typeof saved.shuffleSeeds === 'object'
      ? Object.fromEntries(Object.entries(saved.shuffleSeeds).filter((entry): entry is [WrittenTopicSelection, number] => (
        (entry[0] === 'random' || isTopic(entry[0])) && typeof entry[1] === 'number' && Number.isSafeInteger(entry[1])
      )))
      : typeof saved.shuffleSeed === 'number' && Number.isSafeInteger(saved.shuffleSeed)
        ? { [topic]: saved.shuffleSeed }
        : {}
    return {
      enabled: saved.enabled === true,
      topic,
      questionLimit: WRITTEN_QUESTION_LIMITS.includes(saved.questionLimit as number | 'all')
        ? saved.questionLimit as number | 'all'
        : defaults.questionLimit,
      includeAllTopicQuestions: saved.includeAllTopicQuestions === true,
      returnToLectureTopic: typeof saved.returnToLectureTopic === 'string' && isTopic(saved.returnToLectureTopic)
        ? saved.returnToLectureTopic
        : null,
      shuffleSeeds,
      visibleAnswers: Array.isArray(saved.visibleAnswers) ? saved.visibleAnswers.filter((key): key is string => typeof key === 'string') : [],
      visibleSolutions: Array.isArray(saved.visibleSolutions) ? saved.visibleSolutions.filter((key): key is string => typeof key === 'string') : [],
      outcomes: saved.outcomes && typeof saved.outcomes === 'object'
        ? Object.fromEntries(Object.entries(saved.outcomes).filter((entry): entry is [string, Rating] => (
          typeof entry[0] === 'string'
          && entry[0].startsWith(`${localDateKey()}:`)
          && (entry[1] === 'gotIt' || entry[1] === 'missedIt')
        )))
        : {},
    }
  } catch (error) {
    console.error('Could not restore the written test state.', error)
    return defaults
  }
}

function loadWrittenScrollPositions(): Partial<Record<WrittenTopicSelection, number>> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(WRITTEN_SCROLL_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(saved).filter((entry): entry is [WrittenTopicSelection, number] => (
      (entry[0] === 'random' || isTopic(entry[0])) && typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )))
  } catch {
    return {}
  }
}

function createShuffleSeed(previousSeed?: number): number {
  const seed = new Uint32Array(1)
  window.crypto.getRandomValues(seed)
  return seed[0] === previousSeed ? (seed[0] + 1) % 2 ** 32 : seed[0]
}

function questionNotePrompt(target: QuestionNoteTarget): string {
  return `${contestPreparationContext(target.topic)}

Create a concise note explaining only the concept in this question that belongs to "${target.topic}". Include a useful shortcut when the question's givens or conditions make one applicable: identify the case, state the shortcut and any limits. Do not invent or force a shortcut. Do not add forecasts, neighboring-topic material, or a broad lesson. Use valid LaTeX for mathematical expressions. Keep the note accurate and easy to scan; do not repeat the full solution. Return only the note text, with no heading or code fences.
${topicScopeInstruction(target.topic)}
${shortcutGuidanceInstruction(target.topic)}

Topic: ${target.topic}
Question: ${target.question.text}
Answer: ${target.question.answer ?? 'Not provided'}
Solution: ${target.question.solution ?? 'Not provided'}`
}

interface StudyScreenProps {
  lectureRequest?: { topic: Topic; nonce: number } | null
  data: StudyData
  dailyProgress: CompetitionDailyProgress
  activeGroup: TopicGroupName
  onGroupChange: (group: TopicGroupName) => void
  phase: SessionPhase
  remainingSeconds: number
  currentQuestion: Question | null
  currentTopic: Topic | null
  questionVisible: boolean
  answerVisible: boolean
  timeIsUp: boolean
  rated: boolean
  notice: string
  onChangeData: (data: StudyData) => void
  onRead: () => void
  onRepeat: () => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onSkip: () => void
  onToggleQuestion: () => void
  onToggleAnswer: () => void
  onNext: () => void
  onRate: (rating: Rating) => void
  onDailyCorrectAnswer: () => void
  onManageTopic: (topic: Topic) => void
  visible: boolean
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function createStudyFavorite(topic: Topic, item: Question, number: number): CompetitionFavorite {
  return {
    id: `study:${encodeURIComponent(topic)}:${encodeURIComponent(item.id)}`,
    sourceVersionId: 'study',
    questionId: item.id,
    source: 'study',
    studyTopic: topic,
    competitionName: 'Study',
    round: 1,
    number,
    category: topic,
    difficulty: 'Easy',
    points: 1,
    type: 'Identification',
    question: item.text,
    choices: null,
    answer: item.answer ?? 'No answer was included for this question.',
    solution: item.solution ?? 'No worked solution was included for this question.',
    timeSeconds: item.seconds,
    savedAt: Date.now(),
  }
}

export default function StudyScreen({
  data,
  dailyProgress,
  activeGroup,
  onGroupChange,
  phase,
  remainingSeconds,
  currentQuestion,
  currentTopic,
  questionVisible,
  answerVisible,
  timeIsUp,
  rated,
  notice,
  onChangeData,
  onRead,
  onRepeat,
  onStop,
  onPause,
  onResume,
  onSkip,
  onToggleQuestion,
  onToggleAnswer,
  onNext,
  onRate,
  onDailyCorrectAnswer,
  onManageTopic,
  visible,
  lectureRequest = null,
}: StudyScreenProps) {
  const [savedWrittenTest] = useState(loadWrittenTest)
  const [writtenTest, setWrittenTest] = useState(savedWrittenTest.enabled)
  const [lectureTopic, setLectureTopic] = useState<Topic | null>(loadLectureTopic)
  const [handledLectureRequest, setHandledLectureRequest] = useState(lectureRequest?.nonce ?? 0)
  if (lectureRequest && lectureRequest.nonce !== handledLectureRequest) {
    setHandledLectureRequest(lectureRequest.nonce)
    setLectureTopic(lectureRequest.topic)
  }
  const [topicsWithLectureNotes, setTopicsWithLectureNotes] = useState(() => {
    const { notes } = loadLectureNotes()
    return new Set(TOPICS.filter((topic) => (notes[topic] ?? '').trim().length > 0))
  })
  const [writtenTopic, setWrittenTopic] = useState<WrittenTopicSelection>(savedWrittenTest.topic)
  const [writtenQuestionLimit, setWrittenQuestionLimit] = useState<number | 'all'>(savedWrittenTest.questionLimit)
  const [includeAllTopicQuestions, setIncludeAllTopicQuestions] = useState(savedWrittenTest.includeAllTopicQuestions)
  const [returnToLectureTopic, setReturnToLectureTopic] = useState<Topic | null>(savedWrittenTest.returnToLectureTopic)
  const [shuffleSeeds, setShuffleSeeds] = useState(savedWrittenTest.shuffleSeeds)
  const shuffleSeed = shuffleSeeds[writtenTopic] ?? 1
  const [savedWrittenScrollPositions] = useState(loadWrittenScrollPositions)
  const writtenScrollPositionsRef = useRef(savedWrittenScrollPositions)
  const writtenPanelRef = useRef<HTMLElement>(null)
  const [weightsDialogOpen, setWeightsDialogOpen] = useState(false)
  const weightsDialogRef = useRef<HTMLDialogElement>(null)
  const [questionToDelete, setQuestionToDelete] = useState<WrittenQuestionDeletion | null>(null)
  const deleteDialogRef = useRef<HTMLDialogElement>(null)
  const [noteTarget, setNoteTarget] = useState<QuestionNoteTarget | null>(null)
  const [noteMode, setNoteMode] = useState<'preview' | 'edit'>('edit')
  const [noteDraft, setNoteDraft] = useState('')
  const [noteNotice, setNoteNotice] = useState('')
  const noteDialogRef = useRef<HTMLDialogElement>(null)
  const [visibleAnswers, setVisibleAnswers] = useState<Set<string>>(() => new Set(savedWrittenTest.visibleAnswers))
  const [visibleSolutions, setVisibleSolutions] = useState<Set<string>>(() => new Set(savedWrittenTest.visibleSolutions))
  const [writtenOutcomes, setWrittenOutcomes] = useState<Record<string, Rating>>(savedWrittenTest.outcomes)
  const writtenOutcomesRef = useRef(writtenOutcomes)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    return new Set(loadCompetitionStorage().favorites.map((favorite) => favorite.id))
  })
  const [favoriteNotice, setFavoriteNotice] = useState('')
  const [openWrittenActionsKey, setOpenWrittenActionsKey] = useState<string | null>(null)
  const dailyFocusRef = useRef<HTMLElement>(null)
  const [dailyFocusIsStuck, setDailyFocusIsStuck] = useState(false)
  const today = localDateKey()
  const todayCorrect = dailyProgress.correctByDate[today] ?? 0
  const dailyStreak = currentDailyStreak(dailyProgress, today)
  const chances = topicChances(data, activeGroup)
  const counts = questionCounts(data)
  const visibleGroup = TOPIC_GROUPS.find((group) => group.name === activeGroup) ?? TOPIC_GROUPS[0]
  const selectedCount = visibleGroup.topics.reduce((total, topic) => {
    const preference = data.topicPreferences[topic]
    return total + (preference.active && preference.weight > 0 ? counts[topic] : 0)
  }, 0)
  const active = phase === 'speaking' || phase === 'countdown' || phase === 'paused'
  const ended = phase === 'time-up' || phase === 'revealed' || phase === 'rated'
  const timeStyle = { '--time-progress': `${Math.max(0, Math.min(1, remainingSeconds / (currentQuestion?.seconds ?? data.settings.defaultSeconds))) * 100}%` } as CSSProperties
  const allWrittenQuestions = useMemo(() => {
    return writtenTestQuestions(data, writtenTopic, shuffleSeed, undefined, includeAllTopicQuestions)
  }, [data, includeAllTopicQuestions, shuffleSeed, writtenTopic])
  const writtenQuestions = writtenQuestionLimit === 'all'
    ? allWrittenQuestions
    : allWrittenQuestions.slice(0, writtenQuestionLimit)
  const currentQuestionNote = currentTopic && currentQuestion
    ? data.questionBanks[currentTopic].find((question) => question.id === currentQuestion.id)?.note
    : undefined
  const currentQuestionNumber = currentTopic && currentQuestion
    ? data.questionBanks[currentTopic].findIndex((item) => item.id === currentQuestion.id) + 1
    : 0
  const currentStudyFavoriteId = currentTopic && currentQuestion
    ? `study:${encodeURIComponent(currentTopic)}:${encodeURIComponent(currentQuestion.id)}`
    : null
  const currentQuestionSearchText = currentQuestion
    ? questionSearchText(currentQuestion)
    : ''

  useEffect(() => {
    const updateStickyState = () => {
      setDailyFocusIsStuck((dailyFocusRef.current?.getBoundingClientRect().top ?? 1) <= 0)
    }
    window.addEventListener('scroll', updateStickyState, { passive: true })
    updateStickyState()
    return () => window.removeEventListener('scroll', updateStickyState)
  }, [])

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (!target.closest('.written-question-actions-disclosure')) {
        setOpenWrittenActionsKey(null)
      }
    }
    const closeOnScroll = () => setOpenWrittenActionsKey(null)
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(WRITTEN_TEST_STORAGE_KEY, JSON.stringify({
        enabled: writtenTest,
        topic: writtenTopic,
        questionLimit: writtenQuestionLimit,
        includeAllTopicQuestions,
        returnToLectureTopic,
        shuffleSeeds,
        visibleAnswers: [...visibleAnswers],
        visibleSolutions: [...visibleSolutions],
        outcomes: writtenOutcomes,
      } satisfies SavedWrittenTest))
    } catch (error) {
      console.error('Could not save the written test state.', error)
    }
  }, [includeAllTopicQuestions, returnToLectureTopic, shuffleSeeds, visibleAnswers, visibleSolutions, writtenOutcomes, writtenQuestionLimit, writtenTopic, writtenTest])

  useEffect(() => {
    let frame = 0
    const saveScrollPosition = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const panel = writtenPanelRef.current
        const key = panel?.dataset.scrollKey
        if (!panel || panel.offsetParent === null || !key) return
        writtenScrollPositionsRef.current = { ...writtenScrollPositionsRef.current, [key]: window.scrollY }
        try {
          window.localStorage.setItem(WRITTEN_SCROLL_STORAGE_KEY, JSON.stringify(writtenScrollPositionsRef.current))
        } catch (error) {
          console.error('Could not save the written test scroll position.', error)
        }
      })
    }
    window.addEventListener('scroll', saveScrollPosition, { passive: true })
    return () => {
      window.removeEventListener('scroll', saveScrollPosition)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  // Return to where this written test topic was left, including after visiting other tabs.
  useLayoutEffect(() => {
    if (!visible || !writtenTest || lectureTopic) return
    window.scrollTo({ top: writtenScrollPositionsRef.current[writtenTopic] ?? 0 })
  }, [lectureTopic, visible, writtenTest, writtenTopic])

  useEffect(() => {
    try {
      if (lectureTopic) window.localStorage.setItem(LECTURE_TOPIC_STORAGE_KEY, lectureTopic)
      else window.localStorage.removeItem(LECTURE_TOPIC_STORAGE_KEY)
    } catch (error) {
      console.error('Could not save the open lecture topic.', error)
    }
  }, [lectureTopic])

  useEffect(() => {
    const dialog = weightsDialogRef.current
    if (!dialog) return
    if (weightsDialogOpen && !dialog.open) dialog.showModal()
    else if (!weightsDialogOpen && dialog.open) dialog.close()
  }, [weightsDialogOpen])

  useEffect(() => {
    const dialog = deleteDialogRef.current
    if (!dialog) return
    if (questionToDelete && !dialog.open) dialog.showModal()
    else if (!questionToDelete && dialog.open) dialog.close()
  }, [questionToDelete])

  useEffect(() => {
    const dialog = noteDialogRef.current
    if (!dialog) return
    if (noteTarget && !dialog.open) dialog.showModal()
    else if (!noteTarget && dialog.open) dialog.close()
  }, [noteTarget])

  function refreshWrittenQuestions() {
    const reloadedKeys = new Set(allWrittenQuestions.map(({ key }) => key))
    const keepOtherTopics = (current: Set<string>) => new Set([...current].filter((key) => !reloadedKeys.has(key)))
    setShuffleSeeds((current) => ({ ...current, [writtenTopic]: createShuffleSeed(shuffleSeed) }))
    setVisibleAnswers(keepOtherTopics)
    setVisibleSolutions(keepOtherTopics)
    const outcomes = Object.fromEntries(Object.entries(writtenOutcomesRef.current).filter(([outcomeKey]) => (
      !reloadedKeys.has(outcomeKey.slice(outcomeKey.indexOf(':') + 1))
    )))
    writtenOutcomesRef.current = outcomes
    setWrittenOutcomes(outcomes)
    writtenScrollPositionsRef.current = { ...writtenScrollPositionsRef.current, [writtenTopic]: 0 }
    window.scrollTo({ top: 0 })
  }

  function reloadWrittenQuestions() {
    refreshWrittenQuestions()
  }

  function startLectureWrittenTest(topic: Topic) {
    onStop()
    setWrittenTopic(topic)
    setWrittenQuestionLimit('all')
    setIncludeAllTopicQuestions(true)
    setReturnToLectureTopic(topic)
    setWrittenTest(true)
    setLectureTopic(null)
  }

  function returnToLectureNotes() {
    if (!returnToLectureTopic) return
    setLectureTopic(returnToLectureTopic)
    setReturnToLectureTopic(null)
    setIncludeAllTopicQuestions(false)
    setWrittenTest(false)
    window.scrollTo({ top: 0 })
  }

  function markWrittenOutcome(key: string, rating: Rating) {
    const outcomeKey = `${localDateKey()}:${key}`
    if (writtenOutcomesRef.current[outcomeKey]) return
    const outcomes = { ...writtenOutcomesRef.current, [outcomeKey]: rating }
    writtenOutcomesRef.current = outcomes
    setWrittenOutcomes(outcomes)
    if (rating === 'gotIt') onDailyCorrectAnswer()
  }

  function closeWeightsDialog() {
    setWeightsDialogOpen(false)
    if (weightsDialogRef.current?.open) weightsDialogRef.current.close()
  }

  function openQuestionNote(topic: Topic, question: Question) {
    const savedQuestion = data.questionBanks[topic].find((candidate) => candidate.id === question.id) ?? question
    setNoteTarget({ topic, question: savedQuestion })
    setNoteDraft(savedQuestion.note ?? '')
    setNoteMode(savedQuestion.note ? 'preview' : 'edit')
    setNoteNotice('')
  }

  function closeNoteDialog() {
    setNoteTarget(null)
    if (noteDialogRef.current?.open) noteDialogRef.current.close()
  }

  function saveQuestionNote() {
    if (!noteTarget) return
    const note = noteDraft.trim()
    onChangeData({
      ...data,
      questionBanks: {
        ...data.questionBanks,
        [noteTarget.topic]: data.questionBanks[noteTarget.topic].map((question) => {
          if (question.id !== noteTarget.question.id) return question
          const updated = { ...question }
          if (note) updated.note = note
          else delete updated.note
          return updated
        }),
      },
    })
    closeNoteDialog()
  }

  async function copyNotePrompt() {
    if (!noteTarget) return
    try {
      await navigator.clipboard.writeText(questionNotePrompt(noteTarget))
      setNoteNotice('AI note prompt copied.')
    } catch {
      setNoteNotice('Could not copy the prompt. Select and copy the prompt text below.')
    }
  }

  function deleteWrittenQuestion() {
    if (!questionToDelete) return
    const favoriteId = `study:${encodeURIComponent(questionToDelete.topic)}:${encodeURIComponent(questionToDelete.id)}`
    const storage = loadCompetitionStorage()
    const favorites = storage.favorites.filter((favorite) => favorite.id !== favoriteId)
    if (favorites.length !== storage.favorites.length && !saveCompetitionStorage({ ...storage, favorites })) {
      setFavoriteNotice('Could not fully delete this question because its Favorite could not be removed from browser storage.')
      setQuestionToDelete(null)
      return
    }

    const topic = questionToDelete.topic
    onChangeData({
      ...data,
      questionBanks: {
        ...data.questionBanks,
        [topic]: data.questionBanks[topic].filter((question) => question.id !== questionToDelete.id),
      },
      usedQuestionIds: {
        ...data.usedQuestionIds,
        [topic]: data.usedQuestionIds[topic].filter((id) => id !== questionToDelete.id),
      },
    })
    setFavoriteIds(new Set(favorites.map((favorite) => favorite.id)))
    setVisibleAnswers((current) => new Set([...current].filter((key) => key !== `${topic}:${questionToDelete.id}`)))
    setVisibleSolutions((current) => new Set([...current].filter((key) => key !== `${topic}:${questionToDelete.id}`)))
    setFavoriteNotice('Question deleted from the topic bank and Favorites.')
    if (questionToDelete.source === 'oral') onStop()
    setQuestionToDelete(null)
  }

  async function copyPracticeQuestion(question: Question) {
    try {
      await navigator.clipboard.writeText(question.text)
      setFavoriteNotice('Question copied to clipboard.')
    } catch {
      setFavoriteNotice('Clipboard access is unavailable. Select and copy the question text after showing it.')
    }
  }

  function showAllAnswers() {
    setVisibleAnswers(new Set(writtenQuestions.map(({ key }) => key)))
  }

  function showAllSolutions() {
    setVisibleSolutions(new Set(writtenQuestions.map(({ key }) => key)))
  }

  function hideAllWrittenAnswers() {
    setVisibleAnswers(new Set())
    setVisibleSolutions(new Set())
  }

  function toggleWrittenVisibility(key: string, kind: 'answer' | 'solution') {
    const setVisibility = kind === 'answer' ? setVisibleAnswers : setVisibleSolutions
    setVisibility((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function changePreference(topic: Topic, preference: StudyData['topicPreferences'][Topic]) {
    onChangeData({ ...data, topicPreferences: { ...data.topicPreferences, [topic]: preference } })
  }

  function choosePreset(preset: Preset) {
    onChangeData(applyPreset(data, preset))
  }

  function toggleStudyFavorite(topic: Topic, item: Question, number: number) {
    const favoriteToToggle = createStudyFavorite(topic, item, number)
    const id = favoriteToToggle.id
    const storage = loadCompetitionStorage()
    const favorites = storage.favorites.some((favorite) => favorite.id === id)
      ? storage.favorites.filter((favorite) => favorite.id !== id)
      : [favoriteToToggle, ...storage.favorites]

    if (!saveCompetitionStorage({ ...storage, favorites })) {
      setFavoriteNotice('Could not save favorite. Check browser storage and try again.')
      return
    }
    setFavoriteIds(new Set(favorites.map((favorite) => favorite.id)))
    setFavoriteNotice(favorites.some((favorite) => favorite.id === id) ? 'Question saved to Favorites.' : 'Question removed from Favorites.')
  }

  function renderTopic(topic: Topic) {
    const preference = data.topicPreferences[topic]
    const hasLectureNotes = topicsWithLectureNotes.has(topic)
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
        <button
          className={`topic-open-lecture${hasLectureNotes ? ' has-lecture-notes' : ''}`}
          type="button"
          aria-label={`Open ${topic} lecture${hasLectureNotes ? ' (notes available)' : ''}`}
          onClick={() => {
            onStop()
            setLectureTopic(topic)
          }}
        >
          Open lecture
        </button>
      </div>
    )
  }

  const topicControls = (
    <>
      <div className="topic-list" aria-label={`${visibleGroup.name} topics`}>
        {visibleGroup.name === 'Electrical Engineering' ? (
          <>
            {[{ name: 'Electrical Fundamentals', topics: EE_FOUNDATION_TOPICS }, ...EE_TOPIC_SECTIONS].map((section) => (
              <details className="topic-list-section" key={section.name} open>
                <summary>
                  <h3>{section.name}</h3>
                  <span className="topic-list-section-count">{section.topics.length}</span>
                </summary>
                {section.topics.map(renderTopic)}
              </details>
            ))}
          </>
        ) : visibleGroup.topics.map(renderTopic)}
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
          onChange={(event) => onChangeData({ ...data, settings: { ...data.settings, timeFilter: event.currentTarget.value === 'any' ? 'any' : Number(event.currentTarget.value) as 15 | 20 | 30 | 60 | 120 } })}
        >
          <option value="any">Any</option>
          <option value="15">Only 15s</option>
          <option value="20">Only 20s</option>
          <option value="30">Only 30s</option>
          <option value="60">Only 60s</option>
          <option value="120">Only 2m</option>
        </select>
      </details>
    </>
  )

  return (
    <>
      {!lectureTopic && <section ref={dailyFocusRef} className={`study-daily-focus${dailyFocusIsStuck ? ' is-stuck' : ''}`} aria-label="Daily study goal">
        <div className="study-daily-focus-top">
          <p className="study-streak"><span aria-hidden="true">✦</span> {dailyStreak}-day streak</p>
          <p className="study-daily-goal">
            <strong>{todayCorrect}</strong> / {DAILY_CORRECT_GOAL} correct today
            <span> · {Math.max(0, DAILY_CORRECT_GOAL - todayCorrect)} to go</span>
          </p>
        </div>
        <progress
          aria-label={`${todayCorrect} correct answers today; daily goal ${DAILY_CORRECT_GOAL}`}
          max={DAILY_CORRECT_GOAL}
          value={Math.min(todayCorrect, DAILY_CORRECT_GOAL)}
        />
      </section>}
      {lectureTopic ? (
        <LectureScreen
          topic={lectureTopic}
          onBack={() => setLectureTopic(null)}
          onStartWrittenTest={() => startLectureWrittenTest(lectureTopic)}
          onChangeTopic={setLectureTopic}
          onManageQuestions={() => onManageTopic(lectureTopic)}
          onNotesChange={(topic, hasNotes) => {
            setTopicsWithLectureNotes((current) => {
              const next = new Set(current)
              if (hasNotes) next.add(topic)
              else next.delete(topic)
              return next
            })
          }}
        />
      ) : <div className={`study-layout${writtenTest ? ' is-written-test' : ''}`}>
      <section className="topic-panel" aria-labelledby="topics-heading">
        <div className="view-heading">
          <p className="eyebrow">{writtenTest ? 'Self-paced review' : 'Build your round'}</p>
          <h1 id="topics-heading">{writtenTest ? 'Written test' : 'Choose topics'}</h1>
          <p className="topic-priority-help" id="topic-priority-help">
            {writtenTest
              ? writtenTopic === 'random'
                ? 'Questions are drawn randomly from all available topics, weighted by their priorities. Nothing is read aloud or timed.'
                : `Showing ${writtenTopic} questions. Nothing is read aloud or timed.`
              : 'Priority controls how often a topic is picked: 1x is standard, 5x is five times as likely, and 0 is off. The percentage shows its share of the active pool.'}
          </p>
          {writtenTest && (
            <label className="written-topic-picker">
              <span>Topic</span>
              <select
                value={writtenTopic}
                onChange={(event) => {
                  const selection = event.currentTarget.value
                  if (selection === 'random' || isTopic(selection)) {
                    setWrittenTopic(selection)
                    setIncludeAllTopicQuestions(false)
                    setReturnToLectureTopic(null)
                  }
                }}
              >
                <option value="random">Random (weighted by priority)</option>
                {TOPIC_GROUPS.flatMap((group) => group.name === 'Electrical Engineering'
                  ? [
                    <optgroup key="ee-foundations" label="EE · Electrical Fundamentals">
                      {EE_FOUNDATION_TOPICS.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                    </optgroup>,
                    ...EE_TOPIC_SECTIONS.map((section) => (
                      <optgroup key={section.name} label={`EE · ${section.name}`}>
                        {section.topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                      </optgroup>
                    )),
                  ]
                  : [
                    <optgroup key={group.name} label={group.name}>
                      {group.topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                    </optgroup>,
                  ])}
              </select>
            </label>
          )}
        </div>

        <div className="study-topic-toolbar">
          {!writtenTest && (
            <div className="segmented-control topic-group-toggle" role="group" aria-label="Topic group">
              {TOPIC_GROUPS.map((group) => (
                <button
                  key={group.name}
                  type="button"
                  aria-label={group.name}
                  aria-pressed={activeGroup === group.name}
                  onClick={() => onGroupChange(group.name)}
                >
                  {group.name === 'Math' ? 'Math' : group.name === 'ESAS' ? 'ESAS' : 'EE'}
                </button>
              ))}
            </div>
          )}
          <div className="segmented-control study-mode-toggle" role="group" aria-label="Study mode">
            <button
              type="button"
              aria-pressed={!writtenTest}
              onClick={() => {
                setReturnToLectureTopic(null)
                setWrittenTest(false)
              }}
            >
              Oral Practice
            </button>
            <button
              type="button"
              aria-pressed={writtenTest}
              onClick={() => {
                if (writtenTest) return
                onStop()
                setReturnToLectureTopic(null)
                setWrittenTest(true)
              }}
            >
              Written test
            </button>
          </div>
        </div>

        {!writtenTest && topicControls}
      </section>

      {writtenTest ? (
        <section ref={writtenPanelRef} className="written-test-panel" aria-label="Written test questions" data-scroll-key={writtenTopic}>
          {returnToLectureTopic && (
            <button className="lecture-back-button written-test-back-to-lecture" type="button" onClick={returnToLectureNotes}>
              <span aria-hidden="true">←</span> Back to {returnToLectureTopic} notes
            </button>
          )}
          <div className="written-test-toolbar">
            <label className="written-count-picker">
              <span>Questions</span>
              <select value={writtenQuestionLimit} onChange={(event) => setWrittenQuestionLimit(event.currentTarget.value === 'all' ? 'all' : Number(event.currentTarget.value))}>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="30">30</option>
                <option value="50">50</option>
                <option value="all">All ({allWrittenQuestions.length})</option>
              </select>
            </label>
            <p>{writtenQuestions.length} of {allWrittenQuestions.length} question{allWrittenQuestions.length === 1 ? '' : 's'}</p>
            <p className="written-goal-hint">Mark answers; correct ones count toward your daily Mock Competition goal.</p>
            <div className="action-row">
              <button className="secondary-action" type="button" onClick={() => setWeightsDialogOpen(true)}>Topic weights</button>
              <button className="secondary-action" type="button" disabled={!allWrittenQuestions.length} onClick={reloadWrittenQuestions}>Reload questions</button>
              <button className="secondary-action" type="button" disabled={!writtenQuestions.length} onClick={showAllAnswers}>Show all answers</button>
              <button className="secondary-action" type="button" disabled={!writtenQuestions.length} onClick={showAllSolutions}>Show all solutions</button>
              <button className="secondary-action" type="button" disabled={!visibleAnswers.size && !visibleSolutions.size} onClick={hideAllWrittenAnswers}>Hide all</button>
            </div>
          </div>
          {writtenQuestions.length ? (
            <ol className="written-question-list">
              {writtenQuestions.map(({ topic, question: item, key }, index) => (
                <li className="written-question-card" key={key}>
                  <div className="written-question-heading">
                    <p className="written-question-meta">{index + 1}. {topic}</p>
                    <div className="written-question-tools">
                      <div className={`written-question-actions-disclosure${openWrittenActionsKey === key ? ' is-open' : ''}`}>
                        <button
                          className="written-question-actions-toggle"
                          type="button"
                          aria-label={`More actions for question ${index + 1}`}
                          aria-expanded={openWrittenActionsKey === key}
                          title="More actions"
                          onClick={() => setOpenWrittenActionsKey((openKey) => openKey === key ? null : key)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
                        </button>
                        <div className="written-question-actions-icons">
                      <button
                        className={`written-note-button${item.note ? ' has-note' : ''}`}
                        type="button"
                        aria-label={item.note ? `View or edit note for question ${index + 1}` : `Add note for question ${index + 1}`}
                        title={item.note ? 'View or edit note' : 'Add note'}
                        onClick={() => openQuestionNote(topic, item)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.75h14a1.25 1.25 0 0 1 1.25 1.25v14A1.25 1.25 0 0 1 19 20.25H5A1.25 1.25 0 0 1 3.75 19V5A1.25 1.25 0 0 1 5 3.75Z" /><path d="M7.5 8h9M7.5 12h9M7.5 16h5" /></svg>
                      </button>
                      <button
                        className={`written-favorite-button${favoriteIds.has(`study:${encodeURIComponent(topic)}:${encodeURIComponent(item.id)}`) ? ' is-favorite' : ''}`}
                        type="button"
                        aria-label={favoriteIds.has(`study:${encodeURIComponent(topic)}:${encodeURIComponent(item.id)}`) ? 'Remove this question from favorites' : 'Save this question to favorites'}
                        aria-pressed={favoriteIds.has(`study:${encodeURIComponent(topic)}:${encodeURIComponent(item.id)}`)}
                        onClick={() => toggleStudyFavorite(topic, item, index + 1)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></svg>
                      </button>
                      <button
                        className="secondary-action practice-copy-button"
                        type="button"
                        aria-label={`Copy question ${index + 1}`}
                        title="Copy question"
                        onClick={() => copyPracticeQuestion(item)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="1.5" /><path d="M16 8V5a1.5 1.5 0 0 0-1.5-1.5h-9A1.5 1.5 0 0 0 4 5v11a1.5 1.5 0 0 0 1.5 1.5H8" /></svg>
                        <span>Copy question</span>
                      </button>
                      <a
                        className="secondary-action practice-search-button"
                        href={`https://www.google.com/search?q=${encodeURIComponent(questionSearchText(item))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Search question ${index + 1} on Google`}
                        title="Search question"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
                        <span>Search question</span>
                      </a>
                      <button
                        className="written-delete-button"
                        type="button"
                        aria-label={`Delete question ${index + 1} from ${topic}`}
                        onClick={() => setQuestionToDelete({ topic, id: item.id, text: item.text, source: 'written' })}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5" /></svg>
                        <span>Delete</span>
                      </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="written-question-text"><MathText text={item.text} /></div>
                  <div className="written-question-actions" role="group" aria-label={`Question ${index + 1} actions`}>
                    <button
                      className="secondary-action"
                      type="button"
                      aria-expanded={visibleAnswers.has(key)}
                      onClick={() => toggleWrittenVisibility(key, 'answer')}
                    >
                      {visibleAnswers.has(key) ? 'Hide answer' : 'Show answer'}
                    </button>
                    <button
                      className="secondary-action"
                      type="button"
                      aria-expanded={visibleSolutions.has(key)}
                      onClick={() => toggleWrittenVisibility(key, 'solution')}
                    >
                      {visibleSolutions.has(key) ? 'Hide solution' : 'Show solution'}
                    </button>
                    <button
                      className={`secondary-action written-rating-button${writtenOutcomes[`${localDateKey()}:${key}`] === 'gotIt' ? ' is-correct' : ''}`}
                      type="button"
                      aria-label={`Mark question ${index + 1} correct`}
                      title="Mark correct"
                      aria-pressed={writtenOutcomes[`${localDateKey()}:${key}`] === 'gotIt'}
                      disabled={writtenOutcomes[`${localDateKey()}:${key}`] !== undefined}
                      onClick={() => markWrittenOutcome(key, 'gotIt')}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    </button>
                    <button
                      className={`secondary-action written-rating-button${writtenOutcomes[`${localDateKey()}:${key}`] === 'missedIt' ? ' is-wrong' : ''}`}
                      type="button"
                      aria-label={`Mark question ${index + 1} incorrect`}
                      title="Mark incorrect"
                      aria-pressed={writtenOutcomes[`${localDateKey()}:${key}`] === 'missedIt'}
                      disabled={writtenOutcomes[`${localDateKey()}:${key}`] !== undefined}
                      onClick={() => markWrittenOutcome(key, 'missedIt')}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                    </button>
                  </div>
                  {(visibleAnswers.has(key) || visibleSolutions.has(key)) && (
                    <div className="study-answer-panel written-answer-panel">
                      {visibleAnswers.has(key) && <div><strong>Answer:</strong>{' '}<MathText text={item.answer ?? 'No answer was included for this question.'} /></div>}
                      {visibleSolutions.has(key) && <div><strong>Solution:</strong>{' '}<MathText text={item.solution ?? 'No worked solution was included for this question.'} /></div>}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">
              {writtenTopic === 'random'
                ? 'No questions match your active topics and time filter. Enable a topic, increase its priority, or change the time filter to see questions here.'
                : `No ${writtenTopic} questions match the current time filter.`}
            </p>
          )}
          {favoriteNotice && <p className="session-notice" role="status">{favoriteNotice}</p>}
        </section>
      ) : <section className="session-panel" aria-label="Question session">
        <div className="timer-wrap">
          {currentTopic && currentQuestion && currentStudyFavoriteId && (
            <div className="practice-question-tools">
              <button
                className={`practice-note-button${currentQuestionNote ? ' has-note' : ''}`}
                type="button"
                aria-label={currentQuestionNote ? 'View or edit question note' : 'Add a note to this question'}
                onClick={() => openQuestionNote(currentTopic, currentQuestion)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.75h14a1.25 1.25 0 0 1 1.25 1.25v14A1.25 1.25 0 0 1 19 20.25H5A1.25 1.25 0 0 1 3.75 19V5A1.25 1.25 0 0 1 5 3.75Z" /><path d="M7.5 8h9M7.5 12h9M7.5 16h5" /></svg>
                {currentQuestionNote ? 'View note' : 'Add note'}
              </button>
              <button
                className={`written-favorite-button practice-favorite-button${favoriteIds.has(currentStudyFavoriteId) ? ' is-favorite' : ''}`}
                type="button"
                aria-label={favoriteIds.has(currentStudyFavoriteId) ? 'Remove this question from favorites' : 'Save this question to favorites'}
                aria-pressed={favoriteIds.has(currentStudyFavoriteId)}
                title={favoriteIds.has(currentStudyFavoriteId) ? 'Remove from Favorites' : 'Save to Favorites'}
                onClick={() => toggleStudyFavorite(currentTopic, currentQuestion, currentQuestionNumber)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></svg>
              </button>
              <button
                className="secondary-action practice-copy-button"
                type="button"
                onClick={() => copyPracticeQuestion(currentQuestion)}
              >
                Copy question
              </button>
              <a
                className="secondary-action practice-search-button"
                href={`https://www.google.com/search?q=${encodeURIComponent(currentQuestionSearchText)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Search question
              </a>
              <button
                className="written-delete-button practice-delete-button"
                type="button"
                onClick={() => setQuestionToDelete({
                  topic: currentTopic,
                  id: currentQuestion.id,
                  text: currentQuestion.text,
                  source: 'oral',
                })}
              >
                Delete
              </button>
            </div>
          )}
          <p className={`session-state${timeIsUp ? ' is-alert' : ''}`} aria-live="polite">
            {timeIsUp ? "Time's up!" : phase === 'speaking' ? 'Listen' : phase === 'paused' ? 'Paused' : phase === 'countdown' ? '' : phase === 'revealed' || phase === 'rated' ? 'Question' : 'Ready'}
          </p>
          <div className={`timer${phase === 'countdown' && remainingSeconds <= 5 ? ' timer-urgent' : ''}`} role="timer" aria-live="off" aria-label={`${formatTime(remainingSeconds)} remaining`} style={timeStyle}>
            {formatTime(remainingSeconds)}
          </div>
          <div className="timer-track" aria-hidden="true"><span /></div>
          {currentTopic && phase !== 'countdown' && <p className="current-topic">{currentTopic}</p>}
          {questionVisible && currentQuestion && <MathText text={currentQuestion.text} className="revealed-question" />}
          {favoriteNotice && <p className="session-notice" role="status">{favoriteNotice}</p>}
          {(timeIsUp || answerVisible) && currentQuestion && <div className="study-answer-panel">
            <div><strong>Answer:</strong>{' '}<MathText text={currentQuestion.answer ?? 'No answer was included for this question.'} /></div>
            <div><strong>Solution:</strong>{' '}<MathText text={currentQuestion.solution ?? 'No worked solution was included for this question.'} /></div>
          </div>}
          {notice && <p className="session-notice" role="status">{notice}</p>}

          {!active && !ended && (
            <button className="primary-action" type="button" disabled={selectedCount === 0} onClick={onRead}>
              Read question
            </button>
          )}

          {phase === 'speaking' && (
            <div className="action-row">
              <button className="secondary-action" type="button" onClick={onToggleQuestion}>{questionVisible ? 'Hide question' : 'Show question'}</button>
              <button className="secondary-action" type="button" onClick={onToggleAnswer}>{answerVisible ? 'Hide answer' : 'Show answer'}</button>
              <button className="secondary-action" type="button" onClick={onPause}>Pause</button>
              <button className="secondary-action" type="button" onClick={onStop}>Clear session</button>
              <button className="secondary-action" type="button" onClick={onSkip}>Skip</button>
              {answerVisible && <button className="primary-action" type="button" onClick={onNext}>Next question</button>}
            </div>
          )}

          {phase === 'countdown' && (
            <div className="action-grid">
              <button className="secondary-action" type="button" onClick={onRepeat}>Hear it again</button>
              <button className="secondary-action" type="button" onClick={onToggleQuestion}>{questionVisible ? 'Hide question' : 'Show question'}</button>
              <button className="secondary-action" type="button" onClick={onToggleAnswer}>{answerVisible ? 'Hide answer' : 'Show answer'}</button>
              <button className="secondary-action" type="button" onClick={onPause}>Pause</button>
              <button className="secondary-action" type="button" onClick={onStop}>Clear session</button>
              <button className="secondary-action" type="button" onClick={onSkip}>Skip</button>
              {answerVisible && <button className="primary-action" type="button" onClick={onNext}>Next question</button>}
            </div>
          )}

          {phase === 'paused' && (
            <div className="action-grid">
              <button className="primary-action" type="button" onClick={onResume}>Resume</button>
              <button className="secondary-action" type="button" onClick={onToggleQuestion}>{questionVisible ? 'Hide question' : 'Show question'}</button>
              <button className="secondary-action" type="button" onClick={onToggleAnswer}>{answerVisible ? 'Hide answer' : 'Show answer'}</button>
              <button className="secondary-action" type="button" onClick={onStop}>Clear session</button>
              <button className="secondary-action" type="button" onClick={onSkip}>Skip</button>
              {answerVisible && <button className="primary-action" type="button" onClick={onNext}>Next question</button>}
            </div>
          )}

          {phase === 'time-up' && (
            <div className="action-grid">
              <button className="secondary-action" type="button" onClick={onToggleQuestion}>{questionVisible ? 'Hide question' : 'Show question'}</button>
              <button className="secondary-action" type="button" onClick={onStop}>Clear session</button>
              <button className="primary-action" type="button" onClick={onNext}>Next question</button>
            </div>
          )}

          {(phase === 'revealed' || phase === 'rated') && (
            <div className="action-grid">
              <button className="secondary-action" type="button" onClick={onStop}>Clear session</button>
              <button className="primary-action" type="button" onClick={onNext}>Next question</button>
            </div>
          )}

          {currentQuestion && phase !== 'ready' && !rated && <div className="action-row study-outcome-actions" role="group" aria-label="Mark your answer">
            <button
              className="secondary-action written-rating-button study-rating-button is-correct"
              type="button"
              aria-label="I got it right"
              title="I got it right"
              onClick={() => onRate('gotIt')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </button>
            <button
              className="secondary-action written-rating-button study-rating-button is-wrong"
              type="button"
              aria-label="I got it wrong"
              title="I got it wrong"
              onClick={() => onRate('missedIt')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>}

        </div>
      </section>}
      <dialog
        ref={weightsDialogRef}
        className="written-weights-dialog"
        aria-labelledby="written-weights-title"
        onClose={() => setWeightsDialogOpen(false)}
        onCancel={(event) => {
          event.preventDefault()
          closeWeightsDialog()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeWeightsDialog()
        }}
      >
        <div className="written-weights-heading">
          <div>
            <p className="eyebrow">Written test</p>
            <h2 id="written-weights-title">Topic weights</h2>
            <p>These settings are shared with Oral Practice. Set each topic from off (0) to five times priority (5x).</p>
          </div>
          <button className="text-action" type="button" onClick={closeWeightsDialog}>Close</button>
        </div>
        {topicControls}
      </dialog>
      <dialog
        ref={deleteDialogRef}
        className="written-delete-dialog"
        aria-labelledby="written-delete-title"
        onClose={() => setQuestionToDelete(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) deleteDialogRef.current?.close()
        }}
      >
        <p className="eyebrow">Delete question</p>
        <h2 id="written-delete-title">Delete this question?</h2>
        {questionToDelete && (
          <>
            <p className="written-delete-topic">{questionToDelete.topic}</p>
            <MathText text={questionToDelete.text} className="written-delete-question" />
          </>
        )}
        <p className="written-delete-warning">This removes the question from its topic bank and removes its saved Study favorite. This cannot be undone.</p>
        <div className="written-delete-actions">
          <button className="text-action" type="button" onClick={() => deleteDialogRef.current?.close()}>Cancel</button>
          <button className="primary-action" type="button" onClick={deleteWrittenQuestion}>Delete question</button>
        </div>
      </dialog>
      <dialog
        ref={noteDialogRef}
        className="question-note-dialog"
        aria-labelledby="question-note-title"
        onClose={() => setNoteTarget(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeNoteDialog()
        }}
      >
        <div className="question-note-heading">
          <div>
            <p className="eyebrow">{noteTarget?.topic ?? 'Study question'}</p>
            <h2 id="question-note-title">{noteMode === 'preview' ? 'Question note' : noteTarget?.question.note ? 'Edit question note' : 'Add a question note'}</h2>
          </div>
          <button className="text-action" type="button" onClick={closeNoteDialog}>Close</button>
        </div>
        {noteTarget && <MathText text={noteTarget.question.text} className="question-note-prompt-question" />}
        {noteMode === 'preview' && noteTarget?.question.note ? (
          <button
            className="question-note-preview"
            type="button"
            aria-label="Edit this note"
            onClick={() => {
              setNoteDraft(noteTarget.question.note ?? '')
              setNoteMode('edit')
            }}
          >
            <strong>Click note to edit</strong>
            <MathText text={noteTarget.question.note} />
          </button>
        ) : (
          <>
            <label className="question-note-label" htmlFor="question-note-text">Formula shortcut or note</label>
            <textarea
              id="question-note-text"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.currentTarget.value)}
              placeholder="Add a shortcut, formula, or reminder. LaTeX such as $E=mc^2$ is supported."
              rows={4}
            />
            <details className="question-note-ai-prompt">
              <summary>AI prompt for a formula shortcut</summary>
              {noteTarget && (
                <>
                  <textarea
                    aria-label="AI prompt for a formula shortcut"
                    readOnly
                    rows={8}
                    value={questionNotePrompt(noteTarget)}
                  />
                  <button className="secondary-action" type="button" onClick={() => { void copyNotePrompt() }}>Copy AI prompt</button>
                </>
              )}
            </details>
          </>
        )}
        {noteNotice && <p className="session-notice" role="status">{noteNotice}</p>}
        <div className="question-note-actions">
          {noteMode === 'preview' ? (
            <button className="text-action" type="button" onClick={closeNoteDialog}>Close</button>
          ) : (
            <>
              <button className="text-action" type="button" onClick={closeNoteDialog}>Cancel</button>
              <button className="primary-action" type="button" onClick={saveQuestionNote}>Save note</button>
            </>
          )}
        </div>
      </dialog>
      </div>}
    </>
  )
}
