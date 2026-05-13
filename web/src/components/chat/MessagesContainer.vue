<template>
  <div class="messages-container" ref="containerRef">
    <div v-if="messages.length === 0" class="empty-state">
      <el-icon :size="64" color="#409eff">
        <ChatDotRound />
      </el-icon>
      <p>{{ $t('chat.noMessages') }}</p>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <el-button @click="$emit('quick-action', 'buffer')">Buffer Analysis</el-button>
        <el-button @click="$emit('quick-action', 'overlay')">Overlay Analysis</el-button>
        <el-button @click="$emit('quick-action', 'statistics')">Statistics</el-button>
      </div>
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

const emit = defineEmits<{
  'quick-action': [action: string]
}>()

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
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--el-text-color-secondary);
  flex: 1 1 auto; // Changed from flex: 1 to allow shrinking
  min-height: 0;

  p {
    font-size: 16px;
    margin: 0;
  }
}

.quick-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
</style>
