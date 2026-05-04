<template>
  <div class="settings-view">
    <div class="view-header">
      <h2>{{ $t('settings.title') || 'Settings' }}</h2>
    </div>
    
    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- LLM Configuration -->
      <el-tab-pane :label="$t('settings.llm')" name="llm">
        <el-form :model="llmConfig" label-width="150px" style="max-width: 600px">
          <el-form-item :label="$t('settings.provider')" required>
            <el-select v-model="llmConfig.provider" :placeholder="$t('settings.selectProvider')" style="width: 100%">
              <el-option :label="$t('settings.providers.openai')" value="openai" />
              <el-option :label="$t('settings.providers.anthropic')" value="anthropic" />
              <el-option :label="$t('settings.providers.ollama')" value="ollama" />
              <el-option :label="$t('settings.providers.qwen')" value="qwen" />
            </el-select>
          </el-form-item>
          
          <el-form-item :label="$t('settings.apiUrl')" required>
            <el-input 
              v-model="llmConfig.apiUrl" 
              :placeholder="getApiUrlPlaceholder(llmConfig.provider)"
            />
            <div class="form-help">{{ getApiUrlHelp(llmConfig.provider) }}</div>
          </el-form-item>
          
          <el-form-item :label="$t('settings.apiKey')" v-if="llmConfig.provider !== 'ollama'">
            <el-input 
              v-model="llmConfig.apiKey" 
              type="password"
              show-password
              :placeholder="getApiKeyPlaceholder(llmConfig.provider)"
            />
          </el-form-item>
          
          <el-form-item :label="$t('settings.model')" required>
            <el-select v-model="llmConfig.model" :placeholder="$t('settings.model')" style="width: 100%">
              <!-- OpenAI Models -->
              <template v-if="llmConfig.provider === 'openai'">
                <el-option :label="$t('settings.models.gpt4o')" value="gpt-4o" />
                <el-option :label="$t('settings.models.gpt4Turbo')" value="gpt-4-turbo" />
                <el-option :label="$t('settings.models.gpt35Turbo')" value="gpt-3.5-turbo" />
              </template>
              
              <!-- Anthropic Models -->
              <template v-else-if="llmConfig.provider === 'anthropic'">
                <el-option :label="$t('settings.models.claude35Sonnet')" value="claude-3-5-sonnet-20241022" />
                <el-option :label="$t('settings.models.claude35Haiku')" value="claude-3-5-haiku-20241022" />
                <el-option :label="$t('settings.models.claude3Opus')" value="claude-3-opus-20240229" />
              </template>
              
              <!-- Ollama Models -->
              <template v-else-if="llmConfig.provider === 'ollama'">
                <el-option :label="$t('settings.models.llama31')" value="llama3.1" />
                <el-option :label="$t('settings.models.mistral')" value="mistral" />
                <el-option :label="$t('settings.models.qwen25')" value="qwen2.5" />
                <el-option :label="$t('settings.models.custom')" value="custom" />
              </template>
              
              <!-- Qwen Models -->
              <template v-else-if="llmConfig.provider === 'qwen'">
                <el-option :label="$t('settings.models.qwenMax')" value="qwen-max" />
                <el-option :label="$t('settings.models.qwenPlus')" value="qwen-plus" />
                <el-option :label="$t('settings.models.qwenTurbo')" value="qwen-turbo" />
                <el-option :label="$t('settings.models.qwenLong')" value="qwen-long" />
              </template>
            </el-select>
          </el-form-item>
          
          <el-form-item :label="$t('settings.temperature')">
            <el-slider 
              v-model="llmConfig.temperature" 
              :min="0" 
              :max="2" 
              :step="0.1"
              show-input
            />
          </el-form-item>
          
          <el-form-item :label="$t('settings.maxTokens')">
            <el-input-number 
              v-model="llmConfig.maxTokens" 
              :min="100" 
              :max="8000"
              :step="100"
              style="width: 100%"
            />
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="handleSaveLLMConfig" :loading="loading">
              {{ $t('settings.saveConfiguration') }}
            </el-button>
            <el-button @click="handleTestLLMConnection" :loading="loading" style="margin-left: 10px">
              {{ $t('settings.testConnection') }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <!-- Appearance -->
      <el-tab-pane :label="$t('settings.appearance')" name="appearance">
        <el-form label-width="150px" style="max-width: 600px">
          <el-form-item :label="$t('settings.theme')">
            <el-radio-group :model-value="uiStore.theme" @change="handleThemeChange">
              <el-radio-button label="light">{{ $t('settings.light') }}</el-radio-button>
              <el-radio-button label="dark">{{ $t('settings.dark') }}</el-radio-button>
              <el-radio-button label="auto">{{ $t('settings.auto') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          
          <el-form-item :label="$t('settings.language')">
            <el-select 
              v-model="configStore.language" 
              @change="handleLanguageChange"
              style="width: 100%"
            >
              <el-option label="English" value="en-US" />
              <el-option label="中文" value="zh-CN" />
            </el-select>
          </el-form-item>
          
          <el-form-item :label="$t('settings.sidebar')">
            <el-switch 
              :model-value="uiStore.sidebarCollapsed"
              @change="handleSidebarChange"
              :active-text="$t('settings.collapsed')"
              :inactive-text="$t('settings.expanded')"
            />
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <!-- Map Defaults -->
      <el-tab-pane :label="$t('settings.mapDefaults')" name="map">
        <el-form label-width="150px" style="max-width: 600px">
          <el-form-item :label="$t('settings.defaultBasemap')">
            <el-select v-model="mapDefaults.basemap" style="width: 100%">
              <el-option :label="$t('settings.basemaps.cartoDark')" value="cartoDark" />
              <el-option :label="$t('settings.basemaps.cartoLight')" value="cartoLight" />
              <el-option :label="$t('settings.basemaps.esriStreet')" value="esriStreet" />
              <el-option :label="$t('settings.basemaps.esriSatellite')" value="esriSatellite" />
              <el-option :label="$t('settings.basemaps.osmStandard')" value="osmStandard" />
              <el-option :label="$t('settings.basemaps.stamenTerrain')" value="stamenTerrain" />
            </el-select>
          </el-form-item>
          
          <el-form-item :label="$t('settings.defaultCenter')">
            <el-row :gutter="10">
              <el-col :span="12">
                <el-input-number 
                  v-model="mapDefaults.center[0]" 
                  :precision="4"
                  :step="0.1"
                  :placeholder="$t('settings.longitude')"
                  style="width: 100%"
                />
              </el-col>
              <el-col :span="12">
                <el-input-number 
                  v-model="mapDefaults.center[1]" 
                  :precision="4"
                  :step="0.1"
                  :placeholder="$t('settings.latitude')"
                  style="width: 100%"
                />
              </el-col>
            </el-row>
          </el-form-item>
          
          <el-form-item :label="$t('settings.defaultZoom')">
            <el-slider 
              v-model="mapDefaults.zoom" 
              :min="0" 
              :max="20" 
              show-input
            />
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="handleSaveMapDefaults" :loading="loading">
              {{ $t('settings.saveMapDefaults') }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <!-- About -->
      <el-tab-pane :label="$t('settings.about')" name="about">
        <div class="about-section">
          <h3>GeoAI-UP Geographic AI Assistant</h3>
          <p class="version">{{ $t('settings.version') }} {{ appVersion }}</p>
          
          <el-descriptions :column="1" border>
            <el-descriptions-item :label="$t('settings.frontendFramework')">
              Vue 3.5 + TypeScript
            </el-descriptions-item>
            <el-descriptions-item :label="$t('settings.uiLibrary')">
              Element Plus 2.13
            </el-descriptions-item>
            <el-descriptions-item :label="$t('settings.mapEngine')">
              MapLibre GL 4.7
            </el-descriptions-item>
            <el-descriptions-item :label="$t('settings.stateManagement')">
              Pinia 3.0
            </el-descriptions-item>
            <el-descriptions-item :label="$t('settings.buildTool')">
              Vite 6.0
            </el-descriptions-item>
          </el-descriptions>
          
          <div class="credits">
            <h4>{{ $t('settings.credits') }}</h4>
            <p>{{ $t('settings.creditsText') }}</p>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { settingsService, type LLMConfig, type MapDefaults } from '@/services/settings'

const configStore = useConfigStore()
const uiStore = useUIStore()
const { locale, t } = useI18n()

const activeTab = ref('llm')
const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0'
const loading = ref(false)

// LLM Configuration
const llmConfig = reactive<LLMConfig>({
  provider: 'openai',
  apiUrl: '',
  apiKey: '',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2000
})

// Helper functions for provider-specific placeholders
function getApiUrlPlaceholder(provider: string): string {
  const placeholders: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    ollama: 'http://localhost:11434/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  }
  return placeholders[provider] || 'https://api.example.com/v1'
}

function getApiUrlHelp(provider: string): string {
  const help: Record<string, string> = {
    openai: 'OpenAI API endpoint',
    anthropic: 'Anthropic API endpoint',
    ollama: 'Local Ollama instance (default port 11434)',
    qwen: 'Alibaba DashScope compatible mode endpoint'
  }
  return help[provider] || ''
}

function getApiKeyPlaceholder(provider: string): string {
  const placeholders: Record<string, string> = {
    openai: 'sk-...',
    anthropic: 'sk-ant-...',
    qwen: 'sk-... (DashScope API Key)'
  }
  return placeholders[provider] || 'Enter API key'
}

// Map Defaults
const mapDefaults = reactive<MapDefaults>({
  basemap: 'cartoDark',
  center: [104.0, 35.0],
  zoom: 3
})

// Load settings on component mount
onMounted(async () => {
  await loadSettings()
})

async function loadSettings() {
  loading.value = true
  try {
    // Load LLM config from backend
    const llmConfigData = await settingsService.getLLMConfig()
    if (llmConfigData) {
      Object.assign(llmConfig, llmConfigData)
    }
    
    // Load map defaults from localStorage (backend support pending)
    const savedBasemap = localStorage.getItem('map_basemap')
    const savedCenter = localStorage.getItem('map_center')
    const savedZoom = localStorage.getItem('map_zoom')
    
    if (savedBasemap) mapDefaults.basemap = savedBasemap
    if (savedCenter) mapDefaults.center = JSON.parse(savedCenter)
    if (savedZoom) mapDefaults.zoom = parseInt(savedZoom)
  } catch (error) {
    console.error('Failed to load settings:', error)
    ElMessage.error('Failed to load settings')
  } finally {
    loading.value = false
  }
}

// Methods
async function handleSaveLLMConfig() {
  loading.value = true
  try {
    const success = await settingsService.saveLLMConfig(llmConfig)
    if (success) {
      ElMessage.success(t('settings.llmConfigSaved'))
    } else {
      ElMessage.error(t('settings.llmConfigSaveFailed'))
    }
  } catch (error) {
    console.error('Failed to save LLM config:', error)
    ElMessage.error(t('settings.llmConfigSaveFailed'))
  } finally {
    loading.value = false
  }
}

async function handleTestLLMConnection() {
  loading.value = true
  try {
    const result = await settingsService.testLLMConnection(llmConfig)
    if (result.connected) {
      ElMessage.success(`${t('settings.connectionSuccess')}: ${result.message}`)
    } else {
      ElMessage.warning(`${t('settings.connectionFailed')}: ${result.message}`)
    }
  } catch (error) {
    console.error('Failed to test connection:', error)
    ElMessage.error(t('settings.connectionTestFailed'))
  } finally {
    loading.value = false
  }
}

function handleLanguageChange(lang: string) {
  configStore.setLanguage(lang as any)
  locale.value = lang
  settingsService.saveUIPreferences({ language: lang })
  ElMessage.success(t('settings.languageChanged'))
}

function handleThemeChange(theme: string) {
  uiStore.setTheme(theme as any)
  settingsService.saveUIPreferences({ theme })
  ElMessage.success(t('settings.themeChanged'))
}

function handleSidebarChange(collapsed: boolean) {
  // Update the store
  uiStore.sidebarCollapsed = collapsed
  localStorage.setItem('sidebarCollapsed', String(collapsed))
  // Save preference for persistence (future backend implementation)
  settingsService.saveUIPreferences({ sidebarCollapsed: collapsed })
}

function handleSaveMapDefaults() {
  settingsService.saveMapDefaults(mapDefaults)
  ElMessage.success(t('settings.mapDefaultsSaved'))
}
</script>

<style scoped lang="scss">
.settings-view {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.view-header {
  margin-bottom: 24px;
  
  h2 {
    margin: 0;
    font-size: 24px;
    color: var(--el-text-color-primary);
  }
}

.settings-tabs {
  background: var(--el-bg-color);
  padding: 20px;
  border-radius: 8px;
}

.form-help {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.5;
}

.about-section {
  max-width: 600px;
  
  h3 {
    margin: 0 0 8px 0;
    color: var(--el-text-color-primary);
  }
  
  .version {
    margin: 0 0 24px 0;
    color: var(--el-text-color-secondary);
    font-size: 14px;
  }
  
  .credits {
    margin-top: 24px;
    
    h4 {
      margin: 0 0 8px 0;
      color: var(--el-text-color-regular);
    }
    
    p {
      margin: 0;
      color: var(--el-text-color-secondary);
      font-size: 14px;
    }
  }
}
</style>
