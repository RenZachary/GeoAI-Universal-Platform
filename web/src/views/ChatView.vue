<template>
  <div class="chat-view">
    <!-- Conversation Sidebar -->
    <aside class="conversation-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <el-button v-if="!sidebarCollapsed" class="new-chat-btn" size="default" @click="handleNewChat">
          <el-icon>
            <Plus />
          </el-icon>
          <span>{{ $t('chat.newChat') }}</span>
        </el-button>
        <el-tooltip :content="sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'" placement="right">
          <el-button class="sidebar-toggle-btn" text circle @click="sidebarCollapsed = !sidebarCollapsed">
            <el-icon v-if="sidebarCollapsed">
              <DArrowRight />
            </el-icon>
            <el-icon v-else>
              <DArrowLeft />
            </el-icon>
          </el-button>
        </el-tooltip>
      </div>

      <div v-if="!sidebarCollapsed" class="conversation-list">
        <div v-for="conv in chatStore.conversations" :key="conv.id" class="conversation-item"
          :class="{ active: conv.id === chatStore.currentConversationId }" @click="handleSelectConversation(conv.id)">
          <div class="info">
            <span class="conversation-title">{{ conv.title || 'Untitled' }}</span>
            <el-tag type="info" size="small">{{ new Date(conv.created_at).toLocaleString() }}</el-tag>
          </div>
          <div class="conversation-actions">
            <el-icon class="rename-icon" @click.stop="handleRenameConversation(conv.id, conv.title)">
              <Edit />
            </el-icon>
            <el-icon class="delete-icon" @click.stop="handleDeleteConversation(conv.id)">
              <Delete />
            </el-icon>
          </div>
        </div>

        <el-empty v-if="chatStore.conversations.length === 0" :description="$t('chat.noMessages')" :image-size="80" />
      </div>
    </aside>

    <!-- Main Content Area: Split Layout -->
    <main class="chat-main">
      <el-splitter style="height: 100%">
        <!-- Left Panel: Chat -->
        <el-splitter-panel min="400">
          <div class="chat-panel">
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
            <div class="input-area">
              <div ref="editorRef" class="rich-editor" contenteditable="true" @input="handleEditorInput"
                @keydown="handleEditorKeydown" @paste="handlePaste" :disabled="chatStore.isStreaming"></div>

              <!-- Custom autocomplete dropdown for @datasources -->
              <div v-if="showAutocomplete && autocompleteType === 'datasource' && filteredDataSources.length > 0"
                class="autocomplete-dropdown">
                <div v-for="(ds, index) in filteredDataSources" :key="ds.id" class="autocomplete-item"
                  :class="{ active: index === activeSuggestionIndex }" @mousedown.prevent="selectDataSource(ds)"
                  @mouseenter="activeSuggestionIndex = index">
                  <span class="suggestion-name">{{ ds.name }}</span>
                  <el-tag size="small" type="info">{{ ds.type }}</el-tag>
                </div>
              </div>

              <!-- Custom autocomplete dropdown for /tools -->
              <div v-if="showAutocomplete && autocompleteType === 'tool' && filteredTools.length > 0"
                class="autocomplete-dropdown tool-dropdown">
                <div v-for="(tool, index) in filteredTools" :key="tool.id" class="autocomplete-item"
                  :class="{ active: index === activeSuggestionIndex }" @mousedown.prevent="selectTool(tool)"
                  @mouseenter="activeSuggestionIndex = index">
                  <el-icon>
                    <Tools />
                  </el-icon>
                  <span class="suggestion-name">{{ tool.name }}</span>
                  <el-tag size="small" type="primary">{{ tool.category || 'tool' }}</el-tag>
                </div>
              </div>

              <div class="input-actions">
                <el-button :loading="chatStore.isStreaming" :disabled="!inputMessage.trim()"
                  @click="handleSendMessage">
                  <el-icon>
                    <Promotion />
                  </el-icon>
                  <span>{{ $t('chat.send') }}</span>
                </el-button>
              </div>
            </div>
          </div>
        </el-splitter-panel>

        <!-- Right Panel: Map -->
        <el-splitter-panel min="30%">
          <div class="map-panel">
            <MapWorkspace />
          </div>
        </el-splitter-panel>
      </el-splitter>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useDataSourceStore } from '@/stores/dataSources'
import { useToolStore } from '@/stores/tools'
import { useI18n } from 'vue-i18n'
import MessageBubble from '@/components/chat/MessageBubble.vue'
import WorkflowStatusIndicator from '@/components/chat/WorkflowStatusIndicator.vue'
import MapWorkspace from '@/components/chat-map/MapWorkspace.vue'
import { Plus, Delete, ChatDotRound, Promotion, DArrowRight, DArrowLeft, Edit, Tools } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const dataSourceStore = useDataSourceStore()
const toolStore = useToolStore()
const inputMessage = ref('')
const messagesContainerRef = ref<HTMLElement>()
const editorRef = ref<HTMLElement>()

// Autocomplete state
const showAutocomplete = ref(false)
const autocompleteType = ref<'datasource' | 'tool'>('datasource') // Track which type of autocomplete
const activeSuggestionIndex = ref(0)
const mentionStartPos = ref(-1)

// Load sidebar state from localStorage
const SIDERBAR_COLLAPSED_KEY = 'chat-sidebar-collapsed'
const savedSidebarState = localStorage.getItem(SIDERBAR_COLLAPSED_KEY)
const sidebarCollapsed = ref(savedSidebarState === 'true')

// Computed: Filtered data sources based on @mention text
const filteredDataSources = computed(() => {
  if (mentionStartPos.value === -1 || autocompleteType.value !== 'datasource') return []

  const textAfterSymbol = inputMessage.value.slice(mentionStartPos.value + 1).toLowerCase()

  return dataSourceStore.dataSources.filter((ds: any) =>
    ds.name.toLowerCase().includes(textAfterSymbol)
  )
})

// Computed: Filtered tools based on / command
const filteredTools = computed(() => {
  if (mentionStartPos.value === -1 || autocompleteType.value !== 'tool') return []

  const textAfterSlash = inputMessage.value.slice(mentionStartPos.value + 1).toLowerCase()

  return toolStore.tools.filter((tool: any) =>
    tool.name.toLowerCase().includes(textAfterSlash) ||
    (tool.description && tool.description.toLowerCase().includes(textAfterSlash))
  )
})

// Computed: Highlighted text with @mentions styled
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

// Watch route query parameter changes to load conversation
watch(() => route.query.conversation, async (newConvId) => {
  if (newConvId && typeof newConvId === 'string') {
    console.log('[ChatView] Route query parameter changed, loading conversation:', newConvId)
    await chatStore.loadConversation(newConvId)
  }
})

// Lifecycle
onMounted(async () => {
  await chatStore.loadConversations()
  await dataSourceStore.loadDataSources()
  await toolStore.loadTools()

  // Check if there's a conversation ID in query parameters
  const conversationId = route.query.conversation as string
  if (conversationId) {
    console.log('[ChatView] Loading conversation from query parameter:', conversationId)
    await chatStore.loadConversation(conversationId)
  }
})

// Methods
function shouldShowStreaming(msg: any, index: number): boolean {
  const messages = chatStore.currentMessages
  const isLastMessage = index === messages.length - 1
  const isAssistant = msg.role === 'assistant'
  const isStreaming = chatStore.isStreaming

  return isStreaming && isAssistant && isLastMessage
}

// Convert editor HTML to text with datasource IDs
function extractTextWithIds(editor: HTMLElement): string {
  let result = ''

  // Walk through all child nodes
  editor.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement

      // Check if it's a datasource mention span
      if (element.classList.contains('mention-highlight') && element.hasAttribute('data-datasource-id')) {
        const dsId = element.getAttribute('data-datasource-id')
        const dsName = element.textContent?.replace('@', '') || ''
        result += `@[datasourceId:${dsId}](${dsName})`
      } else {
        // For other elements, recursively extract text
        result += extractTextWithIds(element)
      }
    }
  })

  return result
}

async function handleSendMessage() {
  if (!inputMessage.value.trim() || chatStore.isStreaming) return

  // Extract text with datasource IDs from editor DOM
  let messageWithIds = inputMessage.value
  if (editorRef.value) {
    messageWithIds = extractTextWithIds(editorRef.value)
  }

  // Clear the editor
  if (editorRef.value) {
    editorRef.value.innerHTML = ''
  }
  inputMessage.value = ''

  // Send the message with IDs (MessageBubble will convert back to names for display)
  await chatStore.sendMessage(messageWithIds, () => {
    // Scroll to bottom on each token
    scrollToBottom()
  })

  scrollToBottom()
}

// Convert @mention names to data source IDs and /tool names to tool IDs
function convertMentionsToIds(text: string): string {
  let result = text

  // Find all @mentions (data sources)
  const mentionRegex = /@([^\s,，]+)/g
  let match

  while ((match = mentionRegex.exec(text)) !== null) {
    const mentionName = match[1]

    // Find exact match in data sources
    const matchedDS = dataSourceStore.dataSources.find((ds: any) => ds.name === mentionName)

    if (matchedDS) {
      // Replace @name with @id format that backend can parse
      const replacement = `@[datasource:${matchedDS.id}]`
      result = result.replace(`@${mentionName}`, replacement)
    }
  }

  // Find all /commands (tools)
  const toolRegex = /\/([^\s,，]+)/g

  while ((match = toolRegex.exec(text)) !== null) {
    const toolName = match[1]

    // Find exact match in tools
    const matchedTool = toolStore.tools.find((t: any) => t.name === toolName)

    if (matchedTool) {
      // Replace /name with /id format that backend can parse
      const replacement = `/[tool:${matchedTool.id}]`
      result = result.replace(`/${toolName}`, replacement)
    }
  }

  return result
}

function handleSelectConversation(conversationId: string) {
  // Update URL query parameter
  router.push({ query: { conversation: conversationId } })
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

    // If deleted conversation was current, clear URL parameter
    if (route.query.conversation === conversationId) {
      router.push({ query: {} })
    }
  } catch {
    // User cancelled
  }
}

async function handleRenameConversation(conversationId: string, currentTitle: string) {
  try {
    const { value: newTitle } = await ElMessageBox.prompt(
      t('chat.enterNewTitle'),
      t('chat.renameConversation'),
      {
        confirmButtonText: t('chat.renameConfirm'),
        cancelButtonText: t('chat.cancel'),
        inputValue: currentTitle || 'Untitled',
        inputPattern: /.+/,
        inputErrorMessage: 'Title cannot be empty'
      }
    )

    if (newTitle && newTitle.trim()) {
      await chatStore.renameConversation(conversationId, newTitle.trim())
      ElMessage.success(t('common.success'))
    }
  } catch {
    // User cancelled
  }
}

function handleNewChat() {
  // Clear conversation query parameter
  router.push({ query: {} })
  chatStore.createNewConversation()
}

function handleQuickAction(action: string) {
  const prompts: Record<string, string> = {
    buffer: 'Perform a buffer analysis on my data',
    overlay: 'Run an overlay analysis between two layers',
    statistics: 'Calculate statistics for my dataset'
  }

  const promptText = prompts[action] || ''
  inputMessage.value = promptText

  // Also update the contenteditable editor
  if (editorRef.value) {
    editorRef.value.innerText = promptText
    // Focus the editor
    editorRef.value.focus()
  }
}

// Autocomplete handlers
// Contenteditable editor handlers
function handleEditorInput(event: Event) {
  const target = event.target as HTMLElement
  const text = target.innerText || ''
  inputMessage.value = text

  // Ensure editor is truly empty for placeholder to show
  if (!text.trim() && editorRef.value) {
    // Remove all child nodes to ensure :empty selector works
    while (editorRef.value.firstChild) {
      editorRef.value.removeChild(editorRef.value.firstChild)
    }
  }

  // Check if user typed @ or /
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  const textBeforeCursor = getTextBeforeCursor(range)
  const lastAtIndex = textBeforeCursor.lastIndexOf('@')
  const lastSlashIndex = textBeforeCursor.lastIndexOf('/')

  // Determine which trigger is closer to cursor (most recent)
  const triggerIndex = Math.max(lastAtIndex, lastSlashIndex)

  if (triggerIndex !== -1) {
    const triggerChar = textBeforeCursor[triggerIndex]
    const textAfterTrigger = textBeforeCursor.slice(triggerIndex + 1)

    // Check if there's a space after the trigger
    const currentContainer = range.startContainer.parentElement
    const isInHighlight = currentContainer?.classList.contains('mention-highlight')

    if (!textAfterTrigger.includes(' ') && !isInHighlight) {
      mentionStartPos.value = triggerIndex
      showAutocomplete.value = true
      activeSuggestionIndex.value = 0

      // Set autocomplete type based on trigger character
      if (triggerChar === '@') {
        autocompleteType.value = 'datasource'
      } else if (triggerChar === '/') {
        autocompleteType.value = 'tool'
      }
      return
    }
  }

  // Hide autocomplete if no valid trigger
  showAutocomplete.value = false
  mentionStartPos.value = -1
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (!showAutocomplete.value) return

  const items = autocompleteType.value === 'datasource' ? filteredDataSources.value : filteredTools.value

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeSuggestionIndex.value = Math.min(
      activeSuggestionIndex.value + 1,
      items.length - 1
    )
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeSuggestionIndex.value = Math.max(activeSuggestionIndex.value - 1, 0)
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    if (items.length > 0) {
      if (autocompleteType.value === 'datasource') {
        selectDataSource(items[activeSuggestionIndex.value])
      } else {
        selectTool(items[activeSuggestionIndex.value])
      }
    }
  } else if (event.key === 'Escape') {
    showAutocomplete.value = false
  }
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}

function getTextBeforeCursor(range: Range): string {
  if (!editorRef.value) return ''
  const preCaretRange = range.cloneRange()
  preCaretRange.selectNodeContents(editorRef.value)
  preCaretRange.setEnd(range.endContainer, range.endOffset)
  return preCaretRange.toString()
}

function selectDataSource(ds: any) {
  if (mentionStartPos.value === -1 || !editorRef.value) return

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  const textBeforeCursor = getTextBeforeCursor(range)

  // Find the @ position
  const atIndex = textBeforeCursor.lastIndexOf('@')
  if (atIndex === -1) return

  // Get text after @
  const afterAtSymbol = textBeforeCursor.slice(atIndex + 1)
  const spaceIndex = afterAtSymbol.indexOf(' ')
  const mentionEnd = spaceIndex === -1 ? afterAtSymbol.length : spaceIndex

  try {
    // Create a new range to replace the @mention
    const replaceRange = document.createRange()

    // Walk back from current cursor position to find the @ symbol
    let currentNode: Node | null = range.startContainer
    let currentOffset = range.startOffset
    let charsToWalkBack = mentionEnd + 1 // +1 for the @ symbol

    // Walk back through text nodes to find the start of the @mention
    while (charsToWalkBack > 0 && currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const textLength = (currentNode as Text).length
        if (currentOffset >= charsToWalkBack) {
          // The @ is in this node
          replaceRange.setStart(currentNode, currentOffset - charsToWalkBack)
          charsToWalkBack = 0
        } else {
          // Move to previous sibling
          charsToWalkBack -= currentOffset
          const prevSibling = currentNode.previousSibling
          currentNode = prevSibling as Node | null
          currentOffset = currentNode ? (currentNode.nodeType === Node.TEXT_NODE ? (currentNode as Text).length : 0) : 0
        }
      } else {
        // Skip non-text nodes
        const prevSibling = currentNode.previousSibling
        currentNode = prevSibling as Node | null
        currentOffset = currentNode ? (currentNode.nodeType === Node.TEXT_NODE ? (currentNode as Text).length : 0) : 0
      }
    }

    // Set the end of the range at current cursor position
    replaceRange.setEnd(range.startContainer, range.startOffset)

    // Delete the old @mention
    replaceRange.deleteContents()

    // Create highlighted span with data attribute for ID
    const mentionSpan = document.createElement('span')
    mentionSpan.className = 'mention-highlight'
    mentionSpan.setAttribute('data-datasource-id', ds.id)
    mentionSpan.textContent = `@${ds.name}`

    // Insert the span at the collapsed range position
    replaceRange.collapse(true)
    replaceRange.insertNode(mentionSpan)

    // Add a space after
    const spaceNode = document.createTextNode(' ')
    mentionSpan.parentNode?.insertBefore(spaceNode, mentionSpan.nextSibling)

    // Move cursor after the space
    const newRange = document.createRange()
    newRange.setStartAfter(spaceNode)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    // Update inputMessage
    inputMessage.value = editorRef.value.innerText || ''

    // Hide autocomplete
    showAutocomplete.value = false
    mentionStartPos.value = -1

    // Focus back on editor
    editorRef.value.focus()
  } catch (error) {
    console.error('[ChatView] Error selecting datasource:', error)
    // Fallback: just insert the text
    const textToInsert = `@${ds.name} `
    document.execCommand('insertText', false, textToInsert)
    inputMessage.value = editorRef.value?.innerText || ''
    showAutocomplete.value = false
    mentionStartPos.value = -1
  }
}

function selectTool(tool: any) {
  if (mentionStartPos.value === -1 || !editorRef.value) return

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  const textBeforeCursor = getTextBeforeCursor(range)

  // Find the / position
  const slashIndex = textBeforeCursor.lastIndexOf('/')
  if (slashIndex === -1) return

  // Get text after /
  const afterSlash = textBeforeCursor.slice(slashIndex + 1)
  const spaceIndex = afterSlash.indexOf(' ')
  const mentionEnd = spaceIndex === -1 ? afterSlash.length : spaceIndex

  try {
    // Create a new range to replace the /command
    const replaceRange = document.createRange()

    // Walk back from current cursor position to find the / symbol
    let currentNode: Node | null = range.startContainer
    let currentOffset = range.startOffset
    let charsToWalkBack = mentionEnd + 1 // +1 for the / symbol

    // Walk back through text nodes to find the start of the /command
    while (charsToWalkBack > 0 && currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const textLength = (currentNode as Text).length
        if (currentOffset >= charsToWalkBack) {
          // The / is in this node
          replaceRange.setStart(currentNode, currentOffset - charsToWalkBack)
          charsToWalkBack = 0
        } else {
          // Move to previous sibling
          charsToWalkBack -= currentOffset
          const prevSibling = currentNode.previousSibling
          currentNode = prevSibling as Node | null
          currentOffset = currentNode ? (currentNode.nodeType === Node.TEXT_NODE ? (currentNode as Text).length : 0) : 0
        }
      } else {
        // Skip non-text nodes
        const prevSibling = currentNode.previousSibling
        currentNode = prevSibling as Node | null
        currentOffset = currentNode ? (currentNode.nodeType === Node.TEXT_NODE ? (currentNode as Text).length : 0) : 0
      }
    }

    // Set the end of the range at current cursor position
    replaceRange.setEnd(range.startContainer, range.startOffset)

    // Delete the old /command
    replaceRange.deleteContents()

    // Create highlighted span for tool
    const toolSpan = document.createElement('span')
    toolSpan.className = 'tool-highlight'
    toolSpan.textContent = `/${tool.name}`

    // Insert the span at the collapsed range position
    replaceRange.collapse(true)
    replaceRange.insertNode(toolSpan)

    // Add a space after
    const spaceNode = document.createTextNode(' ')
    toolSpan.parentNode?.insertBefore(spaceNode, toolSpan.nextSibling)

    // Move cursor after the space
    const newRange = document.createRange()
    newRange.setStartAfter(spaceNode)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    // Update inputMessage
    inputMessage.value = editorRef.value.innerText || ''

    // Hide autocomplete
    showAutocomplete.value = false
    mentionStartPos.value = -1

    // Focus back on editor
    editorRef.value.focus()
  } catch (error) {
    console.error('[ChatView] Error selecting tool:', error)
    // Fallback: just insert the text
    const textToInsert = `/${tool.name} `
    document.execCommand('insertText', false, textToInsert)
    inputMessage.value = editorRef.value?.innerText || ''
    showAutocomplete.value = false
    mentionStartPos.value = -1
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
@use './../assets/chatView.scss';
</style>
