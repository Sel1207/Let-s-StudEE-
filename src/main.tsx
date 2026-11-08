import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { loadThemePreference } from './themePreference'
import LetsStudeeApp from './LetsStudeeApp.tsx'

const initialTheme = loadThemePreference()
document.documentElement.dataset.theme = initialTheme
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', initialTheme === 'dark' ? '#111214' : '#f7f8f5')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LetsStudeeApp />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Home screen apps on iPhone rarely reload, so look for a new service worker whenever the app comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {})
      })
    }).catch((error: unknown) => {
      console.error('Could not register offline support.', error)
    })
  })
}
