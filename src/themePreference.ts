export type ThemePreference = 'light' | 'dark'

const THEME_STORAGE_KEY = 'lets-studee-theme-v1'

export function loadThemePreference(): ThemePreference {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function saveThemePreference(theme: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The current selection still applies for this page if storage is unavailable.
  }
}
