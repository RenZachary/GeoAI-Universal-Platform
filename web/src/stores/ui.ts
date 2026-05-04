import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ThemeType } from '@/types'

export const useUIStore = defineStore('ui', () => {
  // Theme
  const theme = ref<ThemeType>(
    (localStorage.getItem('theme') as ThemeType) || 
    (import.meta.env.VITE_DEFAULT_THEME as ThemeType) || 
    'auto'
  )
  
  // Sidebar state
  const sidebarCollapsed = ref(
    localStorage.getItem('sidebarCollapsed') === 'true'
  )
  
  function setTheme(t: ThemeType) {
    theme.value = t
    localStorage.setItem('theme', t)
    
    // Apply theme to document
    if (t === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      applyTheme(prefersDark ? 'dark' : 'light')
    } else {
      applyTheme(t)
    }
  }
  
  function applyTheme(mode: 'dark' | 'light') {
    if (mode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
  
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed.value))
  }
  
  // Initialize theme on store creation
  setTheme(theme.value)
  
  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', (e) => {
      if (theme.value === 'auto') {
        applyTheme(e.matches ? 'dark' : 'light')
      }
    })
  }
  
  return {
    theme,
    sidebarCollapsed,
    setTheme,
    toggleSidebar
  }
})
