import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import LetsStudeeApp from './LetsStudeeApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LetsStudeeApp />
  </StrictMode>,
)
