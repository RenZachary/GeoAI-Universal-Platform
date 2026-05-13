import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatMessage } from '@/types'
import * as chatService from '@/services/chat'
import { translateWorkflowStatus } from '@/utils/i18n'
import { useMapStore } from './map'

// ============================================================================
// Type Definitions
// ============================================================================

interface Conversation {
  id: string
  title?: string
  createdAt?: string
  updatedAt?: string
}

interface WorkflowState {
  status: string
}

interface SSEEvent {
  type: string
  data?: any
  step?: string
  tool?: string
  service?: any
  services?: any[]
  summary?: string
  output?: string
}

// ============================================================================
// Constants
// ============================================================================

const TOOL_DESCRIPTIONS: Record<string, string> = {
  buffer_analysis: '🔵 Creating buffer zones...',
  overlay_analysis: '🔀 Performing overlay analysis...',
  data_filter: '🔍 Filtering data...',
  data_aggregation: '📊 Calculating statistics...',
  choropleth_map: '🗺️ Generating choropleth map...',
  heatmap_visualization: '🔥 Creating heatmap...',
  statistics_calculator: '📈 Computing statistics...',
  report_generator: '📄 Generating report...'
}

const TOOL_SUCCESS_MESSAGES: Record<string, string> = {
  buffer_analysis: '✅ Buffer zones created',
  overlay_analysis: '✅ Overlay completed',
  data_filter: '✅ Data filtered',
  choropleth_map: '✅ Map generated',
  heatmap_visualization: '✅ Heatmap created',
  statistics_calculator: '✅ Statistics computed',
  report_generator: '✅ Report generated'
}

const STATUS_TOKEN_PREFIX = '__STATUS__:'
const EVENT_TOKEN_PREFIX = '__EVENT__:'
const AUTO_CLEAR_STATUS_DELAY = 2000
const SERVICE_READY_CLEAR_DELAY = 3000

export const useChatStore = defineStore('chat', () => {
  // State
  const conversations = ref<Conversation[]>([])
  const currentConversationId = ref<string | null>(null)
  const messages = ref<Map<string, ChatMessage[]>>(new Map())
  const isStreaming = ref(false)
  
  // Workflow state (grouped together)
  const workflow = ref<WorkflowState>({
    status: ''
  })
  
  // Intent classification state
  const currentIntent = ref<{ type: string; confidence: number; reasoning: string } | null>(null)
  
  // Computed
  const currentMessages = computed(() => {
    if (!currentConversationId.value) return []
    return messages.value.get(currentConversationId.value) || []
  })
  
  // Actions
  async function loadConversations() {
    try {
      conversations.value = await chatService.listConversations()
    } catch (error) {
      console.error('Failed to load conversations:', error)
    }
  }
  
  async function loadConversation(conversationId: string) {
    try {
      const msgs = await chatService.getConversation(conversationId)
      messages.value.set(conversationId, msgs)
      currentConversationId.value = conversationId
      
      // Clear workflow state for loaded conversation
      workflow.value = {
        status: ''
      }
    } catch (error) {
      console.error('Failed to load conversation:', error)
    }
  }
  
  async function sendMessage(message: string, onEvent?: (event: SSEEvent) => void) {
    console.log('[Chat Store] Sending message:', message.substring(0, 50) + '...')
    isStreaming.value = true
    
    // Clear workflow state before starting new message
    workflow.value = {
      status: ''
    }
    
    const conversationId = getOrCreateConversationId()
    const currentMsgs = messages.value.get(conversationId) || []
    
    // Get spatial context from map store
    const mapStore = useMapStore()
    
    console.log('[Chat Store] MapStore drawnGeometries before mapping:', mapStore.drawnGeometries)
    console.log('[Chat Store] MapStore drawnGeometries length:', mapStore.drawnGeometries?.length)
    
    const spatialContext: chatService.SpatialContext = {
      viewportBbox: mapStore.viewportBbox || undefined,
      selectedFeature: mapStore.selectedFeature || undefined,
      drawnGeometries: (mapStore.drawnGeometries || []).map(d => ({
        id: d.id,
        type: d.type,
        geometry: d.geometry,
        properties: d.properties
      }))
    }
    
    // Log context for debugging
    console.log('[Chat Store] Spatial context before sending:', {
      hasViewport: !!spatialContext.viewportBbox,
      viewportBbox: spatialContext.viewportBbox,
      hasSelection: !!spatialContext.selectedFeature,
      drawnCount: spatialContext.drawnGeometries?.length || 0,
      rawViewportBbox: mapStore.viewportBbox,
      rawSelectedFeature: mapStore.selectedFeature,
      rawDrawnGeometries: mapStore.drawnGeometries
    })
    
    if (spatialContext.viewportBbox || spatialContext.selectedFeature || (spatialContext.drawnGeometries?.length || 0) > 0) {
      console.log('[Chat Store] ✅ Including spatial context in message')
    } else {
      console.log('[Chat Store] ⚠️ No spatial context available (user has not interacted with map)')
    }
    
    // Create user and empty assistant messages immediately
    const updatedMsgs: ChatMessage[] = [
      ...currentMsgs,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      },
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString()
      }
    ]
    
    updateMessages(conversationId, updatedMsgs)
    
    try {
      await chatService.sendMessageStream(
        {
          message,
          conversationId: currentConversationId.value!,
          context: spatialContext
        },
        (event) => {
          handleSSEEvent(event)
          onEvent?.(event)
        }
      )
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      isStreaming.value = false
    }
  }
  
  // ========================================================================
  // Helper Functions
  // ========================================================================
  
  /**
   * Update messages for a conversation with proper reactivity
   */
  function updateMessages(conversationId: string, newMessages: ChatMessage[]) {
    messages.value.set(conversationId, newMessages)
  }
  
  /**
   * Get or create conversation ID
   */
  function getOrCreateConversationId(): string {
    if (!currentConversationId.value) {
      currentConversationId.value = `conv_${Date.now()}`
    }
    return currentConversationId.value!
  }
  
  /**
   * Auto-clear workflow status after delay
   */
  function autoClearStatus(matchPattern: string, delay: number = AUTO_CLEAR_STATUS_DELAY) {
    setTimeout(() => {
      if (workflow.value.status.includes(matchPattern)) {
        workflow.value.status = ''
      }
    }, delay)
  }
  
  // ========================================================================
  // SSE Event Handlers (split into small functions)
  // ========================================================================
  
  function handleToolStart(toolName: string) {
    // Deprecated: activeTools feature removed
    console.log('[Chat Store] Tool started:', toolName)
  }
  
  function handleToolComplete(toolName: string, output?: string) {
    // Deprecated: activeTools feature removed
    console.log('[Chat Store] Tool completed:', toolName)
  }
  
  function handlePartialResult(service: any) {
    // Deprecated: partialServices feature removed
    console.log('[Chat Store] Partial result:', service)
  }
  
  function handleStatusToken(tokenText: string) {
    const statusMessage = tokenText.replace(STATUS_TOKEN_PREFIX, '')
    workflow.value.status = statusMessage
  }
  
  function handleEventToken(tokenText: string) {
    try {
      const eventData = JSON.parse(tokenText.replace(EVENT_TOKEN_PREFIX, ''))
      console.log('[Chat Store] Received event:', eventData.type, eventData)
      
      if (eventData.type === 'intent_classified') {
        currentIntent.value = {
          type: eventData.intent,
          confidence: eventData.confidence,
          reasoning: eventData.reasoning
        }
        console.log('[Chat Store] Intent classified:', currentIntent.value)
      }
      
      // Handle KB retrieval start event
      else if (eventData.type === 'kb_retrieval_start') {
        workflow.value.status = translateWorkflowStatus('kbSearching')
      }
      
      // Handle KB retrieval complete event
      else if (eventData.type === 'kb_retrieval_complete') {
        const count = eventData.data?.resultCount || 0
        const time = eventData.data?.searchTime || 0
        workflow.value.status = translateWorkflowStatus('kbFound', { count, time })
        
        // Don't auto-clear - let subsequent status updates overwrite it naturally
        // The next node (goalSplitter/taskPlanner) will send its own __STATUS__ message
      }
      
      // Handle source citation events
      else if (eventData.type === 'source_citation') {
        console.log('[Chat Store] Source citation:', eventData.data)
        // Note: Citations are already included in the summary text by SummaryGenerator
        // This event can be used for future enhancements like clickable source links
      }
      
    } catch (error) {
      console.error('[Chat Store] Failed to parse event:', error, 'Raw token:', tokenText)
    }
  }
  
  function handleToken(tokenText: string, conversationId: string) {
    const currentMsgs = messages.value.get(conversationId) || []
    let updatedMsgs = [...currentMsgs]
    
    if (updatedMsgs.length === 0 || updatedMsgs[updatedMsgs.length - 1].role !== 'assistant') {
      // Create new assistant message
      updatedMsgs.push({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: tokenText,
        timestamp: new Date().toISOString()
      })
    } else {
      // Append to existing assistant message
      const lastMsg = updatedMsgs[updatedMsgs.length - 1]
      updatedMsgs[updatedMsgs.length - 1] = {
        ...lastMsg,
        content: lastMsg.content + tokenText
      }
    }
    
    updateMessages(conversationId, updatedMsgs)
  }
  
  function handleMessageComplete(data: any, conversationId: string) {
    const currentMsgs = messages.value.get(conversationId) || []
    const lastMessage = currentMsgs[currentMsgs.length - 1]
    
    // Ensure there's an assistant message
    if (!lastMessage || lastMessage.role !== 'assistant') {
      currentMsgs.push({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data?.summary || 'Analysis completed',
        timestamp: new Date().toISOString()
      })
    } else {
      // Update existing message with summary
      currentMsgs[currentMsgs.length - 1] = {
        ...lastMessage,
        content: data?.summary || lastMessage.content || 'Analysis completed'
      }
    }
    
    // Handle visualization services
    const servicesToStore = data?.services || []
    if (servicesToStore.length > 0) {
      attachServicesToLastMessage(currentMsgs, servicesToStore)
      addServicesToPartialList(servicesToStore)
    }
    
    // Update messages and clear workflow state
    updateMessages(conversationId, currentMsgs)
    workflow.value.status = ''
    isStreaming.value = false
  }
  
  function attachServicesToLastMessage(msgs: ChatMessage[], services: any[]) {
    // Find last assistant message index
    const lastIndex = msgs.map((m, i) => ({ m, i }))
      .reverse()
      .find(({ m }) => m.role === 'assistant')?.i
    
    if (lastIndex !== undefined) {
      msgs[lastIndex] = {
        ...msgs[lastIndex],
        services: [...services]
      }
    }
  }
  
  function addServicesToPartialList(services: any[]) {
    // Deprecated: partialServices feature removed
    console.log('[Chat Store] Services published:', services.length)
  }
  
  function handleError(data: any, conversationId: string) {
    const errorMessage = data?.error || data?.message || 'Unknown error'
    console.error('Chat error:', errorMessage)
    
    const currentMsgs = messages.value.get(conversationId) || []
    currentMsgs.push({
      id: `error-${Date.now()}`,
      role: 'assistant',
      content: `⚠️ Error: ${errorMessage}`,
      timestamp: new Date().toISOString()
    })
    
    updateMessages(conversationId, currentMsgs)
    isStreaming.value = false
  }
  
  // ========================================================================
  // Main SSE Handler (now clean and simple)
  // ========================================================================
  
  function handleSSEEvent(event: SSEEvent) {
    const { type, data, tool, service, output } = event
    
    // Ensure conversation ID exists
    if (!currentConversationId.value && data?.conversationId) {
      currentConversationId.value = data.conversationId
    }
    
    const conversationId = currentConversationId.value
    if (!conversationId) return
    
    // Route to appropriate handler
    switch (type) {
      case 'tool_start':
        if (tool) handleToolStart(tool)
        break
        
      case 'tool_complete':
        if (tool) handleToolComplete(tool, output)
        break
        
      case 'partial_result':
        if (service) handlePartialResult(service)
        break
        
      case 'token':
        const tokenText = data?.token || ''
        
        // Handle special markers first
        if (tokenText.startsWith(STATUS_TOKEN_PREFIX)) {
          handleStatusToken(tokenText)
        } else if (tokenText.startsWith(EVENT_TOKEN_PREFIX)) {
          handleEventToken(tokenText)
        } else if (tokenText) {
          // Only handle as normal text if it's not empty and not a marker
          handleToken(tokenText, conversationId)
        }
        break
        
      case 'message_complete':
        handleMessageComplete(data, conversationId)
        // Clear intent after message is complete
        currentIntent.value = null
        break
        
      case 'error':
        handleError(data, conversationId)
        break
        
      // Ignore these events (handled elsewhere)
      case 'step_start':
      case 'step_complete':
      case 'message_start':
        break
        
      default:
        console.warn('[Chat Store] Unknown SSE event type:', type)
    }
  }
  
  function createNewConversation() {
    currentConversationId.value = null
    messages.value.clear()
    workflow.value = {
      status: ''
    }
  }
  
  async function deleteConversation(conversationId: string) {
    try {
      await chatService.deleteConversation(conversationId)
      messages.value.delete(conversationId)
      
      if (currentConversationId.value === conversationId) {
        currentConversationId.value = null
      }
      
      await loadConversations()
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }
  
  async function renameConversation(conversationId: string, newTitle: string) {
    try {
      await chatService.renameConversation(conversationId, newTitle)
      // Reload conversations to get updated title
      await loadConversations()
    } catch (error) {
      console.error('Failed to rename conversation:', error)
      throw error
    }
  }
  
  return {
    conversations,
    currentConversationId,
    messages,
    currentMessages,
    isStreaming,
    workflowStatus: computed(() => workflow.value.status),
    currentIntent: computed(() => currentIntent.value),
    loadConversations,
    loadConversation,
    sendMessage,
    createNewConversation,
    deleteConversation,
    renameConversation
  }
})
