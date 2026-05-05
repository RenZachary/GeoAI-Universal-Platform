<template>
  <div class="chat-view">
    <!-- Conversation Sidebar -->
    <aside class="conversation-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <el-button 
          v-if="!sidebarCollapsed"
          type="primary" 
          @click="handleNewChat" 
          :icon="Plus"
        >
          {{ $t('chat.newChat') }}
        </el-button>
        <el-button 
          class="sidebar-toggle-btn"
          text
          @click="sidebarCollapsed = !sidebarCollapsed"
          :title="sidebarCollapsed ? 'Expand' : 'Collapse'"
        >
          {{ sidebarCollapsed ? '▶' : '◀' }}
        </el-button>
      </div>
      
      <!-- Data Sources Toggle -->
      <div v-if="!sidebarCollapsed" class="data-sources-toggle">
        <el-button 
          text 
          size="small" 
          @click="showDataSources = !showDataSources"
          style="width: 100%; justify-content: flex-start"
        >
          <el-icon><Folder /></el-icon>
          {{ showDataSources ? t('chat.hideDataSources') : t('chat.showDataSources') }} ({{ dataSourceStore.dataSources.length }})
        </el-button>
      </div>
      
      <!-- Data Sources List -->
      <div v-if="!sidebarCollapsed && showDataSources" class="data-sources-section">
        <div class="section-title">{{ t('chat.availableData') }}</div>
        <div 
          v-for="ds in dataSourceStore.dataSources" 
          :key="ds.id"
          class="data-source-item"
          @click="handleAddDataSourceToChat(ds)"
        >
          <div class="ds-info">
            <span class="ds-name">{{ ds.name }}</span>
            <el-tag size="small" type="info">{{ ds.type }}</el-tag>
          </div>
          <div class="ds-meta">
            <span>{{ (ds.metadata as any)?.featureCount || 'N/A' }} {{ t('chat.records') }}</span>
          </div>
        </div>
        <el-empty 
          v-if="dataSourceStore.dataSources.length === 0"
          :description="t('chat.noDataSources')"
          :image-size="60"
        >
          <el-button size="small" type="primary" @click="$router.push('/data')">
            {{ t('chat.uploadData') }}
          </el-button>
        </el-empty>
      </div>
      
      <div v-if="!sidebarCollapsed" class="conversation-list">
        <div
          v-for="conv in chatStore.conversations"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: conv.id === chatStore.currentConversationId }"
          @click="handleSelectConversation(conv.id)"
        >
          <span class="conversation-title">{{ conv.title || 'Untitled' }}</span>
          <el-icon 
            class="delete-icon"
            @click.stop="handleDeleteConversation(conv.id)"
          >
            <Delete />
          </el-icon>
        </div>
        
        <el-empty 
          v-if="chatStore.conversations.length === 0"
          :description="$t('chat.noMessages')"
          :image-size="80"
        />
      </div>
    </aside>
    
    <!-- Main Content Area: Split Layout -->
    <main class="chat-main split-layout">
      <!-- Left Panel: Chat -->
      <div 
        class="chat-panel" 
        :style="{ width: chatPanelWidth + '%' }"
      >
        <!-- Workflow Status Indicator -->
        <WorkflowStatusIndicator 
          :status="chatStore.workflowStatus"
          :active-tools="chatStore.activeTools"
        />
        
        <!-- Messages Container -->
        <div class="messages-container" ref="messagesContainerRef">
          <div v-if="chatStore.currentMessages.length === 0" class="empty-state">
            <el-icon :size="64" color="#409eff"><ChatDotRound /></el-icon>
            <p>{{ $t('chat.noMessages') }}</p>
            
            <!-- Quick Actions -->
            <div class="quick-actions">
              <el-button @click="handleQuickAction('buffer')">Buffer Analysis</el-button>
              <el-button @click="handleQuickAction('overlay')">Overlay Analysis</el-button>
              <el-button @click="handleQuickAction('statistics')">Statistics</el-button>
            </div>
          </div>
          
          <MessageBubble
            v-for="(msg, index) in chatStore.currentMessages"
            :key="msg.id"
            :message="msg"
            :is-streaming="shouldShowStreaming(msg, index)"
          />
        </div>
        
        <!-- Input Area -->
        <div class="input-area">
          <el-input
            v-model="inputMessage"
            type="textarea"
            :placeholder="$t('chat.placeholder')"
            :rows="3"
            :disabled="chatStore.isStreaming"
            @keydown.enter.ctrl="handleSendMessage"
          />
          <div class="input-actions">
            <el-button 
              type="primary" 
              :loading="chatStore.isStreaming"
              :disabled="!inputMessage.trim()"
              @click="handleSendMessage"
            >
              <el-icon><Promotion /></el-icon>
              Send
            </el-button>
          </div>
        </div>
      </div>

      <!-- Split Pane Resizer -->
      <SplitPane 
        :initial-ratio="0.4"
        @resize="handleSplitResize"
      />

      <!-- Right Panel: Map -->
      <div 
        class="map-panel"
        :style="{ width: mapPanelWidth + '%' }"
      >
        <MapWorkspace />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useDataSourceStore } from '@/stores/dataSources'
import { useI18n } from 'vue-i18n'
import MessageBubble from '@/components/chat/MessageBubble.vue'
import WorkflowStatusIndicator from '@/components/chat/WorkflowStatusIndicator.vue'
import SplitPane from '@/components/chat-map/SplitPane.vue'
import MapWorkspace from '@/components/chat-map/MapWorkspace.vue'
import { Plus, Delete, ChatDotRound, Promotion, Folder } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'

const { t } = useI18n()
const chatStore = useChatStore()
const dataSourceStore = useDataSourceStore()
const inputMessage = ref('')
const messagesContainerRef = ref<HTMLElement>()

// Load sidebar state from localStorage
const SIDERBAR_COLLAPSED_KEY = 'chat-sidebar-collapsed'
const savedSidebarState = localStorage.getItem(SIDERBAR_COLLAPSED_KEY)
const sidebarCollapsed = ref(savedSidebarState === 'true')

const showDataSources = ref(false)
const chatPanelWidth = ref(40)
const mapPanelWidth = ref(60)

// Debug: Watch partialServices changes
watch(() => chatStore.partialServices, (newVal) => {
  console.log('[ChatView] partialServices changed:', newVal.length, 'services')
  if (newVal.length > 0) {
    console.log('[ChatView] First service:', newVal[0])
  }
}, { deep: true })

// Watch sidebar collapsed state and save to localStorage
watch(sidebarCollapsed, (newValue) => {
  localStorage.setItem(SIDERBAR_COLLAPSED_KEY, newValue.toString())
  console.log('[ChatView] Sidebar state saved:', newValue ? 'collapsed' : 'expanded')
})

// Lifecycle
import { onMounted } from 'vue'
onMounted(async () => {
  await chatStore.loadConversations()
  await dataSourceStore.loadDataSources()
})

// Methods
function shouldShowStreaming(msg: any, index: number): boolean {
  const messages = chatStore.currentMessages
  const isLastMessage = index === messages.length - 1
  const isAssistant = msg.role === 'assistant'
  const isStreaming = chatStore.isStreaming
    
  return isStreaming && isAssistant && isLastMessage
}

async function handleSendMessage() {
  if (!inputMessage.value.trim() || chatStore.isStreaming) return
  
  const message = inputMessage.value
  inputMessage.value = ''
  
  await chatStore.sendMessage(message, () => {
    // Scroll to bottom on each token
    scrollToBottom()
  })
  
  scrollToBottom()
}

function handleSelectConversation(conversationId: string) {
  chatStore.loadConversation(conversationId)
}

async function handleDeleteConversation(conversationId: string) {
  try {
    await ElMessageBox.confirm(
      t('chat.deleteConfirm'),
      t('chat.confirmDelete'),
      {
        confirmButtonText: t('chat.delete'),
        cancelButtonText: t('chat.cancel'),
        type: 'warning'
      }
    )
    
    await chatStore.deleteConversation(conversationId)
  } catch {
    // User cancelled
  }
}

function handleNewChat() {
  chatStore.createNewConversation()
}

function handleQuickAction(action: string) {
  const prompts: Record<string, string> = {
    buffer: 'Perform a buffer analysis on my data',
    overlay: 'Run an overlay analysis between two layers',
    statistics: 'Calculate statistics for my dataset'
  }
  
  inputMessage.value = prompts[action] || ''
}

function handleAddDataSourceToChat(dataSource: any) {
  // Insert data source reference into chat input
  const mention = `@${dataSource.name}`
  if (inputMessage.value) {
    inputMessage.value += ` ${mention}`
  } else {
    inputMessage.value = `Analyze ${mention}: `
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
    }
  })
}

function handleSplitResize(ratio: number) {
  chatPanelWidth.value = ratio * 100
  mapPanelWidth.value = (1 - ratio) * 100
}

// Service handlers
function handleServicePreview(service: any) {
  // Open service URL in new tab or show preview dialog
  window.open(service.url, '_blank')
  ElMessage.success(`Opening ${service.type} preview`)
}

function handleServiceDownload(service: any) {
  // Trigger download
  const link = document.createElement('a')
  link.href = service.url
  link.download = `${service.stepId || 'result'}.${service.type}`
  link.click()
  ElMessage.success(`Downloading ${service.type} file`)
}

function handleViewOnMap(service: any) {
  // TODO: Add layer to map store
  console.log('[ChatView] View on map:', service)
  ElMessage.info(`Adding ${service.type} layer to map...`)
  
  // Navigate to map view if not already there
  // In future, integrate with mapStore to add layer directly
  // For now, just show a message
  ElMessage({
    message: `MVT/WMS service ready. You can view it on the Map page.`,
    type: 'success',
    duration: 3000
  })
}
</script>

<style scoped lang="scss">
.chat-view {
  display: flex;
  height: 100%;
  background: var(--el-bg-color-page);
}

.conversation-sidebar {
  width: 260px;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.3s;
  overflow: hidden;
  
  &.collapsed {
    width: 40px;
  }
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  gap: 8px;
  align-items: center;
}

.sidebar-toggle-btn {
  min-width: 32px;
  padding: 4px 8px;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.conversation-item {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  
  &:hover {
    background: var(--el-fill-color-light);
  }
  
  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
}

.conversation-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.delete-icon {
  opacity: 0;
  transition: opacity 0.2s;
  
  &:hover {
    color: var(--el-color-danger);
  }
}

.conversation-item:hover .delete-icon {
  opacity: 1;
}

.data-sources-toggle {
  padding: 8px 8px;
  border-bottom: 1px solid var(--el-border-color);
}

.data-sources-section {
  max-height: 300px;
  overflow-y: auto;
  border-bottom: 1px solid var(--el-border-color);
}

.section-title {
  padding: 12px 16px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}

.data-source-item {
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s;
  
  &:hover {
    background: var(--el-fill-color-light);
  }
}

.ds-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.ds-name {
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.chat-main {
  flex: 1;
  display: flex;
  background: var(--el-bg-color);
  overflow: hidden;
}

.split-layout {
  display: flex;
  width: 100%;
  height: 100%;
}

.chat-panel {
  display: flex;
  flex-direction: column;
  min-width: 30%;
  max-width: 70%;
  background: var(--el-bg-color);
}

.map-panel {
  display: flex;
  flex-direction: column;
  min-width: 30%;
  max-width: 70%;
  background: var(--el-bg-color-page);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 24px;
  color: var(--el-text-color-secondary);
  
  p {
    font-size: 16px;
  }
}

.quick-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.input-area {
  display: flex;
  flex-direction: row;
  gap: 8px;
  border-top: 1px solid var(--el-border-color);
  padding: 8px;
  background: var(--el-bg-color);
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
</style>
