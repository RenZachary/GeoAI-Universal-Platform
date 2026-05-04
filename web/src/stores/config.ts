import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LanguageType } from '@/types'

export const useConfigStore = defineStore('config', () => {
  // Base URL from environment
  const baseUrl = ref(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000')
  
  // Language
  const language = ref<LanguageType>(
    (localStorage.getItem('language') as LanguageType) || 
    (import.meta.env.VITE_DEFAULT_LANGUAGE as LanguageType) || 
    'en-US'
  )
  
  // Browser fingerprint
  const fingerprint = ref(localStorage.getItem('browser_fingerprint') || '')
  
  function setLanguage(lang: LanguageType) {
    language.value = lang
    localStorage.setItem('language', lang)
  }
  
  function setFingerprint(fp: string) {
    fingerprint.value = fp
    localStorage.setItem('browser_fingerprint', fp)
  }
  
  return {
    baseUrl,
    language,
    fingerprint,
    setLanguage,
    setFingerprint
  }
})
