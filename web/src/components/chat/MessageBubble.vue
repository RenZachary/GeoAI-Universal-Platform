<template>
  <div class="message-bubble" :class="message.role">
    <div class="message-avatar">
      <el-icon v-if="message.role === 'user'" :size="24">
        <User />
      </el-icon>
      <el-icon v-else :size="24" color="#409eff">
        <ChatDotRound />
      </el-icon>
    </div>
    
    <div class="message-content">
      <div class="message-header">
        <span class="message-role">{{ message.role === 'user' ? $t('chat.user') : 'AI Assistant' }}</span>
        <span class="message-time">{{ formatTime(message.timestamp) }}</span>
      </div>
      
      <div class="message-text" v-html="renderedContent" />
      
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
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/types'
import { User, ChatDotRound, DocumentCopy, RefreshRight } from '@element-plus/icons-vue'
import { marked } from 'marked'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()

const props = defineProps<{
  message: ChatMessage
  isStreaming?: boolean
}>()

// Render markdown content
const renderedContent = computed(() => {
  if (props.message.role === 'user') {
    return props.message.content
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

function handleCopy() {
  navigator.clipboard.writeText(props.message.content)
}

function handleRegenerate() {
  if (props.message.role !== 'assistant' || chatStore.isStreaming) return
  
  // Get the previous user message
  const messages = chatStore.currentMessages
  const currentIndex = messages.findIndex((m: ChatMessage) => m.id === props.message.id)
  if (currentIndex <= 0) return
  
  const lastUserMessage = messages[currentIndex - 1]
  if (lastUserMessage.role !== 'user') return
  
  // Simply re-send the user message to regenerate (backend will handle conversation context)
  chatStore.sendMessage(lastUserMessage.content)
}
</script>

<style scoped lang="scss">
.message-bubble {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  padding: 16px;
  border-radius: 12px;
  
  &.user {
    background: #f5f7fa;
    
    .message-avatar {
      background: #67c23a;
      color: white;
    }
  }
  
  &.assistant {
    background: #fff;
    border: 1px solid #e4e7ed;
    
    .message-avatar {
      background: #ecf5ff;
      color: #409eff;
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
  color: #303133;
}

.message-time {
  font-size: 12px;
  color: #909399;
}

.message-text {
  font-size: 14px;
  line-height: 1.6;
  color: #606266;
  word-wrap: break-word;
  
  :deep(p) {
    margin: 8px 0;
  }
  
  :deep(code) {
    background: #f5f7fa;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
  }
  
  :deep(pre) {
    background: #282c34;
    color: #abb2bf;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 12px 0;
    
    code {
      background: transparent;
      padding: 0;
    }
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
    background: #409eff;
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
</style>
