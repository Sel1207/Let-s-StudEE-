// AI diagrams often label things "I_L" or "x^2", which SVG would print literally.
const SVG_SCRIPT = /([^\s_^])([_^])(?:\{([^{}]+)\}|([A-Za-z0-9]+))/g

/** Turns "I_L" and "x^2" in an SVG label into a real subscript or superscript. */
export function raiseScripts(element: Element) {
  const document = element.ownerDocument
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue
    const text = node.textContent ?? ''
    if (!/[_^]/.test(text)) continue
    const pieces: Node[] = []
    let last = 0
    for (const match of text.matchAll(SVG_SCRIPT)) {
      const start = (match.index ?? 0) + match[1].length
      pieces.push(document.createTextNode(text.slice(last, start)))
      const script = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      script.setAttribute('baseline-shift', match[2] === '_' ? 'sub' : 'super')
      script.setAttribute('font-size', '75%')
      script.textContent = match[3] ?? match[4]
      pieces.push(script)
      last = (match.index ?? 0) + match[0].length
    }
    if (pieces.length === 0) continue
    pieces.push(document.createTextNode(text.slice(last)))
    node.replaceWith(...pieces)
  }
}

// Bare "I_L" or "N_{L}" written outside $...$ in the notes becomes math, so it shows as a subscript.
const BARE_SUBSCRIPT = /(?<![\w\\{$])([A-Za-zΑ-ω])_(\{[^{}$\n]+\}|[A-Za-z0-9]{1,4})(?!\w)/g

export function wrapBareSubscripts(text: string): string {
  return text.replace(BARE_SUBSCRIPT, (_, base: string, script: string) => `$${base}_{${script.replace(/^\{|\}$/g, '')}}$`)
}

/** Splits plain note text into ordinary pieces and the bare subscripts that render as math. */
export function splitBareSubscripts(text: string): Array<{ text: string; math: boolean }> {
  const pieces: Array<{ text: string; math: boolean }> = []
  let last = 0
  for (const match of text.matchAll(BARE_SUBSCRIPT)) {
    const start = match.index ?? 0
    if (start > last) pieces.push({ text: text.slice(last, start), math: false })
    pieces.push({ text: match[0], math: true })
    last = start + match[0].length
  }
  if (last < text.length || pieces.length === 0) pieces.push({ text: text.slice(last), math: false })
  return pieces
}
