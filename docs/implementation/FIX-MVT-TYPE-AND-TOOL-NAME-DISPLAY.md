# MVT 服务类型和工具名称显示问题修复

## 日期：2026-05-05

---

## 问题描述

### 问题一：MVT Publisher 按钮显示 "Download" 而非 "View on Map"

**现象**：
- MVT Publisher 执行成功后，服务链接按钮显示 "Download"
- 点击后触发文件下载（.geojson），而不是跳转到地图页面

**根本原因**：
从日志中可以看到：
```json
"partial_result","service":{
  "id":"service_publish_guangdong_mvt",
  "type":"geojson",  // ❌ 应该是 "mvt"
  "url":"/api/results/publish_guangdong_mvt.geojson"  // ❌ 应该是 MVT URL
}
```

**问题分析**：
1. `PluginToolWrapper` 返回的 JSON 字符串中**缺少 `type` 字段**
2. `GeoAIGraph` 直接将工具返回的字符串作为 `result.data`，没有解析
3. `ServicePublisher.determineServiceType(undefined)` 回退到默认值 `'geojson'`

---

### 问题二：页面顶部显示 "Unknown tool"

**现象**：
- 工具执行时，页面顶部状态栏显示 "Using Unknown tool..."
- 而不是显示 "🗺️ Publishing map tiles..."

**根本原因**：
前端代码尝试从 `event.input` 中解析 `pluginId`：
```typescript
const input = JSON.parse(event.input)
const toolName = input.pluginId || input.tool || 'Unknown tool'
```

但 LangChain 的 `tool_start` 事件中，`input` 只包含工具的**输入参数**（如 `dataSourceId`），不包含元数据。

正确的工具名称在 `event.tool` 字段中（由 `GeoAIStreamingHandler.handleToolStart` 设置）。

---

## 解决方案

### 修复一：PluginToolWrapper 返回完整 NativeData 信息

**文件**: `server/src/plugin-orchestration/tools/PluginToolWrapper.ts`

**修改前**：
```typescript
return JSON.stringify({
  success: true,
  pluginId: plugin.id,
  resultId: result.id,
  metadata: result.metadata,
  message: 'Plugin executed successfully'
});
```

**修改后**：
```typescript
// Return complete NativeData object (not just simplified JSON)
// This ensures ServicePublisher can access result.data.type correctly
return JSON.stringify({
  success: true,
  pluginId: plugin.id,
  resultId: result.id,
  type: result.type,  // ✅ Include data type for service publishing
  reference: result.reference,  // ✅ Include reference
  metadata: result.metadata,
  message: 'Plugin executed successfully'
});
```

---

### 修复二：GeoAIGraph 正确解析工具返回值

**文件**: `server/src/llm-interaction/workflow/GeoAIGraph.ts`

**修改前**：
```typescript
const result = await tool.invoke(step.parameters);

executionResults.set(step.stepId, {
  id: step.stepId,
  goalId,
  status: 'success',
  data: result,  // ❌ result 是 JSON 字符串，不是对象
  metadata: { ... }
});
```

**修改后**：
```typescript
const toolResult = await tool.invoke(step.parameters);

// Parse tool result (it's a JSON string)
let parsedResult: any;
try {
  parsedResult = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
} catch (error) {
  console.error(`[Plugin Executor] Failed to parse tool result:`, error);
  parsedResult = { success: false, error: 'Invalid tool result format' };
}

// Construct proper result object with NativeData
const analysisResult: AnalysisResult = {
  id: step.stepId,
  goalId,
  status: parsedResult.success ? 'success' : 'failed',
  data: parsedResult.success ? {
    id: parsedResult.resultId,
    type: parsedResult.type || 'geojson',  // ✅ Use type from tool result
    reference: parsedResult.reference || '',
    metadata: parsedResult.metadata || {}
  } : undefined,
  error: parsedResult.error,
  metadata: {
    pluginId: step.pluginId,
    parameters: step.parameters,
    executedAt: new Date().toISOString()
  }
};

executionResults.set(step.stepId, analysisResult);
```

---

### 修复三：前端正确获取工具名称

**文件**: `web/src/stores/chat.ts`

#### tool_start 事件处理

**修改前**：
```typescript
case 'tool_start':
  if (event.input) {
    try {
      const input = JSON.parse(event.input)
      const toolName = input.pluginId || input.tool || 'Unknown tool'  // ❌ input 中没有 pluginId
      // ...
    } catch (e) {
      console.warn('[Chat Store] Failed to parse tool input', e)
    }
  }
  break
```

**修改后**：
```typescript
case 'tool_start':
  // Get tool name from event.tool field (set by GeoAIStreamingHandler)
  const toolName = event.tool || 'Unknown tool'  // ✅ 直接从 event.tool 获取
  activeTools.value.push(toolName)
  
  const toolDescriptions: Record<string, string> = {
    'mvt_publisher': '🗺️ Publishing map tiles...',
    // ...
  }
  
  workflowStatus.value = toolDescriptions[toolName] || `Using ${toolName}...`
  console.log('[Chat Store] Tool started:', toolName)
  break
```

#### tool_complete 事件处理

**修改前**：
```typescript
case 'tool_complete':
  if (data?.output) {
    const output = JSON.parse(data.output)
    const toolName = output.pluginId || 'Unknown tool'
    // ...
  }
  break
```

**修改后**：
```typescript
case 'tool_complete':
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
  
  // Check if the tool succeeded
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
    const successMessages: Record<string, string> = {
      'mvt_publisher': '✅ Map tiles published',
      // ...
    }
    workflowStatus.value = successMessages[completedToolName] || `${completedToolName} completed ✓`
  } else {
    workflowStatus.value = `❌ ${completedToolName} failed`
  }
  break
```

---

## 验证步骤

### 测试场景 1：MVT 服务类型正确

1. **启动服务器**：
   ```bash
   cd server && npm run dev
   cd web && npm run dev
   ```

2. **生成 MVT**：
   - 打开聊天页面
   - 输入："为广东省数据集创建 MVT 瓦片"
   - 等待执行完成

3. **检查日志**：
   应该看到：
   ```json
   "partial_result","service":{
     "id":"service_xxx",
     "type":"mvt",  // ✅ 现在是 mvt
     "url":"/api/services/mvt/mvt_xxx/{z}/{x}/{y}.pbf"  // ✅ 正确的 MVT URL
   }
   ```

4. **验证按钮**：
   - 按钮文本应该是 **"View on Map"**
   - 图标应该是地图图标 🗺️

5. **点击按钮**：
   - 应该跳转到地图页面
   - 图层自动添加并可见

---

### 测试场景 2：工具名称正确显示

1. **执行 MVT Publisher**：
   - 在聊天中输入任何触发 MVT Publisher 的命令

2. **观察页面顶部状态栏**：
   
   **工具开始时**应该显示：
   ```
   🗺️ Publishing map tiles...
   ```
   
   **而不是**：
   ```
   Using Unknown tool...
   ```

3. **工具完成时**应该显示：
   ```
   ✅ Map tiles published
   ```
   
   **而不是**：
   ```
   Unknown tool completed ✓
   ```

4. **2秒后状态栏应该清空**

---

## 预期效果对比

### 修复前

| 项目 | 显示内容 |
|------|---------|
| MVT 服务按钮 | ❌ "Download" |
| MVT 服务 URL | ❌ `/api/results/xxx.geojson` |
| 点击行为 | ❌ 文件下载 |
| 工具开始提示 | ❌ "Using Unknown tool..." |
| 工具完成提示 | ❌ "Unknown tool completed ✓" |

### 修复后

| 项目 | 显示内容 |
|------|---------|
| MVT 服务按钮 | ✅ "View on Map" |
| MVT 服务 URL | ✅ `/api/services/mvt/xxx/{z}/{x}/{y}.pbf` |
| 点击行为 | ✅ 跳转地图并添加图层 |
| 工具开始提示 | ✅ "🗺️ Publishing map tiles..." |
| 工具完成提示 | ✅ "✅ Map tiles published" |

---

## 技术要点

### 1. 数据流完整性

```
Plugin Executor (NativeData)
    ↓
PluginToolWrapper (JSON.stringify with type field)
    ↓
LangChain Tool (string)
    ↓
GeoAIGraph (JSON.parse + construct AnalysisResult)
    ↓
ServicePublisher (read result.data.type)
    ↓
VisualizationService (correct type)
    ↓
Frontend (correct button text and behavior)
```

### 2. 事件数据结构

**tool_start 事件**：
```typescript
{
  type: 'tool_start',
  tool: 'mvt_publisher',  // ✅ 从这里获取工具名称
  input: '{"dataSourceId":"..."}',  // ❌ 不要从这里解析
  timestamp: 1234567890
}
```

**tool_complete 事件**：
```typescript
{
  type: 'tool_complete',
  output: '{"success":true,"pluginId":"mvt_publisher",...}',  // ✅ 可以从中解析
  timestamp: 1234567890
}
```

### 3. 容错处理

- JSON 解析失败时使用默认值
- 无法获取工具名称时回退到 activeTools 列表
- 无法判断成功/失败时默认为成功

---

## 相关文件清单

### 后端文件
- ✅ `server/src/plugin-orchestration/tools/PluginToolWrapper.ts` - 添加 type 和 reference 字段
- ✅ `server/src/llm-interaction/workflow/GeoAIGraph.ts` - 解析工具返回值并构造 AnalysisResult
- ℹ️ `server/src/llm-interaction/handlers/GeoAIStreamingHandler.ts` - 已正确设置 event.tool

### 前端文件
- ✅ `web/src/stores/chat.ts` - 修复 tool_start 和 tool_complete 事件处理

---

## 注意事项

1. **向后兼容**：其他插件也需要更新 PluginToolWrapper 以返回完整的 NativeData 信息
2. **错误处理**：增加了完善的 JSON 解析错误处理
3. **用户体验**：工具名称显示更加友好和准确
4. **调试友好**：Console 日志清晰显示工具执行情况

---

## 后续优化建议

1. **统一工具返回格式**：所有插件执行器都应该返回标准的 NativeData 结构
2. **增强错误信息**：在 tool_complete 中包含更详细的错误信息
3. **工具执行进度**：对于长时间运行的工具，可以发送进度更新
4. **国际化支持**：工具描述和状态消息应该支持多语言
