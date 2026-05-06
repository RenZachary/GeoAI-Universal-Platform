# Plugin Orchestration 快速参考

## 🚀 快速开始

### 添加新插件（3步）

```typescript
// Step 1: 创建执行器
// executor/analysis/MyExecutor.ts
export class MyExecutor implements IPluginExecutor {
  async execute(params: any) {
    // 实现业务逻辑
    return result;
  }
}

// Step 2: 添加到配置
// config/executor-config.ts
import { MyExecutor } from '../executor/analysis/MyExecutor';

export const BUILTIN_EXECUTORS: ExecutorClassRef[] = [
  // ... 现有配置
  {
    pluginId: 'my_plugin',
    executorClass: MyExecutor,
    requiresDb: true,
    requiresWorkspace: true
  }
];

// Step 3: 注册能力（可选，用于智能规划）
// registration/registerPluginCapabilities.ts
const capabilities = {
  // ... 现有能力
  'my_plugin': {
    executionCategory: 'computational',
    // ... 其他能力配置
  }
};
```

---

## 📁 目录速查

```
plugin-orchestration/
├── config/              # 纯配置数据
│   └── executor-config.ts          ← 添加新执行器在这里
│
├── registration/        # 注册逻辑
│   ├── registerExecutors.ts        ← 自动读取config
│   └── registerPluginCapabilities.ts ← 添加新能力在这里
│
├── registry/            # 运行时管理
│   ├── ExecutorRegistry.ts         ← 查询执行器
│   ├── PluginCapabilityRegistry.ts ← 筛选插件
│   └── ToolRegistry.ts             ← 管理工具
│
└── tools/               # 工具转换
    └── PluginToolWrapper.ts        ← Plugin → LangChain Tool
```

---

## 🔍 常用API

### 注册表查询

```typescript
import { 
  ExecutorRegistryInstance,
  PluginCapabilityRegistry,
  ToolRegistryInstance 
} from './plugin-orchestration';

// 获取执行器
const executor = ExecutorRegistryInstance.getExecutor(
  'buffer_analysis', 
  db, 
  workspaceBase
);

// 检查执行器是否存在
const exists = ExecutorRegistryInstance.hasExecutor('buffer_analysis');

// 根据能力筛选插件
const plugins = PluginCapabilityRegistry.filterByCapability({
  expectedCategory: 'visualization',
  dataFormat: 'vector'
});

// 获取所有注册的插件ID
const allPlugins = PluginCapabilityRegistry.getAllPluginIds();

// 获取工具
const tool = ToolRegistryInstance.getTool('buffer_analysis');

// 获取所有工具
const allTools = ToolRegistryInstance.getAllTools();
```

### 动态注册

```typescript
import { 
  registerExecutor, 
  unregisterExecutor 
} from './plugin-orchestration';

// 动态注册执行器
registerExecutor('custom_plugin', (db, workspace) => {
  return new CustomExecutor(db, workspace);
});

// 动态注销
unregisterExecutor('custom_plugin');
```

---

## 🎯 典型场景

### 场景1: TaskPlanner 筛选插件

```typescript
// 用户需求："显示人口分布"
const criteria = {
  expectedCategory: 'visualization',
  dataFormat: 'vector',
  geometryType: 'Polygon',
  hasNumericField: true,
  isTerminalAllowed: true
};

const candidates = PluginCapabilityRegistry.filterByCapability(criteria);
// 返回: ['choropleth_renderer', 'categorical_renderer', ...]

// LLM 从候选中选择最合适的
const selected = await llm.choose(candidates, userRequest);
```

### 场景2: 执行插件

```typescript
// LangChain Agent 调用工具
const tool = ToolRegistryInstance.getTool('choropleth_renderer');
const result = await tool.invoke({
  data_reference: 'data_123',
  field: 'population',
  colors: ['#ff0000', '#00ff00']
});

// 内部流程:
// 1. PluginToolWrapper.wrapPlugin() 创建工具
// 2. 工具被调用时，通过 ExecutorRegistry 获取执行器
// 3. 执行器执行业务逻辑
// 4. 返回结果
```

### 场景3: 启动时注册

```typescript
// server/src/index.ts
import { 
  registerAllExecutors,
  registerAllPluginCapabilities,
  ToolRegistryInstance,
  BUILT_IN_PLUGINS
} from './plugin-orchestration';

async function initialize() {
  // 1. 注册执行器
  registerAllExecutors(db, WORKSPACE_BASE);
  
  // 2. 注册插件能力
  registerAllPluginCapabilities();
  
  // 3. 注册工具
  await ToolRegistryInstance.registerPlugins(BUILT_IN_PLUGINS);
  
  console.log('Plugin orchestration initialized!');
}
```

---

## ⚠️ 常见错误

### ❌ 错误1: 直接导入子模块

```typescript
// 错误
import { ExecutorRegistryInstance } from 
  '../plugin-orchestration/registry/ExecutorRegistry';

// 正确
import { ExecutorRegistryInstance } from 
  '../plugin-orchestration';
```

### ❌ 错误2: 在插件中导入执行器

```typescript
// 错误 - plugins 不应该依赖 executor
import { BufferAnalysisExecutor } from '../executor/...';

// 正确 - 插件只包含元数据
export const BufferAnalysisPlugin: Plugin = {
  id: 'buffer_analysis',
  name: 'Buffer Analysis',
  // ...
};
```

### ❌ 错误3: 在业务代码中使用 registration

```typescript
// 错误 - registration 仅用于启动时
import { registerAllExecutors } from 
  '../plugin-orchestration/registration/registerExecutors';

// 正确 - 通过 index.ts 导出
import { registerAllExecutors } from 
  '../plugin-orchestration';
```

---

## 🔧 调试技巧

### 查看已注册的执行器

```typescript
console.log('Registered executors:', 
  ExecutorRegistryInstance.getRegisteredPluginIds()
);
// 输出: ['buffer_analysis', 'overlay_analysis', ...]
```

### 查看插件能力分类

```typescript
const byCategory = PluginCapabilityRegistry.getPluginsByCategory();
console.log('Plugins by category:', byCategory);
// 输出: {
//   computational: ['buffer_analysis', ...],
//   visualization: ['choropleth_renderer', ...],
//   ...
// }
```

### 查看工具列表

```typescript
const tools = ToolRegistryInstance.listToolsWithMetadata();
console.log('Available tools:', tools.map(t => t.name));
```

---

## 📊 配置示例

### 需要数据库和工作区的执行器

```typescript
{
  pluginId: 'buffer_analysis',
  executorClass: BufferAnalysisExecutor,
  requiresDb: true,           // 需要数据库连接
  requiresWorkspace: true     // 需要工作区路径
}
```

### 只需要工作区的执行器

```typescript
{
  pluginId: 'heatmap',
  executorClass: HeatmapExecutor,
  requiresDb: false,          // 不需要数据库
  requiresWorkspace: true     // 需要工作区路径
}
```

### 什么都不需要的执行器

```typescript
{
  pluginId: 'simple_executor',
  executorClass: SimpleExecutor,
  requiresDb: false,
  requiresWorkspace: false
}
```

---

## 🎓 核心概念

### Registry vs Registration

| 概念 | 职责 | 生命周期 |
|------|------|---------|
| **Registry** | 运行时管理（查询、注册、注销） | 应用整个运行期间 |
| **Registration** | 初始化时批量注册 | 仅在启动时调用一次 |

### Config vs Registration

| 概念 | 内容 | 示例 |
|------|------|------|
| **Config** | 纯数据（映射关系、常量） | `BUILTIN_EXECUTORS` |
| **Registration** | 注册逻辑（如何注册） | `registerAllExecutors()` |

### Executor vs Plugin

| 概念 | 职责 | 位置 |
|------|------|------|
| **Plugin** | 元数据定义（名称、schema、描述） | `plugins/` |
| **Executor** | 实际业务逻辑实现 | `executor/` |

---

## 🔗 相关文档

- [PLUGIN-ORCHESTRATION-LAYER-ARCHITECTURE.md](../architecture/PLUGIN-ORCHESTRATION-LAYER-ARCHITECTURE.md) - 完整文档
- [PLUGIN-ORCHESTRATION-REFACTORING-SUMMARY.md](./PLUGIN-ORCHESTRATION-REFACTORING-SUMMARY.md) - 重构总结
- [PLUGIN-ORCHESTRATION-ARCHITECTURE-DIAGRAM.md](../architecture/PLUGIN-ORCHESTRATION-ARCHITECTURE-DIAGRAM.md) - 架构关系图

---

## 💡 提示

> **记住这个原则**: 
> - `config/` = 数据
> - `registration/` = 动作
> - `registry/` = 管理
> - `tools/` = 转换
> - `executor/` = 实现
