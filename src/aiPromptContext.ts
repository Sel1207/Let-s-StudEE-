import { EE_TOPICS, ESAS_TOPICS, LEGACY_TOPIC_ALIASES, MATH_TOPICS, TOPICS } from './studyTypes'

const EVENT_NAMES = {
  math: 'IIEE National Math Wizard',
  ee: 'IIEE National Quiz Show',
  esas: 'IIEE ESAS',
} as const

function subjectKey(subject: string): string {
  return subject.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

function contestEvent(subject: string): string {
  const key = subjectKey(subject)
  if (['ee', 'electrical engineering', 'national quiz show', 'iiee national quiz show'].includes(key)) {
    return EVENT_NAMES.ee
  }
  if (['esas', 'iiee esas'].includes(key)) return EVENT_NAMES.esas

  const topic = TOPICS.find((item) => subjectKey(item) === key)
    ?? Object.entries(LEGACY_TOPIC_ALIASES).find(([alias]) => subjectKey(alias) === key)?.[1]
  if (topic && EE_TOPICS.some((item) => item === topic)) return EVENT_NAMES.ee
  if (topic && ESAS_TOPICS.some((item) => item === topic)) return EVENT_NAMES.esas
  if (topic && MATH_TOPICS.some((item) => item === topic)) return EVENT_NAMES.math

  return key.includes('quiz show') || key === 'ee' ? EVENT_NAMES.ee
    : key.includes('esas') ? EVENT_NAMES.esas
      : EVENT_NAMES.math
}

export function contestPreparationContext(subject: string): string {
  return `CONTEST PREPARATION CONTEXT
I am preparing for the upcoming ${contestEvent(subject)}. Keep any study material focused on the exact topic requested below. Do not add generic contest-preparation material, unrelated topic content, forecasts, or invented questions unless explicitly requested.`
}

export function topicScopeInstruction(topic: string): string {
  return `STRICT TOPIC SCOPE
The only requested topic is "${topic}". Use the source only to find or explain material whose main concept is specifically part of "${topic}".
- Include a question only when solving it directly tests "${topic}". A passing mention, shared formula, or incidental use of another topic is not enough.
- If a question has separable parts from different topics, include only the part(s) that directly test "${topic}", keeping any context needed to make them solvable. Exclude unrelated parts.
- Do not broaden this into a survey, crash course, master course, or notes on neighboring topics. Briefly mention another concept only when essential to explain "${topic}".
- Never move out-of-scope material into a note, explanation, example, or solution. For question-extraction tasks, return an empty array if the source has no matching questions.`
}

export function shortcutGuidanceInstruction(topic: string): string {
  return `USEFUL SHORTCUTS
- Include a valid, time-saving shortcut for "${topic}" when one genuinely applies; do not force one or invent a rule.
- State the recognizable given case or conditions and connect them directly to the shortcut, such as: "When [this case/given] occurs, use [this shortcut]."
- Show the shortcut formula or steps, briefly explain why it works, and mention important assumptions or limits. Distinguish exact shortcuts from approximations.
- Keep every shortcut within the requested topic and relevant to the supplied question or notes.`
}

export function noteDetailsPrompt(details: Record<string, string>, { subject = 'this question', titled = false } = {}): string {
  const lines = Object.entries(details).map(([label, value]) => `${label}: ${value}`).join('\n')
  return `CHECK MY IDEA
At the end of this message, I state the shortcut, idea, or reminder I noticed for ${subject}. Check whether it is correct and when it applies. Before the code block, say in one line that it is correct, or briefly explain what I got wrong and why. If I stated nothing, ask me what I noticed and do not write a note yet.

COPYABLE OUTPUT
Write a note in English that captures what I noticed, using the corrected version if I made a mistake. Return it as plain text inside exactly one \`\`\`text code block, and put only the note inside the block. Do not use nested code fences. Keep all LaTeX as raw source with its $...$ or $$...$$ delimiters.
Format the note so it is easy to scan: short lines, a blank line between ideas, "- " for bullets, and "1. " for steps. Do not use headings, bold, or tables.${titled ? '\nPut a short title of 3 to 8 words on the first line, with no "Title:" label, using $...$ for any math in it. Then leave a blank line and write the note.' : ''}

${selfCheckInstruction({ solutions: false })}

${lines}

What I noticed: `
}

export const SVG_SUBSCRIPT_EXAMPLE = '<text x="40" y="30" font-size="14" font-family="sans-serif">I<tspan baseline-shift="sub" font-size="10">L</tspan></text>'

/**
 * The closing instruction for every AI prompt: the AI reviews and fixes its own draft before
 * replying. Subscripts get special attention, because AIs often leave raw "I_L" or "N_L" in plain
 * text and in diagram labels, where it shows up literally instead of as a subscript.
 */
export function selfCheckInstruction({ diagrams = false, spoken = false, solutions = true } = {}): string {
  const checks = [
    solutions
      ? '- Accuracy: independently re-solve every calculation and re-derive every formula. Check each number, sign, unit, prefix, and rounding, and confirm every answer matches its solution and the source. If anything disagrees, find the error and correct it.'
      : '- Accuracy: confirm every fact, formula, number, sign, and unit is correct. If you find a mistake, correct it.',
    '- Completeness: confirm nothing the instructions require was skipped, merged, or cut short, and nothing was invented.',
    '- Notation: every variable with a subscript or superscript, every symbol, and every equation outside a diagram must be inside $...$ (write $I_L$, $N_L$, $V_{s}$, $x^2$, never bare I_L, N_L, V_s, or x^2). Check that every $ has a partner, braces are balanced, and the LaTeX renders in KaTeX.',
    ...(diagrams ? [
      `- Diagrams: SVG text cannot show LaTeX, so no label may contain _, ^, $, or a backslash. Write each subscript with a tspan instead, for example ${SVG_SUBSCRIPT_EXAMPLE} for I with subscript L. Confirm every component, value, label, current direction, and polarity matches the explanation, labels do not overlap lines or each other, and only the allowed SVG elements are used.`,
    ] : []),
    ...(spoken ? ['- Read-aloud fields: no LaTeX, dollar signs, backslashes, underscores, or unexplained symbols; each one says the same thing as its display field.'] : []),
    '- Format: the output follows the requested format exactly, with every required field and no extra text beyond what the instructions allow.',
  ]
  return `DOUBLE-CHECK YOUR WORK BEFORE ANSWERING
Do not send your first draft. Review the whole draft line by line against the source and these instructions, fix every problem you find, then review the fixes once more. Return only the corrected final version; do not include the review or any commentary about it.
${checks.join('\n')}`
}

export function stripOuterCodeFence(value: string): string {
  const fenced = /^\s*```[^\r\n]*\r?\n([\s\S]*?)\r?\n?```\s*$/.exec(value)
  return (fenced ? fenced[1] : value).trim()
}

export const STUDY_BANK_CHOICE_POLICY = `QUESTION FORMAT
- For problem-solving questions that require calculations, derivations, or applying a method, always make them open-ended. If the source provides answer choices, remove every choice from "question" and "questionReadAloud", and phrase the question so the student must solve it without seeing options. Keep all necessary givens; provide the correct result and full solution in the answer fields.
- For conceptual, definition, or identification questions, decide whether answer choices genuinely help assess the concept. You may retain useful choices in the question when appropriate, or make it open-ended. Do not include choices just because the source has them.
- Never put choice lists, option letters, or the correct option among the displayed or spoken question text for a problem-solving question.`
