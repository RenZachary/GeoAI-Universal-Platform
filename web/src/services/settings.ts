import api from './api'

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'qwen'
  apiUrl: string
  apiKey?: string
  model: string
  temperature: number
  maxTokens: number
}

export interface MapDefaults {
  basemap: string
  center: [number, number]
  zoom: number
}

export interface UserPreferences {
  llmConfig?: LLMConfig
  mapDefaults?: MapDefaults
  theme?: 'light' | 'dark' | 'auto'
  language?: 'en-US' | 'zh-CN'
  sidebarCollapsed?: boolean
}

/**
 * Settings Service - Manages user preferences via backend API
 */
export class SettingsService {
  /**
   * Get LLM configuration from backend
   */
  async getLLMConfig(): Promise<LLMConfig | null> {
    try {
      const response = await api.get('/api/llm/config')
      if (response.data.success) {
        return response.data.config
      }
      return null
    } catch (error) {
      console.error('Failed to get LLM config:', error)
      return null
    }
  }

  /**
   * Save LLM configuration to backend
   */
  async saveLLMConfig(config: LLMConfig): Promise<boolean> {
    try {
      const response = await api.post('/api/llm/config', config)
      return response.data.success
    } catch (error) {
      console.error('Failed to save LLM config:', error)
      throw error
    }
  }

  /**
   * Test LLM connection
   */
  async testLLMConnection(config: LLMConfig): Promise<{ connected: boolean; message: string }> {
    try {
      const response = await api.post('/api/llm/config/test', config)
      return {
        connected: response.data.connected,
        message: response.data.message
      }
    } catch (error) {
      console.error('Failed to test LLM connection:', error)
      return {
        connected: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
      }
    }
  }

  /**
   * Delete LLM configuration
   */
  async deleteLLMConfig(): Promise<boolean> {
    try {
      const response = await api.delete('/api/llm/config')
      return response.data.success
    } catch (error) {
      console.error('Failed to delete LLM config:', error)
      throw error
    }
  }

  /**
   * Get user preferences (for future implementation)
   * Currently uses localStorage for non-LLM settings
   */
  async getUserPreferences(): Promise<UserPreferences> {
    // For now, only LLM config comes from backend
    // Other preferences still use localStorage until backend support is added
    const llmConfig = await this.getLLMConfig()
    
    return {
      llmConfig: llmConfig || undefined,
      theme: (localStorage.getItem('ui_theme') as any) || 'light',
      language: (localStorage.getItem('app_language') as any) || 'en-US',
      sidebarCollapsed: localStorage.getItem('ui_sidebar_collapsed') === 'true',
      mapDefaults: {
        basemap: (localStorage.getItem('map_basemap') as any) || 'cartoDark',
        center: JSON.parse(localStorage.getItem('map_center') || '[104.0, 35.0]'),
        zoom: parseInt(localStorage.getItem('map_zoom') || '3')
      }
    }
  }

  /**
   * Save map defaults to localStorage (backend support pending)
   */
  saveMapDefaults(defaults: MapDefaults): void {
    localStorage.setItem('map_basemap', defaults.basemap)
    localStorage.setItem('map_center', JSON.stringify(defaults.center))
    localStorage.setItem('map_zoom', String(defaults.zoom))
  }

  /**
   * Save UI preferences to localStorage (backend support pending)
   */
  saveUIPreferences(prefs: { theme?: string; language?: string; sidebarCollapsed?: boolean }): void {
    if (prefs.theme) {
      localStorage.setItem('ui_theme', prefs.theme)
    }
    if (prefs.language) {
      localStorage.setItem('app_language', prefs.language)
    }
    if (prefs.sidebarCollapsed !== undefined) {
      localStorage.setItem('ui_sidebar_collapsed', String(prefs.sidebarCollapsed))
    }
  }
}

// Export singleton instance
export const settingsService = new SettingsService()
