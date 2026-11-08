import { useEffect, useState } from 'react'
import { CURRENT_BUILD, fetchLatestBuild, installLatestVersion } from './appUpdate'

const CHECK_EVERY_MS = 5 * 60 * 1000

/** Shows a small bar when the live site has a newer build than the one running, e.g. a home screen app reopened days later. */
export default function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (!CURRENT_BUILD) return undefined
    let lastCheck = 0
    let cancelled = false
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < CHECK_EVERY_MS) return
      lastCheck = Date.now()
      void fetchLatestBuild().then((build) => {
        if (!cancelled && build && build !== CURRENT_BUILD) setLatest(build)
      })
    }
    check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  if (!latest || dismissed === latest) return null
  return (
    <div className="update-banner" role="status">
      <span><strong>New version ready.</strong> Update to get the latest changes.</span>
      <button type="button" className="update-banner-go" disabled={updating} onClick={() => { setUpdating(true); void installLatestVersion() }}>
        {updating ? 'Updating…' : 'Update'}
      </button>
      <button type="button" className="update-banner-close" aria-label="Dismiss" title="Not now" onClick={() => setDismissed(latest)}>×</button>
    </div>
  )
}
