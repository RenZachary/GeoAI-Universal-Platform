<template>
  <div class="settings-view">
    <div class="view-header">
      <h2>{{ $t('settings.title') || 'Settings' }}</h2>
    </div>
    
    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- LLM Configuration -->
      <el-tab-pane label="LLM Configuration" name="llm">
        <el-form :model="llmConfig" label-width="150px" style="max-width: 600px">
          <el-form-item label="Provider" required>
            <el-select v-model="llmConfig.provider" placeholder="Select provider" style="width: 100%">
              <el-option label="OpenAI" value="openai" />
              <el-option label="Anthropic (Claude)" value="anthropic" />
              <el-option label="Ollama (Local)" value="ollama" />
              <el-option label="Qwen (Alibaba)" value="qwen" />
            </el-select>
          </el-form-item>
          
          <el-form-item label="API Base URL" required>
            <el-input 
              v-model="llmConfig.apiUrl" 
              :placeholder="getApiUrlPlaceholder(llmConfig.provider)"
            />
            <div class="form-help">{{ getApiUrlHelp(llmConfig.provider) }}</div>
          </el-form-item>
          
          <el-form-item label="API Key" v-if="llmConfig.provider !== 'ollama'">
            <el-input 
              v-model="llmConfig.apiKey" 
              type="password"
              show-password
              :placeholder="getApiKeyPlaceholder(llmConfig.provider)"
            />
          </el-form-item>
          
          <el-form-item label="Model" required>
            <el-select v-model="llmConfig.model" placeholder="Select model" style="width: 100%">
              <!-- OpenAI Models -->
              <template v-if="llmConfig.provider === 'openai'">
                <el-option label="GPT-4o" value="gpt-4o" />
                <el-option label="GPT-4 Turbo" value="gpt-4-turbo" />
                <el-option label="GPT-3.5 Turbo" value="gpt-3.5-turbo" />
              </template>
              
              <!-- Anthropic Models -->
              <template v-else-if="llmConfig.provider === 'anthropic'">
                <el-option label="Claude 3.5 Sonnet" value="claude-3-5-sonnet-20241022" />
                <el-option label="Claude 3.5 Haiku" value="claude-3-5-haiku-20241022" />
                <el-option label="Claude 3 Opus" value="claude-3-opus-20240229" />
              </template>
              
              <!-- Ollama Models -->
              <template v-else-if="llmConfig.provider === 'ollama'">
                <el-option label="Llama 3.1" value="llama3.1" />
                <el-option label="Mistral" value="mistral" />
                <el-option label="Qwen 2.5" value="qwen2.5" />
                <el-option label="Custom" value="custom" />
              </template>
              
              <!-- Qwen Models -->
              <template v-else-if="llmConfig.provider === 'qwen'">
                <el-option label="Qwen-Max" value="qwen-max" />
                <el-option label="Qwen-Plus" value="qwen-plus" />
                <el-option label="Qwen-Turbo" value="qwen-turbo" />
                <el-option label="Qwen-Long" value="qwen-long" />
              </template>
            </el-select>
          </el-form-item>
          
          <el-form-item label="Temperature">
            <el-slider 
              v-model="llmConfig.temperature" 
              :min="0" 
              :max="2" 
              :step="0.1"
              show-input
            />
          </el-form-item>
          
          <el-form-item label="Max Tokens">
            <el-input-number 
              v-model="llmConfig.maxTokens" 
              :min="100" 
              :max="8000"
              :step="100"
              style="width: 100%"
            />
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="handleSaveLLMConfig">
              Save Configuration
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <!-- Appearance -->
      <el-tab-pane label="Appearance" name="appearance">
        <el-form label-width="150px" style="max-width: 600px">
          <el-form-item label="Theme">
            <el-radio-group v-model="uiStore.theme">
              <el-radio-button label="light">Light</el-radio-button>
              <el-radio-button label="dark">Dark</el-radio-button>
              <el-radio-button label="auto">Auto</el-radio-button>
            </el-radio-group>
          </el-form-item>
          
          <el-form-item label="Language">
            <el-select 
              v-model="configStore.language" 
              @change="handleLanguageChange"
              style="width: 100%"
            >
              <el-option label="English" value="en-US" />
              <el-option label="中文" value="zh-CN" />
            </el-select>
          </el-form-item>
          
          <el-form-item label="Sidebar">
            <el-switch 
              v-model="uiStore.sidebarCollapsed"
              active-text="Collapsed"
              inactive-text="Expanded"
            />
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <!-- Map Defaults -->
      <el-tab-pane label="Map Defaults" name="map">
        <el-form label-width="150px" style="max-width: 600px">
          <el-form-item label="Default Basemap">
            <el-select v-model="mapDefaults.basemap" style="width: 100%">
              <el-option label="CARTO Dark" value="cartoDark" />
              <el-option label="CARTO Light" value="cartoLight" />
              <el-option label="Esri Streets" value="esriStreet" />
              <el-option label="Esri Satellite" value="esriSatellite" />
              <el-option label="OpenStreetMap" value="osmStandard" />
              <el-option label="Stamen Terrain" value="stamenTerrain" />
            </el-select>
          </el-form-item>
          
          <el-form-item label="Default Center">
            <el-row :gutter="10">
              <el-col :span="12">
                <el-input-number 
                  v-model="mapDefaults.center[0]" 
                  :precision="4"
                  :step="0.1"
                  placeholder="Longitude"
                  style="width: 100%"
                />
              </el-col>
              <el-col :span="12">
                <el-input-number 
                  v-model="mapDefaults.center[1]" 
                  :precision="4"
                  :step="0.1"
                  placeholder="Latitude"
                  style="width: 100%"
                />
              </el-col>
            </el-row>
          </el-form-item>
          
          <el-form-item label="Default Zoom">
            <el-slider 
              v-model="mapDefaults.zoom" 
              :min="0" 
              :max="20" 
              show-input
            />
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="handleSaveMapDefaults">
              Save Map Defaults
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <!-- About -->
      <el-tab-pane label="About" name="about">
        <div class="about-section">
          <h3>GeoAI-UP Geographic AI Assistant</h3>
          <p class="version">Version {{ appVersion }}</p>
          
          <el-descriptions :column="1" border>
            <el-descriptions-item label="Frontend Framework">
              Vue 3.5 + TypeScript
            </el-descriptions-item>
            <el-descriptions-item label="UI Library">
              Element Plus 2.13
            </el-descriptions-item>
            <el-descriptions-item label="Map Engine">
              MapLibre GL 4.7
            </el-descriptions-item>
            <el-descriptions-item label="State Management">
              Pinia 3.0
            </el-descriptions-item>
            <el-descriptions-item label="Build Tool">
              Vite 6.0
            </el-descriptions-item>
          </el-descriptions>
          
          <div class="credits">
            <h4>Credits</h4>
            <p>Built with modern web technologies for geographic information analysis and visualization.</p>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const configStore = useConfigStore()
const uiStore = useUIStore()
const { locale } = useI18n()

const activeTab = ref('llm')
const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0'

// LLM Configuration
const llmConfig = reactive({
  provider: (localStorage.getItem('llm_provider') as any) || 'openai',
  apiUrl: localStorage.getItem('llm_api_url') || '',
  apiKey: localStorage.getItem('llm_api_key') || '',
  model: localStorage.getItem('llm_model') || 'gpt-4o',
  temperature: parseFloat(localStorage.getItem('llm_temperature') || '0.7'),
  maxTokens: parseInt(localStorage.getItem('llm_max_tokens') || '2000')
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
const mapDefaults = reactive({
  basemap: (localStorage.getItem('map_basemap') as any) || 'cartoDark',
  center: JSON.parse(localStorage.getItem('map_center') || '[104.0, 35.0]'),
  zoom: parseInt(localStorage.getItem('map_zoom') || '3')
})

// Methods
function handleSaveLLMConfig() {
  localStorage.setItem('llm_provider', llmConfig.provider)
  localStorage.setItem('llm_api_url', llmConfig.apiUrl)
  localStorage.setItem('llm_api_key', llmConfig.apiKey)
  localStorage.setItem('llm_model', llmConfig.model)
  localStorage.setItem('llm_temperature', String(llmConfig.temperature))
  localStorage.setItem('llm_max_tokens', String(llmConfig.maxTokens))
  
  ElMessage.success('LLM configuration saved')
}

function handleLanguageChange(lang: string) {
  configStore.setLanguage(lang as any)
  locale.value = lang
  ElMessage.success('Language changed')
}

function handleSaveMapDefaults() {
  localStorage.setItem('map_basemap', mapDefaults.basemap)
  localStorage.setItem('map_center', JSON.stringify(mapDefaults.center))
  localStorage.setItem('map_zoom', String(mapDefaults.zoom))
  
  ElMessage.success('Map defaults saved')
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
    color: #303133;
  }
}

.settings-tabs {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
}

.form-help {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.5;
}

.about-section {
  max-width: 600px;
  
  h3 {
    margin: 0 0 8px 0;
    color: #303133;
  }
  
  .version {
    margin: 0 0 24px 0;
    color: #909399;
    font-size: 14px;
  }
  
  .credits {
    margin-top: 24px;
    
    h4 {
      margin: 0 0 8px 0;
      color: #606266;
    }
    
    p {
      margin: 0;
      color: #909399;
      font-size: 14px;
    }
  }
}
</style>
