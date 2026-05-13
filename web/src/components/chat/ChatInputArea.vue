<template>
  <div class="input-area">
    <div 
      ref="editorRef" 
      class="rich-editor" 
      contenteditable="true" 
      @input="handleEditorInput"
      @keydown="handleEditorKeydown" 
      @paste="handlePaste" 
      :disabled="disabled"
      :data-placeholder="t('chat.placeholder')"
    ></div>

    <!-- Custom autocomplete dropdown for @datasources -->
    <div 
      v-if="showAutocomplete && autocompleteType === 'datasource' && filteredDataSources.length > 0"
      class="autocomplete-dropdown"
    >
      <div 
        v-for="(ds, index) in filteredDataSources" 
        :key="ds.id" 
        class="autocomplete-item"
        :class="{ active: index === activeSuggestionIndex }" 
        @mousedown.prevent="$emit('select-datasource', ds)"
        @mouseenter="$emit('update:activeSuggestionIndex', index)"
      >
        <span class="suggestion-name">{{ ds.name }}</span>
        <el-tag size="small" type="info">{{ ds.type }}</el-tag>
      </div>
    </div>

    <!-- Custom autocomplete dropdown for /tools -->
    <div 
      v-if="showAutocomplete && autocompleteType === 'tool' && filteredTools.length > 0"
      class="autocomplete-dropdown tool-dropdown"
    >
      <div 
        v-for="(tool, index) in filteredTools" 
        :key="tool.id" 
        class="autocomplete-item"
        :class="{ active: index === activeSuggestionIndex }" 
        @mousedown.prevent="$emit('select-tool', tool)"
        @mouseenter="$emit('update:activeSuggestionIndex', index)"
      >
        <el-icon>
          <Tools />
        </el-icon>
        <span class="suggestion-name">{{ tool.name }}</span>
        <el-tag size="small" type="primary">{{ tool.category || 'tool' }}</el-tag>
      </div>
    </div>

    <div class="input-actions">
      <el-button 
        :loading="loading" 
        :disabled="disabled || !canSend"
        @click="$emit('send')"
      >
        <el-icon>
          <Promotion />
        </el-icon>
        <span>{{ $t('chat.send') }}</span>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Promotion, Tools } from '@element-plus/icons-vue'

const { t } = useI18n()

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
  modelValue: string
  disabled: boolean
  loading: boolean
  showAutocomplete: boolean
  autocompleteType: 'datasource' | 'tool'
  activeSuggestionIndex: number
  filteredDataSources: DataSource[]
  filteredTools: Tool[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'send': []
  'input': [event: Event]
  'keydown': [event: KeyboardEvent]
  'paste': [event: ClipboardEvent]
  'select-datasource': [ds: DataSource]
  'select-tool': [tool: Tool]
  'update:activeSuggestionIndex': [index: number]
}>()

const editorRef = ref<HTMLElement>()
let isSyncing = false

// Only sync editor when modelValue is cleared externally (after sending)
watch(() => props.modelValue, (newValue) => {
  if (editorRef.value && !isSyncing) {
    const currentContent = editorRef.value.innerText
    
    // Only sync if the content is different AND newValue is empty (cleared after send)
    // This prevents the infinite loop during normal typing
    if (newValue === '' && currentContent !== '') {
      isSyncing = true
      editorRef.value.innerText = ''
      // Use nextTick to reset flag after DOM update
      nextTick(() => {
        isSyncing = false
      })
    }
  }
})

function handleEditorInput(event: Event) {
  // Skip if we're syncing from watch
  if (isSyncing) return
  
  const target = event.target as HTMLElement
  emit('update:modelValue', target.innerText || '')
  emit('input', event)
}

function handleEditorKeydown(event: KeyboardEvent) {
  emit('keydown', event)
}

function handlePaste(event: ClipboardEvent) {
  emit('paste', event)
}

const canSend = computed(() => {
  return props.modelValue.trim().length > 0
})

// Expose editor ref for parent component
defineExpose({
  editorRef
})
</script>

<style scoped lang="scss">
.input-area {
  padding: 4px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  position: relative;
  display: flex;
  gap: 4px;
  align-items: center; // Changed from flex-end to center for vertical alignment
  flex-shrink: 0; // Prevent shrinking
  min-height: 70px; // Ensure minimum visibility
}

.rich-editor {
  flex: 1;
  min-height: 60px;
  max-height: 200px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-blank);
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
  }

  &:disabled {
    background: var(--el-fill-color-light);
    cursor: not-allowed;
  }

  // Placeholder using data-placeholder attribute
  &[data-placeholder]:empty::before {
    content: attr(data-placeholder);
    color: var(--el-text-color-placeholder);
    pointer-events: none;
  }
}

.autocomplete-dropdown {
  position: absolute;
  bottom: 100%;
  left: 16px;
  right: 16px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  margin-bottom: 8px;

  &.tool-dropdown {
    max-width: 400px;
  }
}

.autocomplete-item {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover,
  &.active {
    background: var(--el-fill-color-light);
  }

  .suggestion-name {
    flex: 1;
    font-size: 14px;
    color: var(--el-text-color-primary);
  }

  .el-icon {
    font-size: 16px;
    color: var(--el-color-primary);
  }
}

.input-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
</style>
