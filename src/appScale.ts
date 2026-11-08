/**
 * Display size: scales the whole site like browser zoom, on computers and tablets only.
 * Phones keep 100% because they already size pages for their screens.
 */
export type DisplayScale = 'small' | 'default' | 'large'

export const DISPLAY_SCALES: Record<DisplayScale, { label: string; zoom: number }> = {
  small: { label: 'Small', zoom: 1 },
  default: { label: 'Default', zoom: 1.25 },
  large: { label: 'Large', zoom: 1.4 },
}

export const DISPLAY_SCALE_STORAGE_KEY = 'lets-studee-display-scale-v1'
/** Below this window width the site stays at 100%. */
export const MIN_SCALED_WIDTH = 900

export function parseDisplayScale(value: unknown): DisplayScale {
  return value === 'small' || value === 'large' || value === 'default' ? value : 'default'
}

export function loadDisplayScale(): DisplayScale {
  try {
    return parseDisplayScale(window.localStorage.getItem(DISPLAY_SCALE_STORAGE_KEY))
  } catch {
    return 'default'
  }
}

export function saveDisplayScale(scale: DisplayScale): void {
  try {
    window.localStorage.setItem(DISPLAY_SCALE_STORAGE_KEY, scale)
  } catch {
    // The choice still applies to this visit.
  }
}

/** The zoom a given window width gets for a chosen scale. */
export function zoomFor(scale: DisplayScale, windowWidth: number): number {
  return windowWidth >= MIN_SCALED_WIDTH ? DISPLAY_SCALES[scale].zoom : 1
}

let screenFactor = 1

/**
 * How many screen pixels one page pixel takes right now. Browsers that scale pointer and
 * getBoundingClientRect coordinates with CSS zoom report the zoom; others report 1.
 */
export function screenScale(): number {
  return screenFactor
}

/** Converts a distance measured on screen (pointer or getBoundingClientRect) into page pixels. */
export function toPagePx(screenDistance: number): number {
  return screenDistance / screenFactor
}

function measureFactors(root: HTMLElement) {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100vh;visibility:hidden;pointer-events:none'
  document.body.append(probe)
  const rect = probe.getBoundingClientRect()
  probe.remove()
  screenFactor = rect.width > 0 ? rect.width / 100 : 1
  // vh and vw units are scaled by zoom in some browsers; CSS divides them by this to keep "one screen" honest.
  const viewFactor = window.innerHeight > 0 ? rect.height / window.innerHeight : 1
  root.style.setProperty('--view-scale', String(Math.round(viewFactor * 1000) / 1000 || 1))
}

let currentScale: DisplayScale = 'default'
let listening = false

export function applyDisplayScale(scale: DisplayScale = currentScale): void {
  currentScale = scale
  const root = document.documentElement
  const zoom = zoomFor(scale, window.innerWidth)
  root.style.zoom = zoom === 1 ? '' : String(zoom)
  root.dataset.displayScale = scale
  if (document.body) measureFactors(root)
  else document.addEventListener('DOMContentLoaded', () => measureFactors(root), { once: true })
  if (!listening) {
    listening = true
    window.addEventListener('resize', () => applyDisplayScale())
  }
}
