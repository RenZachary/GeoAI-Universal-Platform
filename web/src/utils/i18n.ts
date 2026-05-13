import { createI18n } from 'vue-i18n'
import messages from '@/i18n/locales'

// Create a standalone i18n instance for use outside of Vue components
let i18nInstance: any = null

function getI18nInstance() {
  if (!i18nInstance) {
    const savedLanguage = localStorage.getItem('language') || 'en-US'
    
    i18nInstance = createI18n({
      legacy: false,
      locale: savedLanguage,
      fallbackLocale: 'en-US',
      messages
    })
  }
  return i18nInstance
}

/**
 * Get translated title for a route
 * This function can be safely called outside of Vue components
 */
export function getTranslatedTitle(titleKey: string): string {
  if (!titleKey) return 'GeoAI-UP'
  
  try {
    const i18n = getI18nInstance()
    const { t } = i18n.global
    const translated = t(titleKey)
    return `GeoAI-UP - ${translated}`
  } catch (error) {
    console.warn('Failed to translate title:', titleKey, error)
    return `GeoAI-UP - ${titleKey}`
  }
}

/**
 * Translate workflow status messages
 * This function can be safely called outside of Vue components (e.g., in Pinia stores)
 */
export function translateWorkflowStatus(key: string, params?: Record<string, any>): string {
  try {
    const i18n = getI18nInstance()
    const { t } = i18n.global
    
    // Build the full key path (e.g., 'chat.kbSearching')
    const fullKey = key.startsWith('chat.') ? key : `chat.${key}`
    
    if (params) {
      return t(fullKey, params)
    }
    return t(fullKey)
  } catch (error) {
    console.warn('Failed to translate workflow status:', key, error)
    return key
  }
}
