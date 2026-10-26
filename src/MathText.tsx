import katex from 'katex'
import 'katex/dist/katex.min.css'
import './mathText.css'

function mathHtml(expression: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expression, { displayMode, throwOnError: false, strict: 'ignore' })
  } catch {
    return expression
  }
}

export default function MathText({ text, className }: { text: string; className?: string }) {
  const chunks = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g)
  return <span className={className}>{chunks.map((chunk, index) => {
    const displayMode = chunk.startsWith('$$') || chunk.startsWith('\\[')
    const inline = (chunk.startsWith('$') && chunk.endsWith('$')) || (chunk.startsWith('\\(') && chunk.endsWith('\\)'))
    if (!inline && !displayMode) return <span key={index}>{chunk}</span>
    const expression = displayMode ? chunk.slice(2, -2)
      : chunk.startsWith('$') ? chunk.slice(1, -1) : chunk.slice(2, -2)
    return <span key={index} className={displayMode ? 'math-display' : undefined} dangerouslySetInnerHTML={{ __html: mathHtml(expression, displayMode) }} />
  })}</span>
}
