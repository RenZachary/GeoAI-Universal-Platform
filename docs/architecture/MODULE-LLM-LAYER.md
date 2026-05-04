# LLM交互层详细设计

## 1. 模块职责

- 解析用户自然语言输入
- 识别意图和输出目标
- 分解任务为可执行的子目标
- 管理LLM调用和流式输出
- 管理对话上下文

---

## 2. 核心类设计

### 2.1 RequirementParser（需求解析器）

```typescript
class RequirementParser {
  private intentDetector: IntentDetector;
  private goalSplitter: GoalSplitter;
  
  /**
   * 解析用户需求
   */
  async parse(input: string, context?: ConversationContext): Promise<ParsedRequirement>;
  
  /**
   * 检测用户意图
   */
  private detectIntent(input: string): Intent;
  
  /**
   * 拆分输出目标
   */
  private splitGoals(parsedText: string): OutputGoal[];
}

interface ParsedRequirement {
  intent: Intent;
  goals: OutputGoal[];
  parameters: Record<string, any>;
  confidence: number;
}

interface OutputGoal {
  id: string;
  description: string;
  type: GoalType; // 'visualization' | 'analysis' | 'report' | 'query'
  parameters: GoalParameters;
}
```

---

### 2.2 TaskDecomposer（任务分解器）

```typescript
class TaskDecomposer {
  private llmAdapter: LLMAdapter;
  
  /**
   * 将输出目标分解为执行步骤
   */
  async decompose(goal: OutputGoal): Promise<ExecutionPlan>;
  
  /**
   * 生成执行计划
   */
  private generatePlan(goal: OutputGoal, availablePlugins: PluginInfo[]): ExecutionPlan;
  
  /**
   * 协调多次LLM调用
   * - 串行：当步骤有依赖关系时
   * - 并行：当多个目标独立时
   */
  async coordinateMultipleCalls(
    goals: OutputGoal[],
    context: ConversationContext
  ): Promise<ExecutionPlan[]>;
}

interface ExecutionPlan {
  goalId: string;
  steps: ExecutionStep[];
  estimatedTime: number;
  executionMode: 'sequential' | 'parallel';  // 执行模式
}

interface ExecutionStep {
  id: string;
  type: StepType; // 'load_data' | 'analyze' | 'transform' | 'visualize' | 'report'
  pluginName: string;
  parameters: Record<string, any>;
  dependencies: string[]; // 依赖的前置步骤ID
  requiresLLMCall?: boolean;  // 是否需要再次调用LLM
}
```

**多次LLM调用编排逻辑**:

1. **初次调用**: RequirementParser识别所有输出目标
2. **目标分解**: 对每个目标调用TaskDecomposer.decompose()生成执行计划
3. **依赖分析**: 
   - 如果目标间无依赖 → 并行执行
   - 如果目标间有依赖 → 串行执行（如先加载数据再分析）
4. **动态调整**: 执行过程中如需重新规划，可再次调用LLM

---

### 2.3 StreamManager（流式输出管理器）

```typescript
class StreamManager {
  /**
   * 创建SSE流
   */
  createStream(res: Response): SSEStream;
  
  /**
   * 发送文本块
   */
  sendText(stream: SSEStream, text: string): void;
  
  /**
   * 发送任务状态
   */
  sendTaskStatus(stream: SSEStream, status: TaskStatus): void;
  
  /**
   * 发送步骤状态
   */
  sendStepStatus(
    stream: SSEStream, 
    taskId: string, 
    stepId: string, 
    stepType: StepType,
    status: 'start' | 'complete'
  ): void;
  
  /**
   * 发送可视化结果
   */
  sendVisualization(
    stream: SSEStream,
    serviceId: string,
    type: 'mvt' | 'wms' | 'heatmap',
    url?: string
  ): void;
  
  /**
   * 发送报告结果
   */
  sendReport(
    stream: SSEStream,
    reportId: string,
    downloadUrl: string
  ): void;
  
  /**
   * 发送错误
   */
  sendError(stream: SSEStream, error: ErrorResponse): void;
  
  /**
   * 关闭流
   */
  closeStream(stream: SSEStream): void;
}
```

---

### 2.4 ContextManager（上下文管理器）

```typescript
class ContextManager {
  private conversationRepo: ConversationRepository;
  
  /**
   * 加载对话上下文
   */
  async loadContext(conversationId: string): Promise<ConversationContext>;
  
  /**
   * 保存对话上下文
   */
  async saveContext(context: ConversationContext): Promise<void>;
  
  /**
   * 更新上下文
   */
  async updateContext(conversationId: string, updates: ContextUpdate): Promise<void>;
}

interface ConversationContext {
  conversationId: string;
  messages: Message[];
  currentDataSources: string[];  // 当前对话中使用的数据源ID列表
  activePlugins: string[];       // 当前激活的插件
  lastAnalysisResults: AnalysisResult[];  // 最近的分析结果
  analysisParameters?: {         // 分析参数记忆
    distance?: number;
    unit?: DistanceUnit;
    fields?: string[];
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface ContextUpdate {
  dataSources?: string[];
  plugins?: string[];
  analysisResults?: AnalysisResult[];
  parameters?: Record<string, any>;
}
```

---

### 2.5 PromptManager（提示词管理器）

```typescript
class PromptManager {
  private templateRepo: PromptTemplateRepository;
  
  /**
   * 加载提示词模板
   */
  async loadTemplate(templateId: string): Promise<PromptTemplate>;
  
  /**
   * 渲染提示词
   */
  renderTemplate(template: PromptTemplate, variables: Record<string, any>): string;
  
  /**
   * 获取系统提示词
   */
  async getSystemPrompt(language: string): Promise<string>;
}

interface PromptTemplate {
  id: string;
  name: string;
  content: string;  // Loaded from external file, not embedded in code
  language: string;  // 'en-US' (default) | 'zh-CN'
  category: string;  // 'requirement_parsing' | 'task_decomposition' | 'gis_analysis'
  variables: string[];
  filePath?: string;  // Path to external template file
  createdAt: Date;
  updatedAt: Date;
}
```

**提示词模板外部化管理**:

所有提示词模板存储在外部文件中，不嵌入代码。

**重要原则**: 提示词仅用于LLM需要**推理和决策**的场景，不用于具体执行逻辑。

```
server/
└── llm/
    └── prompts/
        ├── en-US/                    # 英文模板（默认）
        │   ├── goal-splitting.md             # Step 1: 拆分用户目标
        │   ├── task-planning.md              # Step 2: 为每个目标规划执行
        │   └── response-summary.md           # Step 5: 生成总结性文本（可选）
        └── zh-CN/                    # 中文模板（可选）
            ├── goal-splitting.md
            ├── task-planning.md
            └── response-summary.md
```

**完整处理流程**:

```
用户输入: "显示河流的500米缓冲区并计算面积统计"

Step 1: Goal Splitting (LLM) ──────────────────────────┐
  Prompt: goal-splitting.md                            │
  Input: 用户自然语言                                   │
  Output: [
    { "goal": "显示河流500米缓冲区", "type": "visualization" },
    { "goal": "计算面积统计", "type": "analysis" }
  ]                                                      │
                                                         │
Step 2: Per-Goal Planning (LLM, 并行或串行) ─────────────┤
  Prompt: task-planning.md                              │
  Input: 目标 + 数据源元信息 + 可用插件列表               │
  Output: 执行计划（选择哪些插件、参数是什么）             │
  Example:                                               │
    Goal 1 Plan: [                                       │
      { plugin: "data-loader", params: {...} },         │
      { plugin: "buffer-analyzer", params: {distance:500} },
      { plugin: "mvt-publisher", params: {...} }        │
    ]                                                    │
    Goal 2 Plan: [                                       │
      { plugin: "statistics-analyzer", params: {...},   │
        dependsOn: ["Goal 1 Step 2"] }                  │
    ]                                                    │
                                                         │
Step 3: Plugin Execution (Code, 无LLM) ──────────────────┤
  - DataLoaderPlugin.execute()                          │
  - BufferAnalyzer.createBuffer() → PostGISAccessor     │
  - MVTPublisher.publish()                              │
  - StatisticsAnalyzer.calculate()                      │
  * 注意: 某些插件内部可能调用LLM（如ReportGenerator）    │
                                                         │
Step 4: Output Generation (Code, 无LLM) ─────────────────┤
  - MVT服务发布完成                                      │
  - WMS服务发布完成                                      │
  - 热力图GeoJSON生成                                    │
  - 统计表格数据                                         │
  - 报告文件生成（如果ReportGenerator调用了LLM）          │
                                                         │
Step 5: Response Summary (LLM, 可选) ────────────────────┘
  Prompt: response-summary.md
  Input: 所有执行结果 + 用户原始问题
  Output: "已完成河流500米缓冲区分析，覆盖2.5平方公里...
           统计结果显示平均面积为..."
```

**为什么这样设计？**

1. **Step 1 (goal-splitting)**: 
   - 简单快速，只识别有几个独立目标
   - 不涉及具体执行细节

2. **Step 2 (task-planning)**:
   - **关键步骤**: LLM看到完整上下文后做决策
   - 数据源元信息: 字段、坐标系、要素数量等
   - 插件信息: 可用插件列表及其能力描述
   - LLM基于这些信息选择最合适的插件和参数

3. **Step 3 (execution)**:
   - 纯代码执行，确定性高
   - 插件内部可以按需调用LLM（如报告生成）

4. **Step 4 (output)**:
   - 服务发布、文件生成等
   - 不需要LLM

5. **Step 5 (summary)**:
   - 可选，提升用户体验
   - 用自然语言总结所有结果
```

**模板文件示例**:

#### 1. `goal-splitting.md` (Step 1)

```markdown
Identify and split the user's request into independent goals.

User input: {{userInput}}

Return a JSON array of goals:
[
  {
    "id": "goal_1",
    "description": "string",
    "type": "visualization" | "analysis" | "report" | "query"
  }
]

Rules:
- Each goal should be independently achievable
- Don't plan execution steps yet, just identify goals
- If only one goal, return array with single element
```

#### 2. `task-planning.md` (Step 2 - Most Important)

```markdown
Create an execution plan for the given goal using available plugins and data sources.

Goal: {{goalDescription}}
Goal Type: {{goalType}}

Available Data Sources:
{{dataSourcesMetadata}}

Available Plugins:
{{availablePlugins}}

Context from Previous Steps (if any):
{{previousResults}}

Create a step-by-step execution plan. For each step specify:
- pluginName: Which plugin to use
- parameters: What parameters to pass
- dependencies: Which previous steps this depends on

Return JSON:
{
  "goalId": "string",
  "steps": [
    {
      "id": "step_1",
      "pluginName": "data-loader",
      "parameters": { "dataSourceId": "river_data" },
      "dependencies": []
    },
    {
      "id": "step_2",
      "pluginName": "buffer-analyzer",
      "parameters": { "distance": 500, "unit": "meters" },
      "dependencies": ["step_1"]
    }
  ]
}

Important:
- Choose plugins based on their capabilities and the goal type
- Consider data source metadata (CRS, fields, geometry type) when selecting plugins
- Ensure proper dependency ordering
- Parameters must match plugin's expected input schema
```

#### 3. `response-summary.md` (Step 5 - Optional)

```markdown
Generate a friendly, concise summary of the analysis results for the user.

Original User Request: {{userInput}}

Completed Tasks:
{{executionResults}}

Generated Outputs:
- Visualizations: {{visualizations}}
- Analyses: {{analyses}}
- Reports: {{reports}}

Create a natural language summary that:
1. Confirms what was done
2. Highlights key findings
3. Mentions available outputs (maps, charts, reports)
4. Is conversational and helpful

Keep it concise (2-4 sentences).
```

**PromptManager加载外部模板**:

```typescript
class PromptManager {
  private templateRepo: PromptTemplateRepository;
  private promptsDir: string;
  
  constructor(promptsDir: string) {
    this.promptsDir = promptsDir;
  }
  
  /**
   * 从外部文件加载提示词模板
   */
  async loadTemplate(templateId: string, language: string = 'en-US'): Promise<PromptTemplate> {
    const filePath = path.join(this.promptsDir, language, `${templateId}.md`);
    
    if (!fs.existsSync(filePath)) {
      // Fallback to English if requested language not found
      if (language !== 'en-US') {
        const fallbackPath = path.join(this.promptsDir, 'en-US', `${templateId}.md`);
        if (fs.existsSync(fallbackPath)) {
          return await this.loadFromFile(fallbackPath, templateId, 'en-US');
        }
      }
      throw new Error(`Prompt template not found: ${templateId} (${language})`);
    }
    
    return await this.loadFromFile(filePath, templateId, language);
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
    
    // Extract variables from {{variable}} patterns
    const variables = this.extractVariables(content);
    
    return {
      id: templateId,
      name: this.getTemplateName(templateId),
      content,
      language,
      category: this.getTemplateCategory(templateId),
      variables,
      filePath,
      createdAt: await this.getFileCreatedAt(filePath),
      updatedAt: await this.getFileUpdatedAt(filePath),
    };
  }
  
  /**
   * 渲染提示词
   */
  renderTemplate(template: PromptTemplate, variables: Record<string, any>): string {
    let rendered = template.content;
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), String(value));
    }
    
    return rendered;
  }
  
  /**
   * 获取系统提示词（默认英文）
   */
  async getSystemPrompt(language: string = 'en-US'): Promise<string> {
    const template = await this.loadTemplate('system-prompt', language);
    return template.content;
  }
  
  private extractVariables(content: string): string[] {
    const matches = content.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  }
  
  private getTemplateName(id: string): string {
    const names: Record<string, string> = {
      'requirement-parsing': 'Requirement Parsing Template',
      'task-decomposition': 'Task Decomposition Template',
      'buffer-analysis': 'Buffer Analysis Template',
      // ...
    };
    return names[id] || id;
  }
  
  private getTemplateCategory(id: string): string {
    if (id.includes('parsing')) return 'requirement_parsing';
    if (id.includes('decomposition')) return 'task_decomposition';
    return 'gis_analysis';
  }
}
```

**设计原则**:

1. **外部化存储**: 所有prompt模板存储在`llm/prompts/`目录下
2. **默认英文**: 默认使用`en-US`目录下的模板
3. **多语言支持**: 可选提供`zh-CN`等其他语言版本
4. **降级策略**: 如果请求的语言不存在，自动降级到英文
5. **动态加载**: 运行时从文件系统加载，支持热更新
6. **变量提取**: 自动从模板中提取`{{variable}}`占位符
7. **前端管理**: 前端可通过API查看、编辑模板文件

---

## 3. LLM适配器设计

### 3.1 LLMAdapter接口

```typescript
interface LLMAdapter {
  /**
   * 普通对话
   */
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  
  /**
   * 流式对话
   */
  chatStream(
    messages: Message[], 
    options?: ChatOptions
  ): AsyncIterable<ChatChunk>;
  
  /**
   * 获取模型信息
   */
  getModelInfo(): ModelInfo;
  
  /**
   * 验证配置
   */
  validateConfig(config: LLMConfig): ValidationResult;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

interface ChatResponse {
  content: string;
  usage: TokenUsage;
  model: string;
}

interface ChatChunk {
  content?: string;
  done?: boolean;
  usage?: TokenUsage;
}
```

---

### 3.2 QwenAdapter实现

```typescript
class QwenAdapter implements LLMAdapter {
  private config: QwenConfig;
  private client: OpenAI; // Qwen兼容OpenAI API
  
  constructor(config: QwenConfig) {
    this.config = config;
    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });
  }
  
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      stream: false,
    });
    
    return {
      content: response.choices[0].message.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      model: response.model,
    };
  }
  
  async *chatStream(
    messages: Message[], 
    options?: ChatOptions
  ): AsyncIterable<ChatChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages: messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield { content };
      }
      if (chunk.choices[0]?.finish_reason) {
        yield { 
          done: true,
          usage: {
            promptTokens: chunk.usage?.prompt_tokens || 0,
            completionTokens: chunk.usage?.completion_tokens || 0,
            totalTokens: chunk.usage?.total_tokens || 0,
          }
        };
      }
    }
  }
  
  getModelInfo(): ModelInfo {
    return {
      name: 'qwen',
      version: this.config.model,
      provider: 'Alibaba',
    };
  }
  
  validateConfig(config: LLMConfig): ValidationResult {
    if (!config.baseUrl) {
      return { valid: false, error: 'Base URL is required' };
    }
    if (!config.apiKey) {
      return { valid: false, error: 'API key is required' };
    }
    return { valid: true };
  }
}
```

---

### 3.3 LLMFactory（LLM工厂）

```typescript
class LLMFactory {
  private adapters: Map<LLMModelType, LLMAdapter> = new Map();
  
  /**
   * 创建或获取LLM适配器
   */
  createAdapter(modelType: LLMModelType, config: LLMConfig): LLMAdapter {
    const cacheKey = `${modelType}_${config.model}`;
    
    if (this.adapters.has(cacheKey)) {
      return this.adapters.get(cacheKey)!;
    }
    
    let adapter: LLMAdapter;
    
    switch (modelType) {
      case 'qwen':
        adapter = new QwenAdapter(config as QwenConfig);
        break;
      case 'openai':
        adapter = new OpenAIAdapter(config as OpenAIConfig);
        break;
      case 'anthropic':
        adapter = new AnthropicAdapter(config as AnthropicConfig);
        break;
      default:
        throw new Error(`Unsupported LLM model type: ${modelType}`);
    }
    
    this.adapters.set(cacheKey, adapter);
    return adapter;
  }
  
  /**
   * 获取支持的模型类型
   */
  getSupportedModels(): LLMModelInfo[] {
    return [
      { type: 'qwen', name: 'Qwen', provider: 'Alibaba' },
      { type: 'openai', name: 'GPT', provider: 'OpenAI' },
      { type: 'anthropic', name: 'Claude', provider: 'Anthropic' },
    ];
  }
}
```

---

## 4. 数据流时序图

```
用户 → ChatController → RequirementParser → TaskDecomposer
                                          ↓
                                    LLMAdapter (多次调用)
                                          ↓
                                    ExecutionPlan
                                          ↓
                              PluginOrchestrationLayer
```

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
