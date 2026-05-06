# Plugin Orchestration Layer

插件编排层负责管理插件的定义、注册、执行和工具化。

## 📁 目录结构

```
plugin-orchestration/
├── plugins/              # 插件定义（元数据）
│   ├── analysis/        # 分析类插件
│   ├── visualization/   # 可视化类插件
│   └── reporting/       # 报告类插件
│
├── executor/            # 插件执行器（实现逻辑）
│   ├── analysis/        # 分析执行器
│   ├── visualization/   # 可视化执行器
│   └── reporting/       # 报告执行器
│
├── registry/            # 注册表（单例管理类）
│   ├── ExecutorRegistry.ts           # 执行器注册表
│   ├── ToolRegistry.ts               # 工具注册表
│   └── PluginCapabilityRegistry.ts   # 插件能力注册表
│
├── registration/        # 批量注册配置
│   ├── index.ts                        # 注册函数统一导出
│   ├── registerExecutors.ts              # 注册所有执行器
│   └── registerPluginCapabilities.ts     # 注册所有插件能力
│
├── config/              # 纯配置数据
│   ├── index.ts                        # 配置数据统一导出
│   └── executor-config.ts              # 执行器配置数据
│
├── loader/              # 插件加载器
│   └── CustomPluginLoader.ts    # 自定义插件加载器
│
├── tools/               # 工具封装
│   └── PluginToolWrapper.ts       # LangChain 工具包装器
│
├── utils/               # 工具函数
└── index.ts             # 统一导出入口
```

## 🏗️ 架构说明

### 1. **Plugins（插件定义）**
- 位置：`plugins/`
- 职责：定义插件的元数据（名称、版本、输入输出schema、能力等）
- 示例：`ChoroplethRendererPlugin.ts`

### 2. **Executors（执行器）**
- 位置：`executor/`
- 职责：实现插件的具体业务逻辑
- 示例：`ChoroplethExecutor.ts`

### 3. **Registries（注册表）**
- 位置：`registry/`
- 职责：管理运行时对象的注册和查询（单例模式）
- 三个注册表：
  - `ExecutorRegistry`: 管理执行器实例
  - `ToolRegistry`: 管理 LangChain 工具
  - `PluginCapabilityRegistry`: 管理插件能力元数据（用于智能规划）

### 4. **Config（配置数据）**
- 位置：`config/`
- 职责：存储纯配置数据，不包含业务逻辑
- 示例：`executor-config.ts` - 定义插件ID与执行器类的映射关系
- 特点：可被registration文件引用，用于简化注册逻辑

### 5. **Registration（批量注册）**
- 位置：`registration/`
- 职责：在应用启动时批量注册对象到注册表
- 命名规范：`register*.ts`（动词开头，表示执行注册操作）
- 两个注册函数：
  - `registerExecutors()`: 使用config中的配置注册所有执行器到 ExecutorRegistry
  - `registerPluginCapabilities()`: 注册所有插件能力到 PluginCapabilityRegistry

### 6. **Loader（加载器）**
- 位置：`loader/`
- 职责：动态加载自定义插件（从文件系统）
- 示例：`CustomPluginLoader.ts`

## 🔄 启动流程

```typescript
// server/src/index.ts

// 1. 注册执行器（用于实际执行）
registerAllExecutors(db, WORKSPACE_BASE);

// 2. 注册插件能力（用于 TaskPlanner 智能筛选）
registerAllPluginCapabilities();

// 3. 加载自定义插件
const customPluginLoader = new CustomPluginLoader(WORKSPACE_BASE);
await customPluginLoader.loadAllPlugins();
```

## 📝 命名规范

| 类型 | 命名模式 | 示例 |
|------|---------|------|
| 注册表类 | `*Registry.ts` | `ExecutorRegistry.ts` |
| 注册函数 | `register*.ts` | `registerExecutors.ts` |
| 加载器类 | `*Loader.ts` | `CustomPluginLoader.ts` |
| 插件定义 | `*Plugin.ts` | `ChoroplethRendererPlugin.ts` |
| 执行器类 | `*Executor.ts` | `ChoroplethExecutor.ts` |

## 🔒 ESLint 导入约束规则

为了保证架构清晰和防止循环依赖，ESLint 配置了以下导入约束：

### ✅ 允许的导入

1. **外部模块** → 通过 `plugin-orchestration/index.ts` 统一导入
   ```typescript
   // ✅ 正确
   import { CustomPluginLoader, registerAllExecutors } from '../plugin-orchestration';
   ```

2. **registration 文件** → 可以直接导入 registry、executor、plugins
   ```typescript
   // ✅ registration/registerExecutors.ts 中可以这样导入
   import { ExecutorRegistryInstance } from '../registry/ExecutorRegistry';
   import { BufferAnalysisExecutor } from '../executor/analysis/BufferAnalysisExecutor';
   ```

3. **同层内部导入** → 允许（如 executor 内部相互引用）
   ```typescript
   // ✅ executor/visualization/ChoroplethExecutor.ts 中
   import { BaseRendererExecutor } from './BaseRendererExecutor';
   ```

### ❌ 禁止的导入

1. **插件定义 → 执行器**
   ```typescript
   // ❌ 错误：plugins 不应该导入 executor
   import { ChoroplethExecutor } from '../executor/visualization/ChoroplethExecutor';
   
   // ✅ 正确：插件只包含元数据，不依赖执行逻辑
   ```

2. **执行器 → 插件定义**
   ```typescript
   // ❌ 错误：executor 不应该导入 plugin
   import { ChoroplethRendererPlugin } from '../plugins/visualization/ChoroplethRendererPlugin';
   
   // ✅ 正确：通过 Plugin 类型接口解耦
   import type { Plugin } from '../../core';
   ```

3. **业务代码 → registration 文件**
   ```typescript
   // ❌ 错误：registration 仅用于启动时批量注册
   import { registerAllExecutors } from '../plugin-orchestration/registration/registerExecutors';
   
   // ✅ 正确：通过 index.ts 导出
   import { registerAllExecutors } from '../plugin-orchestration';
   ```

4. **直接导入子模块**（除非在 registration 文件中）
   ```typescript
   // ❌ 错误：应该通过 index.ts 统一导入
   import { ToolRegistryInstance } from '../plugin-orchestration/registry/ToolRegistry';
   
   // ✅ 正确
   import { ToolRegistryInstance } from '../plugin-orchestration';
   ```

### 📋 规则总结

| 导入源 | 目标 | 是否允许 | 说明 |
|--------|------|----------|------|
| 外部模块 | plugin-orchestration/* | ⚠️ 警告 | 应通过 index.ts 导入 |
| registration/* | registry/* | ✅ 允许 | 注册需要访问注册表 |
| registration/* | executor/* | ✅ 允许 | 注册需要实例化执行器 |
| registration/* | plugins/* | ✅ 允许 | 注册需要读取插件元数据 |
| plugins/* | executor/* | ❌ 禁止 | 插件不应依赖执行逻辑 |
| executor/* | plugins/* | ❌ 禁止 | 执行器不应依赖插件定义 |
| 业务代码 | registration/* | ❌ 禁止 | registration 仅用于启动 |
| 同层内部 | 同层内部 | ✅ 允许 | 如 executor 内部引用 |

### 🎯 设计原则

1. **单向依赖**：plugins → (无) ← executor，两者都独立
2. **注册集中**：所有批量注册逻辑集中在 `registration/` 目录
3. **统一出口**：外部模块只通过 `index.ts` 访问内部功能
4. **层次隔离**：防止跨层直接依赖，保持架构清晰

## 🔑 关键概念

### ExecutorRegistry vs PluginCapabilityRegistry

**ExecutorRegistry**（已实现）:
- 注册执行器实例
- 用于实际执行插件功能
- 在 `PluginToolWrapper` 中通过 pluginId 查找执行器

**PluginCapabilityRegistry**（新增）:
- 注册插件能力元数据
- 用于 TaskPlanner 在规划阶段进行智能筛选
- 支持按类别、数据格式、几何类型等条件过滤

### 为什么需要两个注册？

```
用户请求："显示陕西省市级行政区划数据集"
         ↓
Goal Splitter: 识别为 visualization 类型
         ↓
TaskPlanner Stage 1: 
  PluginCapabilityRegistry.filterByCapability({
    expectedCategory: 'visualization'
  })
  → 返回: ['choropleth_renderer', 'uniform_color_renderer', ...]
         ↓
TaskPlanner Stage 2: 
  LLM 从候选列表中选择最合适的插件
         ↓
PluginToolWrapper:
  ExecutorRegistry.getExecutor('choropleth_renderer')
  → 返回: ChoroplethExecutor 实例
         ↓
执行器执行实际业务逻辑
```

## 🚀 扩展指南

### 添加新插件

1. **创建插件定义**：`plugins/{category}/{Name}Plugin.ts`
2. **创建执行器**：`executor/{category}/{Name}Executor.ts`
3. **在 `plugins/index.ts` 中导出**
4. **在 `config/executor-config.ts` 中添加配置**
   ```typescript
   {
     pluginId: 'your_plugin_id',
     executorClass: YourExecutor,
     requiresDb: true,
     requiresWorkspace: true
   }
   ```
5. **在 `registration/registerPluginCapabilities.ts` 中注册能力**

### 添加新注册表

1. **创建注册表类**：`registry/{Name}Registry.ts`
2. **实现单例模式和注册/查询方法**
3. **创建批量注册函数**：`registration/register{Name}s.ts`
4. **在 `registration/index.ts` 中导出**
5. **在 `index.ts` 中导出**
6. **在 `server/src/index.ts` 中调用注册函数**
