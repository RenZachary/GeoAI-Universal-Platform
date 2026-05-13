<template>
  <div class="chat-view">
    <!-- Conversation Sidebar -->
    <ConversationSidebar
      :conversations="chatStore.conversations"
      :current-conversation-id="chatStore.currentConversationId"
      :collapsed="sidebarCollapsed"
      @new-chat="handleNewChat"
      @select-conversation="handleSelectConversation"
      @rename-conversation="handleRenameConversation"
      @delete-conversation="handleDeleteConversation"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
    />

    <!-- Main Content Area: Split Layout -->
    <main class="chat-main">
      <el-splitter style="height: 100%">
        <!-- Left Panel: Chat -->
        <el-splitter-panel min="300" style="height: 100%; overflow: hidden;">
          <div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
            <ChatPanel
              ref="chatPanelRef"
              :workflow-status="chatStore.workflowStatus"
              :current-intent="chatStore.currentIntent"
              :messages="chatStore.currentMessages"
              :is-streaming="chatStore.isStreaming"
              :input-message="inputMessage"
              @update:input-message="inputMessage = $event"
              :show-autocomplete="showAutocomplete"
              :autocomplete-type="autocompleteType"
              :active-suggestion-index="activeSuggestionIndex"
              :filtered-data-sources="filteredDataSources"
              :filtered-tools="filteredTools"
              @send-message="handleSendMessage"
              @quick-action="handleQuickAction"
              @editor-input="handleEditorInput"
              @editor-keydown="handleEditorKeydown"
              @editor-paste="handlePaste"
              @select-datasource="selectDataSource"
              @select-tool="selectTool"
              @update:active-suggestion-index="activeSuggestionIndex = $event"
            />
          </div>
        </el-splitter-panel>

        <!-- Right Panel: Map -->
        <el-splitter-panel min="300" style="height: 100%; overflow: hidden;">
          <div class="map-panel">
            <MapWorkspace />
          </div>
        </el-splitter-panel>
      </el-splitter>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useDataSourceStore } from '@/stores/dataSources'
import { useToolStore } from '@/stores/tools'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage } from 'element-plus'
import ConversationSidebar from '@/components/chat/ConversationSidebar.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import MapWorkspace from '@/components/chat-map/MapWorkspace.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const dataSourceStore = useDataSourceStore()
const toolStore = useToolStore()

const inputMessage = ref('')
const chatPanelRef = ref<InstanceType<typeof ChatPanel>>()

// Autocomplete state
const showAutocomplete = ref(false)
const autocompleteType = ref<'datasource' | 'tool'>('datasource')
const activeSuggestionIndex = ref(0)
const mentionStartPos = ref(-1)

// Sidebar state
const SIDERBAR_COLLAPSED_KEY = 'chat-sidebar-collapsed'
const savedSidebarState = localStorage.getItem(SIDERBAR_COLLAPSED_KEY)
const sidebarCollapsed = ref(savedSidebarState === 'true')

// Computed: Filtered data sources
const filteredDataSources = computed(() => {
  if (mentionStartPos.value === -1 || autocompleteType.value !== 'datasource') return []
  
  // Find the position of the last @ symbol in the current input
  // This ensures we're using the correct reference frame (inputMessage string)
  const lastAtIndex = inputMessage.value.lastIndexOf('@')
  if (lastAtIndex === -1) return []
  
  const textAfterSymbol = inputMessage.value.slice(lastAtIndex + 1).toLowerCase()
  return dataSourceStore.dataSources.filter((ds: any) =>
    ds.name.toLowerCase().includes(textAfterSymbol)
  )
})

// Computed: Filtered tools
const filteredTools = computed(() => {
  if (mentionStartPos.value === -1 || autocompleteType.value !== 'tool') return []
  
  // Find the position of the last / symbol in the current input
  // This ensures we're using the correct reference frame (inputMessage string)
  const lastSlashIndex = inputMessage.value.lastIndexOf('/')
  if (lastSlashIndex === -1) return []
  
  const textAfterSlash = inputMessage.value.slice(lastSlashIndex + 1).toLowerCase()
  return toolStore.tools.filter((tool: any) =>
    tool.name.toLowerCase().includes(textAfterSlash) ||
    (tool.description && tool.description.toLowerCase().includes(textAfterSlash))
  )
})

// Watch language changes
watch(locale, () => {
  updatePlaceholderVariable()
})

// Watch sidebar collapsed state
watch(sidebarCollapsed, (newValue) => {
  localStorage.setItem(SIDERBAR_COLLAPSED_KEY, newValue.toString())
})

// Watch route query parameter changes
watch(() => route.query.conversation, async (newConvId) => {
  if (newConvId && typeof newConvId === 'string') {
    await chatStore.loadConversation(newConvId)
  }
})

// Lifecycle
onMounted(async () => {
  await chatStore.loadConversations()
  await dataSourceStore.loadDataSources()
  await toolStore.loadTools()

  const conversationId = route.query.conversation as string
  if (conversationId) {
    await chatStore.loadConversation(conversationId)
  }

  updatePlaceholderVariable()
})

// Helper functions
function updatePlaceholderVariable() {
  // This will be handled by ChatInputArea component
}

function handleNewChat() {
  chatStore.createNewConversation()
  inputMessage.value = ''
  
  // Clear conversation ID from URL for new chat
  router.push({ query: {} })
}

async function handleSelectConversation(conversationId: string) {
  await chatStore.loadConversation(conversationId)
  inputMessage.value = ''
  
  // Update URL to include conversation ID for bookmarking and page refresh
  router.push({ query: { conversation: conversationId } })
}

async function handleRenameConversation(conversationId: string, currentTitle: string) {
  try {
    const { value: newTitle } = await ElMessageBox.prompt(t('chat.enterNewTitle'), t('chat.renameConversation'), {
      inputValue: currentTitle,
      inputPattern: /.+/,
      inputErrorMessage: t('common.required')
    })
    
    if (newTitle) {
      await chatStore.renameConversation(conversationId, newTitle)
      ElMessage.success(t('chat.renameSuccess'))
    }
  } catch {
    // User cancelled
  }
}

async function handleDeleteConversation(conversationId: string) {
  try {
    await ElMessageBox.confirm(t('chat.deleteConfirm'), t('chat.confirmDelete'), {
      type: 'warning'
    })
    
    await chatStore.deleteConversation(conversationId)
    ElMessage.success(t('chat.deleteSuccess'))
    
    // If deleted conversation was current, clear URL parameter
    if (!chatStore.currentConversationId) {
      router.push({ query: {} })
    }
  } catch {
    // User cancelled
  }
}

async function handleSendMessage() {
  if (!inputMessage.value.trim() || chatStore.isStreaming) return
  
  const message = inputMessage.value
  inputMessage.value = ''
  
  await chatStore.sendMessage(message)
  
  // Scroll to bottom after sending
  setTimeout(() => {
    chatPanelRef.value?.scrollToBottom()
  }, 100)
}

function handleQuickAction(action: string) {
  const templates: Record<string, string> = {
    buffer: 'Create a buffer zone around ',
    overlay: 'Perform overlay analysis on ',
    statistics: 'Calculate statistics for '
  }
  
  inputMessage.value = templates[action] || ''
}

function handleEditorInput(event: Event) {
  const target = event.target as HTMLElement
  // Use conversion function to preserve mention formats
  inputMessage.value = convertEditorContentToMessageFormat(target)
  
  // Note: Don't close autocomplete here based on character checks.
  // Autocomplete closing is handled by:
  // 1. User selecting an item (in selectDataSource/selectTool)
  // 2. Pressing Escape (in handleEditorKeydown)
  // 3. Typing other keys when autocomplete is active (handled in keydown)
}

// Helper function to get caret position in contenteditable
function getCaretPosition(element: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  
  const range = selection.getRangeAt(0)
  const preCaretRange = range.cloneRange()
  preCaretRange.selectNodeContents(element)
  preCaretRange.setEnd(range.endContainer, range.endOffset)
  return preCaretRange.toString().length
}

function handleEditorKeydown(event: KeyboardEvent) {
  // Handle @ and / for autocomplete
  if (event.key === '@' || event.key === '/') {
    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
    if (editor) {
      // Use getCaretPosition to get consistent position measurement
      mentionStartPos.value = getCaretPosition(editor)
      autocompleteType.value = event.key === '@' ? 'datasource' : 'tool'
      showAutocomplete.value = true
      activeSuggestionIndex.value = 0
    }
  } else if (event.key === 'Escape') {
    showAutocomplete.value = false
  } else if (showAutocomplete.value) {
    // When autocomplete is showing, handle navigation and selection
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const maxIndex = autocompleteType.value === 'datasource' 
        ? filteredDataSources.value.length - 1 
        : filteredTools.value.length - 1
      activeSuggestionIndex.value = Math.min(activeSuggestionIndex.value + 1, maxIndex)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeSuggestionIndex.value = Math.max(activeSuggestionIndex.value - 1, 0)
    } else if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      if (autocompleteType.value === 'datasource' && filteredDataSources.value[activeSuggestionIndex.value]) {
        selectDataSource(filteredDataSources.value[activeSuggestionIndex.value])
      } else if (autocompleteType.value === 'tool' && filteredTools.value[activeSuggestionIndex.value]) {
        selectTool(filteredTools.value[activeSuggestionIndex.value])
      }
    }
  } else if (event.key === 'Enter' && !event.shiftKey) {
    // Only send message when autocomplete is NOT showing
    event.preventDefault()
    handleSendMessage()
  }
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}

/**
 * Convert editor HTML content to special format for persistence
 * Converts <span class="datasource-mention" data-datasource-id="ID">@Name</span>
 * to @[datasourceId:ID](Name)
 */
function convertEditorContentToMessageFormat(editor: HTMLElement): string {
  // Clone the editor to avoid modifying the DOM
  const clone = editor.cloneNode(true) as HTMLElement
  
  // Find all datasource mentions and convert them
  const datasourceSpans = clone.querySelectorAll('.datasource-mention')
  
  datasourceSpans.forEach(span => {
    const datasourceId = span.getAttribute('data-datasource-id')
    const text = span.textContent || ''
    // Extract name from @Name format
    const name = text.startsWith('@') ? text.substring(1) : text
    
    if (datasourceId) {
      // Replace span with special format
      const replacement = `@[datasourceId:${datasourceId}](${name})`
      span.replaceWith(document.createTextNode(replacement))
    }
  })
  
  // Find all tool highlights and convert them
  const toolSpans = clone.querySelectorAll('.tool-highlight')
  toolSpans.forEach(span => {
    const toolId = span.getAttribute('data-tool-id')
    const text = span.textContent || ''
    // Extract tool name from /Name format
    const name = text.startsWith('/') ? text.substring(1) : text
    
    if (toolId) {
      // Replace span with special format including ID
      const replacement = `/[tool:${toolId}]`
      span.replaceWith(document.createTextNode(replacement))
    } else {
      // Fallback: use name if ID not available
      const replacement = `/[tool:${name}]`
      span.replaceWith(document.createTextNode(replacement))
    }
  })
  
  return clone.innerText || ''
}

function selectDataSource(ds: any) {
  const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
  if (!editor) return

  try {
    // Focus the editor
    editor.focus()
    
    // Get current selection
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      console.warn('[ChatView] No valid selection')
      return
    }

    // Get the full text content and cursor position
    const fullText = editor.innerText || ''
    const range = selection.getRangeAt(0)
    const preCaretRange = range.cloneRange()
    preCaretRange.selectNodeContents(editor)
    preCaretRange.setEnd(range.endContainer, range.endOffset)
    const cursorPos = preCaretRange.toString().length
    
    // Find the last @ symbol before the cursor
    const textBeforeCursor = fullText.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex === -1) {
      console.warn('[ChatView] No @ symbol found before cursor')
      return
    }
    
    // Calculate how many characters to delete (from @ to cursor)
    const charsToDelete = cursorPos - lastAtIndex
    
    // Move cursor back to the @ symbol by deleting characters
    for (let i = 0; i < charsToDelete; i++) {
      document.execCommand('delete', false)
    }
    
    // Insert the mention span using execCommand with HTML
    const mentionHtml = `<span class="datasource-mention" data-datasource-id="${ds.id}" contenteditable="false">@${ds.name}</span> `
    document.execCommand('insertHTML', false, mentionHtml)
    
    // Update the input message with special format for persistence
    inputMessage.value = convertEditorContentToMessageFormat(editor)
    
    showAutocomplete.value = false
    mentionStartPos.value = -1
  } catch (error) {
    console.error('[ChatView] Error selecting datasource:', error)
    // Fallback: simple text insertion
    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
    if (editor) {
      editor.focus()
      document.execCommand('insertText', false, `@${ds.name} `)
      inputMessage.value = convertEditorContentToMessageFormat(editor)
    }
    showAutocomplete.value = false
    mentionStartPos.value = -1
  }
}

function selectTool(tool: any) {
  const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
  if (!editor) return

  try {
    // Focus the editor
    editor.focus()
    
    // Get current selection
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      console.warn('[ChatView] No valid selection')
      return
    }

    // Get the full text content and cursor position
    const fullText = editor.innerText || ''
    const range = selection.getRangeAt(0)
    const preCaretRange = range.cloneRange()
    preCaretRange.selectNodeContents(editor)
    preCaretRange.setEnd(range.endContainer, range.endOffset)
    const cursorPos = preCaretRange.toString().length
    
    // Find the last / symbol before the cursor
    const textBeforeCursor = fullText.slice(0, cursorPos)
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/')
    
    if (lastSlashIndex === -1) {
      console.warn('[ChatView] No / symbol found before cursor')
      return
    }
    
    // Calculate how many characters to delete (from / to cursor)
    const charsToDelete = cursorPos - lastSlashIndex
    
    // Move cursor back to the / symbol by deleting characters
    for (let i = 0; i < charsToDelete; i++) {
      document.execCommand('delete', false)
    }
    
    // Insert the tool span using execCommand with HTML
    const toolHtml = `<span class="tool-highlight" data-tool-id="${tool.id}" contenteditable="false">/${tool.name}</span> `
    document.execCommand('insertHTML', false, toolHtml)
    
    // Update the input message with special format for persistence
    inputMessage.value = convertEditorContentToMessageFormat(editor)
    
    showAutocomplete.value = false
    mentionStartPos.value = -1
  } catch (error) {
    console.error('[ChatView] Error selecting tool:', error)
    // Fallback: simple text insertion
    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
    if (editor) {
      editor.focus()
      document.execCommand('insertText', false, `/${tool.name} `)
      inputMessage.value = convertEditorContentToMessageFormat(editor)
    }
    showAutocomplete.value = false
    mentionStartPos.value = -1
  }
}
</script>

<style scoped lang="scss">
// .chat-view 已在 chatView.scss 中定义，无需重复
// 移除了 height: 100vh 的错误定义

.chat-view {
  display: flex;
  height: 100%;  // ✅ 正确：继承父容器高度
  background: var(--el-bg-color-page);
}

.chat-main {
  flex: 1;
  height: 100%;
  overflow: hidden;
}

.map-panel {
  height: 100%;
  background: var(--el-bg-color);
}

// Mention styles for contenteditable editor
:deep(.datasource-mention) {
  color: var(--el-color-primary);
  font-weight: 500;
  background: rgba(64, 158, 255, 0.1);
  padding: 2px 4px;
  border-radius: 3px;
  cursor: default;
  user-select: none;
}

:deep(.tool-highlight) {
  color: var(--el-color-success);
  font-weight: 500;
  background: rgba(103, 194, 58, 0.1);
  padding: 2px 4px;
  border-radius: 3px;
  cursor: default;
  user-select: none;
}
</style>
