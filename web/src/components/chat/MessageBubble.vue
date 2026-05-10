<template>
  <div class="message-bubble" :class="message.role">
    <div class="message-avatar">
      <el-icon v-if="message.role === 'user'" :size="24">
        <User />
      </el-icon>
      <el-icon v-else :size="24" color="var(--el-color-primary)">
        <ChatDotRound />
      </el-icon>
    </div>
    
    <div class="message-content">
      <div class="message-header">
        <span class="message-role">{{ message.role === 'user' ? $t('chat.user') : 'AI Assistant' }}</span>
        <span class="message-time">{{ formatTime(message.timestamp) }}</span>
      </div>
      
      <div class="message-text" v-html="renderedContent" />
      
      <!-- Service links -->
      <div v-if="message.services && message.services.length > 0" class="service-links">
        <div class="service-links-header">
          <el-icon><Link /></el-icon>
          <span>Generated Services ({{ message.services.length }})</span>
        </div>
        <div class="service-link-list">
          <div 
            v-for="service in message.services" 
            :key="service.id"
            class="service-link-item"
          >
            <el-icon>
              <Reading v-if="service.type === VisualizationServiceType.Report" />
              <Document v-else-if="service.type === VisualizationServiceType.GeoJSON" />
              <MapLocation v-else />
            </el-icon>
            <span class="service-name">{{ getServiceName(service) }}</span>
            <el-button 
              
              link 
              type="primary" 
              size="small"
              @click="handleViewService(service)"
            >
              {{ getActionText(service) }}
            </el-button>
          </div>
        </div>
      </div>
      <!-- Debug: Show when services exist but not rendered -->
      <div v-else-if="message.services" class="debug-info" style="color: red; font-size: 12px; margin-top: 8px;">
        Services array exists but length is 0
      </div>
      
      <!-- Streaming indicator -->
      <div v-if="isStreaming" class="streaming-indicator">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      
      <!-- Message actions -->
      <div v-if="!isStreaming && message.role === 'assistant'" class="message-actions">
        <el-button text size="small" @click="handleCopy">
          <el-icon><DocumentCopy /></el-icon>
          {{ $t('chat.copy') }}
        </el-button>
        <el-button text size="small" @click="handleRegenerate">
          <el-icon><RefreshRight /></el-icon>
          {{ $t('chat.regenerate') }}
        </el-button>
      </div>
    </div>
  </div>

  <!-- Report Preview Modal -->
  <ReportPreviewModal
    v-model="showReportModal"
    :report-url="currentReportUrl"
    :title="currentReportTitle"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChatMessage, VisualizationService } from '@/types'
import { VisualizationServiceType } from '@/types'
import { User, ChatDotRound, DocumentCopy, RefreshRight, Link, Document, MapLocation, Reading } from '@element-plus/icons-vue'
import { marked } from 'marked'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import { useMapStore } from '@/stores/map'
import { useToolStore } from '@/stores/tools'
import ReportPreviewModal from './ReportPreviewModal.vue'

const chatStore = useChatStore()
const mapStore = useMapStore()

// Report preview modal state
const showReportModal = ref(false)
const currentReportUrl = ref('')
const currentReportTitle = ref('')
const toolStore = useToolStore()

const props = defineProps<{
  message: ChatMessage
  isStreaming?: boolean
}>()

// Render markdown content
const renderedContent = computed(() => {
  if (props.message.role === 'user') {
    // For user messages, convert @[datasource:ID] back to @name with highlights
    let content = props.message.content
    
    // Find all @[datasourceId:UUID](Name) patterns and replace with highlighted @name
    const datasourceRegex = /@\[datasourceId:([^\]]+)\]\(([^)]+)\)/g
    content = content.replace(datasourceRegex, (match, datasourceId, dsName) => {
      // Return highlighted span with the data source name
      return `<span class="mention-highlight" data-datasource-id="${datasourceId}">@${dsName}</span>`
    })
    
    // Find all /[tool:ID] patterns and replace with highlighted /name
    const toolRegex = /\/\[tool:([^\]]+)\]/g
    content = content.replace(toolRegex, (match, toolId) => {
      // Find the tool by ID
      const tool = toolStore.tools.find((t: any) => t.id === toolId)
      if (tool) {
        // Return highlighted span with the tool name
        return `<span class="tool-highlight">/${tool.name}</span>`
      }
      // If not found, return the original match
      return match
    })
    
    return content
  }
  
  // Parse markdown for assistant messages
  try {
    return marked(props.message.content)
  } catch (e) {
    return props.message.content
  }
})

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getServiceName(service: VisualizationService): string {
  const metadata = service.metadata
  // Check for operatorId or pluginId (both are used in different contexts)
  const operatorName = metadata?.operatorId || metadata?.pluginId
  if (operatorName) {
    return operatorName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
  }
  return service.type.toUpperCase() + ' Service'
}

function getActionText(service: VisualizationService): string {
  // If service has styleConfig, it's a visualization service that should be viewed on map
  if (service.metadata?.styleConfig) {
    return 'View on Map'
  }
  
  // Otherwise, use type-based logic
  if (service.type === VisualizationServiceType.MVT || service.type === VisualizationServiceType.WMS || service.type === VisualizationServiceType.Image) {
    return 'View on Map'
  } else if (service.type === VisualizationServiceType.GeoJSON) {
    return 'Download'
  } else if (service.type === VisualizationServiceType.Heatmap) {
    return 'View Heatmap'
  } else if (service.type === VisualizationServiceType.Report) {
    return 'View Report'
  }
  return 'View'
}

function handleViewService(service: VisualizationService) {
  // If service has styleConfig, treat it as a visualization service and add to map
  if (service.metadata?.styleConfig || 
      service.type === VisualizationServiceType.MVT || 
      service.type === VisualizationServiceType.WMS || 
      service.type === VisualizationServiceType.Image) {
    // Unidirectional flow: chat → map, no callback
    mapStore.addLayerFromService(service)
    
    ElMessage.success(`Layer "${service.metadata?.name || service.id}" added to map`)
  } else if (service.type === VisualizationServiceType.Report) {
    // For reports, open preview modal
    currentReportUrl.value = service.url.startsWith('http') 
      ? service.url 
      : `${window.location.origin}${service.url}`
    currentReportTitle.value = service.metadata?.title || 'Report Preview'
    showReportModal.value = true
  } else {
    // For file-based services (geojson), trigger download - convert relative URL to absolute
    const downloadUrl = service.url.startsWith('http') 
      ? service.url 
      : `${window.location.origin}${service.url}`
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${service.stepId || 'result'}.${service.type}`
    link.click()
    ElMessage.success(`Downloading ${service.type} file`)
  }
}

function handleCopy() {
  navigator.clipboard.writeText(props.message.content)
}

function handleRegenerate() {
  if (props.message.role !== 'assistant' || chatStore.isStreaming) return
  
  // Get the previous user message
  const messages = chatStore.currentMessages
  const currentIndex = messages.findIndex((m: ChatMessage) => m.id === props.message.id)
  
  if (currentIndex <= 0) {
    return
  }
  
  const lastUserMessage = messages[currentIndex - 1]
  
  if (!lastUserMessage || lastUserMessage.role !== 'user') {
    return
  }
  
  // Re-send the user message to regenerate (backend will handle conversation context)
  chatStore.sendMessage(lastUserMessage.content)
}
</script>

<style scoped lang="scss">
.message-bubble {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 12px;
  
  &.user {
    background: var(--el-fill-color-light);
    
    .message-avatar {
      background: var(--el-color-primary-light-7);
      color: white;
    }
  }
  
  &.assistant {
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color);
    
    .message-avatar {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
    }
  }
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.message-role {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.message-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.message-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  word-wrap: break-word;
  
  :deep(p) {
    margin: 8px 0;
  }
  
  :deep(code) {
    background: var(--el-fill-color-light);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
  }
  
  :deep(pre) {
    background: var(--el-bg-color-page);
    color: var(--el-text-color-regular);
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 12px 0;
    border: 1px solid var(--el-border-color);
    
    code {
      background: transparent;
      padding: 0;
    }
  }
  
  // Support for @mention highlights in user messages
  :deep(.mention-highlight) {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
  }
  
  // Support for /tool highlights in user messages
  :deep(.tool-highlight) {
    color: var(--el-color-success);
    background: var(--el-color-success-light-9);
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
  }
}

.streaming-indicator {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--el-color-primary);
    animation: bounce 1.4s infinite ease-in-out both;
    
    &:nth-child(1) {
      animation-delay: -0.32s;
    }
    
    &:nth-child(2) {
      animation-delay: -0.16s;
    }
  }
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.message-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-bubble:hover .message-actions {
  opacity: 1;
}

.service-links {
  margin-top: 16px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.service-links-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}

.service-link-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.service-link-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
  transition: all 0.2s;
  
  &:hover {
    border-color: var(--el-color-primary);
    background: var(--el-fill-color-light);
  }
}

.service-name {
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
