<template>
  <div class="chat-view">
    <!-- Conversation Sidebar -->
    <aside class="conversation-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <el-button v-if="!sidebarCollapsed" type="primary" size="small" @click="handleNewChat" :icon="Plus">
          {{ $t('chat.newChat') }}
        </el-button>
        <el-button class="sidebar-toggle-btn" text @click="sidebarCollapsed = !sidebarCollapsed"
          :title="sidebarCollapsed ? 'Expand' : 'Collapse'">
          {{ sidebarCollapsed ? '▶' : '◀' }}
        </el-button>
      </div>

      <div v-if="!sidebarCollapsed" class="conversation-list">
        <div v-for="conv in chatStore.conversations" :key="conv.id" class="conversation-item"
          :class="{ active: conv.id === chatStore.currentConversationId }" @click="handleSelectConversation(conv.id)">
          <span class="conversation-title">{{ conv.title || 'Untitled' }}</span>
          <el-icon class="delete-icon" @click.stop="handleDeleteConversation(conv.id)">
            <Delete />
          </el-icon>
        </div>

        <el-empty v-if="chatStore.conversations.length === 0" :description="$t('chat.noMessages')" :image-size="80" />
      </div>
    </aside>

    <!-- Main Content Area: Split Layout -->
    <main class="chat-main split-layout">
      <!-- Left Panel: Chat -->
      <div class="chat-panel" :style="{ width: chatPanelWidth + '%' }">
        <!-- Workflow Status Indicator -->
        <WorkflowStatusIndicator :status="chatStore.workflowStatus" :active-tools="chatStore.activeTools" />

        <!-- Messages Container -->
        <div class="messages-container" ref="messagesContainerRef">
          <div v-if="chatStore.currentMessages.length === 0" class="empty-state">
            <el-icon :size="64" color="#409eff">
              <ChatDotRound />
            </el-icon>
            <p>{{ $t('chat.noMessages') }}</p>

            <!-- Quick Actions -->
            <div class="quick-actions">
              <el-button @click="handleQuickAction('buffer')">Buffer Analysis</el-button>
              <el-button @click="handleQuickAction('overlay')">Overlay Analysis</el-button>
              <el-button @click="handleQuickAction('statistics')">Statistics</el-button>
            </div>
          </div>

          <MessageBubble v-for="(msg, index) in chatStore.currentMessages" :key="msg.id" :message="msg"
            :is-streaming="shouldShowStreaming(msg, index)" />
        </div>

        <!-- Input Area -->
        <div class="input-area" style="position: relative">
          <el-input
            v-model="inputMessage"
            type="textarea"
            placeholder="Type your message... Use @ to mention data sources"
            :rows="3"
            :disabled="chatStore.isStreaming"
            @input="handleInput"
            @keydown="handleKeydown"
          />
          
          <!-- Custom autocomplete dropdown -->
          <div v-if="showAutocomplete && filteredDataSources.length > 0" class="autocomplete-dropdown">
            <div 
              v-for="(ds, index) in filteredDataSources" 
              :key="ds.id"
              class="autocomplete-item"
              :class="{ active: index === activeSuggestionIndex }"
              @click="selectDataSource(ds)"
              @mouseenter="activeSuggestionIndex = index"
            >
              <span class="suggestion-name">{{ ds.name }}</span>
              <el-tag size="small" type="info">{{ ds.type }}</el-tag>
            </div>
          </div>
          
          <div class="input-actions">
            <el-button type="primary" :loading="chatStore.isStreaming" :disabled="!inputMessage.trim()"
              @click="handleSendMessage">
              <el-icon>
                <Promotion />
              </el-icon>
              Send
            </el-button>
          </div>
        </div>
      </div>

      <!-- Split Pane Resizer -->
      <SplitPane :initial-ratio="0.4" @resize="handleSplitResize" />

      <!-- Right Panel: Map -->
      <div class="map-panel" :style="{ width: mapPanelWidth + '%' }">
        <MapWorkspace />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
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

// Autocomplete state
const showAutocomplete = ref(false)
const activeSuggestionIndex = ref(0)
const mentionStartPos = ref(-1)

// Load sidebar state from localStorage
const SIDERBAR_COLLAPSED_KEY = 'chat-sidebar-collapsed'
const savedSidebarState = localStorage.getItem(SIDERBAR_COLLAPSED_KEY)
const sidebarCollapsed = ref(savedSidebarState === 'true')

const chatPanelWidth = ref(40)
const mapPanelWidth = ref(60)

// Computed: Filtered data sources based on @mention text
const filteredDataSources = computed(() => {
  if (mentionStartPos.value === -1) return []
  
  const textAfterAt = inputMessage.value.slice(mentionStartPos.value + 1).toLowerCase()
  
  return dataSourceStore.dataSources.filter(ds => 
    ds.name.toLowerCase().includes(textAfterAt)
  )
})

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

// Autocomplete handlers
function handleInput() {
  // Check if user typed @
  const cursorPos = getCursorPosition()
  const textBeforeCursor = inputMessage.value.slice(0, cursorPos)
  const lastAtIndex = textBeforeCursor.lastIndexOf('@')
  
  if (lastAtIndex !== -1) {
    // Check if there's a space after @
    const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
    if (!textAfterAt.includes(' ')) {
      mentionStartPos.value = lastAtIndex
      showAutocomplete.value = true
      activeSuggestionIndex.value = 0
      return
    }
  }
  
  // Hide autocomplete if no valid @mention
  showAutocomplete.value = false
  mentionStartPos.value = -1
}

function handleKeydown(event: KeyboardEvent) {
  if (!showAutocomplete.value) return
  
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeSuggestionIndex.value = Math.min(
      activeSuggestionIndex.value + 1,
      filteredDataSources.value.length - 1
    )
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeSuggestionIndex.value = Math.max(activeSuggestionIndex.value - 1, 0)
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    if (filteredDataSources.value.length > 0) {
      selectDataSource(filteredDataSources.value[activeSuggestionIndex.value])
    }
  } else if (event.key === 'Escape') {
    showAutocomplete.value = false
  }
}

function selectDataSource(ds: any) {
  if (mentionStartPos.value === -1) return
  
  const beforeMention = inputMessage.value.slice(0, mentionStartPos.value)
  const afterMention = inputMessage.value.slice(mentionStartPos.value + 1)
  const spaceIndex = afterMention.indexOf(' ')
  const mentionEnd = spaceIndex === -1 ? afterMention.length : spaceIndex
  const afterMentionText = afterMention.slice(mentionEnd)
  
  // Insert the data source name with @ prefix
  inputMessage.value = `${beforeMention}@${ds.name} ${afterMentionText}`
  
  // Hide autocomplete
  showAutocomplete.value = false
  mentionStartPos.value = -1
  
  // Focus back on textarea and set cursor position
  nextTick(() => {
    const textarea = document.querySelector('.input-area textarea') as HTMLTextAreaElement
    if (textarea) {
      textarea.focus()
      const newPos = beforeMention.length + ds.name.length + 2 // +2 for @ and space
      textarea.setSelectionRange(newPos, newPos)
    }
  })
}

function getCursorPosition(): number {
  const textarea = document.querySelector('.input-area textarea') as HTMLTextAreaElement
  return textarea ? textarea.selectionStart : inputMessage.value.length
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
  padding: 8px 0px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-around;
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

.suggestion-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.suggestion-name {
  flex: 1;
}

.autocomplete-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  margin-bottom: 8px;
}

.autocomplete-item {
  padding: 10px 16px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  transition: background 0.2s;
  
  &:hover,
  &.active {
    background: var(--el-fill-color-light);
  }
}
</style>
