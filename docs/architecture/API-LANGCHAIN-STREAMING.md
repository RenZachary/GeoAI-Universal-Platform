# API设计 - LangChain流式输出集成

## 1. 对话API (SSE Streaming)

### 1.1 POST /api/chat

使用Server-Sent Events (SSE)实现实时流式输出，基于LangChain Callbacks。

**Request:**
```http
POST /api/chat
Content-Type: application/json

{
  "message": "显示河流的500米缓冲区并计算面积统计",
  "conversationId": "conv_123456",  // 可选，新对话可不传
  "language": "en-US"               // 可选，默认en-US
}
```

**Response (SSE Stream):**
```
data: {"type":"step_start","step":"goal_splitter","timestamp":1714752000000}

data: {"type":"token","content":"I","timestamp":1714752000100}
data: {"type":"token","content":"'ll","timestamp":1714752000150}
data: {"type":"token","content":" help","timestamp":1714752000200}
data: {"type":"token","content":" you","timestamp":1714752000250}
data: {"type":"token","content":" analyze","timestamp":1714752000300}
data: {"type":"token","content":" this","timestamp":1714752000350}
data: {"type":"token","content":" data","timestamp":1714752000400}

data: {"type":"step_complete","step":"goal_splitter","timestamp":1714752001000}

data: {"type":"step_start","step":"task_planner","timestamp":1714752001100}

data: {"type":"tool_start","tool":"buffer_analysis","input":"{\"dataSourceId\":\"river_001\",\"distance\":500,\"unit\":\"meters\"}"}

data: {"type":"tool_complete","tool":"buffer_analysis","output":"{\"success\":true,\"resultId\":\"buffer_result_001\"}"}

data: {"type":"tool_start","tool":"mvt_publisher","input":"{\"dataSourceId\":\"buffer_result_001\"}"}

data: {"type":"visualization","serviceId":"mvt_service_001","type":"mvt","url":"/api/mvt/mvt_service_001/{z}/{x}/{y}.pbf"}

data: {"type":"step_complete","step":"task_planner","timestamp":1714752005000}

data: {"type":"summary","content":"I've created a 500-meter buffer around the river and published it as an MVT service. You can now view it on the map."}

data: {"type":"complete","timestamp":1714752006000}
```

### 1.2 SSE事件类型

```typescript
interface SSEEvent {
  type: SSEEventType;
  timestamp: number;
}

type SSEEventType = 
  | 'step_start'      // LangGraph节点开始
  | 'step_complete'   // LangGraph节点完成
  | 'token'           // LLM生成的文本token
  | 'tool_start'      // Plugin Tool开始执行
  | 'tool_complete'   // Plugin Tool执行完成
  | 'visualization'   // 可视化服务发布
  | 'report'          // 报告生成
  | 'error'           // 错误信息
  | 'summary'         // 最终总结
  | 'complete';       // 整个流程完成
```

### 1.3 前端处理示例

```typescript
// Vue组件中使用
async function sendMessage(message: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversationId })
  });
  
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        handleSSEEvent(event);
      }
    }
  }
}

function handleSSEEvent(event: SSEEvent) {
  switch (event.type) {
    case 'token':
      // 流式显示LLM响应
      appendToChatBubble(event.content);
      break;
    
    case 'visualization':
      // 添加地图图层
      addMapLayer({
        id: event.serviceId,
        type: event.type,
        url: event.url
      });
      break;
    
    case 'error':
      // 显示错误
      showError(event.message);
      break;
    
    case 'complete':
      // 完成处理
      markConversationComplete();
      break;
  }
}
```

---

## 2. LLM配置API

### 2.1 GET /api/llm/config

获取当前LLM配置。

**Response:**
```json
{
  "provider": "openai",
  "model": "gpt-4",
  "apiKey": "sk-...xxxx",  // 部分隐藏
  "baseUrl": null,
  "temperature": 0.7,
  "maxTokens": 2000,
  "streaming": true
}
```

### 2.2 PUT /api/llm/config

更新LLM配置。

**Request:**
```json
{
  "provider": "anthropic",
  "model": "claude-3-opus-20240229",
  "apiKey": "sk-ant-...",
  "temperature": 0.8,
  "maxTokens": 3000
}
```

**Response:**
```json
{
  "success": true,
  "message": "LLM configuration updated"
}
```

### 2.3 POST /api/llm/test

测试LLM连接。

**Request:**
```json
{
  "provider": "openai",
  "model": "gpt-4",
  "apiKey": "sk-..."
}
```

**Response:**
```json
{
  "success": true,
  "latency": 245,  // ms
  "message": "Connection successful"
}
```

---

## 3. Prompt模板API

### 3.1 GET /api/prompts

列出所有prompt模板。

**Query Parameters:**
- `language`: en-US | zh-CN (可选)
- `category`: goal_splitting | task_planning | response_summary (可选)

**Response:**
```json
[
  {
    "id": "goal-splitting",
    "name": "Goal Splitting",
    "language": "en-US",
    "category": "goal_splitting",
    "filePath": "llm/prompts/en-US/goal-splitting.md",
    "variables": ["userInput"],
    "createdAt": "2026-05-03T10:00:00Z",
    "updatedAt": "2026-05-03T10:00:00Z"
  }
]
```

### 3.2 GET /api/prompts/:id

获取特定prompt模板内容。

**Response:**
```json
{
  "id": "goal-splitting",
  "language": "en-US",
  "content": "Identify and split the user's request into independent goals.\n\nUser input: {{userInput}}\n\n...",
  "variables": ["userInput"]
}
```

### 3.3 PUT /api/prompts/:id

更新prompt模板（会清除缓存）。

**Request:**
```json
{
  "language": "en-US",
  "content": "Updated prompt content with {{variable}}..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Prompt template updated and cache cleared"
}
```

### 3.4 POST /api/prompts/:id/reset

重置为默认模板。

**Response:**
```json
{
  "success": true,
  "message": "Prompt template reset to default"
}
```

---

## 4. 插件Tool API

### 4.1 GET /api/plugins/tools

列出所有可用的LangChain Tools。

**Response:**
```json
[
  {
    "pluginId": "buffer_analysis",
    "toolName": "buffer_analysis",
    "description": "Perform buffer analysis on spatial data with specified distance",
    "schema": {
      "dataSourceId": {
        "type": "string",
        "required": true,
        "description": "Reference to NativeData object (ID)"
      },
      "distance": {
        "type": "number",
        "required": true,
        "description": "Buffer distance"
      },
      "unit": {
        "type": "string",
        "required": true,
        "enum": ["meters", "kilometers", "miles", "feet"]
      }
    },
    "category": "spatial_analysis"
  }
]
```

### 4.2 POST /api/plugins/tools/:id/execute

手动执行Plugin Tool（用于调试）。

**Request:**
```json
{
  "parameters": {
    "dataSourceId": "native_data_123",
    "distance": 500,
    "unit": "meters"
  }
}
```

**Response:**
```json
{
  "success": true,
  "executionTime": 1234,  // ms
  "result": {
    "resultId": "buffer_result_456",
    "metadata": { /* ... */ }
  }
}
```

---

## 5. 对话历史API

### 5.1 GET /api/conversations

列出所有对话。

**Response:**
```json
[
  {
    "id": "conv_123456",
    "title": "River Buffer Analysis",
    "messageCount": 12,
    "lastMessageAt": "2026-05-03T15:00:00Z",
    "createdAt": "2026-05-03T14:00:00Z"
  }
]
```

### 5.2 GET /api/conversations/:id

获取对话详情和历史消息。

**Response:**
```json
{
  "id": "conv_123456",
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "显示河流的500米缓冲区",
      "timestamp": "2026-05-03T14:00:00Z"
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "content": "I've created a 500-meter buffer...",
      "timestamp": "2026-05-03T14:00:05Z",
      "attachments": [
        {
          "type": "mvt",
          "serviceId": "mvt_service_001",
          "url": "/api/mvt/mvt_service_001/{z}/{x}/{y}.pbf"
        }
      ]
    }
  ],
  "context": {
    "currentDataSources": ["river_data_001"],
    "analysisParameters": {
      "distance": 500,
      "unit": "meters"
    }
  }
}
```

### 5.3 DELETE /api/conversations/:id

删除对话及其历史。

**Response:**
```json
{
  "success": true,
  "message": "Conversation deleted"
}
```

---

## 6. 错误响应格式

### 6.1 标准错误响应

```json
{
  "success": false,
  "error": {
    "code": "LLM_CONNECTION_FAILED",
    "message": "Failed to connect to OpenAI API",
    "details": {
      "provider": "openai",
      "statusCode": 401,
      "suggestion": "Please check your API key configuration"
    },
    "timestamp": "2026-05-03T15:00:00Z"
  }
}
```

### 6.2 SSE错误事件

```
data: {"type":"error","message":"Plugin execution failed","code":"PLUGIN_ERROR","details":{"pluginId":"buffer_analysis","error":"Invalid data source"},"timestamp":1714752000000}
```

### 6.3 常见错误代码

| Error Code | HTTP Status | Description |
|-----------|-------------|-------------|
| `INVALID_INPUT` | 400 | 输入参数无效 |
| `LLM_CONNECTION_FAILED` | 502 | LLM连接失败 |
| `PLUGIN_NOT_FOUND` | 404 | 插件不存在 |
| `DATA_SOURCE_ERROR` | 500 | 数据源访问错误 |
| `TOOL_EXECUTION_FAILED` | 500 | Tool执行失败 |
| `RATE_LIMIT_EXCEEDED` | 429 | 超过速率限制 |
| `MEMORY_LIMIT_EXCEEDED` | 500 | 超出内存限制 |

---

## 7. LangChain集成要点

### 7.1 Streaming Headers

```typescript
response.setHeader('Content-Type', 'text/event-stream');
response.setHeader('Cache-Control', 'no-cache');
response.setHeader('Connection', 'keep-alive');
response.setHeader('X-Accel-Buffering', 'no');  // Nginx兼容
```

### 7.2 Callback Integration

```typescript
const streamingHandler = new GeoAIStreamingHandler(response);

const result = await app.invoke(
  { userInput, conversationId },
  {
    callbacks: [streamingHandler],  // LangChain callbacks
    configurable: { thread_id: conversationId }
  }
);
```

### 7.3 Graceful Shutdown

```typescript
// 客户端断开连接时清理
req.on('close', () => {
  console.log('Client disconnected');
  streamWriter.end();
  
  // 可选：取消正在进行的LangGraph执行
  abortController.abort();
});
```

---

## 8. 性能优化建议

### 8.1 SSE最佳实践

- ✅ 使用`text/event-stream` content type
- ✅ 设置`no-cache`避免缓冲
- ✅ 定期发送keepalive注释 (`: keepalive\n\n`)
- ✅ 限制单个连接的最大持续时间（如5分钟）

### 8.2 LangChain优化

- ✅ 启用streaming mode减少延迟
- ✅ 使用structured output避免解析错误
- ✅ 缓存prompt templates
- ✅ 复用LLM instances（连接池）

### 8.3 监控指标

```typescript
// 记录关键指标
metrics.record({
  metric: 'llm_request_duration',
  value: duration,
  labels: { provider: config.provider, model: config.model }
});

metrics.record({
  metric: 'tool_execution_count',
  value: 1,
  labels: { tool_name: tool.name, status: 'success' }
});
```

---

此API设计完全支持LangChain的流式输出、Tool调用和状态管理功能。
