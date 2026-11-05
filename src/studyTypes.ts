export const MATH_TOPICS = [
  'Foundational Math',
  'Mathematical Trivia',
  'Algebra',
  'Trigonometry',
  'Analytical Geometry',
  'Solid Mensuration',
  'Power Series & Fourier Series Analysis',
  'Differential Calculus',
  'Integral Calculus',
  'Series and Multivariable Calculus',
  'Linear Algebra',
  'Laplace Transform',
  'Matrices',
  'Probability and Statistics',
  'Advanced Mathematics',
  'Differential Equations',
  'Discrete Math',
] as const

export const EE_FOUNDATION_TOPICS = [
  'Electricity: Basic Principles',
  'Electrostatics',
  'Magnetic Circuits',
] as const

export const EE_TOPIC_SECTIONS = [
  {
    name: 'Circuits & Measurements',
    topics: [
      'Network Laws',
      'DC Circuits',
      'AC Circuits',
      'AC Polyphase',
      'Electrical Transients',
      'Instruments & Measurements',
    ],
  },
  {
    name: 'Electrical Machines',
    topics: [
      'DC Generators',
      'DC Motors',
      'Transformers',
      'AC Generators (Alternators)',
      'AC Motors',
    ],
  },
  {
    name: 'Power Systems',
    topics: [
      'Power Plant',
      'Transmission Lines',
      'Power System Analysis',
      'Distribution Systems',
      'Power System Protection',
      'Power System Operation',
      'Power System Transients',
    ],
  },
  {
    name: 'Energy Storage & Renewables',
    topics: [
      'BESS',
      'Solar PV & Wind',
    ],
  },
  {
    name: 'Electronics, Digital & Control',
    topics: [
      'Electronics',
      'Power Electronics',
      'Digital Design',
      'Feedback & Control Systems',
      'Instrumentation & Control',
    ],
  },
  {
    name: 'Electrical Design & Utilization',
    topics: [
      'Illumination',
      'PEC & Wiring Design',
    ],
  },
] as const

export const EE_TOPICS = [
  ...EE_FOUNDATION_TOPICS,
  ...EE_TOPIC_SECTIONS.flatMap((section) => section.topics),
] as const

export const ESAS_TOPICS = [
  'Physics',
  'Fluid Mechanics',
  'Deformable Bodies',
  'Engineering Mechanics',
  'EE Laws',
  'Engineering Economics',
  'Numerical Methods',
  'Engineering Management',
  'BOSH',
  'Chemistry',
  'Computer Programming',
  'Thermodynamics',
  'Materials Science and Engineering',
] as const

export const TOPIC_GROUPS = [
  { name: 'Math', topics: MATH_TOPICS },
  { name: 'Electrical Engineering', topics: EE_TOPICS },
  { name: 'ESAS', topics: ESAS_TOPICS },
] as const

export type TopicGroupName = (typeof TOPIC_GROUPS)[number]['name']

export const TOPICS = [...MATH_TOPICS, ...EE_TOPICS, ...ESAS_TOPICS] as const

export const PREFERRED_VOICE_NAME = 'Microsoft Liam Online (Natural)'

export type Topic = (typeof TOPICS)[number]
export const EE_TOPIC_GUIDANCE: Partial<Record<Topic, string>> = {
  Electronics: 'Diodes, transistors, and operational amplifiers (op-amps).',
  'Power Electronics': 'Rectifiers, inverters, and converters.',
  'Digital Design': 'Boolean algebra, logic gates, and combinational and sequential circuits.',
  'Feedback & Control Systems': 'Transfer functions, stability, and time and frequency response.',
  'Instrumentation & Control': 'Sensors, transducers, signal conditioning, PLCs, and SCADA.',
}

export const LEGACY_TOPIC_ALIASES: Partial<Record<string, Topic>> = {
  'DC Machines': 'DC Generators',
  'AC Machines': 'AC Motors',
  'Power Systems': 'Power System Analysis',
  'Distribution System': 'Distribution Systems',
  'Transient Analysis': 'Electrical Transients',
  'Control Systems': 'Feedback & Control Systems',
  'Polyphase Circuits': 'AC Polyphase',
}

export type SpeechSpeed = 'slow' | 'normal' | 'fast'
export type TimeFilter = 'any' | 15 | 20 | 30 | 60 | 120
export type Preset = 'all-equal' | 'only-selected' | 'focus-weakest'

export const ALLOWED_DURATIONS = [15, 20, 30, 45, 60, 90, 120, 150, 180] as const
export type AllowedDuration = (typeof ALLOWED_DURATIONS)[number]

export interface Question {
  id: string
  text: string
  seconds: AllowedDuration
  spokenText?: string
  answer?: string
  spokenAnswer?: string
  solution?: string
  note?: string
}

export interface TopicPreference {
  active: boolean
  weight: number
}

export interface TopicResult {
  gotIt: number
  missedIt: number
}

export interface StudySettings {
  defaultSeconds: AllowedDuration
  speechSpeed: SpeechSpeed
  voiceURI: string
  announceDuration: boolean
  timeFilter: TimeFilter
}

export interface StudyData {
  version: 1
  questionBanks: Record<Topic, Question[]>
  topicPreferences: Record<Topic, TopicPreference>
  settings: StudySettings
  usedQuestionIds: Record<Topic, string[]>
  results: Record<Topic, TopicResult>
}
