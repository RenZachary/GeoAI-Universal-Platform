# GeoAI-UP 总体架构设计文档

## 1. 架构概述

### 1.1 设计原则

- **文档驱动开发（DDD）**: 所有设计决策、接口定义、数据结构必须先文档化，再编码实现
- **分层架构**: 清晰的层次划分，每层职责单一，通过工厂模式解耦
- **插件化扩展**: 核心功能插件化，支持热插拔和自定义扩展
- **数据原生性**: 保持原始数据格式，避免不必要的数据转换
- **类型安全**: TypeScript严格类型检查，编译时暴露问题

### 1.2 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层 (Web)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │对话界面   │ │数据管理   │ │地图浏览   │ │配置管理       │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │ RESTful API + SSE (HTTP/JSON)
┌────────────────────────▼────────────────────────────────────┐
│                      接口层 (Interface Layer)                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐    │
│  │对话接口       │ │数据管理接口   │ │插件管理接口       │    │
│  └──────────────┘ └──────────────┘ └──────────────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   LLM交互层 (LLM Interaction Layer)          │
│              (Powered by LangChain Framework)                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐    │
│  │LangGraph     │ │LangChain     │ │Conversation      │    │
│  │State Machine │ │Chains        │ │Memory            │    │
│  └──────────────┘ └──────────────┘ └──────────────────┘    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐    │
│  │Goal Splitter │ │Task Planner  │ │Streaming         │    │
│  │Agent         │ │Agent         │ │Handler           │    │
│  └──────────────┘ └──────────────┘ └──────────────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  插件调度层 (Plugin Orchestration Layer)     │
│           (Integrated as LangChain Tools)                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐    │
│  │Tool Wrapper  │ │Executor      │ │Result Aggregator │    │
│  └──────────────┘ └──────────────┘ └──────────────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│数据接入层     │ │空间分析层     │ │可视化服务层   │
│(Data Access) │ │(Spatial      │ │(Visualization │
│              │ │ Analysis)    │ │ Service)      │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    存储层 (Storage Layer)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │文件系统   │ │SQLite DB │ │临时文件   │ │服务元信息     │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 技术栈选型

#### 后端技术栈
- **运行时**: Node.js 20.19+ / 22.12+
- **框架**: Express 5.x
- **语言**: TypeScript 6.x
- **LLM集成**: LangChain (@langchain/core, @langchain/openai, @langchain/anthropic)
- **GIS处理**: 
  - GDAL (gdal-async) - 栅格数据处理
  - Turf.js (@turf/turf) - 空间分析
  - Proj4 (proj4) - 坐标转换
  - GeoTIFF (geotiff) - TIFF影像读取
  - Shapefile (shapefile) - Shapefile解析
  - Vector Tiles (geojson-vt, vt-pbf) - MVT生成
- **数据库**: better-sqlite3 (SQLite)
- **PostgreSQL**: pg (PostGIS连接)
- **文件上传**: multer
- **验证**: zod, ajv
- **工具库**: axios, uuid, dotenv, cors

#### 前端技术栈
- **框架**: Vue 3.5+
- **UI组件**: Element Plus 2.13+
- **状态管理**: Pinia 3.0+
- **路由**: Vue Router 5.0+
- **地图引擎**: MapLibre GL 4.7+
- **国际化**: vue-i18n 9.14+
- **构建工具**: Vite 8.0+
- **HTTP客户端**: axios 1.15+

---

## 2. LangChain集成架构

### 2.1 为什么使用LangChain？

根据需求规格说明书第2.2节要求：
> "充分利用 langchain 框架，实现LLM与插件、数据源的联动，优化需求拆解效率和执行流程"

LangChain provides:
- **Structured LLM Workflows**: Chains, Agents, and Graphs for complex multi-step processes
- **Tool Integration**: Native support for wrapping plugins as callable tools
- **Memory Management**: Built-in conversation history and context management
- **Streaming Support**: First-class SSE streaming for real-time responses
- **Model Abstraction**: Easy switching between different LLM providers
- **LangGraph**: Stateful, cyclic workflows for complex decision-making

### 2.2 LangChain核心组件映射

```
GeoAI-UP Feature          → LangChain Component
─────────────────────────────────────────────────
Goal Splitting            → Agent with custom prompt
Task Planning             → StructuredOutputParser + Chain
Plugin Execution          → @tool decorator → Tool
Multi-goal Coordination   → LangGraph StateGraph
Conversation Memory       → ConversationBufferMemory
Streaming Output          → StreamingStdOutCallbackHandler
Prompt Management         → PromptTemplate from files
Error Recovery            → Fallback chains
```

### 2.3 LangGraph状态机设计

The core of GeoAI-UP's LLM interaction is a **LangGraph StateGraph** that manages the 5-step processing flow:

```typescript
// State definition for LangGraph
interface GeoAIState {
  // Input
  userInput: string;
  
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
  
  // Metadata
  conversationId: string;
  currentStep: 'goal_splitting' | 'task_planning' | 'execution' | 'output' | 'summary';
  errors?: Array<{goalId: string; error: string}>;
}

// Graph nodes
const workflow = new StateGraph<GeoAIState>({...})
  .addNode('goalSplitter', goalSplitterAgent)
  .addNode('taskPlanner', taskPlannerAgent)
  .addNode('pluginExecutor', pluginExecutor)
  .addNode('outputGenerator', outputGenerator)
  .addNode('summaryGenerator', summaryGenerator)
  
  // Conditional edges based on state
  .addConditionalEdges('goalSplitter', routeToTaskPlanning)
  .addConditionalEdges('taskPlanner', routeToExecution)
  .addEdge('pluginExecutor', 'outputGenerator')
  .addEdge('outputGenerator', 'summaryGenerator')
  .addEdge('summaryGenerator', END);
```

### 2.4 插件作为LangChain Tools

All plugins are wrapped as LangChain Tools, enabling dynamic selection by LLM:

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Example: Buffer analysis plugin as a Tool
const bufferAnalysisTool = tool(
  async (input: {dataSourceId: string; distance: number; unit: string}) => {
    const accessor = dataAccessorFactory.createAccessor(input.dataSourceId);
    const nativeData = await accessor.read(input.dataSourceId);
    
    const result = await bufferAnalyzer.execute(nativeData, {
      distance: input.distance,
      unit: input.unit
    });
    
    return JSON.stringify({
      success: true,
      resultId: result.id,
      metadata: result.metadata
    });
  },
  {
    name: 'buffer_analysis',
    description: 'Perform buffer analysis on spatial data',
    schema: z.object({
      dataSourceId: z.string().describe('ID of the data source to analyze'),
      distance: z.number().describe('Buffer distance'),
      unit: z.enum(['meters', 'kilometers', 'feet', 'miles'])
    })
  }
);

// Register all tools
const availableTools = [
  bufferAnalysisTool,
  overlayAnalysisTool,
  statisticsTool,
  mvtPublishTool,
  wmsPublishTool,
  heatmapTool,
  reportGenerationTool
];
```

### 2.5 LangChain Chains for Task Planning

Task decomposition uses **Structured Output Chains** to ensure valid JSON plans:

```typescript
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';

const taskPlanningChain = ChatPromptTemplate.fromTemplate(
  await fs.readFile('llm/prompts/en-US/task-planning.md', 'utf-8')
)
.pipe(llm)
.pipe(new JsonOutputParser<ExecutionPlan>());

// Usage
const plan = await taskPlanningChain.invoke({
  goalDescription: goal.description,
  goalType: goal.type,
  dataSourcesMetadata: JSON.stringify(availableDataSources),
  availablePlugins: JSON.stringify(pluginCapabilities),
  previousResults: JSON.stringify(context.lastAnalysisResults)
});
```

### 2.6 Conversation Memory with LangChain

Multi-turn dialogue context managed by LangChain Memory:

```typescript
import { ConversationBufferMemory } from 'langchain/memory';

const memory = new ConversationBufferMemory({
  memoryKey: 'chat_history',
  returnMessages: true,
  maxTokenLimit: 4000
});

// Store conversation context
await memory.saveContext(
  { input: userMessage },
  { output: assistantResponse }
);

// Retrieve for next LLM call
const history = await memory.loadMemoryVariables({});
```

### 2.7 Streaming with LangChain Callbacks

Real-time streaming using LangChain's callback system:

```typescript
import { StreamingStdOutCallbackHandler } from '@langchain/core/callbacks/handlers';

class GeoAIStreamingHandler extends BaseCallbackHandler {
  name = 'geoai_streaming_handler';
  
  async handleLLMNewToken(token: string) {
    // Send token to client via SSE
    this.streamWriter.write(`data: ${JSON.stringify({type: 'token', content: token})}\n\n`);
  }
  
  async handleChainStart(chain: any, inputs: any) {
    this.streamWriter.write(`data: ${JSON.stringify({type: 'step_start', step: chain.name})}\n\n`);
  }
  
  async handleChainEnd(outputs: any) {
    this.streamWriter.write(`data: ${JSON.stringify({type: 'step_complete'})}\n\n`);
  }
}

// Use in LLM call
const llm = new ChatOpenAI({
  streaming: true,
  callbacks: [new GeoAIStreamingHandler(streamWriter)]
});
```

### 2.8 Multi-LLM Support via LangChain

Easy switching between different LLM providers:

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';

class LLMAdapterFactory {
  static createAdapter(config: LLMConfig): BaseChatModel {
    switch (config.provider) {
      case 'openai':
        return new ChatOpenAI({
          modelName: config.model,
          apiKey: config.apiKey,
          temperature: config.temperature
        });
      case 'anthropic':
        return new ChatAnthropic({
          model: config.model,
          apiKey: config.apiKey
        });
      case 'ollama':
        return new ChatOllama({
          baseUrl: config.baseUrl,
          model: config.model
        });
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }
}
```

---

## 3. 目录结构设计

```
GeoAI-UP/
├── docs/                          # 文档目录
│   ├── architecture/              # 架构设计文档
│   │   ├── OVERALL-DESIGN.md      # 总体架构设计（本文档）
│   │   ├── MODULE-DESIGN.md       # 模块详细设计
│   │   ├── API-SPECIFICATION.md   # API接口规范
│   │   └── DATABASE-DESIGN.md     # 数据库设计
│   ├── development/               # 开发文档
│   │   ├── plugin-dev-guide.md    # 插件开发指南
│   │   ├── coding-standards.md    # 编码规范
│   │   └── testing-guide.md       # 测试指南
│   ├── deployment/                # 部署文档
│   │   ├── installation.md        # 安装指南
│   │   ├── configuration.md       # 配置说明
│   │   └── troubleshooting.md     # 故障排查
│   └── requirements/              # 需求文档
│       └── requirements.md        # 需求规格说明书
│
├── server/                        # 后端代码
│   ├── src/
│   │   ├── interface/             # 接口层
│   │   │   ├── controllers/       # 控制器
│   │   │   │   ├── chat.controller.ts
│   │   │   │   ├── data.controller.ts
│   │   │   │   ├── plugin.controller.ts
│   │   │   │   ├── llm.controller.ts
│   │   │   │   └── visualization.controller.ts
│   │   │   ├── middleware/        # 中间件
│   │   │   │   ├── error-handler.ts
│   │   │   │   ├── validation.ts
│   │   │   │   └── i18n.ts
│   │   │   ├── routes/            # 路由
│   │   │   │   ├── chat.routes.ts
│   │   │   │   ├── data.routes.ts
│   │   │   │   ├── plugin.routes.ts
│   │   │   │   ├── llm.routes.ts
│   │   │   │   └── visualization.routes.ts
│   │   │   └── index.ts           # 接口层入口
│   │   │
│   │   ├── llm-interaction/       # LLM交互层
│   │   │   ├── parsers/           # 解析器
│   │   │   │   ├── requirement-parser.ts
│   │   │   │   └── intent-detector.ts
│   │   │   ├── decomposers/       # 任务分解器
│   │   │   │   ├── task-decomposer.ts
│   │   │   │   └── goal-splitter.ts
│   │   │   ├── managers/          # 管理器
│   │   │   │   ├── stream-manager.ts
│   │   │   │   ├── context-manager.ts
│   │   │   │   └── prompt-manager.ts
│   │   │   ├── adapters/          # LLM适配器
│   │   │   │   ├── llm-adapter.interface.ts
│   │   │   │   ├── qwen-adapter.ts
│   │   │   │   ├── openai-adapter.ts
│   │   │   │   └── anthropic-adapter.ts
│   │   │   ├── factories/         # 工厂类
│   │   │   │   └── llm-factory.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── plugin-orchestration/  # 插件调度层
│   │   │   ├── loader/            # 插件加载器
│   │   │   │   ├── plugin-loader.ts
│   │   │   │   ├── plugin-validator.ts
│   │   │   │   └── plugin-registry.ts
│   │   │   ├── executor/          # 插件执行器
│   │   │   │   ├── plugin-executor.ts
│   │   │   │   └── execution-context.ts
│   │   │   ├── aggregator/        # 结果聚合器
│   │   │   │   └── result-aggregator.ts
│   │   │   ├── lifecycle/         # 生命周期管理
│   │   │   │   └── plugin-lifecycle.ts
│   │   │   ├── factories/         # 工厂类
│   │   │   │   └── plugin-factory.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── data-access/           # 数据接入层
│   │   │   ├── accessors/         # 数据访问器
│   │   │   │   ├── data-accessor.interface.ts
│   │   │   │   ├── shapefile-accessor.ts
│   │   │   │   ├── geojson-accessor.ts
│   │   │   │   ├── postgis-accessor.ts
│   │   │   │   └── tif-accessor.ts
│   │   │   ├── converters/        # 数据转换器
│   │   │   │   ├── format-converter.ts
│   │   │   │   └── coordinate-transformer.ts
│   │   │   ├── validators/        # 数据验证器
│   │   │   │   └── data-validator.ts
│   │   │   ├── factories/         # 工厂类
│   │   │   │   └── db-accessor-factory.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── spatial-analysis/      # 空间分析层
│   │   │   ├── analyzers/         # 分析器
│   │   │   │   ├── buffer-analyzer.ts
│   │   │   │   ├── overlay-analyzer.ts
│   │   │   │   ├── statistics-analyzer.ts
│   │   │   │   └── heatmap-analyzer.ts
│   │   │   ├── processors/        # 处理器
│   │   │   │   └── analysis-processor.ts
│   │   │   ├── factories/         # 工厂类
│   │   │   │   └── analyzer-factory.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── visualization/         # 可视化服务层
│   │   │   ├── services/          # 服务
│   │   │   │   ├── mvt-service.ts
│   │   │   │   ├── wms-service.ts
│   │   │   │   └── heatmap-service.ts
│   │   │   ├── publishers/        # 发布器
│   │   │   │   └── service-publisher.ts
│   │   │   ├── factories/         # 工厂类
│   │   │   │   └── visualization-factory.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── storage/               # 存储层
│   │   │   ├── filesystem/        # 文件系统管理
│   │   │   │   ├── workspace-manager.ts
│   │   │   │   ├── file-organizer.ts
│   │   │   │   └── temp-file-cleaner.ts
│   │   │   ├── database/          # 数据库管理
│   │   │   │   ├── sqlite-manager.ts
│   │   │   │   ├── migrations/    # 数据库迁移
│   │   │   │   └── repositories/  # 数据仓库
│   │   │   │       ├── config-repo.ts
│   │   │   │       ├── conversation-repo.ts
│   │   │   │       ├── task-repo.ts
│   │   │   │       └── datasource-repo.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── plugins/               # 内置插件
│   │   │   ├── builtin/           # 内置插件
│   │   │   │   ├── spatial-analysis/
│   │   │   │   ├── report-generation/
│   │   │   │   └── visualization/
│   │   │   ├── custom/            # 自定义插件目录
│   │   │   └── interfaces/        # 插件接口定义
│   │   │       └── plugin.interface.ts
│   │   │
│   │   ├── core/                  # 核心工具
│   │   │   ├── types/             # 类型定义
│   │   │   │   ├── native-data.ts
│   │   │   │   ├── plugin.ts
│   │   │   │   ├── llm.ts
│   │   │   │   └── common.ts
│   │   │   ├── utils/             # 工具函数
│   │   │   │   ├── logger.ts
│   │   │   │   ├── error-handler.ts
│   │   │   │   ├── i18n.ts
│   │   │   │   └── validator.ts
│   │   │   ├── constants/         # 常量定义
│   │   │   │   └── index.ts
│   │   │   └── config/            # 配置管理
│   │   │       └── config-manager.ts
│   │   │
│   │   └── app.ts                 # 应用入口
│   │
│   ├── config/                    # 配置文件
│   │   ├── default.config.ts
│   │   └── environment.ts
│   │
│   ├── tests/                     # 测试文件
│   │   ├── unit/                  # 单元测试
│   │   ├── integration/           # 集成测试
│   │   └── fixtures/              # 测试数据
│   │
│   └── package.json
│
├── web/                           # 前端代码
│   ├── src/
│   │   ├── components/            # 组件
│   │   │   ├── chat/              # 对话组件
│   │   │   ├── map/               # 地图组件
│   │   │   ├── data/              # 数据管理组件
│   │   │   ├── plugin/            # 插件管理组件
│   │   │   └── common/            # 通用组件
│   │   ├── views/                 # 页面视图
│   │   │   ├── ChatView.vue
│   │   │   ├── DataManager.vue
│   │   │   ├── PluginManager.vue
│   │   │   └── Settings.vue
│   │   ├── stores/                # Pinia状态管理
│   │   │   ├── chat.store.ts
│   │   │   ├── data.store.ts
│   │   │   ├── plugin.store.ts
│   │   │   └── config.store.ts
│   │   ├── router/                # 路由配置
│   │   │   └── index.ts
│   │   ├── api/                   # API调用
│   │   │   ├── chat.api.ts
│   │   │   ├── data.api.ts
│   │   │   ├── plugin.api.ts
│   │   │   └── llm.api.ts
│   │   ├── locales/               # 国际化资源
│   │   │   ├── zh-CN.ts
│   │   │   └── en-US.ts
│   │   ├── types/                 # TypeScript类型
│   │   │   └── index.ts
│   │   ├── utils/                 # 工具函数
│   │   │   └── index.ts
│   │   ├── App.vue
│   │   └── main.ts
│   │
│   ├── public/                    # 静态资源
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── build/                         # 构建脚本
│   ├── package.js                 # 打包脚本
│   ├── build.config.ts
│   └── scripts/
│
├── vendor/                        # 第三方依赖
│   ├── backend/
│   └── frontend/
│
├── scripts/                       # 零散脚本
│   ├── data-processing/
│   └── testing/
│
├── .eslintrc.js
├── .prettierrc
├── tsconfig.json
└── README.md
```

---

## 4. 核心设计模式

### 3.1 工厂模式（强制使用）

每一层必须通过工厂类创建实例，确保统一接口和低耦合：

```typescript
// 示例：数据访问层工厂
interface DataAccessorFactory {
  createAccessor(type: DataSourceType, config: DataSourceConfig): DataAccessor;
}

// 示例：LLM适配器工厂
interface LLMAdapterFactory {
  createAdapter(modelType: LLMModelType, config: LLMConfig): LLMAdapter;
}

// 示例：插件工厂
interface PluginFactory {
  loadPlugin(pluginPath: string): Plugin;
  createBuiltInPlugin(pluginName: string): Plugin;
}
```

### 3.2 策略模式

用于LLM适配器、数据访问器等可替换组件：

```typescript
interface LLMAdapter {
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;
}

class QwenAdapter implements LLMAdapter { ... }
class OpenAIAdapter implements LLMAdapter { ... }
class AnthropicAdapter implements LLMAdapter { ... }
```

### 3.3 观察者模式

用于插件生命周期管理、任务状态更新等：

```typescript
interface PluginLifecycleObserver {
  onPluginLoaded(plugin: Plugin): void;
  onPluginStarted(plugin: Plugin): void;
  onPluginStopped(plugin: Plugin): void;
  onPluginError(plugin: Plugin, error: Error): void;
}
```

### 3.4 责任链模式

用于需求解析和任务分解：

```typescript
interface RequirementParser {
  setNext(parser: RequirementParser): RequirementParser;
  parse(input: string): ParsedRequirement;
}
```

---

## 5. 数据流设计

### 4.1 用户对话流程

```
用户输入自然语言
    ↓
[接口层] 接收请求，参数验证
    ↓
[LLM交互层] 意图识别 → 需求解析 → 任务分解
    ↓
[插件调度层] 加载插件 → 执行插件 → 聚合结果
    ↓
[数据接入层/空间分析层/可视化层] 具体业务处理
    ↓
[存储层] 持久化结果
    ↓
[接口层] 流式返回响应
```

### 4.2 多目标处理流程

```
用户输入："显示小区数据和河流500米缓冲区"
    ↓
LLM识别两个输出目标：
  目标1: 显示小区数据
  目标2: 显示河流500米缓冲区
    ↓
并行拆解每个目标：
  目标1: 加载数据源 → 解析 → 发布MVT → 前端展示
  目标2: 加载数据源 → 缓冲区分析 → 发布MVT → 前端展示
    ↓
并行执行两个任务链
    ↓
聚合两个结果，流式返回
```

### 4.3 数据处理流程

```
原始数据（NativeData）
    ↓
[数据接入层] 读取数据，保持原生格式
    ↓
[空间分析层] 基于原生数据分析
    ↓
[可视化层] 转换为服务格式（MVT/WMS/GeoJSON）
    ↓
发布服务，前端访问
```

---

## 6. 关键设计决策

### 5.1 NativeData设计原则

**核心原则**: 系统运行期间保持原始数据格式，严禁随意转换

- **PostGIS数据**: 直接在数据库内执行查询和分析，必要时使用临时表
- **Shapefile/GeoJSON**: 保持原始文件结构，分析时生成临时文件
- **TIF影像**: 保持原始文件，通过GDAL直接读取
- **插件间传递**: 通过NativeData对象传递，包含元数据和引用

```typescript
interface NativeData {
  id: string;
  type: DataType; // 'shapefile' | 'geojson' | 'postgis' | 'tif'
  metadata: DataMetadata;
  reference: DataReference; // 文件路径或数据库连接信息
  createdAt: Date;
}
```

### 5.2 插件数据传递规范

- **输入/输出**: 所有插件通过NativeData传递数据
- **例外**: 可视化插件可以输出MVT、WMS服务元信息或GeoJSON（仅热力图）
- **临时数据**: 跨数据源操作时，允许创建临时表或临时文件

### 5.3 服务发布策略

- **矢量数据**: 统一发布为MVT服务（Mapbox Vector Tiles）
- **影像数据**: 统一发布为WMS服务（Web Map Service）
- **热力图**: 直接使用GeoJSON格式，不转换为MVT

### 5.4 提示词模板管理

- **外部化存储**: 所有LLM提示词模板存储在外部文件中，不嵌入代码
- **默认语言**: 默认使用英文（en-US）模板
- **多语言支持**: 可选提供其他语言版本（zh-CN等）
- **目录结构**: `llm/prompts/{language}/{template-id}.md`
- **动态加载**: 运行时从文件系统加载，支持热更新
- **前端管理**: 通过API可查看、编辑、创建模板文件

### 5.5 类型安全策略

- **编译时验证**: 使用TypeScript严格模式，zod运行时验证
- **接口契约**: 所有层之间通过明确的接口类型通信
- **错误前置**: 在数据入口处进行类型和格式验证

---

## 7. 性能优化策略

### 6.1 并发处理

- 多目标分析任务并行执行
- 插件调用异步化
- LLM流式输出，减少等待时间

### 6.2 缓存策略

- MVT瓦片缓存
- LLM响应缓存（相同请求）
- 数据源元数据缓存

### 6.3 资源管理

- 临时文件自动清理（可配置策略）
- 数据库连接池管理
- 内存使用监控

---

## 7. 错误处理策略

### 7.1 错误分类

- **用户错误**: 参数错误、数据格式错误 → 友好提示
- **系统错误**: LLM配置异常、数据源异常、插件调用失败 → 详细日志+引导提示
- **运行时错误**: 内存溢出、超时 → 自动恢复+重试机制

### 7.2 错误响应格式

```typescript
interface ErrorResponse {
  code: string;
  message: string;      // 用户友好的中英文提示
  details?: string;     // 技术细节（开发模式）
  suggestion?: string;  // 解决建议
  timestamp: Date;
}
```

---

## 8. 国际化策略

### 8.1 前端国际化

- 使用vue-i18n管理UI文本
- 支持中英文实时切换，无需重启

### 8.2 后端国际化

- LLM提示词模板支持多语言
- 错误消息、应答提示支持中英文
- 根据用户偏好自动选择语言

---

## 9. 安全性考虑

### 9.1 数据安全

- PostGIS密码加密存储
- API密钥安全存储（环境变量或加密文件）
- 文件上传类型校验和大小限制

### 9.2 插件安全

- 插件签名验证
- 沙箱执行环境（可选）
- 权限控制（读写范围限制）

### 9.3 输入验证

- 所有用户输入进行 sanitization
- SQL注入防护（参数化查询）
- XSS防护

---

## 10. 可扩展性设计

### 10.1 LLM扩展

- 统一的LLM适配器接口
- 新增LLM只需实现适配器并注册到工厂

### 10.2 数据源扩展

- 统一的数据访问器接口
- 新增数据源格式只需实现新的Accessor

### 10.3 插件扩展

- 标准化的插件接口
- 热插拔支持
- 插件市场（未来扩展）

### 10.4 分析功能扩展

- 基于插件机制
- 内置常用分析，自定义通过插件

---

## 11. 部署架构

### 11.1 单体应用架构

- 前后端分离，独立部署
- 后端：Node.js + Express
- 前端：Vue SPA，静态文件托管

### 11.2 打包策略

- 使用pkg将Node.js应用打包为可执行文件
- 包含Node.js运行时，无需额外安装
- 前端构建为静态资源，嵌入或独立部署

### 11.3 跨平台兼容

- Windows: .exe可执行文件
- Linux: 二进制可执行文件
- 配置文件和数据目录独立

---

## 12. 监控与日志

### 12.1 日志策略

- 分级日志：DEBUG, INFO, WARN, ERROR
- 结构化日志（JSON格式）
- 日志轮转和归档

### 12.2 监控指标

- API响应时间
- LLM调用成功率
- 插件执行成功率
- 内存和CPU使用率

---

## 13. 测试策略

### 13.1 单元测试

- 每个核心模块编写单元测试
- 覆盖率目标：>80%
- 使用Jest + ts-jest

### 13.2 集成测试

- API接口测试
- 插件集成测试
- 数据源连接测试

### 13.3 E2E测试

- 完整用户流程测试
- 多轮对话测试
- 数据分析流程测试

---

## 14. 版本管理

### 14.1 语义化版本

- MAJOR.MINOR.PATCH
- MAJOR: 不兼容的API变更
- MINOR: 向后兼容的功能新增
- PATCH: 向后兼容的问题修正

### 14.2 插件版本

- 插件独立版本号
- 兼容性声明
- 依赖管理

---

## 15. 下一步工作

完成总体架构设计后，需要继续完成：

1. **模块详细设计**: 每个模块的类图、时序图、接口定义
2. **数据库设计**: 完整的ER图、表结构、索引设计
3. **API接口规范**: RESTful API详细定义
4. **插件开发规范**: 插件接口、生命周期、示例代码
5. **前端组件设计**: 组件树、状态管理、路由设计

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03  
**作者**: GeoAI-UP Architecture Team  
**审核状态**: Draft
