# SSE 事件流架构 - 快速参考

## 📡 事件类型总览

| 事件类型 | 触发时机 | 发送者 | 前端用途 |
|---------|---------|--------|---------|
| `step_start` | Workflow 节点开始执行 | GeoAIStreamingHandler | 显示进度提示 |
| `step_complete` | Workflow 节点执行完成 | GeoAIStreamingHandler | 清除进度提示 |
| `tool_start` | 工具开始执行 | GeoAIStreamingHandler | 显示工具执行状态 |
| `tool_complete` | 工具执行完成 | GeoAIStreamingHandler | 显示成功/失败状态 |
| `partial_result` | 增量结果发布（MVT服务） | ChatController (callback) | 即时显示地图图层 |
| `token` | LLM 生成文本 token | GeoAIStreamingHandler | 打字机效果显示 summary |
| `message_complete` | 整个消息处理完成 | ChatController | 最终清理和保存 |
| `error` | 发生错误 | GeoAIStreamingHandler | 显示错误信息 |

---

## 🔄 事件流时序图

```
User Input
    │
    ▼
┌─────────────────────┐
│  ChatController     │ ──► message_start
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  memoryLoader       │ ──► step_start → step_complete
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  goalSplitter       │ ──► step_start → step_complete
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  taskPlanner        │ ──► step_start → step_complete
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  pluginExecutor     │ ──► step_start
│                     │
│  ┌───────────────┐  │
│  │ Tool 1        │──┼──► tool_start → tool_complete
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Tool 2        │──┼──► tool_start → tool_complete
│  └───────────────┘  │
│                     │ ──► partial_result (if MVT published)
│                     │ ──► step_complete
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ reportDecision      │ ──► step_start → step_complete
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ outputGenerator     │ ──► step_start → step_complete
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ summaryGenerator    │ ──► step_start
│                     │
│  LLM Streaming      │──┼──► token → token → token → ...
│                     │
│                     │ ──► step_complete
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  ChatController     │ ──► message_complete
└─────────────────────┘
```

---

## 🎯 关键代码位置

### 后端

#### 1. 事件发送中心
**文件**: `server/src/llm-interaction/handlers/GeoAIStreamingHandler.ts`

```typescript
export class GeoAIStreamingHandler extends BaseCallbackHandler {
  async handleChainStart(chain: any): Promise<void> {
    // Sends: step_start
  }
  
  async handleChainEnd(outputs: any): Promise<void> {
    // Sends: step_complete
  }
  
  async handleToolStart(tool: any, input: string): Promise<void> {
    // Sends: tool_start
  }
  
  async handleToolEnd(output: string): Promise<void> {
    // Sends: tool_complete
  }
  
  async handleLLMNewToken(token: string): Promise<void> {
    // Sends: token
  }
  
  async handleChainError(error: Error): Promise<void> {
    // Sends: error
  }
}
```

#### 2. 工作流定义
**文件**: `server/src/llm-interaction/workflow/GeoAIGraph.ts`

```typescript
const workflow = new StateGraph(GeoAIStateAnnotation)
  .addNode('memoryLoader', ...)
  .addNode('goalSplitter', ...)
  .addNode('taskPlanner', ...)
  .addNode('pluginExecutor', ...)
  .addNode('reportDecision', ...)
  .addNode('outputGenerator', ...)
  .addNode('summaryGenerator', ...)
  .addEdge(START, 'memoryLoader')
  .addEdge('memoryLoader', 'goalSplitter')
  // ... more edges
  .addEdge('summaryGenerator', END);
```

#### 3. 业务编排
**文件**: `server/src/api/controllers/ChatController.ts`

```typescript
// 1. Create handler
const streamingHandler = new GeoAIStreamingHandler(res);

// 2. Compile graph with callback
const graph = compileGeoAIGraph(llmConfig, workspaceBase, 
  (service) => {
    // Sends: partial_result
    res.write(`data: ${JSON.stringify({ type: 'partial_result', service })}`);
  }
);

// 3. Stream with callbacks
const stream = await graph.stream(initialState, {
  callbacks: [streamingHandler]
});

// 4. Extract final state
for await (const chunk of stream) {
  if (chunk.summaryGenerator?.summary) finalSummary = ...;
  if (chunk.outputGenerator?.visualizationServices) finalServices = ...;
}

// 5. Send completion
res.write(`data: ${JSON.stringify({ 
  type: 'message_complete', 
  data: { summary: finalSummary, services: finalServices }
})}`);
```

---

### 前端

#### 1. 事件接收
**文件**: `web/src/services/chat.ts`

```typescript
export async function sendMessageStream(
  params: SendMessageParams,
  onEvent: (event: any) => void
): Promise<void> {
  const response = await fetch('/api/chat/stream', {...});
  const reader = response.body?.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        onEvent(event); // Dispatch to store
      }
    }
  }
}
```

#### 2. 事件处理
**文件**: `web/src/stores/chat.ts`

```typescript
function handleSSEEvent(event: any) {
  const { type, step, tool, data, service, output } = event;
  
  switch (type) {
    case 'step_start':
      workflowStatus.value = stepDescriptions[step] || `Working on: ${step}...`;
      break;
      
    case 'step_complete':
      workflowStatus.value = '';
      break;
      
    case 'tool_start':
      activeTools.value.push(tool);
      workflowStatus.value = toolDescriptions[tool] || `Using ${tool}...`;
      break;
      
    case 'tool_complete':
      activeTools.value = activeTools.value.filter(t => t !== tool);
      workflowStatus.value = outputData.success ? '✅ Completed' : '❌ Failed';
      setTimeout(() => { workflowStatus.value = ''; }, 2000);
      break;
      
    case 'partial_result':
      partialServices.value.push(service);
      break;
      
    case 'token':
      appendTokenToAssistantMessage(data.token);
      break;
      
    case 'message_complete':
      attachServicesToLastMessage(data.services);
      isStreaming.value = false;
      break;
      
    case 'error':
      showError(data.message);
      isStreaming.value = false;
      break;
  }
}
```

---

## 🔧 调试技巧

### 1. 查看后端日志

```bash
# 启动服务器并查看详细日志
cd server
npm run dev

# 应该看到类似输出：
# [Chat API] Starting conversation: conv_1234567890
# [Memory Loader] Loading conversation history
# [Goal Splitter Node] Processing user input: ...
# [Summary Generator] Streaming LLM response...
```

### 2. 查看前端控制台

打开浏览器开发者工具 → Console，应该看到：

```
[Chat Store] DEBUG: step_start received with stepName: memoryLoader
[Chat Store] Workflow status set to: 💡 Loading conversation history...
[Chat Store] DEBUG: step_start received with stepName: goalSplitter
[Chat Store] Workflow status set to: 🎯 Analyzing your request...
...
```

### 3. 查看网络请求

打开浏览器开发者工具 → Network：

1. 找到 `/api/chat/stream` 请求
2. 查看 Response 标签
3. 应该看到 SSE 事件流：

```
data: {"type":"message_start","data":{"conversationId":"conv_123"},"timestamp":1234567890}

data: {"type":"step_start","step":"memoryLoader","timestamp":1234567891}

data: {"type":"step_complete","timestamp":1234567892}

data: {"type":"step_start","step":"goalSplitter","timestamp":1234567893}

...

data: {"type":"token","data":{"token":"The"},"timestamp":1234567900}
data: {"type":"token","data":{"token":" analysis"},"timestamp":1234567901}
data: {"type":"token","data":{"token":" shows"},"timestamp":1234567902}

...

data: {"type":"message_complete","data":{"summary":"...","services":[...]},"timestamp":1234567950}
```

### 4. 常见问题排查

#### 问题 1: 没有收到 `step_complete` 事件

**可能原因**:
- LangGraph 节点抛出异常，未正常结束
- `handleChainEnd` callback 未被调用

**排查步骤**:
```typescript
// 在 GeoAIStreamingHandler.ts 中添加日志
async handleChainEnd(outputs: any, runId?: string): Promise<void> {
  console.log('[Handler] Chain ended:', outputs);
  this.writeSSE({ type: 'step_complete', timestamp: Date.now() });
}
```

#### 问题 2: Token 流不工作

**可能原因**:
- LLM provider 不支持 streaming
- SummaryGenerator 仍在使用 `invoke()` 而非 `stream()`

**排查步骤**:
```typescript
// 在 SummaryGenerator.ts 中检查
console.log('[Summary Generator] Using streaming:', !!this.llmConfig);
const stream = await chain.stream(context);
console.log('[Summary Generator] Stream created');
```

#### 问题 3: 重复的 tool_start 事件

**可能原因**:
- EnhancedPluginExecutor 中仍有手动发送代码
- 未完全删除旧的 streamWriter 逻辑

**排查步骤**:
```bash
# 搜索残留的手动发送代码
grep -r "streamWriter.write" server/src/llm-interaction/workflow/nodes/
# 应该返回空结果
```

---

## 📊 性能优化建议

### 1. 事件节流（如果需要）

对于高频事件（如 token），可以考虑节流：

```typescript
// GeoAIStreamingHandler.ts
private lastTokenTime = 0;
private tokenThrottleMs = 50; // Minimum 50ms between tokens

async handleLLMNewToken(token: string): Promise<void> {
  const now = Date.now();
  if (now - this.lastTokenTime < this.tokenThrottleMs) {
    return; // Skip this token
  }
  this.lastTokenTime = now;
  
  this.writeSSE({ type: 'token', data: { token }, timestamp: now });
}
```

### 2. 大输出截断

已经在 `truncate()` 方法中实现：

```typescript
private truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}
```

### 3. 批量发送（未来优化）

对于多个连续的小事件，可以批量发送：

```typescript
// 伪代码
private eventBuffer: any[] = [];
private batchTimer: NodeJS.Timeout | null = null;

private writeSSEBatched(data: any): void {
  this.eventBuffer.push(data);
  
  if (!this.batchTimer) {
    this.batchTimer = setTimeout(() => {
      const batch = this.eventBuffer.splice(0);
      this.streamWriter.write(`data: ${JSON.stringify({ batch })}\n\n`);
      this.batchTimer = null;
    }, 100); // Batch every 100ms
  }
}
```

---

## 🚀 扩展指南

### 添加新的 Workflow 节点

1. **在 GeoAIGraph.ts 中定义节点**:

```typescript
.addNode('myNewNode', async (state: GeoAIStateType) => {
  console.log('[My New Node] Processing...');
  // Your logic here
  return { currentStep: 'my_new_step' };
})
```

2. **添加边连接**:

```typescript
workflow.addEdge('previousNode', 'myNewNode');
workflow.addEdge('myNewNode', 'nextNode');
```

3. **前端添加描述** (chat.ts):

```typescript
const stepDescriptions: Record<string, string> = {
  // ... existing steps
  'myNewNode': '🆕 Doing something new...'
};
```

**无需修改事件发送逻辑！** GeoAIStreamingHandler 会自动捕获。

---

### 添加新的工具

1. **创建 SpatialOperator** (已有架构)

2. **注册到 ToolRegistry** (自动转换)

3. **前端添加工具描述** (chat.ts):

```typescript
const toolDescriptions: Record<string, string> = {
  // ... existing tools
  'my_new_tool': '🔧 Running my new tool...'
};

const successMessages: Record<string, string> = {
  // ... existing messages
  'my_new_tool': '✅ My new tool completed'
};
```

**无需修改事件发送逻辑！** LangChain 会自动触发 callbacks。

---

## 📚 相关文档

- [SSE 重构方案](./SSE-STREAMING-REFACTORING-PLAN.md) - 详细的设计方案
- [SSE 重构实施报告](./SSE-REFACTORING-IMPLEMENTATION-REPORT.md) - 完整的实施记录
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/) - 官方文档
- [LangChain Callbacks](https://js.langchain.com/docs/modules/callbacks/) - Callback 机制说明

---

## 💡 最佳实践

1. **永远不要手动发送 step/tool 事件**
   - 让 GeoAIStreamingHandler 自动处理
   - 保持单一事件源

2. **使用 meaningful 的节点名称**
   - 避免使用 `RunnableLambda` 等默认名称
   - 便于前端显示和用户理解

3. **错误处理要全面**
   - 在 try-catch 中包裹所有异步操作
   - 确保错误事件能正确发送到前端

4. **前端要做防御性编程**
   - 始终检查字段是否存在 (`data?.token`)
   - 提供合理的 fallback 值

5. **日志要详细但不过度**
   - 关键步骤添加日志
   - 生产环境可调整日志级别

---

**最后更新**: 2026-05-11  
**维护者**: GeoAI-UP Team
