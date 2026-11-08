import { useEffect, useRef } from 'react'
import { screenScale } from './appScale'

const SCROLL_INTENT_PIXELS = 6
const HIDE_AFTER_MS = 2500

export function useAutoHideHeader() {
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const root = document.documentElement
    let lastY = Math.max(0, window.scrollY)
    let travelled = 0
    let frame = 0
    let hideTimer: number | null = null

    const clearHideTimer = () => {
      if (hideTimer !== null) window.clearTimeout(hideTimer)
      hideTimer = null
    }
    const place = (hidden: boolean, floating: boolean) => {
      header.classList.toggle('is-hidden', hidden)
      header.classList.toggle('is-floating', floating && !hidden)
      root.style.setProperty('--sticky-top', hidden ? '0px' : `${header.offsetHeight}px`)
    }
    const hide = () => {
      clearHideTimer()
      place(true, false)
    }
    const hideLater = () => {
      clearHideTimer()
      hideTimer = window.setTimeout(() => {
        if (header.matches(':hover, :focus-within')) hideLater()
        else hide()
      }, HIDE_AFTER_MS)
    }

    const update = () => {
      frame = 0
      const maxY = root.scrollHeight - window.innerHeight
      const y = Math.max(0, Math.min(window.scrollY, maxY))
      const delta = y - lastY
      lastY = y
      if (y <= header.offsetHeight) {
        clearHideTimer()
        travelled = 0
        place(false, y > 0)
        return
      }
      travelled = Math.sign(delta) === Math.sign(travelled) ? travelled + delta : delta
      if (travelled >= SCROLL_INTENT_PIXELS) hide()
      else if (travelled <= -SCROLL_INTENT_PIXELS) {
        place(false, true)
        hideLater()
      }
    }
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    place(false, lastY > 0)
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    return () => {
      clearHideTimer()
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      root.style.removeProperty('--sticky-top')
    }
  }, [])

  return headerRef
}

export function isStuckToTop(element: HTMLElement | null): boolean {
  if (!element) return false
  return element.getBoundingClientRect().top <= (parseFloat(getComputedStyle(element).top) + 1) * screenScale()
}
