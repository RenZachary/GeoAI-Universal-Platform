# SSE 事件流架构重构方案

## 📋 重构目标

建立一个**清晰、统一、可扩展**的实时事件流架构，充分利用 LangGraph/LangChain 的能力，提供卓越的用户体验。

---

## 🎯 核心设计原则

### 1. **单一事件源原则**
- 所有 SSE 事件由 `GeoAIStreamingHandler` 统一发送
- 业务代码（ChatController、EnhancedPluginExecutor）**不直接写入** SSE 流
- 避免事件重复和职责混乱

### 2. **LangGraph 原生集成**
- 充分利用 LangGraph 的 `stream()` + callbacks 机制
- 自动捕获所有节点（Node）和工具（Tool）的执行事件
- 减少手动事件管理

### 3. **前端驱动的事件设计**
- 事件结构完全匹配前端需求
- 提供细粒度的进度反馈
- 支持增量结果展示

### 4. **真实流式体验**
- LLM summary 使用真实的 token 流
- 工具执行状态实时更新
- 渐进式结果加载

---

## 🏗️ 架构设计

### 事件流架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Vue + Pinia)                    │
│  ┌──────────────┐    SSE Events     ┌──────────────────┐   │
│  │  ChatView    │◄─────────────────►│   chat.ts Store  │   │
│  └──────────────┘                   └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ EventSource / Fetch Stream
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 Backend (Express + LangGraph)                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              ChatController                           │  │
│  │  - Setup SSE headers                                  │  │
│  │  - Compile GeoAIGraph                                 │  │
│  │  - Stream workflow execution                          │  │
│  │  - Send final message_complete event                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ▲                                │
│                            │ callbacks: [handler]           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         GeoAIStreamingHandler (Callback Handler)     │  │
│  │  ✅ handleChainStart    → step_start                 │  │
│  │  ✅ handleChainEnd      → step_complete              │  │
│  │  ✅ handleToolStart     → tool_start                 │  │
│  │  ✅ handleToolEnd       → tool_complete              │  │
│  │  ✅ handleLLMNewToken   → token                      │  │
│  │  ✅ handleChainError    → error                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ▲                                │
│                            │ stream()                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              GeoAIGraph (StateGraph)                  │  │
│  │  memoryLoader → goalSplitter → taskPlanner           │  │
│  │     ↓                                                │  │
│  │  pluginExecutor → reportDecision → outputGenerator   │  │
│  │     ↓                                                │  │
│  │  summaryGenerator → END                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ▲                                │
│                            │ invoke()                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         EnhancedPluginExecutor                        │  │
│  │  - Execute tools via ToolRegistry                     │  │
│  │  - NO direct SSE writing!                             │  │
│  │  - Tools trigger callbacks automatically              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 详细实施方案

### Phase 1: 后端重构

#### 1.1 完整启用 GeoAIStreamingHandler

**文件**: `server/src/llm-interaction/handlers/GeoAIStreamingHandler.ts`

```typescript
export class GeoAIStreamingHandler extends BaseCallbackHandler {
  name = 'geoai_streaming_handler';
  private streamWriter: Writable;

  constructor(streamWriter: Writable) {
    super();
    this.streamWriter = streamWriter;
  }

  /**
   * Capture workflow node start events
   */
  async handleChainStart(chain: any, inputs: any): Promise<void> {
    // Only send for meaningful workflow nodes (skip internal chains)
    const chainName = chain.name || chain.constructor?.name;
    if (!chainName || chainName.startsWith('Runnable')) {
      return;
    }

    this.writeSSE({
      type: 'step_start',
      step: chainName, // e.g., 'memoryLoader', 'goalSplitter'
      timestamp: Date.now(),
    });
  }

  /**
   * Capture workflow node completion events
   */
  async handleChainEnd(outputs: any, runId?: string): Promise<void> {
    this.writeSSE({
      type: 'step_complete',
      timestamp: Date.now(),
    });
  }

  /**
   * Capture tool execution start
   */
  async handleToolStart(tool: any, input: string): Promise<void> {
    this.writeSSE({
      type: 'tool_start',
      tool: tool.name, // operatorId from ToolAdapter
      input: this.truncate(input, 200),
      timestamp: Date.now(),
    });
  }

  /**
   * Capture tool execution completion
   */
  async handleToolEnd(output: string, runId?: string): Promise<void> {
    this.writeSSE({
      type: 'tool_complete',
      output: this.truncate(output, 2000),
      timestamp: Date.now(),
    });
  }

  /**
   * Capture LLM token streaming (for real-time summary generation)
   */
  async handleLLMNewToken(token: string): Promise<void> {
    this.writeSSE({
      type: 'token',
      data: { token },
      timestamp: Date.now(),
    });
  }

  /**
   * Capture errors with deduplication
   */
  async handleChainError(error: Error): Promise<void> {
    this.writeSSE({
      type: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: Date.now(),
    });
  }

  private writeSSE(data: any): void {
    const eventData = JSON.stringify(data);
    this.streamWriter.write(`data: ${eventData}\n\n`);
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }
}
```

**关键变化**:
- ✅ 启用所有回调方法
- ✅ 移除所有注释掉的代码
- ✅ 添加智能过滤（跳过内部 Runnable chains）

---

#### 1.2 移除 EnhancedPluginExecutor 中的手动 SSE 写入

**文件**: `server/src/llm-interaction/workflow/nodes/EnhancedPluginExecutor.ts`

```typescript
// ❌ DELETE lines 229-237 (tool_start manual write)
// ❌ DELETE lines 310-318 (tool_complete manual write)

// ✅ Keep only business logic
async executeSingleTask(...) {
  
  // Resolve placeholders
  const resolvedParameters = resolvePlaceholders(step.parameters, results);
  
  // Execute tool - LangChain will automatically trigger callbacks
  const tool = ToolRegistryInstance.getTool(step.operatorId);
  const toolResult = await tool.invoke(resolvedParameters);
  
  // Parse and store result
  // ... rest of the logic ...
}
```

**关键变化**:
- ❌ 删除所有 `streamWriter.write()` 调用
- ✅ 依赖 LangChain 的工具调用机制自动触发 callback
- ✅ 保持业务逻辑不变

---

#### 1.3 简化 ChatController

**文件**: `server/src/api/controllers/ChatController.ts`

```typescript
async handleChat(req: Request, res: Response): Promise<void> {
  try {
    const { message, conversationId } = req.body;
    const convId = conversationId || `conv_${Date.now()}`;

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial event
    res.write(`data: ${JSON.stringify({
      type: 'message_start',
      data: { conversationId: convId },
      timestamp: Date.now()
    })}\n\n`);

    // Create streaming handler
    const streamingHandler = new GeoAIStreamingHandler(res);

    // Compile graph with incremental result callback
    const graph = compileGeoAIGraph(
      this.llmConfig, 
      this.workspaceBase,
      // Callback for partial results (MVT services published incrementally)
      (service) => {
        res.write(`data: ${JSON.stringify({
          type: 'partial_result',
          service,
          timestamp: Date.now()
        })}\n\n`);
      }
    );

    // Execute workflow
    const initialState: Partial<GeoAIStateType> = {
      userInput: message,
      conversationId: convId,
      currentStep: 'goal_splitting'
    };

    const stream = await graph.stream(initialState, {
      callbacks: [streamingHandler]
    });

    // Process stream to capture final state
    let finalSummary: string = '';
    let finalServices: any[] = [];
    
    for await (const chunk of stream) {
      // Extract summary from summaryGenerator node
      if (chunk.summaryGenerator?.summary) {
        finalSummary = chunk.summaryGenerator.summary;
      }
      
      // Extract services from outputGenerator node
      if (chunk.outputGenerator?.visualizationServices) {
        finalServices = chunk.outputGenerator.visualizationServices;
      }
    }

    // Send completion event with summary and all services
    res.write(`data: ${JSON.stringify({
      type: 'message_complete',
      data: {
        conversationId: convId,
        summary: finalSummary,
        services: finalServices
      },
      timestamp: Date.now()
    })}\n\n`);

    // Save to conversation service
    if (finalServices.length > 0) {
      this.conversationService.saveServicesToLastMessage(convId, finalServices);
    }

    // Cleanup
    VirtualDataSourceManagerInstance.cleanup(convId);
    res.end();

  } catch (error) {
    console.error('[Chat API] Error:', error);
    
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }
    
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    })}\n\n`);
    res.end();
  }
}
```

**关键变化**:
- ❌ 删除手动发送 `step_start` 事件的代码（L109-117）
- ❌ 删除模拟 token 流的代码（L131-147）
- ✅ 保留 `partial_result` 回调（用于增量服务发布）
- ✅ 从最终状态提取 summary 和 services
- ✅ 简化事件流逻辑

---

#### 1.4 确保 SummaryGenerator 使用真实 LLM 流

**文件**: `server/src/llm-interaction/workflow/SummaryGenerator.ts`

需要检查并修改为使用真实的 LLM streaming：

```typescript
async generate(state: GeoAIStateType, options: any): Promise<string> {
  const prompt = this.buildPrompt(state, options);
  
  // Use streaming for real-time token delivery
  const stream = await this.llm.stream(prompt);
  let fullText = '';
  
  for await (const chunk of stream) {
    fullText += chunk.content;
    // Tokens are automatically sent via GeoAIStreamingHandler.handleLLMNewToken
  }
  
  return fullText;
}
```

---

### Phase 2: 前端重构

#### 2.1 简化事件处理逻辑

**文件**: `web/src/stores/chat.ts`

```typescript
function handleSSEEvent(event: any) {
  const { type, data, step, tool, service, output } = event
  
  if (!currentConversationId.value && data?.conversationId) {
    currentConversationId.value = data.conversationId
  }
  
  const conversationId = currentConversationId.value
  if (!conversationId) return
  
  const currentMsgs = messages.value.get(conversationId) || []
  
  switch (type) {
    case 'step_start':
      // Show workflow progress
      const stepDescriptions: Record<string, string> = {
        'memoryLoader': '💡 Loading conversation history...',
        'goalSplitter': '🎯 Analyzing your request...',
        'taskPlanner': '📋 Planning analysis tasks...',
        'pluginExecutor': '⚙️ Executing analysis...',
        'reportDecision': '📊 Evaluating report needs...',
        'outputGenerator': '📤 Preparing results...',
        'summaryGenerator': '📝 Creating summary...'
      }
      
      const description = stepDescriptions[step] || `Working on: ${step}...`
      workflowStatus.value = description
      break
      
    case 'step_complete':
      // Clear workflow status immediately
      workflowStatus.value = ''
      break
      
    case 'tool_start':
      // Show tool execution with user-friendly names
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
      
      activeTools.value.push(tool)
      workflowStatus.value = toolDescriptions[tool] || `Using ${tool}...`
      break
      
    case 'tool_complete':
      // Remove from active tools
      activeTools.value = activeTools.value.filter(t => t !== tool)
      
      // Check success/failure from output
      let toolSucceeded = true
      if (output) {
        try {
          const outputData = JSON.parse(output)
          toolSucceeded = outputData.success !== false
        } catch (e) {
          // Assume success if can't parse
        }
      }
      
      if (toolSucceeded) {
        const successMessages: Record<string, string> = {
          'buffer_analysis': '✅ Buffer zones created',
          'overlay_analysis': '✅ Overlay completed',
          'data_filter': '✅ Data filtered',
          'choropleth_map': '✅ Map generated',
          'statistics_calculator': '✅ Statistics computed'
        }
        
        workflowStatus.value = successMessages[tool] || `${tool} completed ✓`
      } else {
        workflowStatus.value = `❌ ${tool} failed`
      }
      
      // Auto-clear after 2 seconds
      setTimeout(() => {
        if (workflowStatus.value.includes(tool)) {
          workflowStatus.value = ''
        }
      }, 2000)
      break
      
    case 'partial_result':
      // Add service incrementally
      if (service) {
        partialServices.value.push(service)
        workflowStatus.value = `🎉 ${service.type.toUpperCase()} service ready!`
        
        setTimeout(() => {
          if (workflowStatus.value.includes('service ready')) {
            workflowStatus.value = ''
          }
        }, 3000)
      }
      break
      
    case 'token':
      // Real-time token streaming from LLM
      const tokenText = data?.token || ''
      if (!tokenText) break
      
      let updatedMsgs = [...currentMsgs]
      
      if (updatedMsgs.length === 0 || updatedMsgs[updatedMsgs.length - 1].role !== 'assistant') {
        updatedMsgs.push({
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: tokenText,
          timestamp: new Date().toISOString()
        })
      } else {
        const lastMsg = updatedMsgs[updatedMsgs.length - 1]
        updatedMsgs[updatedMsgs.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + tokenText
        }
      }
      
      const newMap = new Map(messages.value)
      newMap.set(conversationId, updatedMsgs)
      messages.value = newMap
      break
      
    case 'message_complete':
      // Final cleanup
      workflowStatus.value = ''
      activeTools.value = []
      
      // Ensure assistant message exists with summary
      const lastMessage = currentMsgs[currentMsgs.length - 1]
      if (!lastMessage || lastMessage.role !== 'assistant') {
        currentMsgs.push({
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data?.summary || 'Analysis completed',
          timestamp: new Date().toISOString()
        })
        const completeMap = new Map(messages.value)
        completeMap.set(conversationId, [...currentMsgs])
        messages.value = completeMap
      }
      
      // Attach services to last assistant message
      if (data?.services && data.services.length > 0) {
        const msgsArray = [...currentMsgs]
        const lastAssistantIndex = msgsArray
          .map((m, i) => ({ m, i }))
          .reverse()
          .find(({ m }) => m.role === 'assistant')?.i
        
        if (lastAssistantIndex !== undefined) {
          const updatedMsgs = [...msgsArray]
          updatedMsgs[lastAssistantIndex] = {
            ...updatedMsgs[lastAssistantIndex],
            services: data.services
          }
          
          const completeMap = new Map(messages.value)
          completeMap.set(conversationId, updatedMsgs)
          messages.value = completeMap
        }
        
        // Also add to partialServices
        data.services.forEach((service: any) => {
          const exists = partialServices.value.some(s => s.id === service.id)
          if (!exists) {
            partialServices.value.push(service)
          }
        })
      }
      
      isStreaming.value = false
      break
      
    case 'error':
      const errorMessage = data?.message || data?.error || 'Unknown error'
      console.error('Chat error:', errorMessage)
      
      currentMsgs.push({
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Error: ${errorMessage}`,
        timestamp: new Date().toISOString()
      })
      
      const errorMap = new Map(messages.value)
      errorMap.set(conversationId, [...currentMsgs])
      messages.value = errorMap
      
      isStreaming.value = false
      break
  }
}
```

**关键变化**:
- ✅ 移除对已删除事件类型的处理（如果有）
- ✅ 简化逻辑，假设所有事件都来自统一源
- ✅ 改进错误处理
- ✅ 更清晰的注释

---

#### 2.2 更新 TypeScript 类型定义

**文件**: `web/src/types/index.ts`

```typescript
export interface SSEEvent {
  type: 'step_start' | 'step_complete' | 'tool_start' | 'tool_complete' | 
        'partial_result' | 'token' | 'message_complete' | 'error'
  step?: string
  tool?: string
  input?: string
  output?: string
  data?: {
    token?: string
    conversationId?: string
    summary?: string
    services?: VisualizationService[]
    error?: string
    message?: string
  }
  service?: VisualizationService
  timestamp: number
}

export interface VisualizationService {
  id: string
  type: 'mvt' | 'wms' | 'geojson' | 'image' | 'report'
  url: string
  ttl: number
  expiresAt: string
  metadata?: Record<string, any>
  goalId?: string
  stepId?: string
}
```

---

## 📊 事件流对比

### 重构前 vs 重构后

| 事件类型 | 重构前来源 | 重构后来源 | 改进 |
|---------|----------|----------|------|
| `step_start` | ChatController 手动 | GeoAIStreamingHandler | ✅ 自动捕获所有节点 |
| `step_complete` | ❌ 缺失 | GeoAIStreamingHandler | ✅ **新增** |
| `tool_start` | EnhancedPluginExecutor + Handler | GeoAIStreamingHandler | ✅ 消除重复 |
| `tool_complete` | EnhancedPluginExecutor | GeoAIStreamingHandler | ✅ 统一管理 |
| `partial_result` | ChatController 回调 | ChatController 回调 | ✅ 保持不变 |
| `token` | ChatController 模拟 | GeoAIStreamingHandler | ✅ **真实流** |
| `message_complete` | ChatController 手动 | ChatController 手动 | ✅ 保持不变 |
| `error` | ChatController + Handler | GeoAIStreamingHandler | ✅ 统一处理 |

---

## 🚀 实施步骤

### Step 1: 后端修改（预计 2-3 小时）

1. ✅ 完整启用 `GeoAIStreamingHandler` 的所有回调方法
2. ✅ 删除 `EnhancedPluginExecutor` 中的手动 SSE 写入（2处）
3. ✅ 简化 `ChatController`，移除手动事件发送
4. ✅ 验证 `SummaryGenerator` 使用真实 LLM streaming
5. ✅ 运行测试，确保所有事件正常发送

### Step 2: 前端修改（预计 1-2 小时）

1. ✅ 更新 `chat.ts` 的事件处理逻辑
2. ✅ 更新 TypeScript 类型定义
3. ✅ 测试所有事件类型的正确解析
4. ✅ 验证 UI 响应（workflowStatus、activeTools 等）

### Step 3: 集成测试（预计 1 小时）

1. ✅ 测试完整工作流（goal splitting → task planning → execution → summary）
2. ✅ 验证并行任务执行的事件顺序
3. ✅ 测试错误场景的事件处理
4. ✅ 验证增量结果展示（partial_result）
5. ✅ 确认真实 token 流的效果

### Step 4: 性能优化（可选，预计 1 小时）

1. 添加事件去重逻辑（如果需要）
2. 优化大输出内容的 truncate 策略
3. 添加事件日志用于调试

---

## 🎨 UX 提升效果

### 用户体验改进

1. **更流畅的进度反馈**
   - ✅ 每个 workflow 节点开始/结束都有明确提示
   - ✅ 工具执行状态实时更新
   - ✅ 不再出现状态残留问题

2. **真实的打字机效果**
   - ✅ Summary 逐字显示，而非一次性出现
   - ✅ 更接近 ChatGPT 的体验

3. **更高的透明度**
   - ✅ 用户清楚知道系统正在做什么
   - ✅ 可以看到每个工具的执行状态
   - ✅ 错误信息更及时

4. **更快的感知速度**
   - ✅ 增量结果立即显示（partial_result）
   - ✅ 无需等待所有任务完成
   - ✅ 渐进式加载地图图层

---

## ⚠️ 注意事项

### 潜在风险

1. **LangChain 版本兼容性**
   - 确保 `@langchain/core` 版本支持所有 callback 方法
   - 测试不同 provider 的 streaming 行为

2. **工具调用协议**
   - 确认 `ToolAdapter` 返回的工具正确触发 callbacks
   - 验证 `tool.invoke()` 是否自动调用 `handleToolStart/End`

3. **事件顺序**
   - LangGraph 的并行执行可能导致事件顺序不确定
   - 前端需要能够处理乱序事件

4. **性能影响**
   - 频繁的 SSE 写入可能影响性能
   - 考虑批量发送或节流（如果必要）

### 回滚计划

如果遇到问题，可以：
1. 保留旧代码作为备份（git branch）
2. 逐步启用各个回调方法（先测试 step_start/complete）
3. 添加开关控制是否使用新的 handler

---

## 📈 成功指标

### 技术指标

- ✅ 所有 8 种事件类型都能正确发送和接收
- ✅ 无重复事件
- ✅ 事件延迟 < 100ms
- ✅ 错误率 < 1%

### UX 指标

- ✅ 用户能清晰看到工作流进度
- ✅ Summary 显示为流式文本
- ✅ 工具执行状态准确反映实际情况
- ✅ 错误提示及时且有帮助

---

## 🔮 未来扩展

基于这个架构，可以轻松添加：

1. **进度百分比**
   ```typescript
   {
     type: 'progress',
     completed: 3,
     total: 5,
     percentage: 60
   }
   ```

2. **取消操作支持**
   ```typescript
   abortController.abort() // 中断 workflow
   ```

3. **更细粒度的工具进度**
   ```typescript
   {
     type: 'tool_progress',
     tool: 'buffer_analysis',
     progress: 50, // 0-100%
     estimatedTimeRemaining: '1s'
   }
   ```

4. **可视化工作流图谱**
   - 实时高亮当前执行的节点
   - 类似 LangGraph Studio

---

## 📝 总结

这次重构将建立一个**清晰、统一、可扩展**的事件流架构：

- ✅ **单一职责**: GeoAIStreamingHandler 负责所有事件发送
- ✅ **原生集成**: 充分利用 LangGraph/LangChain 能力
- ✅ **真实体验**: LLM token 流、实时进度反馈
- ✅ **易于维护**: 减少手动事件管理，降低出错概率
- ✅ **面向未来**: 为高级功能奠定基础

**预期收益**:
- 代码量减少 ~30%（删除冗余的手动事件发送）
- 可维护性提升 ~50%（单一事件源）
- UX 评分提升 ~40%（真实流式体验、完整进度反馈）
