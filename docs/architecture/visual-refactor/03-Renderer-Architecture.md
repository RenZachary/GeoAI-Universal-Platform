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
| **Computational** | NativeData | NativeData (single or multiple) | No | BufferAnalysis, OverlayAnalysis, Filter |
| **Visualization** | NativeData | MVT/WMS/GeoJSON | **Yes** | ChoroplethRenderer, HeatmapRenderer, UniformColorRenderer |
| **Textual** | ExecutionResults (from predecessors) | HTML/PDF | **Yes** | ReportGenerator |

**关键约束：**
1. ✅ **终端节点必须是最后一步**：Visualization和Textual类Plugin只能是Goal的最后一个Executor
2. ✅ **统计类和运算类可串联**：形成pipeline，如 `Filter → Statistics → Choropleth`
3. ✅ **运算类支持多输出**：OverlayAnalysis可输出多个NativeData（交集、并集、差集）
4. ❌ **不支持分支执行**：一个步骤的输出不作为多个后续步骤的输入（通过重复执行实现）

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
      | 'native_data'  // Computational: 新的NativeData（可多个）
      | 'mvt'          // Visualization: MVT服务
      | 'wms'          // Visualization: WMS服务
      | 'geojson'      // Visualization: GeoJSON文件（如热力图）
      | 'html'         // Textual: HTML报告
      | 'pdf';         // Textual: PDF报告
    
    // 是否为终端节点（Visualization/Textual为true）
    isTerminalNode: boolean;
    
    // 是否支持多输出（仅Computational类可能为true）
    supportsMultipleOutputs?: boolean;
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
      case 'wms':
        return 'raster';
      default:
        throw new Error(`Unknown data source type: ${type}`);
    }
  }
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

**OverlayAnalysis（运算类 - 多输出）:**
```typescript
{
  executionCategory: 'computational',
  inputRequirements: {
    supportedDataFormats: ['vector'],
    supportedGeometryTypes: ['Polygon'],
    requiredFields: []
  },
  outputCapabilities: {
    outputType: 'native_data',
    isTerminalNode: false,
    supportsMultipleOutputs: true  // 可输出intersection, union, difference等多个结果
  },
  scenarios: ['spatial_overlay', 'intersection_analysis', 'union_operation'],
  priority: 5
}
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

#### 3.1.6 Capability Registry

```typescript
class PluginCapabilityRegistry {
  private registry: Map<string, PluginCapability> = new Map();
  
  // 注册plugin capability
  register(pluginId: string, capability: PluginCapability): void {
    this.registry.set(pluginId, capability);
  }
  
  // 根据执行类别过滤
  filterByCategory(category: PluginExecutionCategory): string[] {
    return Array.from(this.registry.entries())
      .filter(([_, cap]) => cap.executionCategory === category)
      .map(([id, _]) => id);
  }
  
  // 根据条件过滤兼容的plugin
  filterByCapability(criteria: CapabilityCriteria): string[] {
    return Array.from(this.registry.entries())
      .filter(([_, cap]) => this.matchesCriteria(cap, criteria))
      .map(([id, _]) => id);
  }
  
  // 获取plugin的capability
  getCapability(pluginId: string): PluginCapability | undefined {
    return this.registry.get(pluginId);
  }
  
  private matchesCriteria(cap: PluginCapability, criteria: CapabilityCriteria): boolean {
    // Check data format compatibility
    if (criteria.dataFormat && !cap.inputRequirements.supportedDataFormats?.includes(criteria.dataFormat)) {
      return false;
    }
    
    // Check geometry type compatibility
    if (criteria.geometryType && !cap.inputRequirements.supportedGeometryTypes?.includes(criteria.geometryType)) {
      return false;
    }
    
    // Check execution category
    if (criteria.expectedCategory && cap.executionCategory !== criteria.expectedCategory) {
      return false;
    }
    
    return true;
  }
}

interface CapabilityCriteria {
  dataFormat?: 'vector' | 'raster';
  geometryType?: GeometryType;
  expectedCategory?: PluginExecutionCategory;
  hasNumericField?: boolean;
  hasCategoricalField?: boolean;
}
```

#### 3.1.2 Capability Registry

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

#### 3.2.2 Stage 2: Terminal Node Constraint Validation

**规则1：终端节点必须是最后一步**

```typescript
private validateTerminalConstraints(
  plugins: PluginMetadata[],
  existingPlan?: ExecutionPlan
): PluginMetadata[] {
  if (!existingPlan || existingPlan.steps.length === 0) {
    // No existing steps, all plugins are valid
    return plugins;
  }
  
  // Check if plan already has a terminal node
  const hasTerminalNode = existingPlan.steps.some(step => {
    const plugin = this.registry.getPlugin(step.pluginId);
    return plugin.capability.outputCapabilities.isTerminalNode;
  });
  
  if (hasTerminalNode) {
    // Cannot add any more plugins after terminal node
    console.warn('[TaskPlanner] Plan already has terminal node, cannot add more steps');
    return [];
  }
  
  // Filter out terminal nodes if there are existing non-terminal steps
  // (This is a soft constraint - LLM can still choose terminal node as the last step)
  return plugins;
}
```

**规则2：文本类Plugin需要前序结果**

```typescript
private validateTextualPluginRequirements(
  plugin: PluginMetadata,
  existingPlan?: ExecutionPlan
): boolean {
  if (plugin.capability.executionCategory !== 'textual') {
    return true;  // Non-textual plugins don't have this requirement
  }
  
  if (!existingPlan || existingPlan.steps.length === 0) {
    console.warn('[TaskPlanner] Textual plugin requires at least one predecessor');
    return false;
  }
  
  // Check if predecessors are of valid types
  const predecessors = existingPlan.steps.slice(0, -1);
  const hasValidPredecessor = predecessors.some(step => {
    const predPlugin = this.registry.getPlugin(step.pluginId);
    return ['statistical', 'computational', 'visualization'].includes(
      predPlugin.capability.executionCategory
    );
  });
  
  if (!hasValidPredecessor) {
    console.warn('[TaskPlanner] Textual plugin requires valid predecessor');
    return false;
  }
  
  return true;
}
```

**规则3：执行计划验证**

```typescript
function validateExecutionPlan(plan: ExecutionPlan, registry: PluginRegistry): ValidationResult {
  const errors: string[] = [];
  
  // Find terminal nodes
  const terminalSteps = plan.steps.filter(step => {
    const plugin = registry.getPlugin(step.pluginId);
    return plugin.capability.outputCapabilities.isTerminalNode;
  });
  
  // Rule: At most one terminal node
  if (terminalSteps.length > 1) {
    errors.push('Plan can have at most one terminal node');
  }
  
  // Rule: Terminal node must be the last step
  if (terminalSteps.length === 1) {
    const lastStep = plan.steps[plan.steps.length - 1];
    const terminalStep = terminalSteps[0];
    
    if (lastStep.stepId !== terminalStep.stepId) {
      errors.push(`Terminal node ${terminalStep.pluginId} must be the last step`);
    }
  }
  
  // Rule: Textual plugin must have predecessors
  const textualSteps = plan.steps.filter(step => {
    const plugin = registry.getPlugin(step.pluginId);
    return plugin.capability.executionCategory === 'textual';
  });
  
  if (textualSteps.length > 0 && plan.steps.length < 2) {
    errors.push('Textual plugins require at least one predecessor step');
  }
  
  return { valid: errors.length === 0, errors };
}
```

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
