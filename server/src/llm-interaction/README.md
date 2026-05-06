# LLM Interaction Layer

LLM 交互层负责与大语言模型进行交互，包括适配器管理、提示词管理、Agent 编排和工作流执行。

## 📁 目录结构

```
llm-interaction/
├── adapters/              # LLM 适配器
│   └── LLMAdapterFactory.ts      # 工厂模式创建不同 LLM 提供商的适配器
│
├── managers/            # 管理器
│   ├── PromptManager.ts          # 提示词模板管理（支持多语言、变量替换）
│   └── ConversationMemoryManager.ts  # 对话记忆管理（SQLite 持久化）
│
├── agents/              # Agent（智能体）
│   ├── GoalSplitterAgent.ts      # 目标拆分 Agent
│   └── TaskPlannerAgent.ts       # 任务规划 Agent
│
├── workflow/            # 工作流组件
│   ├── GeoAIGraph.ts             # LangGraph 工作流定义（核心协调器）
│   ├── PlaceholderResolver.ts    # 占位符解析器
│   ├── ServicePublisher.ts       # 服务发布器
│   └── SummaryGenerator.ts       # 总结生成器
│
├── handlers/            # 处理器
│   └── GeoAIStreamingHandler.ts  # SSE 流式响应处理器
│
└── index.ts             # 统一导出入口
```

## 🏗️ 架构说明

### 1. **Adapters（适配器层）**
- **职责**：抽象不同 LLM 提供商的 API 差异
- **实现**：工厂模式，根据配置动态创建适配器
- **支持**：Qwen、OpenAI、Anthropic 等
- **示例**：`LLMAdapterFactory.createAdapter(config)`

### 2. **Managers（管理层）**
- **PromptManager**：
  - 加载和管理提示词模板（从文件系统）
  - 支持多语言（en-US, zh-CN）
  - 变量替换和模板转换
  
- **ConversationMemoryManager**：
  - 管理对话历史
  - SQLite 持久化存储
  - 支持上下文窗口管理

### 3. **Agents（智能体层）**
- **GoalSplitterAgent**：
  - 将用户自然语言请求拆分为可执行的目标列表
  - 识别目标类型（visualization、analysis、general）
  
- **TaskPlannerAgent**：
  - 为每个目标制定执行计划
  - 两阶段决策：规则筛选 + LLM 选择
  - 终端节点验证（防止中间步骤使用可视化插件）

### 4. **Workflow（工作流层）**
- **GeoAIGraph**（核心协调器）：
  - 定义完整的 LangGraph 工作流
  - 串联所有节点：goalSplitter → taskPlanner → pluginExecutor → outputGenerator → summaryGenerator
  - 状态管理和错误处理
  
- **PlaceholderResolver**：
  - 解析执行计划中的占位符
  - 替换为上一步的实际结果
  
- **ServicePublisher**：
  - 发布 MVT/WMS 地图服务
  - 生成前端可用的服务 URL
  
- **SummaryGenerator**：
  - 生成分析结果的文本总结
  - 支持 LLM 生成和模板生成两种模式

### 5. **Handlers（处理器层）**
- **GeoAIStreamingHandler**：
  - 处理 SSE 流式响应
  - 实时推送工作流执行进度
  - 前端友好的事件格式

## 🔄 执行流程

```
用户请求："显示陕西省市级行政区划数据集"
         ↓
[API Controller] 接收请求，创建 conversation
         ↓
[GeoAIGraph] 启动工作流
         ↓
[GoalSplitterAgent] 
  → 调用 LLM 拆分目标
  → 返回: [{ id: 'goal_1', type: 'visualization', description: '...' }]
         ↓
[TaskPlannerAgent]
  → Stage 1: PluginCapabilityRegistry 筛选候选插件
  → Stage 2: LLM 从候选中选择最佳插件
  → 返回: ExecutionPlan { steps: [...], requiredPlugins: [...] }
         ↓
[PluginExecutor] (在 plugin-orchestration 层)
  → 执行计划中的每个步骤
  → 返回: ExecutionResult[]
         ↓
[ServicePublisher]
  → 发布 MVT/WMS 服务
  → 返回: VisualizationService[]
         ↓
[SummaryGenerator]
  → 生成文本总结
  → 保存到 ConversationMemory
         ↓
[SSE Handler] 流式推送所有结果到前端
```

## 🔒 ESLint 导入约束规则

### ✅ 允许的导入

1. **外部模块** → 通过 `llm-interaction/index.ts` 统一导入
   ```typescript
   // ✅ 正确
   import { GoalSplitterAgent, TaskPlannerAgent } from '../llm-interaction';
   ```

2. **workflow 内部** → 可以导入 adapters、managers、agents
   ```typescript
   // ✅ GeoAIGraph.ts 中可以这样导入
   import { PromptManager } from '../managers/PromptManager';
   import { GoalSplitterAgent } from '../agents/GoalSplitterAgent';
   ```

3. **agents 内部** → 可以导入 adapters、managers
   ```typescript
   // ✅ TaskPlannerAgent.ts 中可以这样导入
   import { PromptManager } from '../managers/PromptManager';
   import { LLMAdapterFactory } from '../adapters/LLMAdapterFactory';
   ```

4. **同层内部导入** → 允许（如 workflow 内部相互引用）
   ```typescript
   // ✅ GeoAIGraph.ts 中
   import { PlaceholderResolver } from './PlaceholderResolver';
   ```

### ❌ 禁止的导入

1. **Agents → Workflow 组件**（除了 GeoAIGraph）
   ```typescript
   // ❌ 错误：agents 不应该直接导入 workflow 组件
   import { ServicePublisher } from '../workflow/ServicePublisher';
   
   // ✅ 正确：通过 GeoAIGraph 协调
   ```

2. **Handlers → Agents/Workflow**
   ```typescript
   // ❌ 错误：handlers 不应直接导入 agents 或 workflow
   import { GoalSplitterAgent } from '../agents/GoalSplitterAgent';
   
   // ✅ 正确：handlers 只接收 graph 的执行结果
   ```

3. **Workflow 组件相互直接依赖**
   ```typescript
   // ❌ 错误：SummaryGenerator 不应直接导入 ServicePublisher
   import { ServicePublisher } from './ServicePublisher';
   
   // ✅ 正确：通过 GeoAIGraph 协调数据流
   ```

4. **直接导入子模块**（除非有特殊需求）
   ```typescript
   // ❌ 错误：应该通过 index.ts 统一导入
   import { PromptManager } from '../llm-interaction/managers/PromptManager';
   
   // ✅ 正确
   import { PromptManager } from '../llm-interaction';
   ```

### 📋 规则总结

| 导入源 | 目标 | 是否允许 | 说明 |
|--------|------|----------|------|
| 外部模块 | llm-interaction/* | ⚠️ 警告 | 应通过 index.ts 导入 |
| workflow/* | adapters/* | ✅ 允许 | workflow 需要 LLM 适配器 |
| workflow/* | managers/* | ✅ 允许 | workflow 需要提示词和记忆 |
| workflow/* | agents/* | ✅ 允许 | workflow 需要 Agent |
| agents/* | adapters/* | ✅ 允许 | agents 需要 LLM 适配器 |
| agents/* | managers/* | ✅ 允许 | agents 需要提示词 |
| agents/* | workflow/* | ❌ 禁止 | 防止循环依赖 |
| handlers/* | agents/* | ❌ 禁止 | 保持层次分离 |
| handlers/* | workflow/* | ❌ 禁止 | 保持层次分离 |
| 同层内部 | 同层内部 | ✅ 允许 | 合理引用 |

### 🎯 设计原则

1. **单向依赖**：adapters ← managers ← agents ← workflow ← handlers
2. **协调集中**：GeoAIGraph 作为核心协调器，避免组件间直接依赖
3. **统一出口**：外部模块只通过 `index.ts` 访问内部功能
4. **层次隔离**：handlers 不直接依赖业务逻辑，只处理流式输出

## 🚀 扩展指南

### 添加新 Agent

1. **创建 Agent 文件**：`agents/{Name}Agent.ts`
2. **实现 LangChain Runnable 接口**
3. **在 `index.ts` 中导出**
4. **在 GeoAIGraph 中注册为节点**

### 添加新 Workflow 组件

1. **创建组件文件**：`workflow/{Name}.ts`
2. **实现状态转换函数**：`(state: GeoAIStateType) => Promise<Partial<GeoAIStateType>>`
3. **在 `index.ts` 中导出**
4. **在 GeoAIGraph 中添加为节点**

### 添加新 LLM 适配器

1. **在 `LLMAdapterFactory.ts` 中添加新的 provider**
2. **实现统一的 LLM 接口**
3. **更新配置 schema**

## 📝 关键概念

### Agent vs Workflow Component

**Agent**：
- 主动调用 LLM 进行决策
- 例如：GoalSplitterAgent 调用 LLM 拆分目标
- 通常包含 prompt 模板和 LLM 调用逻辑

**Workflow Component**：
- 执行具体的业务逻辑
- 例如：ServicePublisher 发布地图服务
- 可能调用 LLM，也可能不调用

### GeoAIGraph 的核心作用

GeoAIGraph 是整个 LLM 交互层的**编排中心**：
- 定义节点和执行顺序
- 管理状态流转
- 处理错误和重试
- 集成所有组件

所有组件都应该通过 GeoAIGraph 协调，而不是直接相互调用。
