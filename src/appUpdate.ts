/** The build this page is running, stamped in at build time (empty in dev). */
export const CURRENT_BUILD = String(import.meta.env.VITE_BUILD_ID ?? '')

export function buildLabel(build = CURRENT_BUILD): string {
  const time = Number(build)
  if (!Number.isFinite(time) || time <= 0) return 'development build'
  return new Date(time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Asks the live site which build it is serving. Returns null when offline or in dev. */
export async function fetchLatestBuild(): Promise<string | null> {
  if (!import.meta.env.PROD) return null
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null
    const body = (await response.json()) as { build?: unknown }
    return typeof body.build === 'string' ? body.build : null
  } catch {
    return null
  }
}

/**
 * Drops the offline copy and reloads from the network. A home screen app on iPhone keeps
 * serving its saved copy otherwise, so a plain reload can look like nothing happened.
 * Study data lives in localStorage and is not touched.
 */
export async function installLatestVersion(from: 'settings' | 'banner' = 'banner'): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? []
    await Promise.all(registrations.map((registration) => registration.unregister()))
  } catch { /* nothing to remove */ }
  try {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('lets-studee-')).map((key) => caches.delete(key)))
  } catch { /* Cache Storage unavailable */ }
  const url = new URL(window.location.href)
  // A "settings-" flag brings you back to Settings after the reload.
  url.searchParams.set('__app_update', `${from}-${Date.now()}`)
  window.location.replace(url.toString())
}
