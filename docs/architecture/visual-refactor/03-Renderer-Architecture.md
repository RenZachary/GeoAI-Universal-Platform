# Phase 3: 渲染器整体架构设计

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    User Natural Language                     │
│         "红色显示五虎林河" / "按人口密度分级显示"            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Goal Splitter Agent                        │
│  - 识别意图类型 (visualization)                              │
│  - 提取关键参数 (color, field, classification)               │
│  - Output: {type, description, parameters?}                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  TaskPlanner Agent                           │
│                                                              │
│  Step 1: Capability-Based Filtering (Rule-based)            │
│  ┌────────────────────────────────────────────┐             │
│  │ Filter by goal.type                        │             │
│  │ Filter by dataSource.geometryType          │             │
│  │ Filter by required fields availability     │             │
│  └────────────────────────────────────────────┘             │
│           ↓                                                 │
│  Step 2: LLM Selection (Chain of Thought)                   │
│  ┌────────────────────────────────────────────┐             │
│  │ From 3-5 candidates, select best match     │             │
│  │ Extract parameters (colorRamp, valueField) │             │
│  │ Generate execution plan                    │             │
│  └────────────────────────────────────────────┘             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                Plugin Executor Layer                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Uniform    │  │ Categorical  │  │  Choropleth  │      │
│  │   Color      │  │   Renderer   │  │   Renderer   │      │
│  │   Executor   │  │   Executor   │  │   Executor   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
│         └─────────────────┼──────────────────┘               │
│                           │                                  │
│                    Common Workflow:                          │
│              1. Load data via Accessor                       │
│              2. Validate parameters                          │
│              3. Generate MVT tiles                           │
│              4. Generate Style JSON                          │
│              5. Return NativeData                            │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supporting Services                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Style      │  │   Color      │  │  Geometry    │      │
│  │  Factory     │← │   Engine     │  │   Adapter    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│       │                                    │                │
│       ├─ Generate Mapbox Style JSON        ├─ Detect type   │
│       ├─ Resolve colorRamp names           ├─ Adapt styles  │
│       └─ Save to filesystem                └─ Handle edge   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 核心组件设计

### 3.1 Plugin Execution Category System

#### 3.1.1 分类维度

基于**数据流特征**而非功能描述的分类体系：

| Category | Input | Output | Terminal? | Examples |
|----------|-------|--------|-----------|----------|
| **Statistical** | NativeData | JSON | No | StatisticsCalculator, Aggregation |
| **Computational** | NativeData | NativeData (single) | No | BufferAnalysis, OverlayAnalysis, Filter |
| **Visualization** | NativeData | MVT/WMS/GeoJSON | **Yes** | ChoroplethRenderer, HeatmapRenderer, UniformColorRenderer |
| **Textual** | ExecutionResults (from predecessors) | HTML/PDF | **Yes** | ReportGenerator |

**关键约束：**
1. ✅ **终端节点必须是最后一步**：Visualization和Textual类Plugin只能是Goal的最后一个Executor（由LLM保证）
2. ✅ **统计类和运算类可串联**：形成pipeline，如 `Filter → Statistics → Choropleth`
3. ✅ **所有Plugin均为单输出**：每次执行只返回一个NativeData或JSON结果
4. ❌ **不支持分支执行**：一个步骤的输出不作为多个后续步骤的输入（通过重复执行实现）
5. ❌ **不支持循环依赖**：Step A依赖Step B，Step B又依赖Step A的场景不被支持

---

#### 3.1.2 Capability Schema（修正版）

```typescript
interface PluginCapability {
  // ========== 核心分类 ==========
  executionCategory: 'statistical' | 'computational' | 'visualization' | 'textual';
  
  // ========== 输入要求 ==========
  inputRequirements: {
    // 数据格式抽象：只区分矢量和栅格
    supportedDataFormats?: ('vector' | 'raster')[];
    
    // 几何类型（仅Visualization和Computational需要）
    supportedGeometryTypes?: GeometryType[];
    
    // 必需字段（Statistical需要numeric，Visualization可能需要category/numeric）
    requiredFields?: FieldRequirement[];
    
    // 是否依赖前序步骤结果（Textual类需要）
    requiresPreviousResults?: boolean;
  };
  
  // ========== 输出能力 ==========
  outputCapabilities: {
    // 根据executionCategory有不同的输出类型
    outputType: 
      | 'json'         // Statistical: 统计结果JSON
      | 'native_data'  // Computational: 新的NativeData（单个）
      | 'mvt'          // Visualization: MVT服务
      | 'wms'          // Visualization: WMS服务
      | 'geojson'      // Visualization: GeoJSON文件（如热力图）
      | 'html'         // Textual: HTML报告
      | 'pdf';         // Textual: PDF报告
    
    // 是否为终端节点（Visualization/Textual为true）
    isTerminalNode: boolean;
  };
  
  // ========== 适用场景（供LLM匹配）==========
  scenarios: string[];
  
  // ========== 互斥与依赖 ==========
  mutuallyExclusiveWith?: string[];
  requiresPredecessorOfType?: ('statistical' | 'computational' | 'visualization')[];  // Textual类可能需要
  
  // ========== 优先级 ==========
  priority: number;  // 1-10，越高越优先
}

interface FieldRequirement {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  description?: string;
}
```

---

#### 3.1.3 数据格式抽象

**原则：** Plugin capability只区分`vector`/`raster`，不细分具体数据源类型。

```typescript
// ❌ 旧设计：过于细致
supportedDataTypes: ['geojson', 'shapefile', 'postgis', 'geotiff', 'wms']

// ✅ 新设计：抽象为数据格式
supportedDataFormats: ['vector']  // 或 ['raster']
```

**Accessor层负责映射：**

```typescript
class DataAccessorFactory {
  createAccessor(dataSourceType: DataSourceType): DataAccessor {
    const format = this.mapToDataFormat(dataSourceType);
    // Internal logic handles specific type
  }
  
  private mapToDataFormat(type: DataSourceType): 'vector' | 'raster' {
    switch (type) {
      case 'geojson':
      case 'shapefile':
      case 'postgis':
        return 'vector';
      case 'geotiff':
        return 'raster';
      // 注意：WMS不需要Accessor，因为WMS是服务而非本地数据
      default:
        throw new Error(`Unknown data source type: ${type}`);
    }
  }
}
```

**特殊场景处理：**

1. **WMS服务**：
   - WMS是远程地图服务，不是本地数据文件
   - 不需要WMS Accessor（WMS直接由前端Mapbox GL JS加载）
   - Plugin如果需要使用WMS，应该通过MVT Publisher转换为矢量瓦片

2. **PostGIS Raster**：
   - 当前架构不考虑PostGIS的raster类型
   - 如果需要处理栅格数据，使用GeoTIFF格式

3. **Plugin对特定数据源的限制**：
   - 如果某个Plugin只支持GeoJSON不支持PostGIS，在capability中声明：
   ```typescript
   {
     inputRequirements: {
       supportedDataFormats: ['vector'],
       supportedDataSourceTypes: ['geojson']  // 额外约束
     }
   }
   ```
   - 如果LLM选择了不兼容的数据源，PluginExecutor执行时会报错：
   ```typescript
   if (!isDataSourceCompatible(dataSource.type, plugin.capability)) {
     throw new ValidationError(
       `Plugin ${plugin.id} does not support ${dataSource.type} data sources. `
       + `Please use a compatible data source or convert the data first.`
     );
   }
   ```

**优势：**
- ✅ Plugin capability更简洁
- ✅ 新增数据源类型无需修改所有Plugin
- ✅ Accessor层封装具体实现细节

---

#### 3.1.4 三种渲染器的Capability声明

**Uniform Color Renderer:**
```typescript
{
  executionCategory: 'visualization',
  inputRequirements: {
    supportedDataFormats: ['vector'],
    supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
    requiredFields: []  // 无必需字段
  },
  outputCapabilities: {
    outputType: 'mvt',
    isTerminalNode: true,  // 必须是Goal的最后一个步骤
    supportsMultipleOutputs: false
  },
  scenarios: ['simple_display', 'single_color_visualization', 'basic_rendering'],
  priority: 8  // 高优先级，因为最简单
}
```

**Categorical Renderer:**
```typescript
{
  executionCategory: 'visualization',
  inputRequirements: {
    supportedDataFormats: ['vector'],
    supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
    requiredFields: [
      { name: 'categoryField', type: 'string', description: 'Categorical field for coloring' }
    ]
  },
  outputCapabilities: {
    outputType: 'mvt',
    isTerminalNode: true,
    supportsMultipleOutputs: false
  },
  scenarios: ['categorical_visualization', 'land_use_mapping', 'type_based_coloring'],
  priority: 6
}
```

**Choropleth Renderer:**
```typescript
{
  executionCategory: 'visualization',
  inputRequirements: {
    supportedDataFormats: ['vector'],
    supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
    requiredFields: [
      { name: 'valueField', type: 'number', description: 'Numeric field for classification' }
    ]
  },
  outputCapabilities: {
    outputType: 'mvt',
    isTerminalNode: true,
    supportsMultipleOutputs: false
  },
  scenarios: ['thematic_mapping', 'statistical_visualization', 'gradient_coloring', 'classification'],
  priority: 5
}
```

---

#### 3.1.5 其他Plugin的Capability示例

**StatisticsCalculator（统计类）:**
```typescript
{
  executionCategory: 'statistical',
  inputRequirements: {
    supportedDataFormats: ['vector'],
    requiredFields: [
      { name: 'field', type: 'number', description: 'Numeric field to calculate statistics' }
    ]
  },
  outputCapabilities: {
    outputType: 'json',  // 输出统计结果JSON: {count, mean, median, std, min, max}
    isTerminalNode: false,  // 可以继续传递给其他Plugin
    supportsMultipleOutputs: false
  },
  scenarios: ['descriptive_statistics', 'data_summary', 'aggregation'],
  priority: 7
}
```

**BufferAnalysis（运算类 - 单输出）:**
```typescript
{
  executionCategory: 'computational',
  inputRequirements: {
    supportedDataFormats: ['vector'],
    supportedGeometryTypes: ['Point', 'LineString', 'Polygon'],
    requiredFields: []
  },
  outputCapabilities: {
    outputType: 'native_data',  // 输出新的NativeData（缓冲区多边形）
    isTerminalNode: false,
    supportsMultipleOutputs: false
  },
  scenarios: ['proximity_analysis', 'buffer_zone_creation'],
  priority: 6
}
```

**OverlayAnalysis（运算类 - 单输出）:**
```typescript
{
  executionCategory: 'computational',
  inputRequirements: {
    supportedDataFormats: ['vector'],
    supportedGeometryTypes: ['Polygon'],
    requiredFields: []
  },
  outputCapabilities: {
    outputType: 'native_data',  // 输出单个NativeData（根据operation参数决定是交集/并集/差集）
    isTerminalNode: false,
  },
  scenarios: ['spatial_overlay', 'intersection_analysis', 'union_operation'],
  priority: 5
}
```

**说明：** 如果需要多种叠加结果（交集、并集、差集），需要分别调用三次OverlayAnalysis，每次使用不同的operation参数。
```

**ReportGenerator（文本类）:**
```typescript
{
  executionCategory: 'textual',
  inputRequirements: {
    supportedDataFormats: [],  // 不直接读取数据源
    requiredFields: [],
    requiresPreviousResults: true  // 需要前序步骤的结果
  },
  outputCapabilities: {
    outputType: 'html',  // 或 'pdf'
    isTerminalNode: true,  // 必须是最后一个步骤
    supportsMultipleOutputs: false
  },
  scenarios: ['report_generation', 'result_summary', 'documentation'],
  requiresPredecessorOfType: ['statistical', 'computational', 'visualization'],
  priority: 4
}
```

---

#### 3.1.6 Capability Registry设计规范

**存储策略：内存存储**

根据架构决策，Capability信息**全部存储在内存中**：
- ✅ 内置Plugin：从代码中的Plugin定义直接读取capability
- ✅ 自定义Plugin：从plugin.json (pluginManifest)中读取capability
- ❌ 不需要数据库持久化（Plugin定义本身就是代码/配置文件）

**注册时机：启动时一次性注册 + 热加载支持**

```typescript
// server/src/index.ts - 系统初始化
async function initializeSystem() {
  // 1. 注册内置Plugin
  console.log('[System] Registering built-in plugins...');
  await ToolRegistryInstance.registerPlugins(BUILT_IN_PLUGINS);
  
  for (const plugin of BUILT_IN_PLUGINS) {
    PluginCapabilityRegistry.register(plugin.id, plugin.capability);
  }
  
  // 2. 加载并注册自定义Plugin（支持热加载）
  console.log('[System] Loading custom plugins...');
  await customPluginLoader.loadAllPlugins();
}
```

**热加载机制：**

```typescript
class CustomPluginLoader {
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // 1. 读取plugin.json manifest
      const manifest = this.readManifest(pluginPath);
      
      // 2. 验证manifest
      this.validateManifest(manifest);
      
      // 3. 注册到ToolRegistry
      ToolRegistryInstance.registerPlugin(manifest);
      
      // 4. 注册到CapabilityRegistry
      PluginCapabilityRegistry.register(manifest.id, manifest.capability);
      
      // 5. 标记为enabled
      this.pluginStatuses.set(manifest.id, {
        id: manifest.id,
        status: 'enabled',
        loadedAt: new Date()
      });
      
      console.log(`[CustomPluginLoader] Plugin ${manifest.id} loaded and enabled`);
    } catch (error) {
      console.error(`[CustomPluginLoader] Failed to load plugin:`, error);
      
      // 降级策略：标记为disabled，但不影响其他plugin
      this.pluginStatuses.set(manifest?.id || 'unknown', {
        id: manifest?.id || 'unknown',
        status: 'disabled',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  async disablePlugin(pluginId: string): Promise<void> {
    // 1. 从ToolRegistry注销
    ToolRegistryInstance.unregisterPlugin(pluginId);
    
    // 2. 从CapabilityRegistry移除（可选，保留用于审计）
    // PluginCapabilityRegistry.unregister(pluginId);
    
    // 3. 更新状态
    this.pluginStatuses.set(pluginId, {
      ...this.pluginStatuses.get(pluginId),
      status: 'disabled'
    });
  }
  
  async enablePlugin(pluginId: string): Promise<void> {
    const pluginPath = path.join(this.customPluginsDir, pluginId);
    await this.loadPlugin(pluginPath);  // 重新加载
  }
}
```

**容错机制：**

```typescript
interface PluginStatus {
  id: string;
  status: 'enabled' | 'disabled' | 'error';
  error?: string;
  loadedAt?: Date;
}

// 注册失败时的降级策略
try {
  registerPlugin(plugin);
} catch (error) {
  // 1. 记录错误日志
  console.error(`[Registry] Plugin ${plugin.id} registration failed:`, error);
  
  // 2. 标记为disabled
  PluginStatusRegistry.markAsDisabled(plugin.id, error.message);
  
  // 3. 继续加载其他plugin（不中断系统启动）
  console.warn(`[Registry] Continuing with remaining plugins...`);
}
```

**Capability来源：**

```typescript
// 内置Plugin：从代码定义
export const ChoroplethRendererPlugin: Plugin = {
  id: 'choropleth_renderer',
  name: 'Choropleth Renderer',
  capability: {  // ← 直接在Plugin定义中包含capability
    executionCategory: 'visualization',
    inputRequirements: { ... },
    outputCapabilities: { ... },
    scenarios: [...],
    priority: 5
  },
  // ...
};

// 自定义Plugin：从plugin.json
{
  "id": "custom_analysis",
  "name": "Custom Analysis",
  "version": "1.0.0",
  "capability": {  // ← 在manifest中声明capability
    "executionCategory": "computational",
    "inputRequirements": { ... },
    "outputCapabilities": { ... },
    "scenarios": [...],
    "priority": 6
  }
}
```

```typescript
class PluginCapabilityRegistry {
  private registry: Map<string, PluginCapability> = new Map();
  
  // 注册plugin capability
  register(pluginId: string, capability: PluginCapability): void;
  
  // 根据条件过滤兼容的plugin
  filterByCapability(criteria: CapabilityCriteria): string[];
  
  // 获取plugin的capability
  getCapability(pluginId: string): PluginCapability | undefined;
}

interface CapabilityCriteria {
  geometryType?: GeometryType;
  dataType?: DataSourceType;
  hasNumericField?: boolean;
  hasCategoricalField?: boolean;
  goalType?: string;
}
```

#### 3.1.3 三种渲染器的Capability声明

**Uniform Color Renderer:**
```typescript
{
  inputRequirements: {
    supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
    supportedDataTypes: ['geojson', 'shapefile', 'postgis'],
    requiredFields: []  // 无必需字段
  },
  outputCapabilities: {
    serviceType: 'mvt',
    rendererType: 'uniform',
    generatesStyleJson: true
  },
  scenarios: ['simple_display', 'single_color_visualization', 'basic_rendering'],
  priority: 8  // 高优先级，因为最简单
}
```

**Categorical Renderer:**
```typescript
{
  inputRequirements: {
    supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
    supportedDataTypes: ['geojson', 'shapefile', 'postgis'],
    requiredFields: [
      { name: 'categoryField', type: 'string' }  // 必须是字符串类型字段
    ]
  },
  outputCapabilities: {
    serviceType: 'mvt',
    rendererType: 'categorical',
    generatesStyleJson: true
  },
  scenarios: ['categorical_visualization', 'land_use_mapping', 'type_based_coloring'],
  priority: 6
}
```

**Choropleth Renderer:**
```typescript
{
  inputRequirements: {
    supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
    supportedDataTypes: ['geojson', 'shapefile', 'postgis'],
    requiredFields: [
      { name: 'valueField', type: 'number' }  // 必须是数值类型字段
    ]
  },
  outputCapabilities: {
    serviceType: 'mvt',
    rendererType: 'choropleth',
    generatesStyleJson: true
  },
  scenarios: ['thematic_mapping', 'statistical_visualization', 'gradient_coloring', 'classification'],
  priority: 5
}
```

---

### 3.2 TaskPlanner两阶段决策策略（修正版）

#### 3.2.1 Stage 1: Rule-Based Filtering

```typescript
class TaskPlannerAgent {
  async execute(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
    for (const goal of state.goals) {
      // Stage 1: Filter plugins by execution category and compatibility
      const compatiblePlugins = this.filterCompatiblePlugins(
        goal,
        state.dataSourcesMetadata
      );
      
      // Stage 2: Validate terminal node constraints
      const validatedPlugins = this.validateTerminalConstraints(
        compatiblePlugins,
        state.executionPlans.get(goal.id)
      );
      
      // Stage 3: LLM selects from validated candidates
      const plan = await this.llmSelectPlugin(
        goal,
        validatedPlugins
      );
      
      executionPlans.set(goal.id, plan);
    }
  }
  
  private filterCompatiblePlugins(
    goal: AnalysisGoal,
    dataSourcesMetadata: DataSourceMetadata[]
  ): PluginMetadata[] {
    // Determine expected execution category from goal.type
    const expectedCategory = this.inferExecutionCategory(goal);
    
    // Get data format from data source
    const dataSource = dataSourcesMetadata.find(ds => ds.id === goal.dataSourceId);
    const dataFormat = dataSource ? this.detectDataFormat(dataSource.type) : undefined;
    
    // Build filtering criteria
    const criteria: CapabilityCriteria = {
      expectedCategory,
      dataFormat,
      geometryType: dataSource?.metadata?.geometryType,
      hasNumericField: this.hasNumericField(dataSource),
      hasCategoricalField: this.hasCategoricalField(dataSource)
    };
    
    return this.capabilityRegistry.filterByCapability(criteria)
      .map(pluginId => this.registry.getPlugin(pluginId));
  }
  
  private inferExecutionCategory(goal: AnalysisGoal): PluginExecutionCategory {
    switch (goal.type) {
      case 'visualization':
        return 'visualization';
      case 'analysis':
        // Could be statistical or computational, need more context
        return this.detectAnalysisSubtype(goal);
      case 'report':
        return 'textual';
      default:
        return 'computational';  // fallback
    }
  }
  
  private detectDataFormat(dataSourceType: DataSourceType): 'vector' | 'raster' {
    switch (dataSourceType) {
      case 'geojson':
      case 'shapefile':
      case 'postgis':
        return 'vector';
      case 'geotiff':
      case 'wms':
        return 'raster';
      default:
        throw new Error(`Unknown data source type: ${dataSourceType}`);
    }
  }
}
```

---

#### 3.2.2 Stage 2: LLM负责终端节点约束

**设计决策：由LLM保证终端节点约束**

根据架构决策，终端节点约束（Visualization/Textual必须是最后一步）**完全由LLM在生成执行计划时保证**，不需要在TaskPlanner中进行额外的规则验证。

**理由：**
1. ✅ LLM已经具备理解约束的能力（通过Prompt教育）
2. ✅ 简化TaskPlanner实现，避免复杂的验证逻辑
3. ✅ 如果LLM违反约束，会在PluginExecutor执行时报错，此时可以重试或反馈给用户

**LLM Prompt中的约束说明：**
```markdown
Important Constraints:
1. Terminal Node Rules:
   - Visualization plugins (uniform_color_renderer, categorical_renderer, choropleth_renderer) MUST be the LAST step in a goal's execution plan
   - Textual plugins (report_generator) MUST be the LAST step and MUST have at least one predecessor step
   - A goal can have AT MOST ONE terminal node
   
2. Dependency Rules:
   - Each step can only depend on previous steps (no circular dependencies)
   - If step B depends on step A, step A must appear before step B in the plan
   
3. Single Output Rule:
   - Each plugin execution produces exactly ONE output (NativeData or JSON)
   - If you need multiple results (e.g., intersection AND union), create separate goals or repeat the plugin with different parameters
```

**错误处理策略：**

如果LLM生成了违反约束的计划，系统会在PluginExecutor阶段检测并报错：

```typescript
// PluginExecutor执行时检查
async function executeStep(step: ExecutionStep, context: ExecutionContext) {
  const capability = getPluginCapability(step.pluginId);
  
  // 检查终端节点是否在最后
  if (capability.isTerminalNode && !isLastStep(step, context.plan)) {
    throw new ValidationError(
      `Plugin ${step.pluginId} is a terminal node and must be the last step. ` +
      `This is likely an LLM planning error. Please retry or rephrase your request.`
    );
  }
  
  // ... 继续执行
}
```

**注意：** 当前设计中不实现自动重试机制，错误直接返回给用户。

---

#### 3.2.3 Stage 3: LLM Chain of Thought

**Prompt Template（更新版）:**

```markdown
You are selecting the most appropriate plugin for this goal.

Goal: {{goalDescription}}
Goal Type: {{goalType}}

Available Plugins (pre-filtered by compatibility):
{{compatiblePlugins}}

Data Source Metadata:
{{dataSourceMetadata}}

Existing Steps in Plan (if any):
{{existingSteps}}

Decision Process:
1. Analyze the user's intent and match to plugin execution category
2. Verify required fields exist in data source
3. Check terminal node constraints:
   - If plan already has steps, cannot add another terminal node
   - Visualization/Textual plugins must be the last step
4. Select the best plugin from candidates
5. Extract parameters from user input
6. Verify the selection doesn't violate any constraints

Output Format:
{
  "selectedPlugin": "plugin_id",
  "reasoning": "explanation of choice including constraint validation",
  "parameters": {
    // plugin-specific parameters
  },
  "validationChecks": {
    "hasRequiredFields": true,
    "isTerminalNodeValid": true,
    "hasValidPredecessors": true
  }
}
```

**LLM推理示例：**

```
User: "红色显示五虎林河数据集"

Thought Process:
1. Intent analysis: User wants to display a dataset with red color
2. No classification mentioned → not choropleth
3. No category field mentioned → not categorical
4. Simple display with single color → uniform color renderer
5. Check execution category: visualization ✓
6. Check data source: 五虎林河 is vector data, LineString geometry
7. UniformColorRenderer supports vector + LineString ✓
8. Check terminal constraint: This is the first step, so terminal node is valid ✓
9. Extract parameter: color = "red" → will be resolved by ColorEngine

Selected Plugin: uniform_color_renderer
Parameters: {
  "dataSourceId": "wuhulin_river_id",
  "color": "reds"
}
Validation Checks: {
  "hasRequiredFields": true,  // No required fields for uniform color
  "isTerminalNodeValid": true,  // First step, OK to be terminal
  "hasValidPredecessors": true  // Not applicable
}
```

---

### 3.3 Executor统一工作流

#### 3.3.1 Base Renderer Executor

```typescript
abstract class BaseRendererExecutor {
  protected db: Database;
  protected workspaceBase: string;
  protected styleFactory: StyleFactory;
  
  constructor(db: Database, workspaceBase: string) {
    this.db = db;
    this.workspaceBase = workspaceBase;
    this.styleFactory = new StyleFactory(workspaceBase);
  }
  
  // 所有渲染器共享的基础workflow
  protected async executeBaseWorkflow<T extends BaseRendererParams>(
    params: T,
    styleGenerator: (params: T, nativeData: NativeData) => Promise<string>
  ): Promise<NativeData> {
    // Step 1: Load data source
    const { dataSource, nativeData, accessor } = await this.loadDataSource(
      params.dataSourceId
    );
    
    // Step 2: Validate parameters (renderer-specific)
    this.validateParams(params, dataSource);
    
    // Step 3: Generate MVT tiles
    const tilesetId = await this.generateMVTTiles(nativeData, params);
    
    // Step 4: Generate Style JSON (delegate to StyleFactory)
    const styleUrl = await styleGenerator(params, nativeData);
    
    // Step 5: Return standardized result
    return this.createResult(tilesetId, dataSource.id, nativeData.type, {
      styleUrl,
      ...this.getRendererSpecificMetadata(params)
    });
  }
  
  // Subclasses implement these
  protected abstract validateParams(params: any, dataSource: any): void;
  protected abstract getRendererSpecificMetadata(params: any): any;
}
```

#### 3.3.1.5 Visualization Executor架构 ✅ 最终方案

**最终决策：**

```
Layer 1: utils/publishers/
├── MVTStrategyPublisher.ts      ✅ 统一MVT引擎（Strategy Pattern，推荐）
│   ├── GeoJSONMVTTStrategy (按需生成)
│   ├── ShapefileMVTTStrategy (转换后按需生成)
│   └── PostGISMVTTStrategy (ST_AsMVT按需生成)
└── MVTOnDemandPublisher.ts      ✅ 保留（其他模块正在使用）

Layer 2: plugin-orchestration/executor/visualization/
├── ChoroplethMapExecutor.ts       // 分级统计图执行器（直接调用MVTStrategyPublisher）
├── HeatmapExecutor.ts             // 热力图执行器（直接调用MVTStrategyPublisher）
└── UniformColorExecutor.ts        // 单色渲染执行器（直接调用MVTStrategyPublisher）

❌ 删除: MVTPublisherExecutor.ts (不再需要)
❌ 不创建: MVTServiceExecutor.ts (不需要单独的MVT服务执行器)
```

**核心原则：**

1. **统一MVT引擎**：所有Visualization Executor直接使用 `MVTStrategyPublisher`
2. **移除中间层**：删除 `MVTPublisherExecutor`，Executor直接调用Publisher
3. **职责清晰**：
   - `MVTStrategyPublisher` = MVT瓦片生成与发布（工具类，Strategy Pattern）
   - `*Executor` = Plugin执行框架集成 + 业务逻辑（样式生成、分类等）
4. **向后兼容**：Plugin ID和API保持不变
5. **保留MVTOnDemandPublisher**：其他模块（如DataSourcePublishingService）仍在使用

**实现示例：**

```typescript
// ===== ChoroplethMapExecutor（直接调用Publisher）=====
class ChoroplethMapExecutor {
  private mvtPublisher: MVTStrategyPublisher;
  private styleFactory: StyleFactory;
  
  constructor(workspaceBase: string, db?: Database) {
    this.mvtPublisher = MVTStrategyPublisher.getInstance(workspaceBase, db);
    this.styleFactory = new StyleFactory(workspaceBase);
  }
  
  async execute(params: ChoroplethParams): Promise<NativeData> {
    const { dataSourceId, valueField, classification, colorRamp } = params;
    
    // Step 1: Load data source via DataAccessor
    const { dataSource, nativeData, accessor } = await this.loadDataSource(dataSourceId);
    
    // Step 2: Validate and calculate statistics
    this.validateField(dataSource, valueField);
    const stats = await this.calculateStatistics(accessor, dataSource, valueField);
    const breaks = this.classify(stats.values, classification, params.numClasses);
    
    // Step 3: Publish MVT using MVTStrategyPublisher
    const mvtResult = await this.mvtPublisher.publish(nativeData, {
      minZoom: params.minZoom || 0,
      maxZoom: params.maxZoom || 22,
      layerName: params.layerName || 'choropleth'
    });
    
    if (!mvtResult.success) {
      throw new Error(`MVT publication failed: ${mvtResult.error}`);
    }
    
    // Step 4: Generate choropleth style
    const styleUrl = this.styleFactory.createAndSaveChoroplethStyle({
      tilesetId: mvtResult.tilesetId,
      valueField,
      breaks,
      colors: this.resolveColorRamp(colorRamp, breaks.length)
    });
    
    // Step 5: Return result with style URL
    return {
      id: mvtResult.tilesetId,
      type: 'mvt',
      reference: mvtResult.serviceUrl,
      metadata: {
        rendererType: 'choropleth',
        result: mvtResult.serviceUrl,  // 必需字段
        styleUrl,
        classification: {
          method: classification,
          breaks,
          valueField
        },
        ...mvtResult.metadata
      }
    };
  }
}
```

**迁移步骤：**

1. **删除旧代码**：
   - ❌ 删除 `MVTPublisherExecutor.ts`

2. **重构并重命名Executor**：
   - 🔄 `ChoroplethMVTExecutor.ts` → 重命名为 `ChoroplethMapExecutor.ts`，并重构为直接调用 `MVTStrategyPublisher`
   - 🔄 `HeatmapExecutor.ts` → 保持文件名，重构为直接调用 `MVTStrategyPublisher`
   - 🆕 创建 `UniformColorExecutor.ts`（如果需要）

3. **更新引用**：
   - 🔄 更新 `PluginToolWrapper.ts` 中的实例化逻辑（使用新的类名）
   - 🔄 更新 `index.ts` 导出
   - 🔄 更新 Plugin 注册（如有需要）

4. **测试验证**：
   - ✅ 单元测试：验证Executor正确调用Publisher
   - ✅ 集成测试：验证完整Plugin工作流
   - ✅ 前端测试：验证MVT服务正常访问

**影响范围：**

| 文件/模块 | 操作 | 说明 |
|----------|------|------|
| `MVTPublisherExecutor.ts` | ❌ 删除 | 不再需要 |
| `MVTStrategyPublisher.ts` | ✅ 核心 | 统一MVT引擎（已存在） |
| `MVTOnDemandPublisher.ts` | ✅ 保留 | 其他模块正在使用（DataSourcePublishingService等） |
| `ChoroplethMVTExecutor.ts` | 🔄 重命名+重构 | → `ChoroplethMapExecutor.ts`，直接调用MVTStrategyPublisher |
| `HeatmapExecutor.ts` | 🔄 重构 | 保持文件名，直接调用MVTStrategyPublisher |
| `PluginToolWrapper.ts` | 🔄 更新 | 移除MVTPublisherExecutor引用，使用新类名 |

**兼容性保证：**

- Plugin ID保持为`choropleth_map`、`heatmap`等
- 输入参数schema保持不变
- 输出结果格式保持不变（NativeData with MVT URL）
- 前端调用方式无需修改

**实施时间：** Phase 1（Week 1-2）

#### 3.3.2 Uniform Color Executor

```typescript
class UniformColorExecutor extends BaseRendererExecutor {
  async execute(params: UniformColorParams): Promise<NativeData> {
    return this.executeBaseWorkflow(params, async (p, nativeData) => {
      return await this.styleFactory.generateUniformStyle({
        tilesetId: p.tilesetId,  // will be set after MVT generation
        layerName: p.layerName || 'uniform',
        color: p.color || '#409eff',
        strokeWidth: p.strokeWidth,
        pointSize: p.pointSize,
        opacity: p.opacity || 0.8,
        geometryType: nativeData.metadata?.geometryType  // auto-detected
      });
    });
  }
  
  protected validateParams(params: UniformColorParams, dataSource: any): void {
    // No required fields for uniform color
    // Just validate optional parameters
    if (params.color && !this.isValidColor(params.color)) {
      throw new Error(`Invalid color: ${params.color}`);
    }
  }
  
  protected getRendererSpecificMetadata(params: UniformColorParams): any {
    return {
      rendererType: 'uniform',
      color: params.color || '#409eff'
    };
  }
}
```

#### 3.3.3 Categorical Executor

```typescript
class CategoricalExecutor extends BaseRendererExecutor {
  async execute(params: CategoricalParams): Promise<NativeData> {
    return this.executeBaseWorkflow(params, async (p, nativeData) => {
      // Step 1: Get unique categories from data
      const accessor = this.createAccessor(nativeData.type);
      const categories = await accessor.getUniqueValues(p.categoryField);
      
      // Step 2: Generate color mapping
      const colorMapping = this.assignColorsToCategories(
        categories,
        p.colorScheme || 'set1',
        p.customColors
      );
      
      // Step 3: Generate style
      return await this.styleFactory.generateCategoricalStyle({
        tilesetId: p.tilesetId,
        layerName: p.layerName || 'categorical',
        categoryField: p.categoryField,
        colorMapping,
        opacity: p.opacity || 0.8,
        geometryType: nativeData.metadata?.geometryType
      });
    });
  }
  
  protected validateParams(params: CategoricalParams, dataSource: any): void {
    // Validate categoryField exists and is string type
    const fieldInfo = dataSource.metadata?.fields?.find(
      (f: any) => f.name === params.categoryField
    );
    
    if (!fieldInfo) {
      throw new Error(`Category field '${params.categoryField}' not found`);
    }
    
    if (fieldInfo.type !== 'string') {
      throw new Error(`Category field must be string type, got ${fieldInfo.type}`);
    }
  }
}
```

#### 3.3.4 Choropleth Executor

```typescript
class ChoroplethExecutor extends BaseRendererExecutor {
  async execute(params: ChoroplethParams): Promise<NativeData> {
    return this.executeBaseWorkflow(params, async (p, nativeData) => {
      // Step 1: Calculate statistics using Accessor
      const accessor = this.createAccessor(nativeData.type);
      const stats = await accessor.statisticalOp.calculateStatistics(
        nativeData.reference,
        p.valueField
      );
      
      // Step 2: Perform classification
      const breaks = await accessor.statisticalOp.classify(
        stats.values,
        p.classification || 'quantile',
        p.numClasses || 5
      );
      
      // Step 3: Generate style (delegate color resolution to StyleFactory)
      return await this.styleFactory.generateChoroplethStyle({
        tilesetId: p.tilesetId,
        layerName: p.layerName || 'choropleth',
        valueField: p.valueField,
        breaks,
        colorRamp: p.colorRamp || 'greens',  // pass name, not resolved colors
        numClasses: breaks.length - 1,
        opacity: p.opacity || 0.8,
        geometryType: nativeData.metadata?.geometryType
      });
    });
  }
  
  protected validateParams(params: ChoroplethParams, dataSource: any): void {
    // Validate valueField exists and is numeric
    const fieldInfo = dataSource.metadata?.fields?.find(
      (f: any) => f.name === params.valueField
    );
    
    if (!fieldInfo) {
      throw new Error(`Value field '${params.valueField}' not found`);
    }
    
    if (fieldInfo.type !== 'number') {
      throw new Error(`Value field must be numeric, got ${fieldInfo.type}`);
    }
  }
}
```

---

### 3.4 StyleFactory重构设计

#### 3.4.1 当前问题

```typescript
// ❌ Current: Executor calls resolveColorRamp
class ChoroplethMVTExecutor {
  private resolveColorRamp(colorRamp: string, numColors: number): string[] {
    // 60 lines of color logic
  }
  
  async execute(params) {
    const styleUrl = StyleFactory.createAndSaveChoroplethStyle({
      colors: this.resolveColorRamp(params.colorRamp, breaks.length)  // ← Wrong!
    });
  }
}
```

#### 3.4.2 目标设计

```typescript
// ✅ Target: StyleFactory handles everything
class StyleFactory {
  private colorEngine: ColorResolutionEngine;
  
  async generateChoroplethStyle(config: ChoroplethStyleConfig): Promise<string> {
    // Step 1: Resolve colorRamp name to actual colors
    const colors = await this.colorEngine.resolveColorRamp(
      config.colorRamp,
      config.numClasses
    );
    
    // Step 2: Generate Mapbox GL JS style JSON
    const styleJson = this.buildChoroplethStyle({
      ...config,
      colors  // now we have resolved colors
    });
    
    // Step 3: Save to filesystem
    const styleUrl = this.saveStyleJson(config.tilesetId, styleJson);
    
    return styleUrl;
  }
  
  async generateUniformStyle(config: UniformStyleConfig): Promise<string> {
    const color = await this.colorEngine.resolveColor(config.color);
    const styleJson = this.buildUniformStyle({ ...config, color });
    return this.saveStyleJson(config.tilesetId, styleJson);
  }
  
  async generateCategoricalStyle(config: CategoricalStyleConfig): Promise<string> {
    const colorMapping = await this.colorEngine.resolveColorScheme(
      config.categories,
      config.colorScheme
    );
    const styleJson = this.buildCategoricalStyle({ ...config, colorMapping });
    return this.saveStyleJson(config.tilesetId, styleJson);
  }
}
```

#### 3.4.3 Style Config Interfaces

```typescript
interface BaseStyleConfig {
  tilesetId: string;
  layerName: string;
  geometryType: GeometryType;  // auto-detected by Geometry Adapter
  opacity?: number;
  minZoom?: number;
  maxZoom?: number;
}

interface UniformStyleConfig extends BaseStyleConfig {
  color: string;  // resolved hex color
  strokeWidth?: number;
  pointSize?: number;
}

interface CategoricalStyleConfig extends BaseStyleConfig {
  categoryField: string;
  colorMapping: Record<string, string>;  // category → hex color
}

interface ChoroplethStyleConfig extends BaseStyleConfig {
  valueField: string;
  breaks: number[];
  colorRamp: string;  // colorRamp name (not resolved yet)
  numClasses: number;
}
```

---

### 3.5 Geometry Adapter Layer

#### 3.5.1 职责

- 自动检测GeoJSON的geometry type
- 为StyleFactory提供geometry type信息
- 处理Mixed Geometry Collections

#### 3.5.2 实现

```typescript
class GeometryAdapter {
  /**
   * Detect dominant geometry type from FeatureCollection
   */
  static detectGeometryType(featureCollection: GeoJSON.FeatureCollection): GeometryType {
    const types = new Set<GeometryType>();
    
    for (const feature of featureCollection.features) {
      if (feature.geometry) {
        types.add(this.normalizeGeometryType(feature.geometry.type));
      }
    }
    
    // If mixed types, return the most common one
    if (types.size > 1) {
      return this.findDominantType(featureCollection);
    }
    
    return Array.from(types)[0] || 'Unknown';
  }
  
  /**
   * Normalize geometry type (handle Multi* types)
   */
  private static normalizeGeometryType(type: string): GeometryType {
    const normalizationMap: Record<string, GeometryType> = {
      'Point': 'Point',
      'MultiPoint': 'Point',
      'LineString': 'LineString',
      'MultiLineString': 'LineString',
      'Polygon': 'Polygon',
      'MultiPolygon': 'Polygon'
    };
    
    return normalizationMap[type] || 'Unknown';
  }
  
  /**
   * Get appropriate Mapbox layer type for geometry
   */
  static getMapboxLayerType(geometryType: GeometryType): 'circle' | 'line' | 'fill' {
    switch (geometryType) {
      case 'Point':
        return 'circle';
      case 'LineString':
        return 'line';
      case 'Polygon':
        return 'fill';
      default:
        return 'fill';  // fallback
    }
  }
}
```

#### 3.5.3 在Executor中使用

```typescript
class BaseRendererExecutor {
  protected async loadDataSource(dataSourceId: string) {
    const dataSource = this.dataSourceRepo.getById(dataSourceId);
    const accessor = this.accessorFactory.createAccessor(dataSource.type);
    const nativeData = await accessor.read(dataSource.reference);
    
    // Auto-detect geometry type
    if (nativeData.type === 'geojson') {
      const content = fs.readFileSync(nativeData.reference, 'utf-8');
      const geojson = JSON.parse(content);
      const geometryType = GeometryAdapter.detectGeometryType(geojson);
      
      // Store in metadata for StyleFactory to use
      nativeData.metadata = {
        ...nativeData.metadata,
        geometryType
      };
    }
    
    return { dataSource, nativeData, accessor };
  }
}
```

---

## 🔄 数据流图

### 完整执行流程

```
User Query: "用面积等级专题图显示陕西省，红色系"
    │
    ▼
Goal Splitter
    │
    ├─ type: "visualization"
    ├─ description: "用面积等级专题图显示陕西省，红色系"
    └─ parameters: {colorHint: "红色系"}  ← extracted
    │
    ▼
TaskPlanner
    │
    ├─ Stage 1: Filter by capability
    │   ├─ goal.type = "visualization" → visualization renderers
    │   ├─ dataSource has numeric field "area" → choropleth compatible
    │   └─ Candidates: [choropleth_renderer]
    │
    ├─ Stage 2: LLM selection
    │   ├─ Only 1 candidate → auto-select
    │   ├─ Extract parameters:
    │   │   ├─ valueField: "area" (from metadata)
    │   │   ├─ colorRamp: "reds" (from "红色系")
    │   │   └─ numClasses: 5 (default)
    │   └─ Generate execution plan
    │
    ▼
ChoroplethExecutor.execute()
    │
    ├─ Step 1: Load data source
    │   ├─ dataSourceRepo.getById()
    │   ├─ Accessor.read() → NativeData
    │   └─ GeometryAdapter.detectGeometryType() → "Polygon"
    │
    ├─ Step 2: Validate parameters
    │   ├─ Check "area" field exists
    │   └─ Check "area" is numeric type
    │
    ├─ Step 3: Calculate statistics
    │   └─ accessor.statisticalOp.calculateStatistics("area")
    │       └─ Returns: {min, max, mean, values[]}
    │
    ├─ Step 4: Classify
    │   └─ accessor.statisticalOp.classify(values, "quantile", 5)
    │       └─ Returns: breaks[0, 100, 500, 1000, 5000]
    │
    ├─ Step 5: Generate MVT tiles
    │   └─ MVTPublisher.generateTiles(nativeData)
    │       └─ Returns: tilesetId
    │
    ├─ Step 6: Generate Style JSON
    │   └─ StyleFactory.generateChoroplethStyle({
    │         tilesetId,
    │         valueField: "area",
    │         breaks: [0, 100, 500, 1000, 5000],
    │         colorRamp: "reds",  ← pass name
    │         numClasses: 5,
    │         geometryType: "Polygon"
    │       })
    │       │
    │       ├─ ColorEngine.resolveColorRamp("reds", 5)
    │       │   └─ Returns: ['#fff5f0', '#fcbba1', '#fb6a4a', '#cb181d', '#99000d']
    │       │
    │       ├─ Build Mapbox Style JSON
    │       │   └─ fill-color: interpolate expression
    │       │
    │       └─ Save to workspace/results/styles/{tilesetId}.json
    │           └─ Returns: styleUrl
    │
    └─ Step 7: Return NativeData
        └─ {
             type: 'mvt',
             reference: '/api/services/mvt/{tilesetId}/{z}/{x}/{y}.pbf',
             metadata: {
               result: '/api/services/mvt/{tilesetId}/{z}/{x}/{y}.pbf',
               styleUrl: '/workspace/results/styles/{tilesetId}.json',
               rendererType: 'choropleth',
               valueField: 'area',
               breaks: [...],
               colorRamp: 'reds',
               geometryType: 'Polygon'
             }
           }
    │
    ▼
Frontend receives MVT URL + Style URL
    │
    ├─ Load Style JSON from styleUrl
    ├─ Add vector source with MVT URL
    └─ Render choropleth map with red gradient
```

---

## 🔒 Placeholder解析规范

### 设计决策：简单直接的Placeholder语法

根据架构决策，Placeholder解析采用**简单直接**的语法，不支持复杂嵌套和跨步骤引用。

### 支持的语法

**1. 引用前序步骤的输出：**
```typescript
// ✅ 支持：引用上一个步骤的result
"{{step_1.result}}"

// ✅ 支持：引用metadata中的字段
"{{step_1.metadata.featureCount}}"
"{{step_1.metadata.result}}"
```

**2. 不支持的语法：**
```typescript
// ❌ 不支持：深层嵌套（超过2层）
"{{step_1.metadata.fields[0].name}}"

// ❌ 不支持：跨步骤链式引用
"{{step_1.output.step_2.result}}"

// ❌ 不支持：循环依赖
// Step A depends on Step B, Step B depends on Step A
```

### Placeholder解析实现

```typescript
/**
 * 解析placeholder字符串
 * @param placeholder - 如 "{{step_1.result}}"
 * @param executionResults - 已执行步骤的结果Map
 * @returns 解析后的值
 */
function resolvePlaceholder(
  placeholder: string,
  executionResults: Map<string, AnalysisResult>
): any {
  // 1. 匹配placeholder格式
  const match = placeholder.match(/^\{\{(.+?)\}\}$/);
  if (!match) {
    return placeholder;  // 不是placeholder，直接返回
  }
  
  const expression = match[1];  // "step_1.result"
  const parts = expression.split('.');  // ["step_1", "result"]
  
  // 2. 限制深度（最多2层：stepId.property）
  if (parts.length > 2) {
    throw new Error(
      `Placeholder too deep: ${placeholder}. ` +
      `Maximum depth is 2 (e.g., {{step_id.property}}).`
    );
  }
  
  // 3. 获取step结果
  const stepId = parts[0];
  const result = executionResults.get(stepId);
  
  if (!result) {
    throw new Error(
      `Step ${stepId} not found or not executed yet. ` +
      `Available steps: ${Array.from(executionResults.keys()).join(', ')}`
    );
  }
  
  if (result.status !== 'success') {
    throw new Error(
      `Step ${stepId} failed: ${result.error}`
    );
  }
  
  // 4. 访问属性
  if (parts.length === 1) {
    // {{step_1}} → 返回整个result对象
    return result.data;
  }
  
  const propertyName = parts[1];
  
  if (propertyName === 'result') {
    // {{step_1.result}} → 返回metadata.result
    return result.data?.metadata?.result;
  }
  
  if (propertyName === 'metadata') {
    // {{step_1.metadata}} → 返回整个metadata
    return result.data?.metadata;
  }
  
  // {{step_1.metadata.xxx}} → 不支持，需要自定义解析逻辑
  throw new Error(
    `Property ${propertyName} not directly accessible. ` +
    `Use {{step_1.result}} or {{step_1.metadata}} instead.`
  );
}
```

### 使用示例

**场景1：统计分析后可视化**
```typescript
// Step 1: 计算统计信息
{
  stepId: "step_1",
  pluginId: "statistics_calculator",
  parameters: {
    dataSourceId: "population_data",
    field: "population"
  }
}

// Step 2: 生成报告，引用统计结果
{
  stepId: "step_2",
  pluginId: "report_generator",
  parameters: {
    title: "人口统计报告",
    statistics: "{{step_1.result}}"  // ← 引用统计结果的JSON
  }
}
```

**场景2：空间分析后可视化**
```typescript
// Step 1: 缓冲区分析
{
  stepId: "step_1",
  pluginId: "buffer_analysis",
  parameters: {
    dataSourceId: "rivers",
    distance: 500,
    unit: "meters"
  }
}

// Step 2: 用红色显示缓冲区
{
  stepId: "step_2",
  pluginId: "uniform_color_renderer",
  parameters: {
    dataSourceId: "{{step_1.result}}",  // ← 引用缓冲区的NativeData
    color: "red"
  }
}
```

### 循环依赖检测

**设计决策：不支持循环依赖**

如果用户尝试创建循环依赖，系统会在TaskPlanner阶段报错：

```typescript
function detectCircularDependencies(plan: ExecutionPlan): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  
  function dfs(stepId: string): boolean {
    if (inStack.has(stepId)) {
      return true;  // 找到循环
    }
    
    if (visited.has(stepId)) {
      return false;
    }
    
    visited.add(stepId);
    inStack.add(stepId);
    
    const step = plan.steps.find(s => s.stepId === stepId);
    if (step) {
      for (const dep of step.dependsOn || []) {
        if (dfs(dep)) {
          return true;
        }
      }
    }
    
    inStack.delete(stepId);
    return false;
  }
  
  for (const step of plan.steps) {
    if (dfs(step.stepId)) {
      return true;
    }
  }
  
  return false;
}

// 在TaskPlanner生成计划后检查
if (detectCircularDependencies(plan)) {
  throw new ValidationError(
    'Circular dependency detected in execution plan. ' +
    'Please ensure each step only depends on previous steps.'
  );
}
```

**注意：** 由于当前设计中每个步骤只能依赖前序步骤（线性执行），循环依赖实际上不可能发生。此检测作为防御性编程保留。

---

## 📊 对比：当前vs目标架构

| 维度 | 当前架构 | 目标架构 |
|------|---------|---------|
| **渲染器数量** | 1个(chropleth_map) | 3个(uniform, categorical, choropleth) |
| **几何类型支持** | 未验证，隐式支持 | 显式支持所有类型，自动适配 |
| **颜色解析位置** | Executor中 | StyleFactory + ColorEngine |
| **Plugin选择** | LLM从9个中选 | 两阶段：过滤+LLM从3-5个中选 |
| **Capability声明** | 无结构化 | 完整的Capability Schema |
| **职责分离** | 混乱 | 清晰（Executor/StyleFactory/ColorEngine） |
| **可扩展性** | 差（每新增都要改prompt） | 好（Capability自动发现） |
| **代码重复** | 高（每个Executor都有颜色逻辑） | 低（集中在StyleFactory） |

---

## ✅ 架构验收标准

重构完成后，以下指标应该达成：

1. **三种渲染器全部实现** ✅
2. **所有渲染器支持点线面** ✅
3. **StyleFactory统一生成样式** ✅
4. **Executor不包含颜色解析逻辑** ✅
5. **Capability Registry正常工作** ✅
6. **TaskPlanner两阶段决策生效** ✅
7. **用户query"红色显示五虎林河"能正确映射到UniformColorRenderer** ✅

---

## 📝 下一步

请审阅本核心架构设计文档，确认：
1. 整体架构是否合理？
2. 组件职责划分是否清晰？
3. 数据流是否符合预期？

确认后，我将开始编写Phase 4的三种渲染器详细设计文档。
