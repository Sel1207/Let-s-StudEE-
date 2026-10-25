import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { loadThemePreference } from './themePreference'
import LetsStudeeApp from './LetsStudeeApp.tsx'

const initialTheme = loadThemePreference()
document.documentElement.dataset.theme = initialTheme
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', initialTheme === 'dark' ? '#151b17' : '#f7f8f5')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LetsStudeeApp />
  </StrictMode>,
)
