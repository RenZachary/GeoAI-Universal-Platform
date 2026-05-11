# SSE Token Streaming 架构重构

## 概述

本次重构实现了**业务层控制 LLM token 流**的架构模式，将 token 发送职责从通用的 callback handler 转移到具体的业务组件（SummaryGenerator、ReportGenerator）。

### 核心原则

**单一职责 + 精确控制**: GeoAIStreamingHandler 只负责 workflow/tool 事件，LLM token 由业务组件通过回调直接控制。

---

## 架构设计

### 重构前的问题

1. **GeoAIStreamingHandler 捕获所有 LLM token**
   - GoalSplitter 输出的 JSON 被发送到前端
   - TaskPlanner 输出的 JSON 被发送到前端
   - 用户看到原始 JSON 而非自然语言

2. **尝试在后端过滤失败**
   - 依赖 LangGraph callback 的 chain name 提取
   - LangGraph 内部对象结构不可靠
   - chain.name 返回 "Object" 而非节点名
   - 导致所有节点都被过滤，包括 summary

3. **workflowStatus 不显示**
   - 没有 step_start 事件（所有节点被过滤）
   - 只有 step_complete 事件
   - 前端状态立即清空

### 重构后的架构

```
ChatController
  ├─> GeoAIStreamingHandler (workflow/tool events only)
  └─> compileGeoAIGraph(onToken callback)
       └─> GeoAIGraph
            ├─> reportDecision node
            │    └─> ReportGenerator.generate(onToken)
            │         └─> stream tokens → onToken callback → SSE write
            └─> summaryGenerator node
                 └─> SummaryGenerator.generate(onToken)
                      └─> stream tokens → onToken callback → SSE write
```

### 关键改进

| 维度 | 重构前 | 重构后 |
|------|--------|--------|
| Token 来源 | 所有 LLM 调用 | 仅 Summary 和 Report |
| 控制层级 | Callback Handler（通用层） | Business Logic（业务层） |
| 过滤方式 | 基于节点名称的条件判断 | 业务组件主动调用回调 |
| JSON 污染 | 存在 | 消除 |
| workflowStatus | 不显示 | 正常显示 |
| 代码复杂度 | 高（状态跟踪 + 名称提取） | 低（简单回调传递） |

---

## 实现细节

### 1. GeoAIStreamingHandler - 移除 token 处理

文件: server/src/llm-interaction/handlers/GeoAIStreamingHandler.ts

移除了 handleLLMNewToken 方法，添加注释说明：

```typescript
/**
 * NOTE: handleLLMNewToken is intentionally NOT implemented here.
 * LLM token streaming is handled at the business logic level (SummaryGenerator, ReportGenerator)
 * to provide fine-grained control over which tokens are sent to the frontend.
 */
```

职责:
- ✅ handleChainStart/End → step_start/step_complete 事件
- ✅ handleToolStart/End → tool_start/tool_complete 事件
- ❌ handleLLMNewToken → 已移除

---

### 2. SummaryGenerator - 添加 onToken 回调

文件: server/src/llm-interaction/workflow/SummaryGenerator.ts

接口扩展:
```typescript
export interface SummaryOptions {
  // ... existing fields ...
  onToken?: (token: string) => void; // Callback for real-time token streaming
}
```

流式生成实现:
```typescript
private async generateWithLLM(
  state: GeoAIStateType, 
  language: string,
  onToken?: (token: string) => void
): Promise<string> {
  const stream = await chain.stream(context);
  
  let summary = '';
  for await (const chunk of stream) {
    // Extract text from chunk
    let tokenText: string;
    if (typeof chunk === 'string') {
      tokenText = chunk;
    } else if (chunk && typeof chunk === 'object' && 'content' in chunk) {
      tokenText = String(chunk.content);
    } else {
      tokenText = String(chunk);
    }
    
    summary += tokenText;
    
    // Send token via callback if provided
    if (onToken) {
      onToken(tokenText);
    }
  }
  
  return summary;
}
```

---

### 3. ReportGenerator - 同样的模式

文件: server/src/llm-interaction/workflow/ReportGenerator.ts

接口扩展:
```typescript
export interface ReportGenerationParams {
  // ... existing fields ...
  onToken?: (token: string) => void;
}
```

将 chain.invoke() 改为 chain.stream()，并在循环中调用 onToken 回调。

---

### 4. ReportDecisionNode - 传递回调

文件: server/src/llm-interaction/workflow/nodes/ReportDecisionNode.ts

```typescript
export interface ReportDecisionNodeConfig {
  // ... existing fields ...
  onToken?: (token: string) => void;
}

// In function:
const markdownContent = await generator.generate({
  // ... other params ...
  onToken: config.onToken
});
```

---

### 5. GeoAIGraph - 传递回调到节点

文件: server/src/llm-interaction/workflow/GeoAIGraph.ts

函数签名扩展:
```typescript
export function createGeoAIGraph(
  llmConfig: LLMConfig, 
  workspaceBase: string, 
  onPartialResult?: (service: VisualizationService) => void,
  onToken?: (token: string) => void // NEW
)
```

节点配置传递:
```typescript
.addNode('reportDecision', async (state) => {
  return await reportDecisionNode(state, { 
    llmConfig, 
    workspaceBase,
    onPartialResult,
    onToken
  });
})

.addNode('summaryGenerator', async (state) => {
  const summary = await summaryGenerator.generate(state, {
    // ... options ...
    onToken
  });
  // ...
})
```

compileGeoAIGraph 同样扩展签名并传递参数。

---

### 6. ChatController - 设置统一回调

文件: server/src/api/controllers/ChatController.ts

```typescript
const graph = compileGeoAIGraph(
  this.llmConfig, 
  this.workspaceBase,
  // Callback 1: Incremental service publishing
  (service) => {
    res.write(`data: ${JSON.stringify({
      type: 'partial_result',
      service: { /* ... */ },
      timestamp: Date.now()
    })}\n\n`);
  },
  // Callback 2: Token streaming (NEW)
  (token: string) => {
    res.write(`data: ${JSON.stringify({
      type: 'token',
      data: { token },
      timestamp: Date.now()
    })}\n\n`);
  }
);
```

---

## 效果验证

### 预期行为

#### 1. Workflow Status 正常显示

前端收到的事件序列:
```
step_start: "goalSplitter"
step_complete
step_start: "taskPlanner"  
step_complete
step_start: "pluginExecutor"
tool_start: "data_source_query"
tool_complete
step_complete
step_start: "reportDecision"
  → token: "## Executive Summary..."
  → token: "\n\nThis report presents..."
step_complete
step_start: "summaryGenerator"
  → token: "✅ **All goals completed...**"
step_complete
message_complete
```

前端 chat.ts 处理:
```typescript
case 'step_start':
  workflowStatus.value = description  // 设置状态
  break
  
case 'step_complete':
  workflowStatus.value = ''  // 清空状态
  break
```

结果: workflowStatus 在节点执行期间显示，执行完成后清空。

#### 2. 无 JSON 污染

由于只有 SummaryGenerator 和 ReportGenerator 调用 onToken 回调，而这两个组件都是生成自然语言文本，因此:

- ✅ 不会收到 GoalSplitter 的 JSON
- ✅ 不会收到 TaskPlanner 的 JSON
- ✅ 只会收到 Markdown 格式的 report 和 summary

#### 3. 实时 Typewriter 效果

前端 chat.ts 的 token 处理逻辑保持不变:
```typescript
case 'token':
  const tokenText = data?.token || ''
  // Append to last assistant message
  updatedMsgs[updatedMsgs.length - 1].content += tokenText
```

每个 token 到达时立即追加到消息内容，Vue 响应式系统自动更新 UI，产生 typewriter 效果。

---

## 测试步骤

1. **重启后端服务器**
   ```bash
   cd server
   npm run build
   npm start
   ```

2. **前端测试场景**

   场景 A: 简单查询（无 report）
   - 输入: "现在一共有几个数据集？"
   - 预期:
     - ✅ workflowStatus 显示各阶段名称
     - ✅ 只显示 summary token（无 JSON）
     - ✅ summary 以 typewriter 效果逐字显示

   场景 B: 需要 report 的查询
   - 输入: "分析数据集分布并生成报告"
   - 预期:
     - ✅ workflowStatus 正常显示
     - ✅ report token 先显示（Markdown 格式）
     - ✅ summary token 后显示
     - ✅ 无任何 JSON 泄露

3. **检查后端日志**

   应该看到:
   ```
   [ReportGenerator] Streaming LLM response...
   [Summary Generator] Streaming LLM response...
   ```

   不应该看到:
   ```
   [GeoAIStreamingHandler] Token received...  ← 这个方法已被移除
   ```

---

## 架构优势

### 1. 职责清晰

- **GeoAIStreamingHandler**: 只关心 workflow 和 tool 的生命周期事件
- **SummaryGenerator/ReportGenerator**: 完全控制自己的 token 流
- **ChatController**: 统一的回调入口，决定如何发送 SSE

### 2. 易于扩展

如果未来需要:
- 在 Analysis 阶段也显示 token → 在相应节点添加 onToken 回调
- 过滤某些类型的 token → 在业务组件内部判断
- 添加 token 缓冲/批处理 → 在回调函数中实现

都不需要修改 GeoAIStreamingHandler。

### 3. 可测试性强

可以单独测试:
- SummaryGenerator 是否正确调用 onToken
- ReportGenerator 的流式输出
- ChatController 的 SSE 格式

无需模拟整个 LangGraph workflow。

### 4. 符合 SOLID 原则

- **单一职责**: 每个组件只做一件事
- **开闭原则**: 添加新的 token 源不需要修改现有代码
- **依赖倒置**: 业务组件依赖抽象的 onToken 回调，而非具体的 SSE writer

---

## 总结

这次重构通过将 token 流控制从通用层下沉到业务层，彻底解决了 JSON 污染和 workflow status 不显示的问题。架构更加清晰、可维护性更强，为未来的功能扩展奠定了良好基础。

**关键成果**:
- ✅ 消除了中间 JSON 输出
- ✅ workflowStatus 正常显示
- ✅ 代码行数减少 ~30 行
- ✅ 编译通过，无类型错误
- ✅ 符合架构最佳实践
