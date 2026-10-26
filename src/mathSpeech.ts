function readLatexArgument(text: string, index: number): { value: string; end: number } | null {
  if (index >= text.length) return null
  if (text[index] === '{') {
    let depth = 1
    let cursor = index + 1
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === '\\' && cursor + 1 < text.length) {
        cursor += 2
        continue
      }
      if (text[cursor] === '{') depth += 1
      else if (text[cursor] === '}') depth -= 1
      cursor += 1
    }
    return depth === 0 ? { value: text.slice(index + 1, cursor - 1), end: cursor } : null
  }
  if (text[index] === '\\') {
    let end = index + 1
    if (/[A-Za-z]/.test(text[end] ?? '')) {
      while (/[A-Za-z]/.test(text[end] ?? '')) end += 1
    } else if (end < text.length) {
      end += 1
    }
    return { value: text.slice(index, end), end }
  }
  const character = String.fromCodePoint(text.codePointAt(index)!)
  return { value: character, end: index + character.length }
}

function fractionsToSpeech(text: string): string {
  let result = ''
  let index = 0
  while (index < text.length) {
    const command = text.slice(index).match(/^\\(?:dfrac|tfrac|cfrac|sfrac|frac)\b/)
    if (command) {
      let cursor = index + command[0].length
      while (/\s/.test(text[cursor] ?? '')) cursor += 1
      const numerator = readLatexArgument(text, cursor)
      if (numerator) {
        cursor = numerator.end
        while (/\s/.test(text[cursor] ?? '')) cursor += 1
        const denominator = readLatexArgument(text, cursor)
        if (denominator) {
          result += `${fractionsToSpeech(numerator.value)} all over ${fractionsToSpeech(denominator.value)}`
          index = denominator.end
          continue
        }
      }
    }
    result += text[index]
    index += 1
  }
  return result
}

export function mathToSpeech(text: string): string {
  return fractionsToSpeech(text)
    .replace(/\$\$?|\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\\{2,}(?=[A-Za-z])/g, '\\')
    .replace(/\\(?:,|;|!|quad|qquad)/g, ' ')
    .replace(/\\sqrt\s*\{([^}]+)\}/g, 'square root of $1')
    .replace(/\^\s*\\circ\b/gi, ' degrees ')
    .replace(/\\circ\b/gi, ' degrees ')
    .replace(/\u00B0/g, ' degrees ')
    .replace(/\\begin\{(?:bmatrix|pmatrix|matrix)\}/g, 'matrix ')
    .replace(/\\end\{(?:bmatrix|pmatrix|matrix)\}/g, ' end matrix ')
    .replace(/\\\\/g, ' row ')
    .replace(/&/g, ', ')
    .replace(/\\int_\{?([A-Za-z0-9]+)\}?\^\{?([A-Za-z0-9]+)\}?/g, 'integral from $1 to $2 of ')
    .replace(/\\lim_\{([^}]+)\}/g, 'limit as $1')
    .replace(/\\lim\b/g, 'limit as ')
    .replace(/\\to\b|\\rightarrow\b|â†’/g, ' approaches ')
    .replace(/\\int\b/g, 'integral of ')
    .replace(/\\sum\b/g, 'sum of ')
    .replace(/\\prod\b/g, 'product of ')
    .replace(/\\pi\b/g, 'pi')
    .replace(/Ï€/g, 'pi')
    .replace(/\\theta\b/g, 'theta')
    .replace(/\\alpha\b/g, 'alpha')
    .replace(/\\beta\b/g, 'beta')
    .replace(/\\infty\b/g, 'infinity')
    .replace(/\\sin\b/g, 'sine of ')
    .replace(/\\cos\b/g, 'cosine of ')
    .replace(/\\tan\b/g, 'tangent of ')
    .replace(/\\arcsin\b|\\barcsin\b/gi, 'inverse sine of ')
    .replace(/\\arccos\b|\\barccos\b/gi, 'inverse cosine of ')
    .replace(/\\arctan\b|\\barctan\b/gi, 'inverse tangent of ')
    .replace(/\bsin\b/gi, 'sine of ')
    .replace(/\bcos\b/gi, 'cosine of ')
    .replace(/\btan\b/gi, 'tangent of ')
    .replace(/\\cdot|\\times|Ã—/g, ' times ')
    .replace(/\\div|Ã·/g, ' divided by ')
    .replace(/\\leq|â‰¤/g, ' less than or equal to ')
    .replace(/\\geq|â‰¥/g, ' greater than or equal to ')
    .replace(/\\neq|â‰ /g, ' not equal to ')
    .replace(/\\approx|â‰ˆ/g, ' approximately equal to ')
    .replace(/\\in\b|âˆˆ/g, ' is an element of ')
    .replace(/\\cup|âˆª/g, ' union ')
    .replace(/\\cap|âˆ©/g, ' intersection ')
    .replace(/\\perp|âŠ¥/g, ' perpendicular to ')
    .replace(/\\parallel|âˆ¥/g, ' parallel to ')
    .replace(/\\pm|Â±/g, ' plus or minus ')
    .replace(/âˆš\s*([\w]+)?/g, (_match, value: string | undefined) => `square root of ${value ?? ''}`)
    .replace(/âˆ«/g, 'integral of ')
    .replace(/âˆ‘/g, 'sum of ')
    .replace(/Ï€/g, 'pi')
    .replace(/Î¸/g, 'theta')
    .replace(/Î±/g, 'alpha')
    .replace(/Î²/g, 'beta')
    .replace(/âˆž/g, 'infinity')
    .replace(/Â°/g, ' degrees')
    .replace(/([A-Za-z0-9]+)Â²/g, '$1 squared')
    .replace(/([A-Za-z0-9]+)Â³/g, '$1 cubed')
    .replace(/([A-Za-z0-9]+)â´/g, '$1 to the fourth power')
    .replace(/([A-Za-z0-9]+)\^\{?2\}?/g, '$1 squared')
    .replace(/([A-Za-z0-9]+)\^\{?3\}?/g, '$1 cubed')
    .replace(/([A-Za-z0-9]+)\^\{?([0-9]+)\}?/g, '$1 to the power of $2')
    .replace(/([A-Za-z0-9]+)\s*\^\s*[-âˆ’]\s*([A-Za-z]+)\s*\/\s*([A-Za-z0-9]+)/g, (_match, base: string, numerator: string, denominator: string) => `${base} to the power of negative ${numerator} over ${denominator}`)
    .replace(/([A-Za-z0-9]+)\s*\^\s*\{([^{}]+)\}/g, (_match, base: string, exponent: string) => `${base} to the power of ${exponent.trim().replace(/^[-âˆ’]\s*/, 'negative ')}`)
    .replace(/([A-Za-z0-9]+)\s*\^\s*\(([^()]+)\)/g, (_match, base: string, exponent: string) => `${base} to the power of ${exponent.trim().replace(/^[-âˆ’]\s*/, 'negative ')}`)
    .replace(/([A-Za-z][A-Za-z0-9]*)_(?:\{([^}]+)\}|([A-Za-z0-9]+))/g, '$1 sub $2$3')
    .replace(/([A-Za-z][A-Za-z0-9]*)([\u2080-\u2089]+)/g, (_match, base: string, digits: string) => {
      const digitWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
      const spokenDigits = [...digits].map((digit) => digitWords[digit.codePointAt(0)! - 0x2080]).join(' ')
      return `${base} sub ${spokenDigits}`
    })
    .replace(/\bECE\b/g, 'E C E')
    .replace(/\b([A-Za-z0-9]+)\s*\/\s*([A-Za-z0-9]+)\b/g, '$1 over $2')
    .replace(/\\over\b/g, ' over ')
    .replace(/[{}]/g, ' ')
    .replace(/\\backslash\b/g, ' ')
    .replace(/\\(?:left|right|mathrm|text|,|;|!)/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/\s*\^\s*/g, ' to the power of ')
    .replace(/[=]/g, ' equals ')
    .replace(/\s+/g, ' ')
    .trim()
}
