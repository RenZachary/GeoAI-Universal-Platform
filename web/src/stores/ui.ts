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
  const sidebarCollapsed = ref(false)
  
  function setTheme(t: ThemeType) {
    theme.value = t
    localStorage.setItem('theme', t)
    
    // Apply theme to document
    if (t === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
    } else {
      document.documentElement.setAttribute('data-theme', t)
    }
  }
  
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }
  
  // Initialize theme on store creation
  setTheme(theme.value)
  
  return {
    theme,
    sidebarCollapsed,
    setTheme,
    toggleSidebar
  }
})
