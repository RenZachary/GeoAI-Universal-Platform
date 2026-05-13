<template>
  <div class="chat-panel">
    <!-- Workflow Status Indicator -->
    <WorkflowStatusIndicator 
      :status="workflowStatus" 
      :intent="currentIntent" 
    />

    <!-- Messages Container -->
    <MessagesContainer 
      ref="messagesContainerRef"
      :messages="messages"
      :is-streaming="isStreaming"
      @quick-action="$emit('quick-action', $event)"
    />

    <!-- Input Area -->
    <ChatInputArea
      ref="inputAreaRef"
      :model-value="inputMessage"
      @update:model-value="$emit('update:input-message', $event)"
      :disabled="isStreaming"
      :loading="isStreaming"
      :show-autocomplete="showAutocomplete"
      :autocomplete-type="autocompleteType"
      :active-suggestion-index="activeSuggestionIndex"
      :filtered-data-sources="filteredDataSources"
      :filtered-tools="filteredTools"
      @send="$emit('send-message')"
      @input="$emit('editor-input', $event)"
      @keydown="$emit('editor-keydown', $event)"
      @paste="$emit('editor-paste', $event)"
      @select-datasource="$emit('select-datasource', $event)"
      @select-tool="$emit('select-tool', $event)"
      @update:active-suggestion-index="$emit('update:active-suggestion-index', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import WorkflowStatusIndicator from './WorkflowStatusIndicator.vue'
import MessagesContainer from './MessagesContainer.vue'
import ChatInputArea from './ChatInputArea.vue'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  services?: any[]
}

interface Intent {
  type: string
  confidence: number
  reasoning: string
}

interface DataSource {
  id: string
  name: string
  type: string
}

interface Tool {
  id: string
  name: string
  category?: string
  description?: string
}

interface Props {
  workflowStatus: string
  currentIntent: Intent | null
  messages: ChatMessage[]
  isStreaming: boolean
  inputMessage: string
  showAutocomplete: boolean
  autocompleteType: 'datasource' | 'tool'
  activeSuggestionIndex: number
  filteredDataSources: DataSource[]
  filteredTools: Tool[]
}

defineProps<Props>()

const emit = defineEmits<{
  'send-message': []
  'quick-action': [action: string]
  'editor-input': [event: Event]
  'editor-keydown': [event: KeyboardEvent]
  'editor-paste': [event: ClipboardEvent]
  'select-datasource': [ds: DataSource]
  'select-tool': [tool: Tool]
  'update:active-suggestion-index': [index: number]
  'update:input-message': [value: string]
}>()

const messagesContainerRef = ref<InstanceType<typeof MessagesContainer>>()
const inputAreaRef = ref<InstanceType<typeof ChatInputArea>>()

// Expose methods for parent component
function scrollToBottom() {
  messagesContainerRef.value?.scrollToBottom()
}

defineExpose({
  scrollToBottom
})
</script>

<style scoped lang="scss">
.chat-panel {
  height: 100% !important;
  max-height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  background: var(--el-bg-color);
  overflow: hidden !important;
  position: relative;
  box-sizing: border-box;
}
</style>
