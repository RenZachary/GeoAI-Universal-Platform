# Vue3 聊天界面的 SSE 实时工作流反馈：让 AI 的思考过程"可见"

> "分析北京市五环内的POI分布密度" —— 用户按下回车后，界面没有转圈圈，而是实时显示："🎯 正在分析请求... → 📋 规划任务... → 🔵 创建缓冲区... → ✅ 地图已生成"。这不是动画演示，而是真实的 LangGraph 工作流执行进度。

## 一、为什么需要"可见"的AI思考？

### 传统聊天机器人的痛点

**方案A：纯文本响应**
```
用户：分析北京市五环内的POI分布
（等待15秒...）
AI：已完成分析，结果如下...
```

**问题**：
- 用户不知道AI在做什么（卡住了？还是在计算？）
- 长时间等待导致焦虑，误以为系统故障
- 无法中途取消或干预

**方案B：固定Loading动画**
```javascript
// 常见做法
<div v-if="loading">
  <el-icon class="is-loading"><Loading /></el-icon>
  正在处理...
</div>
```

**问题**：
- 信息量太少，用户仍然不知道具体进展
- 无法区分"意图识别"、"数据查询"、"地图渲染"等不同阶段

**我们的解法**：SSE 实时推送细粒度工作流状态

```typescript
// 后端推送的事件流
data: {"type":"token","data":{"token":"__STATUS__:🎯 Analyzing your request..."}}
data: {"type":"token","data":{"token":"__STATUS__:📋 Planning analysis tasks..."}}
data: {"type":"tool_start","tool":"buffer_analysis"}
data: {"type":"tool_complete","tool":"buffer_analysis","output":"{\"success\":true}"}
data: {"type":"partial_result","service":{"id":"mvt_xxx","type":"mvt","url":"/api/..."}}
data: {"type":"token","data":{"token":"__STATUS__:✅ Map generated"}}
```

**前端效果**：
- **WorkflowStatusIndicator** 组件实时显示当前步骤
- **Active Tools Chips** 动态展示正在执行的算子
- **增量服务卡片** 每生成一个地图服务立即显示，无需等待全部完成

---

## 二、架构总览

```
┌──────────────────────────────────────────────────────┐
│              Frontend (Vue3 + Pinia)                  │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │ ChatView.vue                                 │     │
│  │ • 用户输入框                                 │     │
│  │ • MessageBubble 列表                         │     │
│  │ • WorkflowStatusIndicator（顶部状态栏）       │     │
│  └──────────────────┬──────────────────────────┘     │
│                     │                                 │
│  ┌──────────────────▼──────────────────────────┐     │
│  │ chat.ts (Pinia Store)                        │     │
│  │ • handleSSEEvent() - SSE事件分发器           │     │
│  │ • workflowStatus.value - 响应式状态          │     │
│  │ • activeTools.value[] - 活跃工具列表         │     │
│  │ • partialServices.value[] - 增量服务列表     │     │
│  └──────────────────┬──────────────────────────┘     │
│                     │                                 │
│  ┌──────────────────▼──────────────────────────┐     │
│  │ chat.ts (Service Layer)                      │     │
│  │ • sendMessageStream() - Fetch API + ReadableStream│
│  │ • TextDecoder 解码                           │     │
│  │ • data: JSON 解析                            │     │
│  └──────────────────┬──────────────────────────┘     │
└─────────────────────┼────────────────────────────────┘
                      │ SSE (text/event-stream)
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│         Backend (Node.js + Express)                   │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │ ChatController.stream()                      │     │
│  │ • res.writeHead(200, {                       │     │
│  │     'Content-Type': 'text/event-stream'      │     │
│  │   })                                         │     │
│  │ • GeoAIStreamingHandler 回调注入             │     │
│  └──────────────────┬──────────────────────────┘     │
│                     │                                 │
│  ┌──────────────────▼──────────────────────────┐     │
│  │ GeoAIGraph (LangGraph StateGraph)            │     │
│  │                                              │     │
│  │ memoryLoader → goalSplitter → taskPlanner    │     │
│  │     ↓                                        │     │
│  │ parallelExecutor (Promise.allSettled)        │     │
│  │     ↓                                        │     │
│  │ summaryGenerator                             │     │
│  └──────────────────┬──────────────────────────┘     │
│                     │                                 │
│  ┌──────────────────▼──────────────────────────┐     │
│  │ onToken Callback                             │     │
│  │ • 每个节点执行时调用                          │     │
│  │ • onToken('__STATUS__:🎯 Analyzing...')      │     │
│  │ • res.write(`data: ${JSON.stringify(...)}\n`)│     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

**关键设计原则**：
1. **单向数据流**：后端推送 → Store接收 → 组件响应式更新
2. **特殊Token协议**：`__STATUS__:` 前缀标识状态消息，与普通文本分离
3. **增量渲染**：`partial_result` 事件触发服务卡片立即显示，不等工作流结束
4. **自动清理**：工具完成后2秒自动隐藏状态，避免界面 cluttered

---

## 三、核心实现详解

### 3.1 前端SSE客户端：ReadableStream的优雅封装

传统的 `EventSource` API 不支持 POST 请求和自定义 Header，必须用 Fetch API + ReadableStream 手动实现。

```typescript
// web/src/services/chat.ts

export async function sendMessageStream(
  params: SendMessageParams,
  onEvent: (event: any) => void
): Promise<void> {
  const response = await fetch(`${api.defaults.baseURL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Browser-Fingerprint': localStorage.getItem('browser_fingerprint') || ''
    },
    body: JSON.stringify({
      message: params.message,
      conversationId: params.conversationId,
      llmConfig: params.llmConfig
    })
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  // 获取可读流
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let buffer = '' // 缓冲不完整的数据行

  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break
      
      // 解码二进制块为文本
      buffer += decoder.decode(value, { stream: true })
      
      // 按换行符分割（SSE标准：每条消息以\n结尾）
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留最后一行（可能不完整）

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6) // 去掉 "data: " 前缀
          
          if (data === '[DONE]') {
            return // 流结束标记
          }
          
          try {
            const event = JSON.parse(data)
            onEvent(event) // 回调给Store处理
          } catch (e) {
            console.error('Failed to parse SSE event:', e)
          }
        }
      }
    }
  } finally {
    reader.releaseLock() // 释放锁，允许其他操作
  }
}
```

**关键技术点**：

1. **Buffer机制**：网络传输可能将一条消息拆分成多个chunk，需要用buffer暂存不完整行
2. **stream: true**：TextDecoder的stream选项处理UTF-8多字节字符跨chunk的情况
3. **错误隔离**：单条JSON解析失败不影响后续消息（catch后continue）
4. **资源释放**：finally中releaseLock防止内存泄漏

**对比EventSource**：

| 特性 | EventSource | Fetch + ReadableStream |
|------|------------|------------------------|
| 支持POST | ❌ | ✅ |
| 自定义Header | ❌ | ✅ |
| 二进制数据 | ❌ | ✅ |
| 断开重连 | ✅ 自动 | ❌ 需手动实现 |
| 浏览器兼容 | 所有现代浏览器 | 所有现代浏览器 |

---

### 3.2 Pinia Store：SSE事件分发器

Store是连接SSE流与UI组件的桥梁，负责解析事件类型并更新响应式状态。

```typescript
// web/src/stores/chat.ts

export const useChatStore = defineStore('chat', () => {
  // 响应式状态
  const messages = ref<Map<string, ChatMessage[]>>(new Map())
  const isStreaming = ref(false)
  const workflowStatus = ref<string>('')  // 工作流状态文本
  const activeTools = ref<string[]>([])   // 正在执行的工具列表
  const partialServices = ref<any[]>([])  // 已生成的服务（增量添加）
  
  function handleSSEEvent(event: any) {
    const { type, data, tool, service, services, summary, output } = event
    
    // 确保conversationId已设置
    if (!currentConversationId.value && data?.conversationId) {
      currentConversationId.value = data.conversationId
    }
    
    const conversationId = currentConversationId.value
    if (!conversationId) return
    
    const currentMsgs = messages.value.get(conversationId) || []
    
    switch (type) {
      case 'tool_start':
        // 工具开始执行
        const toolName = tool || 'Unknown tool'
        activeTools.value.push(toolName)
        
        // 映射工具ID为用户友好的描述
        const toolDescriptions: Record<string, string> = {
          'buffer_analysis': '🔵 Creating buffer zones...',
          'overlay_analysis': '🔀 Performing overlay analysis...',
          'data_filter': '🔍 Filtering data...',
          'choropleth_map': '🗺️ Generating choropleth map...',
          'heatmap_visualization': '🔥 Creating heatmap...'
        }
        
        workflowStatus.value = toolDescriptions[toolName] || `Using ${toolName}...`
        break
        
      case 'tool_complete':
        // 工具执行完成
        const completedToolName = tool || 'Unknown tool'
        activeTools.value = activeTools.value.filter(t => t !== completedToolName)
        
        // 检查是否成功
        let toolSucceeded = true
        if (output) {
          try {
            const outputData = JSON.parse(output)
            toolSucceeded = outputData.success !== false
          } catch (e) {
            // 无法解析则假设成功
          }
        }
        
        if (toolSucceeded) {
          const successMessages: Record<string, string> = {
            'buffer_analysis': '✅ Buffer zones created',
            'choropleth_map': '✅ Map generated',
            'statistics_calculator': '✅ Statistics computed'
          }
          
          workflowStatus.value = successMessages[completedToolName] || `${completedToolName} completed ✓`
        } else {
          workflowStatus.value = `❌ ${completedToolName} failed`
        }
        
        // 2秒后自动清除状态（如果仍是该工具的状态）
        setTimeout(() => {
          if (workflowStatus.value.includes(completedToolName)) {
            workflowStatus.value = ''
          }
        }, 2000)
        break
        
      case 'partial_result':
        // 增量服务就绪（无需等待工作流结束）
        if (service) {
          partialServices.value.push(service)
          
          const serviceType = service.type.toUpperCase()
          workflowStatus.value = `🎉 ${serviceType} service ready!`
          
          // 3秒后清除
          setTimeout(() => {
            if (workflowStatus.value.includes('service ready')) {
              workflowStatus.value = ''
            }
          }, 3000)
        }
        break
        
      case 'token':
        // LLM token流式输出
        const tokenText = data?.token || ''
        if (!tokenText) break
        
        // 检测特殊状态Token
        if (tokenText.startsWith('__STATUS__:')) {
          // 提取状态消息并更新workflowStatus
          const statusMessage = tokenText.replace('__STATUS__:', '')
          workflowStatus.value = statusMessage
          // 重要：直接return，不追加到消息内容
          return
        }
        
        // 普通Token：追加到assistant消息
        let updatedMsgs = [...currentMsgs]
        
        if (updatedMsgs.length === 0 || updatedMsgs[updatedMsgs.length - 1].role !== 'assistant') {
          // 创建新的assistant消息
          updatedMsgs.push({
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: tokenText,
            timestamp: new Date().toISOString()
          })
        } else {
          // 追加到现有消息
          const lastMsg = updatedMsgs[updatedMsgs.length - 1]
          updatedMsgs[updatedMsgs.length - 1] = {
            ...lastMsg,
            content: lastMsg.content + tokenText
          }
        }
        
        // 强制Vue响应式更新（Map需要新引用）
        const newMap = new Map(messages.value)
        newMap.set(conversationId, updatedMsgs)
        messages.value = newMap
        break
        
      case 'message_complete':
        // 消息完成，清空状态
        workflowStatus.value = ''
        activeTools.value = []
        
        // 用summary替换最后一条assistant消息（如果之前只有__STATUS__ token）
        const lastMessage = currentMsgs[currentMsgs.length - 1]
        if (lastMessage && lastMessage.role === 'assistant') {
          currentMsgs[currentMsgs.length - 1] = {
            ...lastMessage,
            content: data?.summary || lastMessage.content || 'Analysis completed'
          }
        }
        
        // 保存visualization services到消息
        const servicesToStore = data?.services || services
        if (servicesToStore && servicesToStore.length > 0) {
          // 附加到最后的assistant消息
          const msgsArray = currentMsgs.map((msg, index) => {
            const isLastAssistant = /* 判断逻辑 */
            if (isLastAssistant) {
              return {
                ...msg,
                services: [...servicesToStore]
              }
            }
            return msg
          })
          
          const finalMap = new Map(messages.value)
          finalMap.set(conversationId, msgsArray)
          messages.value = finalMap
        }
        break
    }
  }
  
  return {
    messages,
    workflowStatus,
    activeTools,
    partialServices,
    handleSSEEvent
  }
})
```

**关键技术点**：

1. **Map响应式陷阱**：Vue3对Map的修改不会触发更新，必须创建新Map实例
   ```typescript
   // ❌ 错误：直接修改不会触发响应式
   messages.value.set(conversationId, updatedMsgs)
   
   // ✅ 正确：创建新Map
   const newMap = new Map(messages.value)
   newMap.set(conversationId, updatedMsgs)
   messages.value = newMap
   ```

2. **__STATUS__ Token协议**：
   - 后端在LangGraph节点中调用 `onToken('__STATUS__:消息')`
   - 前端检测到 `__STATUS__:` 前缀，提取消息并更新workflowStatus
   - **不追加到聊天内容**，避免污染最终文本

3. **主动清理策略**：setTimeout自动清除临时状态，避免界面残留

---

### 3.3 WorkflowStatusIndicator组件：状态可视化

这是整个系统的"脸面"，负责将workflowStatus字符串转换为美观的UI。

```vue
<!-- web/src/components/chat/WorkflowStatusIndicator.vue -->
<template>
  <transition name="status-fade">
    <div v-if="status" class="workflow-status" :class="statusClass">
      <div class="status-content">
        <!-- 状态图标（带脉冲动画） -->
        <span class="status-icon-wrapper">
          <span class="status-icon" :class="{ 'pulse': isActive }">
            <el-icon v-if="isActive" class="is-loading">
              <Loading />
            </el-icon>
            <el-icon v-else-if="isSuccess" class="text-success">
              <CircleCheck />
            </el-icon>
            <el-icon v-else-if="isError" class="text-error">
              <CircleClose />
            </el-icon>
          </span>
        </span>

        <!-- 状态文本 -->
        <span class="status-text">{{ status }}</span>

        <!-- 活跃工具Chips -->
        <div v-if="activeTools.length > 0" class="active-tools">
          <el-tag 
            v-for="tool in activeTools" 
            :key="tool" 
            size="small" 
            type="primary" 
            effect="dark"
            class="tool-chip"
          >
            <el-icon><Tools /></el-icon>
            {{ tool }}
          </el-tag>
        </div>
      </div>
      
      <!-- 进度条（仅激活状态显示） -->
      <div v-if="isActive" class="progress-bar">
        <div class="progress-fill"></div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, CircleCheck, CircleClose, Tools } from '@element-plus/icons-vue'

interface Props {
  status: string
  activeTools: string[]
}

const props = defineProps<Props>()

// 根据状态文本判断类型
const isActive = computed(() => {
  return props.status &&
    !props.status.includes('✓') &&
    !props.status.includes('✗') &&
    !props.status.includes('✅') &&
    !props.status.includes('❌') &&
    !props.status.includes('completed') &&
    !props.status.includes('failed')
})

const isSuccess = computed(() => {
  return props.status.includes('✓') ||
    props.status.includes('✅') ||
    props.status.includes('completed')
})

const isError = computed(() => {
  return props.status.includes('✗') ||
    props.status.includes('❌') ||
    props.status.includes('failed')
})

const statusClass = computed(() => {
  if (isActive.value) return 'status-active'
  if (isSuccess.value) return 'status-success'
  if (isError.value) return 'status-error'
  return ''
})
</script>

<style scoped lang="scss">
.workflow-status {
  position: relative;
  padding: 16px 24px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  overflow: hidden;
  transition: all 0.3s ease;

  &.status-active {
    background: linear-gradient(135deg, 
      rgba(64, 158, 255, 0.05) 0%, 
      rgba(64, 158, 255, 0.1) 50%,
      rgba(64, 158, 255, 0.05) 100%
    );
    border-left: 4px solid var(--el-color-primary);
  }

  &.status-success {
    background: linear-gradient(135deg, 
      rgba(103, 194, 58, 0.05) 0%, 
      rgba(103, 194, 58, 0.1) 50%,
      rgba(103, 194, 58, 0.05) 100%
    );
    border-left: 4px solid var(--el-color-success);
  }

  &.status-error {
    background: linear-gradient(135deg, 
      rgba(245, 108, 108, 0.05) 0%, 
      rgba(245, 108, 108, 0.1) 50%,
      rgba(245, 108, 108, 0.05) 100%
    );
    border-left: 4px solid var(--el-color-danger);
  }
}

.status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--el-bg-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  &.pulse {
    animation: pulse 2s ease-in-out infinite;
  }

  .is-loading {
    animation: rotate 1.5s linear infinite;
    color: var(--el-color-primary);
  }
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 4px 16px rgba(64, 158, 255, 0.6);
    transform: scale(1.05);
  }
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--el-fill-color-lighter);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, 
    var(--el-color-primary) 0%, 
    var(--el-color-primary-light-3) 50%,
    var(--el-color-primary) 100%
  );
  background-size: 200% 100%;
  animation: progress-flow 2s linear infinite;
}

@keyframes progress-flow {
  0% {
    background-position: 200% 0;
    width: 30%;
  }
  50% {
    width: 70%;
  }
  100% {
    background-position: -200% 0;
    width: 30%;
  }
}

/* Vue Transition动画 */
.status-fade-enter-active,
.status-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.status-fade-enter-from,
.status-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}
</style>
```

**设计亮点**：

1. **三色状态系统**：
   - **Active（蓝色）**：渐变背景 + 左侧边框 + 脉冲图标 + 流动进度条
   - **Success（绿色）**：渐变背景 + 勾选图标
   - **Error（红色）**：渐变背景 + 叉号图标

2. **动画细节**：
   - `pulse`：box-shadow扩散动画，模拟呼吸效果
   - `rotate`：Loading图标旋转
   - `progress-flow`：进度条从左到右流动（background-position移动）
   - `status-fade`：Vue transition实现淡入淡出 + 位移

3. **Active Tools Chips**：
   - 使用Element Plus的`el-tag`组件
   - 悬停时上浮2px + 阴影增强
   - 最多显示3个工具，超出部分滚动

---

### 3.4 后端LangGraph集成：onToken回调注入

前端能收到`__STATUS__` token，关键在于后端LangGraph每个节点都注入了onToken回调。

```typescript
// server/src/llm-interaction/workflow/GeoAIGraph.ts

export function createGeoAIGraph(
  llmConfig: LLMConfig, 
  workspaceBase: string, 
  onPartialResult?: (service: VisualizationService) => void,
  onToken?: (token: string) => void // 关键：Token流式回调
) {
  const workflow = new StateGraph(GeoAIStateAnnotation)
    
    // Memory Loader节点
    .addNode('memoryLoader', async (state: GeoAIStateType) => {
      console.log('[Memory Loader] Loading conversation history');
      return { messages: [] };
    })
    
    // Goal Splitter节点
    .addNode('goalSplitter', async (state: GeoAIStateType) => {
      console.log('[Goal Splitter] Analyzing user input');
      
      // 发送状态Token
      if (onToken) {
        onToken('__STATUS__:🎯 Analyzing your request...');
      }
      
      const goals = await goalSplitter.splitGoals(state.userInput);
      
      return { 
        goals,
        currentStep: 'goal_splitting' as const
      };
    })
    
    // Task Planner节点
    .addNode('taskPlanner', async (state: GeoAIStateType) => {
      console.log('[Task Planner] Creating execution plans');
      
      if (onToken) {
        onToken('__STATUS__:📋 Planning analysis tasks...');
      }
      
      const plans = await taskPlanner.createPlans(state.goals || []);
      
      return {
        executionPlans: plans,
        currentStep: 'task_planning' as const
      };
    })
    
    // Parallel Executor节点
    .addNode('parallelExecutor', async (state: GeoAIStateType) => {
      console.log('[Parallel Executor] Running tasks');
      
      if (onToken) {
        onToken('__STATUS__:⚙️ Executing analysis...');
      }
      
      // 并行执行所有计划
      const results = await executeAllPlans(state.executionPlans, onToken);
      
      return {
        executionResults: results,
        currentStep: 'execution' as const
      };
    })
    
    // Summary Generator节点
    .addNode('summaryGenerator', async (state: GeoAIStateType) => {
      console.log('[Summary Generator] Creating summary');
      
      if (onToken) {
        onToken('__STATUS__:📝 Creating summary...');
      }
      
      const summary = await summaryGenerator.generate(
        state.executionResults,
        onToken // 传递onToken给LLM流式输出
      );
      
      return {
        summary,
        currentStep: 'summary' as const
      };
    })
    
    // 定义边
    .addEdge(START, 'memoryLoader')
    .addEdge('memoryLoader', 'goalSplitter')
    .addEdge('goalSplitter', 'taskPlanner')
    .addEdge('taskPlanner', 'parallelExecutor')
    .addEdge('parallelExecutor', 'summaryGenerator')
    .addEdge('summaryGenerator', END);
  
  return workflow.compile();
}
```

**关键点**：

1. **每个节点开头调用onToken**：
   ```typescript
   if (onToken) {
     onToken('__STATUS__:🎯 Analyzing your request...');
   }
   ```

2. **SummaryGenerator内部也调用onToken**：
   ```typescript
   // server/src/llm-interaction/workflow/SummaryGenerator.ts
   async generate(results: Map<string, AnalysisResult>, onToken?: (token: string) => void) {
     const stream = await this.llm.stream(prompt);
     
     let fullSummary = '';
     for await (const chunk of stream) {
       const tokenText = chunk.content as string;
       fullSummary += tokenText;
       
       // 实时推送Token
       if (onToken) {
         onToken(tokenText);
       }
     }
     
     return fullSummary;
   }
   ```

3. **ChatController中的桥接**：
   ```typescript
   // server/src/api/controllers/ChatController.ts
   @Post('/stream')
   async stream(@Req() req: Request, @Res() res: Response) {
     res.writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive'
     });
     
     // 定义SSE写入函数
     const writeSSE = (event: any) => {
       res.write(`data: ${JSON.stringify(event)}\n\n`);
     };
     
     // 创建LangGraph，注入onToken回调
     const graph = createGeoAIGraph(
       llmConfig,
       workspaceBase,
       (service) => {
         // partial_result事件
         writeSSE({ type: 'partial_result', service });
       },
       (token) => {
         // token事件
         writeSSE({ type: 'token', data: { token } });
       }
     );
     
     // 执行工作流
     const result = await graph.invoke(initialState);
     
     // 发送完成信号
     res.write('data: [DONE]\n\n');
     res.end();
   }
   ```

---

## 四、增量服务卡片：无需等待的即时反馈

传统做法是等工作流全部结束后，一次性返回所有地图服务。我们改为**每生成一个服务立即推送**。

### 4.1 后端推送时机

```typescript
// server/src/llm-interaction/workflow/nodes/EnhancedPluginExecutor.ts

async executePlan(plan: ExecutionPlan, onPartialResult?: (service: any) => void) {
  for (const step of plan.steps) {
    // 执行空间算子
    const result = await operator.execute(step.params);
    
    // 如果结果是空间数据，立即发布为MVT服务
    if (result.returnType === 'spatial') {
      const service = await VisualizationServicePublisher.publishMVT(
        result.data,
        step.metadata
      );
      
      // 立即推送给前端（不等其他步骤完成）
      if (onPartialResult) {
        onPartialResult(service);
      }
    }
  }
}
```

### 4.2 前端接收与展示

```vue
<!-- web/src/components/chat/MessageBubble.vue -->
<template>
  <div class="message-bubble" :class="message.role">
    <!-- 消息内容 -->
    <div class="message-text" v-html="renderedContent" />
    
    <!-- 服务链接卡片 -->
    <div v-if="displayedServices.length > 0" class="service-links">
      <div class="service-links-header">
        <el-icon><Link /></el-icon>
        <span>Generated Services ({{ displayedServices.length }})</span>
      </div>
      
      <div class="service-link-list">
        <div 
          v-for="service in displayedServices" 
          :key="service.id"
          class="service-link-item"
        >
          <el-icon>
            <MapLocation v-if="service.type === 'mvt'" />
            <Reading v-else-if="service.type === 'report'" />
          </el-icon>
          <span class="service-name">{{ getServiceName(service) }}</span>
          <el-button 
            link 
            type="primary" 
            size="small"
            @click="handleViewService(service)"
          >
            {{ getActionText(service) }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const displayedServices = computed(() => {
  // 优先使用消息自带的services
  if (props.message.services?.length > 0) {
    return props.message.services
  }
  
  // 否则使用partialServices（增量添加的）
  if (props.message.role === 'assistant' && !props.isStreaming) {
    const allMessages = chatStore.currentMessages
    const lastMsg = allMessages[allMessages.length - 1]
    
    if (lastMsg?.id === props.message.id && chatStore.partialServices.length > 0) {
      return chatStore.partialServices
    }
  }
  
  return []
})

function handleViewService(service: VisualizationService) {
  if (service.type === 'mvt' || service.type === 'wms') {
    // 添加到地图
    mapStore.addLayerFromService(service)
    ElMessage.success(`Layer "${service.metadata?.name}" added to map`)
  } else if (service.type === 'report') {
    // 打开报告预览弹窗
    showReportModal.value = true
  }
}
</script>
```

**用户体验提升**：
- **传统方式**：等待15秒 → 一次性显示3个服务卡片
- **增量方式**：第5秒显示第1个 → 第10秒显示第2个 → 第15秒显示第3个
- **心理感受**：用户感觉系统"很快"，因为立即看到了第一个结果

---

## 五、踩坑记录

### 坑1：Vue3 Map响应式失效

**现象**：
```typescript
messages.value.set(conversationId, newMsgs)
// UI不更新！
```

**原因**：Vue3的reactive对Map的set/delete操作不会触发依赖追踪。

**解决方案**：
```typescript
// 必须创建新Map实例
const newMap = new Map(messages.value)
newMap.set(conversationId, newMsgs)
messages.value = newMap
```

**验证方法**：
```typescript
watch(messages, (newVal) => {
  console.log('Map updated:', newVal.size)
}, { deep: true })
```

### 坑2：SSE中文乱码

**现象**：后端推送"正在分析"，前端显示"æ­£åœ¨åˆ†æž"。

**原因**：TextDecoder未指定编码或使用默认ASCII。

**解决方案**：
```typescript
const decoder = new TextDecoder('utf-8') // 明确指定UTF-8
buffer += decoder.decode(value, { stream: true })
```

### 坑3：__STATUS__ Token污染聊天内容

**现象**：
```
AI回复：
__STATUS__:🎯 Analyzing...
__STATUS__:📋 Planning...
Analysis completed.
```

**原因**：前端未检测`__STATUS__:`前缀，直接追加到content。

**解决方案**：
```typescript
case 'token':
  const tokenText = data?.token || ''
  
  if (tokenText.startsWith('__STATUS__:')) {
    workflowStatus.value = tokenText.replace('__STATUS__:', '')
    return // 重要：直接return，不追加到content
  }
  
  // 正常追加逻辑...
```

### 坑4：activeTools重复添加

**现象**：同一个工具在chips中显示多次。

**原因**：`tool_start`事件被触发多次（LangGraph重试机制）。

**解决方案**：
```typescript
case 'tool_start':
  const toolName = tool || 'Unknown tool'
  
  // 去重检查
  if (!activeTools.value.includes(toolName)) {
    activeTools.value.push(toolName)
  }
```

### 坑5：SSE连接断开后无法重连

**现象**：网络波动导致流中断，用户必须刷新页面。

**解决方案**：实现指数退避重连
```typescript
async function sendMessageWithRetry(params: SendMessageParams, onEvent: any, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await sendMessageStream(params, onEvent)
      return // 成功则退出
    } catch (error) {
      if (i === maxRetries - 1) throw error
      
      const delay = Math.pow(2, i) * 1000 // 1s, 2s, 4s
      console.warn(`Retry ${i + 1} after ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
}
```

---

## 六、性能优化实战

### 6.1 防抖状态更新

**问题**：LLM每秒推送10个token，每次更新workflowStatus导致组件频繁重渲染。

**解决方案**：
```typescript
import { debounce } from 'lodash-es'

const updateWorkflowStatus = debounce((status: string) => {
  workflowStatus.value = status
}, 100) // 100ms防抖

// 使用时
if (tokenText.startsWith('__STATUS__:')) {
  updateWorkflowStatus(tokenText.replace('__STATUS__:', ''))
  return
}
```

### 6.2 虚拟滚动长对话

**问题**：超过100条消息后，DOM节点过多导致卡顿。

**解决方案**：使用vue-virtual-scroller
```vue
<RecycleScroller
  :items="currentMessages"
  :item-size="100"
  key-field="id"
  v-slot="{ item }"
>
  <MessageBubble :message="item" />
</RecycleScroller>
```

### 6.3 Blob URL内存管理

**问题**：StyleFactory生成的Blob URL未及时释放，导致内存泄漏。

**解决方案**：
```typescript
// 组件卸载时清理
onUnmounted(() => {
  if (layer.styleUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(layer.styleUrl)
  }
})
```

---

## 七、扩展方向

### 7.1 断点续传：恢复中断的工作流

当前实现中，SSE断开后必须重新开始。未来可实现：

```typescript
// 后端保存checkpoint
await checkpointSaver.save(state, threadId, stepId);

// 前端重连时携带lastEventId
fetch('/api/chat/stream', {
  headers: {
    'Last-Event-ID': lastProcessedEventId
  }
});
```

### 7.2 用户干预：中途取消或修改参数

```typescript
// 前端发送取消信号
ws.send(JSON.stringify({ type: 'cancel', stepId: 'buffer_analysis' }));

// 后端LangGraph中断
graph.interrupt(threadId, stepId);
```

### 7.3 多语言状态消息

当前状态消息硬编码为英文。可改为i18n：

```typescript
const statusMessages = {
  zh: {
    analyzing: '🎯 正在分析请求...',
    planning: '📋 规划任务...',
    executing: '⚙️ 执行分析...'
  },
  en: {
    analyzing: '🎯 Analyzing your request...',
    planning: '📋 Planning tasks...',
    executing: '⚙️ Executing analysis...'
  }
}

// 根据用户语言选择
const lang = navigator.language.startsWith('zh') ? 'zh' : 'en'
onToken(`__STATUS__:${statusMessages[lang].analyzing}`)
```

---

## 八、总结

这套SSE实时工作流反馈系统的核心价值：

✅ **透明度**：用户清楚知道AI在每个阶段做什么  
✅ **即时性**：增量服务卡片让用户无需等待全部完成  
✅ **容错性**：错误状态立即显示，支持快速重试  
✅ **美观度**：渐变背景 + 动画效果提升专业感  

**技术栈组合**：
- **前端**：Vue3 + Pinia + Element Plus + SCSS动画
- **通信**：Fetch API + ReadableStream + SSE协议
- **后端**：LangGraph StateGraph + onToken回调注入
- **协议**：`__STATUS__:` 特殊Token约定

**适用场景**：
- AI驱动的GIS分析平台
- 复杂工作流编排系统
- 需要长时间计算的智能助手
- 任何需要"让用户看到进度"的场景

**不适用场景**：
- 简单问答机器人（响应时间<1秒）
- 批量离线任务（无实时交互需求）
- 纯文本输出（无中间状态）

---

**完整代码仓库**：https://gitee.com/rzcgis/geo-ai-universal-platform

**相关文档**：
- 前端SSE客户端：`web/src/services/chat.ts`
- Pinia Store：`web/src/stores/chat.ts`
- 状态指示器组件：`web/src/components/chat/WorkflowStatusIndicator.vue`
- 后端LangGraph：`server/src/llm-interaction/workflow/GeoAIGraph.ts`

*欢迎交流讨论，如有技术问题可提交Issue。*
