<template>
  <div class="messages-container" ref="containerRef">
    <div v-if="messages.length === 0" class="empty-state">
      <el-icon :size="64" color="#409eff">
        <ChatDotRound />
      </el-icon>
      <p class="welcome-title">{{ $t('chat.welcomeTitle') }}</p>
      <p class="welcome-description">{{ $t('chat.welcomeDescription') }}</p>
    </div>

    <MessageBubble 
      v-for="(msg, index) in messages" 
      :key="msg.id" 
      :message="msg"
      :is-streaming="isStreaming && index === messages.length - 1 && msg.role === 'assistant'" 
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChatDotRound } from '@element-plus/icons-vue'
import MessageBubble from './MessageBubble.vue'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  services?: any[]
}

interface Props {
  messages: ChatMessage[]
  isStreaming: boolean
}

defineProps<Props>()

const containerRef = ref<HTMLElement>()

// Expose scroll method
function scrollToBottom() {
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
}

defineExpose({
  scrollToBottom
})
</script>

<style scoped lang="scss">
.messages-container {
  flex: 1;
  min-height: 0; // Critical for flex child scrolling
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--el-text-color-secondary);
  flex: 1 1 auto;
  min-height: 0;
  text-align: center;
  padding: 0 20px;

  .welcome-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin: 0;
  }

  .welcome-description {
    font-size: 14px;
    line-height: 1.6;
    margin: 0;
    max-width: 500px;
  }
}
</style>
