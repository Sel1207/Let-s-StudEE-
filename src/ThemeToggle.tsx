import { flushSync } from 'react-dom'
import type { ThemePreference } from './themePreference'
import { toPagePx } from './appScale'

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown }

/** Sun/moon button in the header. Where supported, the new theme washes in from the button. */
export default function ThemeToggle({ theme, onChange }: { theme: ThemePreference; onChange: (theme: ThemePreference) => void }) {
  const next = theme === 'dark' ? 'light' : 'dark'

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    const doc = document as ViewTransitionDocument
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!doc.startViewTransition || reduceMotion) {
      onChange(next)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const root = document.documentElement
    root.style.setProperty('--theme-x', `${toPagePx(rect.left + rect.width / 2)}px`)
    root.style.setProperty('--theme-y', `${toPagePx(rect.top + rect.height / 2)}px`)
    doc.startViewTransition(() => {
      root.dataset.theme = next
      flushSync(() => onChange(next))
    })
  }

  return (
    <button
      className={`theme-toggle is-${theme}`}
      type="button"
      aria-label={`Switch to ${next} mode`}
      aria-pressed={theme === 'dark'}
      title={`Switch to ${next} mode`}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <mask id="theme-toggle-mask">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <circle className="theme-toggle-bite" cx="17" cy="7" r="6" fill="#000" />
        </mask>
        <circle className="theme-toggle-core" cx="12" cy="12" r="5" mask="url(#theme-toggle-mask)" />
        <g className="theme-toggle-rays">
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </g>
      </svg>
    </button>
  )
}
