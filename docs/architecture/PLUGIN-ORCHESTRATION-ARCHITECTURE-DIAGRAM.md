# Plugin Orchestration 架构关系图

## 📊 整体架构

```mermaid
graph TB
    subgraph "启动阶段"
        A[server/src/index.ts] -->|调用| B[registerAllPluginCapabilities]
        A -->|调用| C[registerAllExecutors]
        A -->|调用| D[ToolRegistry.registerPlugins]
    end
    
    subgraph "配置层 config/"
        E[executor-config.ts<br/>纯配置数据]
    end
    
    subgraph "注册层 registration/"
        B -->|使用| F[PluginCapabilityRegistry]
        C -->|读取| E
        C -->|注册到| G[ExecutorRegistry]
    end
    
    subgraph "注册表层 registry/"
        F[PluginCapabilityRegistry<br/>能力元数据管理]
        G[ExecutorRegistry<br/>执行器查找管理]
        H[ToolRegistry<br/>LangChain工具管理]
    end
    
    subgraph "工具层 tools/"
        I[PluginToolWrapper<br/>Plugin → LangChain Tool]
    end
    
    subgraph "执行层 executor/"
        J[BufferAnalysisExecutor]
        K[ChoroplethExecutor]
        L[其他执行器...]
    end
    
    D -->|注册| H
    I -->|执行时查询| G
    G -->|创建实例| J
    G -->|创建实例| K
    G -->|创建实例| L
    
    style E fill:#e1f5ff
    style F fill:#fff4e1
    style G fill:#fff4e1
    style H fill:#fff4e1
```

---

## 🔄 工作流程

### 1. 启动阶段（Initialization）

```mermaid
sequenceDiagram
    participant App as Application
    participant RegCap as registerPluginCapabilities
    participant CapReg as PluginCapabilityRegistry
    participant RegExec as registerAllExecutors
    participant ExecConfig as executor-config.ts
    participant ExecReg as ExecutorRegistry
    participant ToolReg as ToolRegistry
    
    App->>RegCap: 调用注册能力
    RegCap->>CapReg: 注册所有插件能力
    Note over CapReg: 存储插件元数据<br/>(类别、输入输出等)
    
    App->>RegExec: 调用注册执行器
    RegExec->>ExecConfig: 读取配置
    ExecConfig-->>RegExec: 返回执行器映射
    RegExec->>ExecReg: 批量注册执行器工厂
    Note over ExecReg: 存储 pluginId → Factory
    
    App->>ToolReg: 注册所有插件为工具
    Note over ToolReg: Plugin → LangChain Tool
```

### 2. 规划阶段（Planning）

```mermaid
sequenceDiagram
    participant User as 用户请求
    participant Planner as TaskPlanner
    participant CapReg as PluginCapabilityRegistry
    
    User->>Planner: "显示陕西省人口分布"
    Planner->>CapReg: filterByCapability({<br/>  category: 'visualization'<br/>})
    CapReg-->>Planner: ['choropleth_renderer', ...]
    Note over Planner: Stage 1: 能力筛选<br/>Stage 2: LLM选择最佳插件
```

### 3. 执行阶段（Execution）

```mermaid
sequenceDiagram
    participant Agent as LangChain Agent
    participant ToolReg as ToolRegistry
    participant Wrapper as PluginToolWrapper
    participant ExecReg as ExecutorRegistry
    participant Executor ChoroplethExecutor
    
    Agent->>ToolReg: 获取工具 'choropleth_renderer'
    ToolReg-->>Agent: 返回 LangChain Tool
    
    Agent->>Wrapper: tool.invoke(params)
    Wrapper->>ExecReg: getExecutor('choropleth_renderer')
    ExecReg->>Executor: factory(db, workspace)
    Executor-->>ExecReg: 返回执行器实例
    ExecReg-->>Wrapper: 返回执行器
    
    Wrapper->>Executor: execute(params)
    Executor-->>Wrapper: 返回结果
    Wrapper-->>Agent: 返回执行结果
```

---

## 🏗️ 分层架构

```mermaid
graph LR
    subgraph "Layer 1: Configuration (配置层)"
        A[executor-config.ts<br/>纯数据，无逻辑]
    end
    
    subgraph "Layer 2: Registration (注册层)"
        B[registerExecutors.ts<br/>读取配置并注册]
        C[registerPluginCapabilities.ts<br/>注册能力元数据]
    end
    
    subgraph "Layer 3: Registry (注册表层)"
        D[ExecutorRegistry<br/>运行时管理]
        E[PluginCapabilityRegistry<br/>能力查询]
        F[ToolRegistry<br/>工具管理]
    end
    
    subgraph "Layer 4: Tools (工具层)"
        G[PluginToolWrapper<br/>转换和包装]
    end
    
    subgraph "Layer 5: Executors (执行层)"
        H[具体执行器实现]
    end
    
    A -->|被读取| B
    B -->|注册到| D
    C -->|注册到| E
    G -->|查询| D
    G -->|查询| F
    D -->|创建| H
    
    style A fill:#e1f5ff
    style B fill:#fff9e1
    style C fill:#fff9e1
    style D fill:#ffe1e1
    style E fill:#ffe1e1
    style F fill:#ffe1e1
```

---

## 📦 模块依赖关系

```mermaid
graph TD
    subgraph "外部模块"
        Ext[server/src/index.ts<br/>app.ts<br/>其他业务代码]
    end
    
    subgraph "plugin-orchestration/index.ts"
        Main[统一导出入口]
    end
    
    subgraph "registration/"
        RegIdx[index.ts]
        RegExec[registerExecutors.ts]
        RegCap[registerPluginCapabilities.ts]
    end
    
    subgraph "config/"
        ConfigIdx[index.ts]
        ExecConfig[executor-config.ts]
    end
    
    subgraph "registry/"
        ExecReg[ExecutorRegistry.ts]
        CapReg[PluginCapabilityRegistry.ts]
        ToolReg[ToolRegistry.ts]
    end
    
    subgraph "tools/"
        Wrapper[PluginToolWrapper.ts]
    end
    
    Ext -->|只通过| Main
    Main --> RegIdx
    Main --> ConfigIdx
    Main --> ExecReg
    Main --> CapReg
    Main --> ToolReg
    Main --> Wrapper
    
    RegIdx --> RegExec
    RegIdx --> RegCap
    
    RegExec --> ExecConfig
    RegExec --> ExecReg
    
    RegCap --> CapReg
    
    Wrapper --> ExecReg
    Wrapper --> ToolReg
    
    ExecConfig -.->|导入执行器类| Executors[executor/*]
    
    style Ext fill:#f0f0f0
    style Main fill:#d4edda
    style ExecConfig fill:#e1f5ff
```

---

## 🔑 关键设计模式

### 1. **单例模式 (Singleton)**
```typescript
// 三个注册表都使用单例模式
ExecutorRegistry.getInstance()
PluginCapabilityRegistry (静态方法)
ToolRegistry.getInstance()
```

### 2. **工厂模式 (Factory)**
```typescript
// ExecutorRegistry 存储工厂函数
type ExecutorFactory = (db, workspaceBase) => IPluginExecutor;

// 使用时创建实例
const executor = factory(db, workspaceBase);
```

### 3. **策略模式 (Strategy)**
```typescript
// 不同执行器实现相同接口
interface IPluginExecutor {
  execute(params: any): Promise<any>;
}

// BufferAnalysisExecutor, ChoroplethExecutor 等都是策略
```

### 4. **配置驱动 (Configuration-Driven)**
```typescript
// 配置与逻辑分离
BUILTIN_EXECUTORS.map(config => createFactory(config))
```

---

## 📋 文件职责对照表

| 文件路径 | 层级 | 职责 | 是否包含逻辑 |
|---------|------|------|------------|
| `config/executor-config.ts` | 配置层 | 定义 pluginId → Executor 映射 | ❌ 纯数据 |
| `config/index.ts` | 配置层 | 统一导出配置 | ❌ 仅导出 |
| `registration/registerExecutors.ts` | 注册层 | 读取配置并注册执行器 | ✅ 注册逻辑 |
| `registration/registerPluginCapabilities.ts` | 注册层 | 注册插件能力元数据 | ✅ 注册逻辑 |
| `registration/index.ts` | 注册层 | 统一导出注册函数 | ❌ 仅导出 |
| `registry/ExecutorRegistry.ts` | 注册表层 | 管理执行器实例的查找 | ✅ 运行时管理 |
| `registry/PluginCapabilityRegistry.ts` | 注册表层 | 管理能力元数据的查询 | ✅ 运行时管理 |
| `registry/ToolRegistry.ts` | 注册表层 | 管理LangChain工具的注册 | ✅ 运行时管理 |
| `tools/PluginToolWrapper.ts` | 工具层 | 将Plugin转换为LangChain Tool | ✅ 转换逻辑 |

---

## ✨ 重构优势

### Before (重构前)
- ❌ 代码重复：两个完全相同的文件
- ❌ 职责不清：config目录包含注册逻辑
- ❌ 维护困难：修改需要改多处
- ❌ 扩展繁琐：添加新执行器需修改注册代码

### After (重构后)
- ✅ 单一职责：config只存数据，registration只做注册
- ✅ 配置驱动：添加新执行器只需在config中加一行
- ✅ 易于维护：配置和逻辑分离
- ✅ 清晰架构：层次分明，依赖单向

---

## 🎯 最佳实践

1. **外部代码只通过 `index.ts` 导入**
   ```typescript
   // ✅ 正确
   import { registerAllExecutors } from '../plugin-orchestration';
   
   // ❌ 错误
   import { registerAllExecutors } from '../plugin-orchestration/registration/registerExecutors';
   ```

2. **配置与逻辑分离**
   - `config/`: 只包含数据和类型定义
   - `registration/`: 只包含注册逻辑
   - 不要混用

3. **注册表使用单例**
   - 确保全局只有一个实例
   - 避免状态不一致

4. **遵循依赖方向**
   - config ← registration ← registry ← tools
   - 不要反向依赖
