<template>
  <div class="chat-view">
    <!-- Conversation Sidebar -->
    <div class="conversation-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <el-button type="primary" @click="handleNewChat" :icon="Plus">
          {{ $t('chat.newChat') }}
        </el-button>
      </div>
      
      <!-- Data Sources Toggle -->
      <div class="data-sources-toggle">
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
      <div v-if="showDataSources" class="data-sources-section">
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
      
      <div class="conversation-list">
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
    </div>
    
    <!-- Main Chat Area -->
    <div class="chat-main">
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
          v-for="msg in chatStore.currentMessages"
          :key="msg.id"
          :message="msg"
          :is-streaming="chatStore.isStreaming && msg.role === 'assistant'"
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
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useDataSourceStore } from '@/stores/dataSources'
import { useI18n } from 'vue-i18n'
import MessageBubble from '@/components/chat/MessageBubble.vue'
import { Plus, Delete, ChatDotRound, Promotion, Folder } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'

const { t } = useI18n()
const chatStore = useChatStore()
const dataSourceStore = useDataSourceStore()
const inputMessage = ref('')
const messagesContainerRef = ref<HTMLElement>()
const sidebarCollapsed = ref(false)
const showDataSources = ref(false)

// Lifecycle
import { onMounted } from 'vue'
onMounted(async () => {
  await chatStore.loadConversations()
  await dataSourceStore.loadDataSources()
})

// Methods
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
  
  &.collapsed {
    width: 0;
    overflow: hidden;
  }
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color);
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
  flex-direction: column;
  background: var(--el-bg-color);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
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
