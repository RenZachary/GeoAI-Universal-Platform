# 插件调度层详细设计

## 1. 模块职责

- 加载和管理插件（内置+自定义）
- 执行插件任务
- 聚合多个插件的执行结果
- 管理插件生命周期

---

## 2. 核心类设计

### 2.1 PluginLoader（插件加载器）

```typescript
class PluginLoader {
  private registry: PluginRegistry;
  private validator: PluginValidator;
  
  /**
   * 加载所有内置插件
   */
  async loadBuiltInPlugins(): Promise<Plugin[]>;
  
  /**
   * 加载自定义插件
   */
  async loadCustomPlugins(): Promise<Plugin[]>;
  
  /**
   * 加载单个插件
   */
  async loadPlugin(pluginPath: string): Promise<Plugin>;
  
  /**
   * 验证插件
   */
  private validatePlugin(plugin: Plugin): ValidationResult;
}

interface PluginRegistry {
  register(plugin: Plugin): void;
  unregister(pluginId: string): void;
  getPlugin(pluginId: string): Plugin | undefined;
  getAllPlugins(): Plugin[];
  getPluginsByCategory(category: string): Plugin[];
}
```

### 2.2 PluginExecutor（插件执行器）

```typescript
class PluginExecutor {
  private dbAccessorFactory: DataAccessorFactory;
  
  /**
   * 执行插件
   */
  async execute(
    step: ExecutionStep, 
    context: ExecutionContext
  ): Promise<ExecutionResult>;
  
  /**
   * 并行执行多个步骤
   */
  async executeParallel(
    steps: ExecutionStep[], 
    context: ExecutionContext
  ): Promise<ExecutionResult[]>;
  
  /**
   * 按依赖顺序执行
   */
  async executeWithDependencies(
    plan: ExecutionPlan, 
    context: ExecutionContext
  ): Promise<ExecutionResult[]>;
}

interface ExecutionContext {
  conversationId: string;
  dataSources: NativeData[];
  previousResults: Map<string, ExecutionResult>;
  tempDir: string;
  language: string;
}

interface ExecutionResult {
  stepId: string;
  success: boolean;
  data?: NativeData | ServiceMetadata;
  error?: Error;
  executionTime: number;
  metadata: Record<string, any>;
}
```

### 2.3 ResultAggregator（结果聚合器）

```typescript
class ResultAggregator {
  /**
   * 聚合多个执行结果
   */
  aggregate(results: ExecutionResult[]): AggregatedResult;
  
  /**
   * 生成最终响应
   */
  generateResponse(
    aggregated: AggregatedResult, 
    language: string
  ): ChatResponse;
}

interface AggregatedResult {
  goals: GoalResult[];
  summary: string;
  visualizations: VisualizationInfo[];
  reports: ReportInfo[];
  errors: Error[];
}

interface GoalResult {
  goalId: string;
  success: boolean;
  results: ExecutionResult[];
  visualization?: VisualizationInfo;
  report?: ReportInfo;
}
```

### 2.4 PluginLifecycleManager（插件生命周期管理器）

```typescript
class PluginLifecycleManager {
  private observers: PluginLifecycleObserver[] = [];
  
  /**
   * 启动插件
   */
  async startPlugin(pluginId: string): Promise<void>;
  
  /**
   * 停用插件
   */
  async stopPlugin(pluginId: string): Promise<void>;
  
  /**
   * 删除插件
   */
  async removePlugin(pluginId: string): Promise<void>;
  
  /**
   * 注册观察者
   */
  addObserver(observer: PluginLifecycleObserver): void;
  
  /**
   * 通知观察者
   */
  private notify(event: PluginLifecycleEvent, plugin: Plugin): void;
}

interface PluginLifecycleObserver {
  onPluginLoaded(plugin: Plugin): void;
  onPluginStarted(plugin: Plugin): void;
  onPluginStopped(plugin: Plugin): void;
  onPluginRemoved(plugin: Plugin): void;
  onPluginError(plugin: Plugin, error: Error): void;
}

type PluginLifecycleEvent = 'loaded' | 'started' | 'stopped' | 'removed' | 'error';
```

**插件安全机制**:

虽然需求未强制要求，但建议实现以下安全措施：

1. **插件签名验证**: 确保插件来源可信
2. **沙箱执行环境** (可选): 使用Node.js vm模块或worker_threads隔离插件执行
3. **权限控制**: 限制插件的文件访问范围、网络访问等
4. **资源限制**: 设置CPU时间、内存使用上限
5. **超时机制**: 插件执行超过设定时间自动终止

```typescript
// 示例：简单的沙箱执行
import { VM } from 'vm2';

class SandboxedPluginExecutor {
  executePlugin(pluginCode: string, input: PluginInput): Promise<PluginOutput> {
    const sandbox = new VM({
      timeout: 30000,  // 30秒超时
      sandbox: {
        console: console,
        // 只暴露必要的API
      }
    });
    
    return sandbox.run(pluginCode);
  }
}
```

---

### 2.5 PluginFactory（插件工厂）

```typescript
class PluginFactory {
  /**
   * 加载插件文件
   */
  async loadPlugin(pluginPath: string): Promise<Plugin>;
  
  /**
   * 创建内置插件实例
   */
  createBuiltInPlugin(pluginName: string): Plugin;
  
  /**
   * 验证插件兼容性
   */
  validateCompatibility(plugin: Plugin): boolean;
}
```

---

## 3. 插件接口定义

```typescript
interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  category: PluginCategory;
  author?: string;
  
  /**
   * 插件元数据
   */
  metadata: PluginMetadata;
  
  /**
   * 初始化插件
   */
  initialize(config?: PluginConfig): Promise<void>;
  
  /**
   * 执行插件功能
   */
  execute(input: PluginInput): Promise<PluginOutput>;
  
  /**
   * 销毁插件
   */
  destroy(): Promise<void>;
  
  /**
   * 获取插件状态
   */
  getStatus(): PluginStatus;
}

interface PluginMetadata {
  inputs: PluginParameter[];
  outputs: PluginParameter[];
  supportedDataTypes: DataType[];
  requiredPermissions: Permission[];
}

interface PluginParameter {
  name: string;
  type: ParameterType;
  required: boolean;
  description?: string;
  defaultValue?: any;
}

type ParameterType = 
  | 'NativeData' 
  | 'number' 
  | 'string' 
  | 'boolean' 
  | 'array' 
  | 'object';

interface PluginConfig {
  [key: string]: any;
}

interface PluginInput {
  data: NativeData[];
  parameters: Record<string, any>;
  context: ExecutionContext;
}

interface PluginOutput {
  data: NativeData | ServiceMetadata;
  metadata: Record<string, any>;
}

type PluginStatus = 'initialized' | 'active' | 'inactive' | 'error';

enum PluginCategory {
  SPATIAL_ANALYSIS = 'spatial_analysis',
  DATA_TRANSFORM = 'data_transform',
  VISUALIZATION = 'visualization',
  REPORT_GENERATION = 'report_generation',
  UTILITY = 'utility',
}

enum Permission {
  READ_FILE = 'read_file',
  WRITE_FILE = 'write_file',
  ACCESS_DATABASE = 'access_database',
  CREATE_TEMP = 'create_temp',
  PUBLISH_SERVICE = 'publish_service',
  NETWORK_ACCESS = 'network_access',
}
```

---

## 4. 插件执行流程

### 4.1 单次插件执行

```
PluginExecutor.execute(step, context)
    ↓
获取插件实例: registry.getPlugin(step.pluginName)
    ↓
验证插件状态: plugin.getStatus() === 'active'
    ↓
准备输入数据: PluginInput
    ↓
执行插件: plugin.execute(input)
    ↓
验证输出: PluginOutput
    ↓
记录执行结果: ExecutionResult
    ↓
返回结果
```

### 4.2 并行执行多个步骤

```typescript
class PluginExecutor {
  async executeParallel(
    steps: ExecutionStep[], 
    context: ExecutionContext
  ): Promise<ExecutionResult[]> {
    // 过滤出无依赖的步骤
    const independentSteps = steps.filter(step => 
      step.dependencies.length === 0
    );
    
    // 并行执行
    const promises = independentSteps.map(step => 
      this.executeStep(step, context)
    );
    
    return await Promise.all(promises);
  }
  
  async executeWithDependencies(
    plan: ExecutionPlan, 
    context: ExecutionContext
  ): Promise<ExecutionResult[]> {
    const results: Map<string, ExecutionResult> = new Map();
    
    // 拓扑排序执行
    const executed = new Set<string>();
    
    while (executed.size < plan.steps.length) {
      // 找到可执行的步骤（所有依赖已执行）
      const readySteps = plan.steps.filter(step => 
        !executed.has(step.id) &&
        step.dependencies.every(dep => executed.has(dep))
      );
      
      if (readySteps.length === 0) {
        throw new Error('Circular dependency detected');
      }
      
      // 并行执行就绪的步骤
      const promises = readySteps.map(async step => {
        const result = await this.executeStep(step, context);
        results.set(step.id, result);
        executed.add(step.id);
        return result;
      });
      
      await Promise.all(promises);
    }
    
    return Array.from(results.values());
  }
  
  private async executeStep(
    step: ExecutionStep, 
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      // 获取插件
      const plugin = this.registry.getPlugin(step.pluginName);
      if (!plugin) {
        throw new Error(`Plugin not found: ${step.pluginName}`);
      }
      
      if (plugin.getStatus() !== 'active') {
        throw new Error(`Plugin is not active: ${step.pluginName}`);
      }
      
      // 准备输入
      const input = await this.prepareInput(step, context);
      
      // 执行插件
      const output = await plugin.execute(input);
      
      const executionTime = Date.now() - startTime;
      
      return {
        stepId: step.id,
        success: true,
        data: output.data,
        executionTime,
        metadata: output.metadata,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        stepId: step.id,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        executionTime,
        metadata: {},
      };
    }
  }
}
```

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
