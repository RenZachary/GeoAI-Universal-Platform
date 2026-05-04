# LLM交互层详细设计 - LangChain集成版

## 1. 模块职责

本层基于 **LangChain框架** 实现，负责：

- **Goal Splitting**: 使用LangChain Agent识别并拆分用户目标
- **Task Planning**: 通过Structured Output Chains生成可执行计划
- **Plugin Integration**: 将插件包装为LangChain Tools供LLM动态调用
- **State Management**: 使用LangGraph管理5步处理流程的状态机
- **Conversation Memory**: 利用LangChain Memory管理多轮对话上下文
- **Streaming**: 通过LangChain Callbacks实现SSE流式输出

---

## 2. LangChain架构设计

### 2.1 LangGraph状态机

核心工作流由LangGraph StateGraph驱动：

```typescript
import { StateGraph, END } from '@langchain/langgraph';

// 状态定义
interface GeoAIState {
  // 输入
  userInput: string;
  conversationId: string;
  
  // Step 1: Goal Splitting
  goals?: AnalysisGoal[];
  
  // Step 2: Task Planning (per goal)
  executionPlans?: Map<string, ExecutionPlan>;
  
  // Step 3: Plugin Execution
  executionResults?: Map<string, AnalysisResult>;
  
  // Step 4: Output Generation
  visualizationServices?: VisualizationService[];
  
  // Step 5: Summary
  summary?: string;
  
  // 元数据
  currentStep: 'goal_splitting' | 'task_planning' | 'execution' | 'output' | 'summary';
  errors?: Array<{goalId: string; error: string}>;
}

// 构建工作流
const workflow = new StateGraph<GeoAIState>({
  channels: {
    userInput: { reducer: (x, y) => y ?? x },
    goals: { reducer: (x, y) => y ?? x },
    executionPlans: { reducer: (x, y) => new Map([...x!, ...y!]) },
    executionResults: { reducer: (x, y) => new Map([...x!, ...y!]) },
    visualizationServices: { reducer: (x, y) => [...(x || []), ...(y || [])] },
    summary: { reducer: (x, y) => y ?? x },
    currentStep: { reducer: (x, y) => y ?? x },
    errors: { reducer: (x, y) => [...(x || []), ...(y || [])] }
  }
})
  .addNode('goalSplitter', goalSplitterAgent)
  .addNode('taskPlanner', taskPlannerAgent)
  .addNode('pluginExecutor', pluginExecutor)
  .addNode('outputGenerator', outputGenerator)
  .addNode('summaryGenerator', summaryGenerator)
  
  // 条件边
  .addConditionalEdges('goalSplitter', routeToTaskPlanning)
  .addConditionalEdges('taskPlanner', routeToExecution)
  .addEdge('pluginExecutor', 'outputGenerator')
  .addEdge('outputGenerator', 'summaryGenerator')
  .addEdge('summaryGenerator', END);

const app = workflow.compile();
```

### 2.2 节点实现

#### Goal Splitter Agent

```typescript
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';

const goalSplittingPrompt = await fs.readFile(
  'llm/prompts/en-US/goal-splitting.md', 
  'utf-8'
);

const goalSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum(['visualization', 'analysis', 'report', 'query'])
});

const goalSplitterAgent = async (state: GeoAIState) => {
  const prompt = ChatPromptTemplate.fromTemplate(goalSplittingPrompt);
  
  const model = llmFactory.createAdapter(currentConfig).withStructuredOutput(
    z.array(goalSchema),
    { name: 'goal_splitter' }
  );
  
  const chain = prompt.pipe(model);
  
  const goals = await chain.invoke({
    userInput: state.userInput
  });
  
  return {
    goals,
    currentStep: 'task_planning'
  };
};
```

#### Task Planner Agent

```typescript
const taskPlanningPrompt = await fs.readFile(
  'llm/prompts/en-US/task-planning.md',
  'utf-8'
);

const taskPlannerAgent = async (state: GeoAIState) => {
  const plans = new Map<string, ExecutionPlan>();
  
  // 并行规划每个目标
  const planPromises = state.goals!.map(async (goal) => {
    const prompt = ChatPromptTemplate.fromTemplate(taskPlanningPrompt);
    
    const model = llmFactory.createAdapter(currentConfig).withStructuredOutput(
      z.object({
        steps: z.array(z.object({
          pluginName: z.string(),
          parameters: z.record(z.any()),
          outputType: z.string()
        }))
      }),
      { name: 'task_planner' }
    );
    
    const chain = prompt.pipe(model);
    
    const plan = await chain.invoke({
      goalDescription: goal.description,
      goalType: goal.type,
      dataSourcesMetadata: JSON.stringify(await getAvailableDataSources()),
      availablePlugins: JSON.stringify(await getPluginCapabilities()),
      previousResults: JSON.stringify(state.executionResults || new Map())
    });
    
    return [goal.id, { goalId: goal.id, steps: plan.steps }];
  });
  
  const planEntries = await Promise.all(planPromises);
  planEntries.forEach(([id, plan]) => plans.set(id, plan));
  
  return {
    executionPlans: plans,
    currentStep: 'execution'
  };
};
```

---

## 3. 插件作为LangChain Tools

### 3.1 Tool Wrapper Factory

所有插件统一包装为LangChain Tools：

```typescript
import { tool } from '@langchain/core/tools';
import { DynamicStructuredTool } from '@langchain/core/tools';

class PluginToolWrapper {
  /**
   * 将插件包装为LangChain Tool
   */
  static wrapPlugin(plugin: Plugin): DynamicStructuredTool {
    return tool(
      async (input: Record<string, any>) => {
        try {
          // 通过插件调度层执行
          const result = await pluginExecutor.execute(plugin.id, input);
          
          return JSON.stringify({
            success: true,
            resultId: result.id,
            metadata: result.metadata,
            message: 'Plugin executed successfully'
          });
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: error.message
          });
        }
      },
      {
        name: this.sanitizeName(plugin.name),
        description: plugin.description,
        schema: this.convertSchemaToZod(plugin.inputSchema)
      }
    );
  }
  
  /**
   * 转换插件参数schema为Zod schema
   */
  private static convertSchemaToZod(schema: ParameterSchema[]): z.ZodObject<any> {
    const shape: Record<string, z.ZodType> = {};
    
    for (const param of schema) {
      let zodType: z.ZodType;
      
      switch (param.type) {
        case 'string':
          zodType = z.string();
          break;
        case 'number':
          zodType = z.number();
          break;
        case 'boolean':
          zodType = z.boolean();
          break;
        case 'data_reference':
          zodType = z.string().describe('NativeData ID reference');
          break;
        default:
          zodType = z.any();
      }
      
      if (param.validation?.enum) {
        zodType = z.enum(param.validation.enum as [string, ...string[]]);
      }
      
      if (!param.required) {
        zodType = zodType.optional();
      }
      
      shape[param.name] = zodType.describe(param.description);
    }
    
    return z.object(shape);
  }
  
  /**
   * 清理插件名称以符合Tool命名规范
   */
  private static sanitizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }
}
```

### 3.2 注册所有Tools

```typescript
class ToolRegistry {
  private tools: Map<string, DynamicStructuredTool> = new Map();
  
  /**
   * 注册内置插件为Tools
   */
  async registerBuiltInPlugins(): Promise<void> {
    const builtInPlugins = await pluginLoader.loadBuiltInPlugins();
    
    for (const plugin of builtInPlugins) {
      const tool = PluginToolWrapper.wrapPlugin(plugin);
      this.tools.set(plugin.id, tool);
    }
  }
  
  /**
   * 注册自定义插件为Tools
   */
  async registerCustomPlugin(pluginId: string): Promise<void> {
    const plugin = await pluginLoader.loadCustomPlugin(pluginId);
    const tool = PluginToolWrapper.wrapPlugin(plugin);
    this.tools.set(pluginId, tool);
  }
  
  /**
   * 获取所有可用Tools
   */
  getAllTools(): DynamicStructuredTool[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * 按类别获取Tools
   */
  getToolsByCategory(category: string): DynamicStructuredTool[] {
    return Array.from(this.tools.values()).filter(
      tool => tool.name.includes(category)
    );
  }
}
```

---

## 4. Conversation Memory with LangChain

### 4.1 Memory Manager

```typescript
import { ConversationBufferMemory } from 'langchain/memory';
import { SQLiteMessageHistory } from './SQLiteMessageHistory';

class ConversationMemoryManager {
  private memories: Map<string, ConversationBufferMemory> = new Map();
  
  /**
   * 获取或创建对话记忆
   */
  getMemory(conversationId: string): ConversationBufferMemory {
    if (!this.memories.has(conversationId)) {
      const memory = new ConversationBufferMemory({
        memoryKey: 'chat_history',
        returnMessages: true,
        maxTokenLimit: 4000,
        chatHistory: new SQLiteMessageHistory(conversationId)
      });
      
      this.memories.set(conversationId, memory);
    }
    
    return this.memories.get(conversationId)!;
  }
  
  /**
   * 保存对话上下文
   */
  async saveContext(
    conversationId: string,
    userInput: string,
    assistantResponse: string
  ): Promise<void> {
    const memory = this.getMemory(conversationId);
    await memory.saveContext(
      { input: userInput },
      { output: assistantResponse }
    );
  }
  
  /**
   * 加载历史用于LLM调用
   */
  async loadHistory(conversationId: string): Promise<any> {
    const memory = this.getMemory(conversationId);
    return await memory.loadMemoryVariables({});
  }
  
  /**
   * 清除对话记忆
   */
  clearMemory(conversationId: string): void {
    this.memories.delete(conversationId);
  }
}
```

### 4.2 SQLite Message History

```typescript
import { BaseChatMessageHistory } from '@langchain/core/chat_history';

class SQLiteMessageHistory extends BaseChatMessageHistory {
  private conversationId: string;
  private db: Database.Database;
  
  constructor(conversationId: string) {
    super();
    this.conversationId = conversationId;
    this.db = sqliteManager.getDatabase();
  }
  
  async getMessages(): Promise<BaseMessage[]> {
    const rows = this.db.prepare(`
      SELECT role, content, timestamp 
      FROM conversation_messages 
      WHERE conversation_id = ? 
      ORDER BY timestamp ASC
    `).all(this.conversationId);
    
    return rows.map(row => {
      if (row.role === 'user') {
        return new HumanMessage(row.content);
      } else {
        return new AIMessage(row.content);
      }
    });
  }
  
  async addMessage(message: BaseMessage): Promise<void> {
    const role = message._getType() === 'human' ? 'user' : 'assistant';
    
    this.db.prepare(`
      INSERT INTO conversation_messages (conversation_id, role, content, timestamp)
      VALUES (?, ?, ?, datetime('now'))
    `).run(this.conversationId, role, message.content);
  }
  
  async clear(): Promise<void> {
    this.db.prepare(`
      DELETE FROM conversation_messages 
      WHERE conversation_id = ?
    `).run(this.conversationId);
  }
}
```

---

## 5. Streaming with LangChain Callbacks

### 5.1 Custom Streaming Handler

```typescript
import { BaseCallbackHandler } from '@langchain/core/callbacks/handler';

class GeoAIStreamingHandler extends BaseCallbackHandler {
  name = 'geoai_streaming_handler';
  private streamWriter: Writable;
  
  constructor(streamWriter: Writable) {
    super();
    this.streamWriter = streamWriter;
  }
  
  /**
   * LLM生成新token时调用
   */
  async handleLLMNewToken(token: string): Promise<void> {
    this.writeSSE({
      type: 'token',
      content: token,
      timestamp: Date.now()
    });
  }
  
  /**
   * Chain开始时调用
   */
  async handleChainStart(chain: any, inputs: any): Promise<void> {
    this.writeSSE({
      type: 'step_start',
      step: chain.name || chain.constructor.name,
      inputs: this.sanitizeInputs(inputs)
    });
  }
  
  /**
   * Chain结束时调用
   */
  async handleChainEnd(outputs: any): Promise<void> {
    this.writeSSE({
      type: 'step_complete',
      outputs: this.sanitizeOutputs(outputs)
    });
  }
  
  /**
   * Tool调用开始时
   */
  async handleToolStart(tool: any, input: string): Promise<void> {
    this.writeSSE({
      type: 'tool_start',
      tool: tool.name,
      input: this.truncate(input, 200)
    });
  }
  
  /**
   * Tool调用结束时
   */
  async handleToolEnd(output: string): Promise<void> {
    this.writeSSE({
      type: 'tool_complete',
      output: this.truncate(output, 500)
    });
  }
  
  /**
   * 错误处理
   */
  async handleChainError(error: Error): Promise<void> {
    this.writeSSE({
      type: 'error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
  
  /**
   * 写入SSE格式数据
   */
  private writeSSE(data: any): void {
    const eventData = JSON.stringify(data);
    this.streamWriter.write(`data: ${eventData}\n\n`);
  }
  
  /**
   * 截断长字符串
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }
  
  /**
   * 清理敏感输入
   */
  private sanitizeInputs(inputs: any): any {
    // Remove API keys, passwords, etc.
    const sanitized = { ...inputs };
    delete sanitized.apiKey;
    delete sanitized.password;
    return sanitized;
  }
  
  private sanitizeOutputs(outputs: any): any {
    return outputs;
  }
}
```

### 5.2 在LLM调用中使用

```typescript
async function executeWithStreaming(
  userInput: string,
  conversationId: string,
  response: Response
): Promise<void> {
  // 设置SSE headers
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  
  // 创建stream writer
  const streamWriter = response;
  
  // 创建callback handler
  const streamingHandler = new GeoAIStreamingHandler(streamWriter);
  
  // 获取对话历史
  const memory = memoryManager.getMemory(conversationId);
  const history = await memory.loadMemoryVariables({});
  
  // 执行LangGraph工作流
  const result = await app.invoke(
    {
      userInput,
      conversationId,
      currentStep: 'goal_splitting'
    },
    {
      callbacks: [streamingHandler],
      configurable: {
        thread_id: conversationId
      }
    }
  );
  
  // 保存对话上下文
  await memoryManager.saveContext(
    conversationId,
    userInput,
    result.summary || ''
  );
  
  // 发送完成信号
  streamWriter.write(`data: ${JSON.stringify({type: 'complete'})}\n\n`);
  streamWriter.end();
}
```

---

## 6. Multi-LLM Provider Support

### 6.1 LLM Adapter Factory

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

class LLMAdapterFactory {
  /**
   * 根据配置创建LLM适配器
   */
  static createAdapter(config: LLMConfig): BaseChatModel {
    switch (config.provider) {
      case 'openai':
        return new ChatOpenAI({
          modelName: config.model || 'gpt-4',
          apiKey: config.apiKey,
          temperature: config.temperature || 0.7,
          maxTokens: config.maxTokens || 2000,
          streaming: true
        });
        
      case 'anthropic':
        return new ChatAnthropic({
          model: config.model || 'claude-3-opus-20240229',
          apiKey: config.apiKey,
          temperature: config.temperature || 0.7,
          maxTokens: config.maxTokens || 2000,
          streaming: true
        });
        
      case 'ollama':
        return new ChatOllama({
          baseUrl: config.baseUrl || 'http://localhost:11434',
          model: config.model || 'llama3',
          temperature: config.temperature || 0.7,
          streaming: true
        });
        
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }
  
  /**
   * 测试LLM连接
   */
  static async testConnection(config: LLMConfig): Promise<boolean> {
    try {
      const llm = this.createAdapter(config);
      const result = await llm.invoke('Hello');
      return result !== null;
    } catch (error) {
      console.error('LLM connection test failed:', error);
      return false;
    }
  }
}
```

---

## 7. Prompt Template Management

### 7.1 从文件加载Prompt

```typescript
import { PromptTemplate } from '@langchain/core/prompts';
import fs from 'fs';
import path from 'path';

class PromptManager {
  private promptsDir: string;
  private templateCache: Map<string, PromptTemplate> = new Map();
  
  constructor(baseDir: string) {
    this.promptsDir = path.join(baseDir, 'llm/prompts');
  }
  
  /**
   * 加载prompt模板
   */
  async loadTemplate(
    templateId: string, 
    language: string = 'en-US'
  ): Promise<PromptTemplate> {
    const cacheKey = `${language}/${templateId}`;
    
    // 检查缓存
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }
    
    const filePath = path.join(this.promptsDir, language, `${templateId}.md`);
    
    // 如果请求的语言不存在，回退到英文
    if (!await fs.pathExists(filePath)) {
      if (language !== 'en-US') {
        const fallbackPath = path.join(this.promptsDir, 'en-US', `${templateId}.md`);
        if (await fs.pathExists(fallbackPath)) {
          return await this.loadFromFile(fallbackPath, templateId, 'en-US');
        }
      }
      throw new Error(`Prompt template not found: ${templateId} (${language})`);
    }
    
    const template = await this.loadFromFile(filePath, templateId, language);
    this.templateCache.set(cacheKey, template);
    
    return template;
  }
  
  /**
   * 从文件加载模板
   */
  private async loadFromFile(
    filePath: string, 
    templateId: string,
    language: string
  ): Promise<PromptTemplate> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // 提取变量 {{variable}}
    const variables = this.extractVariables(content);
    
    return PromptTemplate.fromTemplate(content);
  }
  
  /**
   * 提取模板变量
   */
  private extractVariables(template: string): string[] {
    const matches = template.match(/\{\{([^}]+)\}\}/g);
    if (!matches) return [];
    
    return matches.map(match => match.replace(/[{}]/g, ''));
  }
  
  /**
   * 清除缓存（热更新）
   */
  clearCache(templateId?: string): void {
    if (templateId) {
      // 清除特定模板的所有语言版本
      for (const key of this.templateCache.keys()) {
        if (key.endsWith(`/${templateId}`)) {
          this.templateCache.delete(key);
        }
      }
    } else {
      // 清除所有缓存
      this.templateCache.clear();
    }
  }
}
```

---

## 8. Error Handling with Fallback Chains

### 8.1 Fallback Strategy

```typescript
import { RunnableWithFallbacks } from '@langchain/core/runnables';

class ResilientLLMChain {
  private primaryLLM: BaseChatModel;
  private fallbackLLMs: BaseChatModel[];
  
  constructor(primary: BaseChatModel, fallbacks: BaseChatModel[]) {
    this.primaryLLM = primary;
    this.fallbackLLMs = fallbacks;
  }
  
  /**
   * 创建带fallback的chain
   */
  createResilientChain(prompt: PromptTemplate): RunnableWithFallbacks {
    const primaryChain = prompt.pipe(this.primaryLLM);
    
    const fallbackChains = this.fallbackLLMs.map(llm => 
      prompt.pipe(llm)
    );
    
    return primaryChain.withFallbacks({
      fallbacks: fallbackChains
    });
  }
  
  /**
   * 执行带重试的调用
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        console.warn(`Attempt ${i + 1}/${maxRetries} failed:`, error);
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    
    throw lastError;
  }
}
```

---

## 9. 完整处理流程示例

```typescript
// 用户输入: "显示河流的500米缓冲区并计算面积统计"

// 1. Goal Splitting (LangGraph Node)
const goals = await goalSplitterAgent.invoke({
  userInput: "显示河流的500米缓冲区并计算面积统计"
});
// Output: [
//   { id: 'goal_1', description: 'Display 500m buffer of river', type: 'visualization' },
//   { id: 'goal_2', description: 'Calculate area statistics', type: 'analysis' }
// ]

// 2. Task Planning (LangGraph Node)
const plans = await taskPlannerAgent.invoke({ goals });
// Output: Map {
//   'goal_1' => { steps: [{ pluginName: 'buffer_analysis', ... }, { pluginName: 'mvt_publish', ... }] },
//   'goal_2' => { steps: [{ pluginName: 'statistics', ... }] }
// }

// 3. Plugin Execution (LangGraph Node)
// Plugins are called as LangChain Tools
const results = await pluginExecutor.invoke({ plans });

// 4. Output Generation (LangGraph Node)
const services = await outputGenerator.invoke({ results });

// 5. Summary (LangGraph Node)
const summary = await summaryGenerator.invoke({ services });

// Final response streamed via SSE throughout the process
```

---

## 10. 依赖关系

```typescript
// package.json dependencies
{
  "@langchain/core": "^1.1.43",
  "@langchain/openai": "^1.4.5",
  "@langchain/anthropic": "^1.3.28",
  "@langchain/langgraph": "^1.2.9",
  "@langchain/ollama": "^0.0.3",  // Optional
  "zod": "^3.25.0"
}
```

---

## 总结

本层完全基于LangChain框架构建，实现了：

✅ **LangGraph状态机** - 管理5步处理流程  
✅ **插件即Tools** - 动态选择和执行  
✅ **Structured Output** - 确保有效的JSON输出  
✅ **Conversation Memory** - 多轮对话上下文  
✅ **Streaming Callbacks** - 实时SSE输出  
✅ **Multi-LLM Support** - 提供商抽象层  
✅ **Prompt Management** - 外部文件加载  
✅ **Fallback Chains** - 错误恢复机制  

这完全符合需求规格说明书中"充分利用langchain框架"的要求。
