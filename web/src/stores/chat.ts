import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatMessage } from '@/types'
import * as chatService from '@/services/chat'

export const useChatStore = defineStore('chat', () => {
  // State
  const conversations = ref<any[]>([])
  const currentConversationId = ref<string | null>(null)
  const messages = ref<Map<string, ChatMessage[]>>(new Map())
  const isStreaming = ref(false)
  const workflowStatus = ref<string>('')  // NEW: Track workflow progress
  const activeTools = ref<string[]>([])   // NEW: Track active tools
  const partialServices = ref<any[]>([])  // NEW: Track incremental services
  
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
      // Force Vue reactivity by creating a new Map
      const newMap = new Map(messages.value)
      newMap.set(conversationId, msgs)
      messages.value = newMap
      currentConversationId.value = conversationId
      // Clear services when loading existing conversation (they may have expired)
      partialServices.value = []
      workflowStatus.value = ''
      activeTools.value = []
    } catch (error) {
      console.error('Failed to load conversation:', error)
    }
  }
  
  async function sendMessage(message: string, onEvent?: (event: any) => void) {
    isStreaming.value = true
    
    // Immediately create user and empty assistant messages for better UX
    const conversationId = currentConversationId.value || `conv_${Date.now()}`
    if (!currentConversationId.value) {
      currentConversationId.value = conversationId
    }
    
    console.log('[Chat Store] Creating initial messages for conversation:', conversationId)
    
    const currentMsgs = messages.value.get(conversationId) || []
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
        content: '',  // Empty initially, will be filled by tokens
        timestamp: new Date().toISOString()
      }
    ]
    
    console.log('[Chat Store] Initial messages count:', updatedMsgs.length)
    
    // Force Vue reactivity
    const newMap = new Map(messages.value)
    newMap.set(conversationId, updatedMsgs)
    messages.value = newMap
    
    try {
      await chatService.sendMessageStream(
        {
          message,
          conversationId: currentConversationId.value
        },
        (event) => {
          handleSSEEvent(event)
          if (onEvent) {
            onEvent(event)
          }
        }
      )
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      isStreaming.value = false
    }
  }
  
  function handleSSEEvent(event: any) {
    const { type, data, step, tool, service, services, summary } = event
    
    if (!currentConversationId.value && data?.conversationId) {
      currentConversationId.value = data.conversationId
    }
    
    const conversationId = currentConversationId.value
    if (!conversationId) return
    
    const currentMsgs = messages.value.get(conversationId) || []
    
    switch (type) {
      case 'step_start':
        // Show workflow progress with more detail
        // step is at top level of event, not in data
        const stepName = step || 'Processing'
        
        console.log('[Chat Store] DEBUG: step_start received with stepName:', stepName)
        
        // Map step names to user-friendly descriptions
        const stepDescriptions: Record<string, string> = {
          'memoryLoader': '💡 Loading conversation history...',
          'goalSplitter': '🎯 Analyzing your request...',
          'taskPlanner': '📋 Planning analysis tasks...',
          'pluginExecutor': '⚙️ Executing analysis...',
          'outputGenerator': '📊 Generating results...',
          'summaryGenerator': '📝 Creating summary...'
        }
        
        const description = stepDescriptions[stepName] || `Working on: ${stepName}...`
        workflowStatus.value = description
        console.log('[Chat Store] Workflow status set to:', description)
        break
        
      case 'step_complete':
        // Clear workflow status
        workflowStatus.value = ''
        console.log('[Chat Store] Workflow step complete')
        break
        
      case 'tool_start':
        // Show tool usage with more detail
        // Get tool name from event.tool field (set by GeoAIStreamingHandler)
        const toolName = event.tool || 'Unknown tool'
        activeTools.value.push(toolName)
        
        // Map tool names to user-friendly descriptions
        const toolDescriptions: Record<string, string> = {
          'buffer_analysis': '🔵 Creating buffer zones...',
          'overlay_analysis': '🔀 Performing overlay analysis...',
          'data_filter': '🔍 Filtering data...',
          'data_aggregation': '📊 Calculating statistics...',
          'mvt_publisher': '🗺️ Publishing map tiles...',
          'statistics_calculator': '📈 Computing statistics...',
          'report_generator': '📄 Generating report...'
        }
        
        workflowStatus.value = toolDescriptions[toolName] || `Using ${toolName}...`
        console.log('[Chat Store] Tool started:', toolName)
        break
        
      case 'tool_complete':
        // Remove from active tools with detailed status
        // Try to get tool name from output first, then fall back to activeTools
        let completedToolName = 'Unknown tool'
        if (data?.output) {
          try {
            const output = JSON.parse(data.output)
            completedToolName = output.pluginId || completedToolName
          } catch (e) {
            console.warn('[Chat Store] Failed to parse tool output', e)
          }
        }
        
        // If we couldn't get it from output, use the last active tool
        if (completedToolName === 'Unknown tool' && activeTools.value.length > 0) {
          completedToolName = activeTools.value[activeTools.value.length - 1]
        }
        
        activeTools.value = activeTools.value.filter(t => t !== completedToolName)
        
        // Check if the tool succeeded by parsing output
        let toolSucceeded = true
        if (data?.output) {
          try {
            const output = JSON.parse(data.output)
            toolSucceeded = output.success !== false
          } catch (e) {
            // If can't parse, assume success
          }
        }
        
        if (toolSucceeded) {
          // Show success with emoji based on tool type
          const successMessages: Record<string, string> = {
            'buffer_analysis': '✅ Buffer analysis completed',
            'overlay_analysis': '✅ Overlay analysis completed',
            'data_filter': '✅ Data filtered successfully',
            'data_aggregation': '✅ Statistics calculated',
            'mvt_publisher': '✅ Map tiles published',
            'statistics_calculator': '✅ Statistics computed',
            'report_generator': '✅ Report generated'
          }
          
          workflowStatus.value = successMessages[completedToolName] || `${completedToolName} completed ✓`
        } else {
          workflowStatus.value = `❌ ${completedToolName} failed`
          console.warn('[Chat Store] Tool failed')
        }
        
        // Clear status after 2 seconds
        setTimeout(() => {
          if (workflowStatus.value.includes(completedToolName) || workflowStatus.value.includes('completed') || workflowStatus.value.includes('failed')) {
            workflowStatus.value = ''
          }
        }, 2000)
        break
        
      case 'partial_result':
        // Add service to partial results list
        // service is at top level of event
        if (service) {
          partialServices.value.push(service)
          console.log('[Chat Store] Partial result received:', service.id)
          
          // Show notification when a new service is ready
          const serviceType = service.type.toUpperCase()
          workflowStatus.value = `🎉 ${serviceType} service ready!`
          
          // Clear status after 3 seconds
          setTimeout(() => {
            if (workflowStatus.value.includes('service ready')) {
              workflowStatus.value = ''
            }
          }, 3000)
        }
        break
        
      case 'message_start':
        // User message already created in sendMessage, just ensure conversationId is set
        if (data?.conversationId && !currentConversationId.value) {
          currentConversationId.value = data.conversationId
        }
        break
        
      case 'token':
        // Streaming token from assistant
        if (!data) {
          console.warn('[Chat Store] Token event missing data field', event)
          break
        }
        
        // Support both data structures for backward compatibility
        const tokenText = data.token || data.content || ''
        if (!tokenText) {
          console.warn('[Chat Store] Token event has no text content', event)
          break
        }
        
        // Create new messages array to ensure Vue reactivity
        let updatedMsgs = [...currentMsgs]
        
        if (updatedMsgs.length === 0 || updatedMsgs[updatedMsgs.length - 1].role !== 'assistant') {
          // Create new assistant message
          updatedMsgs.push({
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: tokenText,  // Start with first token
            timestamp: new Date().toISOString()
          })
        } else {
          // Append to existing assistant message (create new object to trigger reactivity)
          const lastMsg = updatedMsgs[updatedMsgs.length - 1]
          updatedMsgs[updatedMsgs.length - 1] = {
            ...lastMsg,
            content: lastMsg.content + tokenText
          }
        }
        
        // Update the Map with new array reference
        // Force Vue reactivity by creating a new Map
        const newMap = new Map(messages.value)
        newMap.set(conversationId, updatedMsgs)
        messages.value = newMap
        break
        
      case 'message_complete':
        // Clear workflow status when message is complete
        workflowStatus.value = ''
        activeTools.value = []
        
        // Message complete - add summary as assistant message if not already added
        const lastMessage = currentMsgs[currentMsgs.length - 1]
        if (!lastMessage || lastMessage.role !== 'assistant') {
          // If no assistant message was created via tokens, create one with summary
          currentMsgs.push({
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: data?.summary || 'Analysis completed',
            timestamp: new Date().toISOString()
          })
          // Force Vue reactivity by creating a new Map
          const completeMap1 = new Map(messages.value)
          completeMap1.set(conversationId, [...currentMsgs])
          messages.value = completeMap1
        }
        
        // Store visualization services if provided
        if (data?.services && data.services.length > 0) {
          console.log('[Chat Store] Received visualization services:', data.services)
          
          // Attach services to the last assistant message
          const lastAssistantMsg = [...currentMsgs].reverse().find((m: any) => m.role === 'assistant')
          if (lastAssistantMsg) {
            lastAssistantMsg.services = data.services
            // Force Vue reactivity by creating a new Map
            const completeMap2 = new Map(messages.value)
            completeMap2.set(conversationId, [...currentMsgs])
            messages.value = completeMap2
            console.log('[Chat Store] Attached services to last assistant message')
          }
          
          // Also add all services to partialServices for backward compatibility
          data.services.forEach((service: any) => {
            // Avoid duplicates by checking if service already exists
            const exists = partialServices.value.some(s => s.id === service.id)
            if (!exists) {
              partialServices.value.push(service)
            }
          })
          console.log(`[Chat Store] Total services now: ${partialServices.value.length}`)
        }
        
        isStreaming.value = false
        break
        
      case 'error':
        // Handle error events - support both old and new structures
        const errorMessage = data?.error || data?.message || 'Unknown error'
        console.error('Chat error:', errorMessage)
        
        // Add error message to chat for user visibility
        currentMsgs.push({
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Error: ${errorMessage}`,
          timestamp: new Date().toISOString()
        })
        // Force Vue reactivity by creating a new Map
        const errorMap = new Map(messages.value)
        errorMap.set(conversationId, [...currentMsgs])
        messages.value = errorMap
        
        isStreaming.value = false
        break
    }
  }
  
  function createNewConversation() {
    currentConversationId.value = null
    messages.value.clear()
    partialServices.value = [] // Clear services for new conversation
    workflowStatus.value = ''
    activeTools.value = []
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
  
  return {
    conversations,
    currentConversationId,
    messages,
    currentMessages,
    isStreaming,
    workflowStatus,      // NEW: Expose workflow status
    activeTools,         // NEW: Expose active tools
    partialServices,     // NEW: Expose partial services
    loadConversations,
    loadConversation,
    sendMessage,
    createNewConversation,
    deleteConversation
  }
})
