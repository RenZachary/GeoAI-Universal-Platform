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
import { useRoute } from 'vue-router'
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
  const textAfterSymbol = inputMessage.value.slice(mentionStartPos.value + 1).toLowerCase()
  return dataSourceStore.dataSources.filter((ds: any) =>
    ds.name.toLowerCase().includes(textAfterSymbol)
  )
})

// Computed: Filtered tools
const filteredTools = computed(() => {
  if (mentionStartPos.value === -1 || autocompleteType.value !== 'tool') return []
  const textAfterSlash = inputMessage.value.slice(mentionStartPos.value + 1).toLowerCase()
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
}

async function handleSelectConversation(conversationId: string) {
  await chatStore.loadConversation(conversationId)
  inputMessage.value = ''
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
  inputMessage.value = target.innerText || ''
}

function handleEditorKeydown(event: KeyboardEvent) {
  // Handle @ and / for autocomplete
  if (event.key === '@' || event.key === '/') {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      mentionStartPos.value = range.startOffset
      autocompleteType.value = event.key === '@' ? 'datasource' : 'tool'
      showAutocomplete.value = true
      activeSuggestionIndex.value = 0
    }
  } else if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSendMessage()
  } else if (event.key === 'Escape') {
    showAutocomplete.value = false
  } else if (showAutocomplete.value) {
    // Handle arrow keys for autocomplete navigation
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
  }
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}

function selectDataSource(ds: any) {
  const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
  if (!editor || mentionStartPos.value === -1) return

  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const replaceRange = document.createRange()
    
    let currentNode: Node | null = range.startContainer
    let currentOffset = range.startOffset
    let charsToWalkBack = range.startOffset - mentionStartPos.value - 1

    while (charsToWalkBack > 0 && currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const textNode = currentNode as Text
        if (currentOffset >= charsToWalkBack) {
          replaceRange.setStart(currentNode, currentOffset - charsToWalkBack)
          charsToWalkBack = 0
        } else {
          charsToWalkBack -= currentOffset
          const prevSibling: Node | null = currentNode.previousSibling
          currentNode = prevSibling
          currentOffset = currentNode ? (currentNode.nodeType === Node.TEXT_NODE ? (currentNode as Text).length : 0) : 0
        }
      } else {
        const prevSibling: Node | null = currentNode.previousSibling
        currentNode = prevSibling
        currentOffset = currentNode ? (currentNode.nodeType === Node.TEXT_NODE ? (currentNode as Text).length : 0) : 0
      }
    }

    replaceRange.setEnd(range.startContainer, range.startOffset)
    replaceRange.deleteContents()

    const mentionSpan = document.createElement('span')
    mentionSpan.className = 'datasource-mention'
    mentionSpan.textContent = `@${ds.name}`
    mentionSpan.dataset.datasourceId = ds.id

    replaceRange.collapse(true)
    replaceRange.insertNode(mentionSpan)

    const spaceNode = document.createTextNode(' ')
    mentionSpan.parentNode?.insertBefore(spaceNode, mentionSpan.nextSibling)

    const newRange = document.createRange()
    newRange.setStartAfter(spaceNode)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    inputMessage.value = editor.innerText || ''
    showAutocomplete.value = false
    mentionStartPos.value = -1
    editor.focus()
  } catch (error) {
    console.error('[ChatView] Error selecting datasource:', error)
    const textToInsert = `@${ds.name} `
    document.execCommand('insertText', false, textToInsert)
    inputMessage.value = editor?.innerText || ''
    showAutocomplete.value = false
    mentionStartPos.value = -1
  }
}

function selectTool(tool: any) {
  const editor = document.querySelector('[contenteditable="true"]') as HTMLElement
  if (!editor || mentionStartPos.value === -1) return

  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const replaceRange = document.createRange()
    
    let currentNode: Node | null = range.startContainer
    let currentOffset = range.startOffset
    let charsToWalkBack = range.startOffset - mentionStartPos.value - 1

    while (charsToWalkBack > 0 && currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const textNode = currentNode as Text
        if (currentOffset >= charsToWalkBack) {
          replaceRange.setStart(currentNode, currentOffset - charsToWalkBack)
          charsToWalkBack = 0
        } else {
          charsToWalkBack -= currentOffset
          const prevSibling: Node | null = currentNode.previousSibling
          currentNode = prevSibling
          currentOffset = currentNode ? (currentNode.nodeType === Node.TEXT_NODE ? (currentNode as Text).length : 0) : 0
        }
      } else {
        const prevSibling: Node | null = currentNode.previousSibling
        currentNode = prevSibling
        currentOffset = currentNode ? (currentNode.nodeType === Node.TEXT_NODE ? (currentNode as Text).length : 0) : 0
      }
    }

    replaceRange.setEnd(range.startContainer, range.startOffset)
    replaceRange.deleteContents()

    const toolSpan = document.createElement('span')
    toolSpan.className = 'tool-highlight'
    toolSpan.textContent = `/${tool.name}`

    replaceRange.collapse(true)
    replaceRange.insertNode(toolSpan)

    const spaceNode = document.createTextNode(' ')
    toolSpan.parentNode?.insertBefore(spaceNode, toolSpan.nextSibling)

    const newRange = document.createRange()
    newRange.setStartAfter(spaceNode)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    inputMessage.value = editor.innerText || ''
    showAutocomplete.value = false
    mentionStartPos.value = -1
    editor.focus()
  } catch (error) {
    console.error('[ChatView] Error selecting tool:', error)
    const textToInsert = `/${tool.name} `
    document.execCommand('insertText', false, textToInsert)
    inputMessage.value = editor?.innerText || ''
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
</style>
