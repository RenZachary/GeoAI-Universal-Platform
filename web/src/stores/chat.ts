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
    console.log('[Chat Store] sendMessage called with message:', message.substring(0, 50) + '...')
    isStreaming.value = true
    
    // Immediately create user and empty assistant messages for better UX
    const conversationId = currentConversationId.value || `conv_${Date.now()}`
    if (!currentConversationId.value) {
      currentConversationId.value = conversationId
    }
    
    console.log('[Chat Store] Creating initial messages for conversation:', conversationId)
    
    const currentMsgs = messages.value.get(conversationId) || []
    console.log('[Chat Store] Current messages count:', currentMsgs.length)
    
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
    
    console.log('[Chat Store] Updated messages count:', updatedMsgs.length)
    
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
    const { type, data, step, tool, service, services, summary,output } = event
    
    if (!currentConversationId.value && data?.conversationId) {
      currentConversationId.value = data.conversationId
    }
    
    const conversationId = currentConversationId.value
    if (!conversationId) return
    
    const currentMsgs = messages.value.get(conversationId) || []
    
    switch (type) {
      case 'step_start':
        // Intentionally ignored - workflow status is now controlled via __STATUS__ tokens
        // See GeoAIGraph.ts where each node sends status updates via onToken callback
        break
        
      case 'step_complete':
        // Intentionally ignored - workflow status persistence is managed by token flow
        break
        
      case 'tool_start':
        // Show tool execution with user-friendly descriptions
        const toolName = tool || 'Unknown tool'
        activeTools.value.push(toolName)
        
        // Map tool names to user-friendly descriptions
        const toolDescriptions: Record<string, string> = {
          'buffer_analysis': '🔵 Creating buffer zones...',
          'overlay_analysis': '🔀 Performing overlay analysis...',
          'data_filter': '🔍 Filtering data...',
          'data_aggregation': '📊 Calculating statistics...',
          'choropleth_map': '🗺️ Generating choropleth map...',
          'heatmap_visualization': '🔥 Creating heatmap...',
          'statistics_calculator': '📈 Computing statistics...',
          'report_generator': '📄 Generating report...'
        }
        
        workflowStatus.value = toolDescriptions[toolName] || `Using ${toolName}...`
        break
        
      case 'tool_complete':
        // Remove completed tool from active list
        const completedToolName = tool || 'Unknown tool'
        activeTools.value = activeTools.value.filter(t => t !== completedToolName)
        
        // Check if the tool succeeded by parsing output
        let toolSucceeded = true
        if (output) {
          try {
            const outputData = JSON.parse(output)
            toolSucceeded = outputData.success !== false
          } catch (e) {
            // If can't parse, assume success
          }
        }
        
        if (toolSucceeded) {
          // Show success message based on tool type
          const successMessages: Record<string, string> = {
            'buffer_analysis': '✅ Buffer zones created',
            'overlay_analysis': '✅ Overlay completed',
            'data_filter': '✅ Data filtered',
            'choropleth_map': '✅ Map generated',
            'heatmap_visualization': '✅ Heatmap created',
            'statistics_calculator': '✅ Statistics computed',
            'report_generator': '✅ Report generated'
          }
          
          workflowStatus.value = successMessages[completedToolName] || `${completedToolName} completed ✓`
        } else {
          workflowStatus.value = `❌ ${completedToolName} failed`
          console.warn('[Chat Store] Tool failed')
        }
        
        // Auto-clear status after 2 seconds
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
        // Real-time token streaming from LLM (via GeoAIStreamingHandler)
        const tokenText = data?.token || ''
        if (!tokenText) {
          console.warn('[Chat Store] Token event has no text content', event)
          break
        }
        
        // Check if this is a status update token
        if (tokenText.startsWith('__STATUS__:')) {
          // Extract the status message and update workflow status
          const statusMessage = tokenText.replace('__STATUS__:', '')
          workflowStatus.value = statusMessage
          // IMPORTANT: Return early to prevent appending to message content
          return
        }
        
        // Normal token - append to assistant message
        let updatedMsgs = [...currentMsgs]
        
        if (updatedMsgs.length === 0 || updatedMsgs[updatedMsgs.length - 1].role !== 'assistant') {
          // Create new assistant message with first token
          updatedMsgs.push({
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: tokenText,
            timestamp: new Date().toISOString()
          })
        } else {
          // Append token to existing assistant message
          const lastMsg = updatedMsgs[updatedMsgs.length - 1]
          updatedMsgs[updatedMsgs.length - 1] = {
            ...lastMsg,
            content: lastMsg.content + tokenText
          }
        }
        
        // Update the Map with new array reference for Vue reactivity
        const newMap = new Map(messages.value)
        newMap.set(conversationId, updatedMsgs)
        messages.value = newMap
        break
        
      case 'message_complete':
        // Clear workflow status when message is complete
        workflowStatus.value = ''
        activeTools.value = []
        
        // Message complete - add or update summary as assistant message
        const lastMessage = currentMsgs[currentMsgs.length - 1]
        if (!lastMessage || lastMessage.role !== 'assistant') {
          // If no assistant message was created via tokens, create one with summary
          currentMsgs.push({
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: data?.summary || 'Analysis completed',
            timestamp: new Date().toISOString()
          })
        } else {
          // Update existing assistant message content with summary
          // This handles the case where only __STATUS__ tokens were received (no real content tokens)
          currentMsgs[currentMsgs.length - 1] = {
            ...lastMessage,
            content: data?.summary || lastMessage.content || 'Analysis completed'
          }
        }
        
        // Store visualization services if provided
        const servicesToStore = data?.services || services
        
        if (servicesToStore && servicesToStore.length > 0) {
          // Attach services to the last assistant message
          // Create a completely new array with all new object references
          const msgsArray = currentMsgs.map((msg, index) => {
            // Check if this is the last assistant message
            const isLastAssistant = index === currentMsgs.map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === 'assistant')?.i
            
            if (isLastAssistant) {
              // Create a new object with services
              return {
                ...msg,
                services: [...servicesToStore] // Create a new array copy
              }
            }
            // Return other messages as-is
            return msg
          })
          
          // Force Vue reactivity by creating a completely new Map
          const completeMap = new Map()
          // Copy all existing conversations
          messages.value.forEach((msgs, convId) => {
            completeMap.set(convId, msgs)
          })
          // Update current conversation with new array
          completeMap.set(conversationId, msgsArray)
          messages.value = completeMap
          
          // Also add all services to partialServices for backward compatibility
          servicesToStore.forEach((service: any) => {
            // Avoid duplicates by checking if service already exists
            const exists = partialServices.value.some(s => s.id === service.id)
            if (!exists) {
              partialServices.value.push(service)
            }
          })
        } else {
          // Even if no services to store, still need to update the Map to trigger reactivity
          const completeMap = new Map(messages.value)
          completeMap.set(conversationId, [...currentMsgs])
          messages.value = completeMap
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
    workflowStatus,      // NEW: Expose workflow status
    activeTools,         // NEW: Expose active tools
    partialServices,     // NEW: Expose partial services
    loadConversations,
    loadConversation,
    sendMessage,
    createNewConversation,
    deleteConversation,
    renameConversation   // NEW: Expose rename conversation
  }
})
