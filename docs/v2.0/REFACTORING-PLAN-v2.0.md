# GeoAI-UP v2.0 重构升级规划

## 📋 文档说明

**版本**: v2.0.0  
**分支**: dev-v2.0  
**创建日期**: 2026-05-09  
**重构原则**: **不考虑向后兼容**,彻底优化架构设计

本文档基于当前 v1.0 实际代码架构,提出系统性重构方案,重点解决以下核心问题:

1. **GIS空间分析任务拆分策略升级** - 从通用LLM拆分转向四层递进式GIS专属策略
2. **数据访问层统一抽象** - 消除Accessor冗余,建立标准化空间算子接口
3. **执行器架构简化** - 合并Executor/Plugin/Tool三层为统一的SpatialOperator
4. **服务发布机制重构** - 统一MVT/WMS/GeoJSON发布流程
5. **工作流引擎增强** - 支持并行执行、中间结果持久化、异常回退

---

## 🎯 重构目标

### 核心目标

| 目标 | 当前状态 (v1.0) | 目标状态 (v2.0) |
|------|----------------|----------------|
| **任务拆分** | 通用LLM意图识别,缺乏GIS语义 | 四层递进式:语义→业务→流程→算子 |
| **数据访问** | Accessor按格式分散(File/PostGIS/Web) | 统一DataAccessor接口,按能力分类 |
| **执行器** | Plugin→Executor→Tool三层嵌套 | 单一SpatialOperator抽象 |
| **服务发布** | MVT/WMS独立Publisher | 统一VisualizationServicePublisher |
| **工作流** | 串行执行,无并行优化 | DAG编排,支持并行+串行混合 |
| **错误处理** | 简单try-catch | 异常回退+中间结果保留 |

### 性能指标提升

- **任务规划准确率**: 75% → 95% (通过行业因子库+数据校验)
- **空间分析执行速度**: 提升40-60% (并行计算+缓存优化)
- **内存占用**: 降低30% (流式处理+延迟加载)
- **代码可维护性**: Cyclomatic Complexity降低50%

---

## 🏗️ 架构重构详解

### 一、任务拆分策略升级 (Goal Splitter + Task Planner)

#### 1.1 问题分析 (v1.0)

**当前实现**:
- `GoalSplitterAgent`: 仅做通用意图分类(spatial_analysis/general/query)
- `TaskPlannerAgent`: 基于PluginCapabilityRegistry过滤,但缺乏GIS业务逻辑
- **缺失**: 隐含因子补全、数据可用性校验、并行/串行区分

**代码位置**:
```typescript
// server/src/llm-interaction/agents/GoalSplitterAgent.ts
async execute(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
  // 仅调用LLM进行通用拆分,未结合GIS知识库
  const promptTemplate = await this.promptManager.loadTemplate('goal-splitting', 'en-US');
  // ...
}

// server/src/llm-interaction/agents/TaskPlannerAgent.ts
private filterPluginsByGoalDescription(goal: any): string[] {
  // 简单按category过滤,无数据校验
  const matches = PluginCapabilityRegistry.filterByCapability({
    expectedCategory: category,
    isTerminalAllowed: true
  });
  return matches;
}
```

#### 1.2 重构方案 (v2.0)

**核心设计理念: 智能因子推断 (Intelligent Factor Inference)**

v2.0的核心优势是**无需用户显式指定分析因子**,LLM会基于以下三层机制自动推断:

1. **行业知识库驱动**: 从预定义的行业因子库中匹配标准因子
2. **数据可用性校验**: 只使用平台当前可用的数据源
3. **常识推理补充**: 对于非标准场景,基于地理学常识动态生成因子

**三种交互模式**:

| 模式 | 用户输入示例 | LLM行为 | 适用场景 |
|------|------------|---------|----------|
| **完全自动** | "帮我选址开婴幼儿店" | 从知识库加载标准因子+数据校验 | 80%常规场景 |
| **半自动** | "选址时重点考虑学校和医院" | 加载标准因子+用户强调的因子优先 | 15%定制场景 |
| **完全手动** | "用人口数据和路网做叠加分析" | 直接使用用户指定的算子 | 5%专业场景 |

**新增组件**:

1. **GISIndustryKnowledgeBase** - 行业选址因子库
   ```typescript
   // server/src/llm-interaction/knowledge/GISIndustryKnowledgeBase.ts
   export interface IndustryFactorProfile {
     industry: string; // 'retail_baby_store', 'healthcare', 'education'
     coreFactors: Array<{
       factorId: string;
       name: string;
       dataType: 'vector' | 'raster';
       requiredDataSources: string[]; // ['population', 'schools', 'hospitals']
       defaultWeight: number;
     }>;
     analysisWorkflow: AnalysisWorkflowTemplate;
   }
   
   export class GISIndustryKnowledgeBase {
     private profiles: Map<string, IndustryFactorProfile>;
     
     getFactorsForIndustry(industry: string): IndustryFactorProfile;
     validateDataAvailability(factors: string[], dataSourceRegistry: DataSourceRegistry): ValidationResult;
   }
   ```

2. **DataAvailabilityChecker** - 数据可用性校验器
   ```typescript
   // server/src/llm-interaction/validators/DataAvailabilityChecker.ts
   export class DataAvailabilityChecker {
     constructor(private dataSourceService: DataSourceService);
     
     async checkRequiredData(requiredDataSources: string[]): Promise<DataCheckResult> {
       // 查询DataSourceService确认数据是否存在
       // 返回缺失数据清单和替代建议
     }
   }
   ```

3. **ParallelTaskAnalyzer** - 并行任务分析器
   ```typescript
   // server/src/llm-interaction/analyzers/ParallelTaskAnalyzer.ts
   export class ParallelTaskAnalyzer {
     analyzeDependencies(steps: ExecutionStep[]): TaskDependencyGraph {
       // 分析步骤间的数据依赖关系
       // 识别可并行的独立因子计算任务
       // 返回DAG图
     }
   }
   ```

**重构后的GoalSplitterAgent**:
```typescript
export class GoalSplitterAgent {
  private knowledgeBase: GISIndustryKnowledgeBase;
  private dataChecker: DataAvailabilityChecker;
  
  async execute(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
    // Layer 1: 语义解析 - 识别用户意图和行业类型
    const semanticResult = await this.parseSemantics(state.userInput);
    // → { taskType: 'site_selection', industry: 'retail_baby_store', ... }
    
    // Layer 2: 行业因子补全 - 从知识库加载标准因子
    const industryProfile = this.knowledgeBase.getFactorsForIndustry(semanticResult.industry);
    // → 返回6个标准因子: [population_0_6, kindergarten, hospital, road, competitor, housing_price]
    
    // Layer 3: 数据可用性校验 - 检查平台有哪些数据
    const dataValidation = await this.dataChecker.checkRequiredData(
      industryProfile.coreFactors.map(f => f.requiredDataSources).flat()
    );
    // → { 
    //     available: ['population_grid_0_6', 'poi_education_kindergarten', 'road_network'],
    //     missing: ['poi_healthcare_maternal', 'poi_competitor_baby_store', 'housing_price_raster']
    //   }
    
    // Layer 4: 智能因子筛选 - 只保留有数据的因子
    const selectedFactors = industryProfile.coreFactors.filter(factor => {
      const hasData = factor.requiredDataSources.every(source => 
        dataValidation.available.includes(source)
      );
      return hasData;
    });
    
    // Layer 5: 生成可解释的分析计划
    if (selectedFactors.length === 0) {
      return {
        goals: [],
        errors: [{ 
          goalId: 'validation', 
          error: `Missing required data: ${dataValidation.missingSources.join(', ')}`,
          suggestions: dataValidation.suggestions // 提供替代方案
        }]
      };
    }
    
    // 生成最终目标
    return {
      goals: [{
        id: generateId(),
        description: semanticResult.description,
        type: 'spatial_site_selection',
        parameters: {
          industry: semanticResult.industry,
          factors: selectedFactors.map(f => ({
            factorId: f.factorId,
            name: f.name,
            weight: f.defaultWeight,
            dataSource: f.requiredDataSources[0],
            rationale: f.rationale // "为什么选择这个因子"
          })),
          skippedFactors: industryProfile.coreFactors
            .filter(f => !selectedFactors.includes(f))
            .map(f => ({
              factorId: f.factorId,
              reason: `Missing data: ${f.requiredDataSources.join(', ')}`,
              suggestion: '请上传相关数据或使用替代因子'
            }))
        },
        priority: 5
      }]
    };
  }
  
  private async parseSemantics(userInput: string): Promise<SemanticResult> {
    // 使用LLM进行意图识别和行业分类
    const prompt = await this.promptManager.loadTemplate('intent-classification-v2');
    const result = await this.llm.invoke(prompt, { userInput });
    return result;
  }
}
```

**用户看到的反馈示例**:
```markdown
## 选址分析计划

✅ **已选择的分析因子** (基于可用数据):
1. **0-6岁人口密度** (权重: 25%)
   - 数据来源: population_grid_0_6
   - 理由: 婴幼儿用品店核心客群是0-6岁儿童家庭

2. **幼儿园 proximity** (权重: 20%)
   - 数据来源: poi_education_kindergarten
   - 理由: 家长接送孩子时会产生顺便购物需求

3. **道路可达性** (权重: 15%)
   - 数据来源: road_network
   - 理由: 良好的交通可达性提升店铺曝光度

⚠️ **跳过的因子** (缺少数据):
- 妇幼医院 proximity (缺少数据: poi_healthcare_maternal)
- 竞品避让 (缺少数据: poi_competitor_baby_store)
- 房价圈层 (缺少数据: housing_price_raster)

💡 **建议**: 上传缺失数据可获得更准确的分析结果，或点击"开始分析"使用现有因子。
```

**重构后的TaskPlannerAgent**:
```typescript
export class TaskPlannerAgent {
  private parallelAnalyzer: ParallelTaskAnalyzer;
  
  async execute(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
    const executionPlans = new Map<string, ExecutionPlan>();
    
    for (const goal of state.goals) {
      // 检查是否为专家模式 (用户显式指定算子)
      if (goal.parameters?.expertMode) {
        // 模式3: 完全手动 - 直接解析用户指定的算子序列
        executionPlans.set(goal.id, await this.handleExpertMode(goal));
      } else if (goal.parameters?.userSpecifiedFactors) {
        // 模式2: 半自动 - 合并用户因子 + 标准因子
        executionPlans.set(goal.id, await this.handleSemiAutoMode(goal));
      } else {
        // 模式1: 完全自动 - 使用GoalSplitter推荐的因子
        executionPlans.set(goal.id, await this.handleFullAutoMode(goal));
      }
    }
    
    return { executionPlans };
  }
  
  /**
   * 模式1: 完全自动 - 标准流程
   */
  private async handleFullAutoMode(goal: AnalysisGoal): Promise<ExecutionPlan> {
    // Stage 1: 业务阶段拆分
    const businessPhases = this.splitBusinessPhases(goal);
    
    // Stage 2: GIS流程拆解
    const gisWorkflows = await this.decomposeToGISWorkflows(businessPhases);
    
    // Stage 3: 原子算子映射
    const atomicSteps = await this.mapToAtomicOperators(gisWorkflows);
    
    // Stage 4: 并行/串行分析
    const dependencyGraph = this.parallelAnalyzer.analyzeDependencies(atomicSteps);
    
    // Stage 5: 生成带依赖关系的执行计划
    return {
      goalId: goal.id,
      steps: this.flattenDAG(dependencyGraph),
      requiredOperators: this.extractRequiredOperators(atomicSteps),
      parallelGroups: dependencyGraph.parallelGroups,
      executionMode: 'hybrid'
    };
  }
  
  /**
   * 模式2: 半自动 - 用户强调某些因子
   */
  private async handleSemiAutoMode(goal: AnalysisGoal): Promise<ExecutionPlan> {
    const userFactors = goal.parameters.userSpecifiedFactors;
    const standardFactors = goal.parameters.factors;
    
    // 合并因子，提升用户强调因子的权重
    const mergedFactors = this.mergeFactorsWithPriority(userFactors, standardFactors);
    
    // 重新归一化权重
    this.normalizeWeights(mergedFactors);
    
    // 继续标准流程
    return await this.handleFullAutoMode({
      ...goal,
      parameters: { ...goal.parameters, factors: mergedFactors }
    });
  }
  
  /**
   * 模式3: 完全手动 - 专家模式
   */
  private async handleExpertMode(goal: AnalysisGoal): Promise<ExecutionPlan> {
    // 直接解析用户指定的算子序列
    const operatorSequence = await this.parseOperatorSequence(goal.description);
    
    return {
      goalId: goal.id,
      steps: operatorSequence.map((op, index) => ({
        stepId: `step_${index}`,
        pluginId: op.operator,
        parameters: op.params,
        dependsOn: index > 0 ? [`step_${index - 1}`] : []
      })),
      requiredOperators: operatorSequence.map(op => op.operator),
      parallelGroups: [], // 专家模式不自动并行
      executionMode: 'sequential'
    };
  }
}
```

#### 1.3 提示词模板升级

**新增提示词文件**:
```
workspace/llm/prompts/en-US/
├── intent-classification-v2.md      # 意图识别与行业分类
├── goal-splitting-v2.md             # 新版目标拆分(含智能因子推断)
├── task-planning-v2.md              # 新版任务规划(含并行分析)
├── industry-factor-library.json     # 行业因子配置
└── atomic-operator-mapping.md       # 算子映射规则
```

**intent-classification-v2.md 核心内容**:
```markdown
# Intent Classification & Industry Detection (v2.0)

## Role
You are a GIS spatial analysis expert. Your task is to classify user intent and detect the industry type.

## Classification Categories

### Task Types
- `site_selection`: Finding optimal locations for businesses/facilities
- `suitability_analysis`: Evaluating areas based on multiple criteria
- `risk_assessment`: Identifying high-risk zones (flood, earthquake, etc.)
- `general_query`: Non-spatial questions or simple data queries

### Industry Types (for site_selection)
When task_type is 'site_selection', identify the industry:
- `retail_baby_store`: Baby products store, children's shop
- `retail_restaurant`: Restaurant, cafe, food service
- `healthcare_clinic`: Community clinic, pharmacy, medical center
- `education_training`: School, training center, tutoring
- `logistics_warehouse`: Warehouse, distribution center
- `retail_general`: General retail (if industry unclear)

## Output Format
Return JSON with:
{
  "taskType": "site_selection",
  "industry": "retail_baby_store",
  "confidence": 0.95,
  "geographicScope": "default_coverage",
  "userSpecifiedFactors": [], // If user explicitly mentioned factors
  "expertMode": false // True if user specified exact operators
}

## Examples

### Example 1: Fully Automatic
User: "Help me find the best location for a baby store"
Output: {
  "taskType": "site_selection",
  "industry": "retail_baby_store",
  "confidence": 0.98,
  "userSpecifiedFactors": [],
  "expertMode": false
}

### Example 2: Semi-Automatic
User: "For restaurant选址, focus on foot traffic and office buildings"
Output: {
  "taskType": "site_selection",
  "industry": "retail_restaurant",
  "confidence": 0.92,
  "userSpecifiedFactors": ["foot_traffic", "office_buildings"],
  "expertMode": false
}

### Example 3: Expert Mode
User: "Buffer the population data by 500m, then overlay with road network"
Output: {
  "taskType": "spatial_analysis",
  "industry": null,
  "confidence": 0.99,
  "userSpecifiedFactors": [],
  "expertMode": true
}
```

**goal-splitting-v2.md 核心内容**:
```markdown
# GIS Spatial Analysis Goal Splitting (v2.0)

## Role
You are a GIS spatial analysis expert specializing in site selection and suitability analysis.

## Intelligent Factor Inference Strategy

When users don't specify analysis factors, automatically infer based on:

### 1. Industry Knowledge Base
Load standard factors from industry profiles:

#### Retail - Baby Store
- Population density (0-6 years age group) → Core customer base
- Proximity to schools/kindergartens → Parent pickup/drop-off traffic
- Proximity to hospitals/maternal care → Family-oriented area indicator
- Traffic accessibility (road network) → Store visibility and access
- Competitor locations → Avoidance zones (if data available)
- Residential property values → Income level proxy

#### Retail - Restaurant
- Foot traffic density → Customer volume potential
- Office building proximity → Lunch/dinner demand
- Tourist attraction proximity → Visitor customer base
- Public transport access → Customer convenience
- Competitor density → Market saturation check

### 2. Data Availability Check
Only include factors where data exists in the platform:
- If population data missing → Skip or suggest alternative (nighttime light)
- If competitor data missing → Skip or use general retail POI
- Always prioritize available data over ideal factors

### 3. Common Sense Reasoning
For non-standard scenarios, apply geographic principles:
- Retail needs customer density + accessibility
- Healthcare needs population coverage + emergency access
- Education needs residential concentration + safety

## Output Format
Return structured JSON with:
{
  "industry": "retail_baby_store",
  "explicitGoals": ["Find optimal locations for baby store"],
  "inferredFactors": [
    {
      "factorId": "population_density_0_6",
      "name": "0-6岁人口密度",
      "dataSource": "population_grid_0_6",
      "weight": 0.25,
      "rationale": "婴幼儿用品店核心客群是0-6岁儿童家庭"
    },
    // ... more factors
  ],
  "skippedFactors": [
    {
      "factorId": "competitor_avoidance",
      "reason": "Missing data: poi_competitor_baby_store",
      "suggestion": "Upload competitor data or use general retail POI"
    }
  ],
  "analysisRange": "default_coverage",
  "expectedOutput": {
    "type": "points_with_scores",
    "format": "geojson"
  }
}
```

---

### 二、数据访问层重构 (Data Access Layer)

#### 2.1 问题分析 (v1.0)

**当前实现**:
- Accessor按**数据格式**分类: `FileAccessor`, `PostGISAccessor`, `WebServiceAccessor`
- 每个Accessor实现完整的CRUD + 空间分析操作
- **问题**: 
  - 代码重复: buffer/overlay/filter在每个Accessor中重复实现
  - 能力不统一: FileAccessor可能不支持某些空间操作
  - 难以扩展: 新增数据源需重写所有方法

**代码示例**:
```typescript
// server/src/data-access/accessors/FileAccessor.ts
export class FileAccessor implements DataAccessor {
  async buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
    // 使用GDAL OGR执行缓冲区分析
    const ds = gdal.open(reference);
    // ... 100+ lines of GDAL code
  }
  
  async overlay(ref1: string, ref2: string, options: OverlayOptions): Promise<NativeData> {
    // 再次使用GDAL OGR执行叠加分析
    // ... 另100+ lines of GDAL code
  }
}

// server/src/data-access/accessors/PostGISAccessor.ts
export class PostGISAccessor implements DataAccessor {
  async buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
    // 使用PostGIS ST_Buffer执行
    const sql = `SELECT ST_Buffer(geom, ${distance}) FROM ${reference}`;
    // ... 完全不同的实现
  }
}
```

#### 2.2 重构方案 (v2.0)

**核心思想**: 将Accessor从**格式驱动**改为**能力驱动**

**新架构**:
```
Data Access Layer v2.0
├── SpatialOperator (核心抽象)
│   ├── BufferOperator
│   ├── OverlayOperator
│   ├── FilterOperator
│   ├── AggregateOperator
│   └── SpatialJoinOperator
│
├── DataBackend (后端适配器)
│   ├── GDALBackend (file-based: Shapefile, GeoJSON, GeoTIFF)
│   ├── PostGISBackend (database)
│   └── WebServiceBackend (WMS/WFS)
│
└── DataAccessFacade (统一入口)
    └── execute(operator: SpatialOperator, source: DataSource): Promise<NativeData>
```

**新增接口定义**:
```typescript
// server/src/data-access/operators/SpatialOperator.ts
export interface SpatialOperator {
  readonly operatorType: 'buffer' | 'overlay' | 'filter' | 'aggregate' | 'spatial_join';
  execute(source: DataSource, params: OperatorParams): Promise<NativeData>;
}

export interface BufferOperator extends SpatialOperator {
  readonly operatorType: 'buffer';
  params: {
    distance: number;
    unit: 'meters' | 'kilometers' | 'degrees';
    dissolve?: boolean;
  };
}

// server/src/data-access/backends/DataBackend.ts
export interface DataBackend {
  readonly backendType: 'gdal' | 'postgis' | 'web_service';
  supports(operatorType: string): boolean;
  execute(operator: SpatialOperator, source: DataSource): Promise<NativeData>;
}

export class GDALBackend implements DataBackend {
  readonly backendType = 'gdal';
  
  supports(operatorType: string): boolean {
    // GDAL支持所有矢量空间操作
    return ['buffer', 'overlay', 'filter', 'aggregate', 'spatial_join'].includes(operatorType);
  }
  
  async execute(operator: SpatialOperator, source: DataSource): Promise<NativeData> {
    // 统一的GDAL执行逻辑
    switch (operator.operatorType) {
      case 'buffer':
        return this.executeBuffer(operator as BufferOperator, source);
      case 'overlay':
        return this.executeOverlay(operator as OverlayOperator, source);
      // ...
    }
  }
}
```

**DataAccessFacade实现**:
```typescript
// server/src/data-access/facade/DataAccessFacade.ts
export class DataAccessFacade {
  private backends: Map<string, DataBackend>;
  
  constructor() {
    this.backends = new Map([
      ['gdal', new GDALBackend()],
      ['postgis', new PostGISBackend()],
      ['web_service', new WebServiceBackend()]
    ]);
  }
  
  async execute(operator: SpatialOperator, source: DataSource): Promise<NativeData> {
    // 1. 根据数据源类型选择后端
    const backend = this.selectBackend(source);
    
    // 2. 检查后端是否支持该操作
    if (!backend.supports(operator.operatorType)) {
      throw new Error(`Backend ${backend.backendType} does not support ${operator.operatorType}`);
    }
    
    // 3. 执行操作
    return await backend.execute(operator, source);
  }
  
  private selectBackend(source: DataSource): DataBackend {
    switch (source.type) {
      case 'shapefile':
      case 'geojson':
      case 'geotiff':
        return this.backends.get('gdal')!;
      case 'postgis':
        return this.backends.get('postgis')!;
      case 'wms':
      case 'wfs':
        return this.backends.get('web_service')!;
      default:
        throw new Error(`Unsupported data source type: ${source.type}`);
    }
  }
}
```

**优势对比**:

| 维度 | v1.0 (格式驱动) | v2.0 (能力驱动) |
|------|----------------|----------------|
| **代码复用** | ❌ 每个Accessor重复实现 | ✅ Operator逻辑集中 |
| **扩展性** | ❌ 新增格式需重写所有方法 | ✅ 只需添加新Backend |
| **一致性** | ❌ 不同Accessor行为可能不一致 | ✅ 统一Operator接口 |
| **测试难度** | ❌ 需测试N×M组合 | ✅ 分别测试Operator和Backend |

---

### 三、执行器架构简化 (Plugin → SpatialOperator)

#### 3.1 问题分析 (v1.0)

**当前三层架构**:
```
Plugin Definition (plugin.json)
    ↓
Plugin Executor (BufferAnalysisExecutor)
    ↓
PluginToolWrapper (LangChain Tool)
    ↓
ToolRegistry
```

**问题**:
1. **职责重叠**: Plugin定义元数据,Executor实现逻辑,ToolWrapper转换格式
2. **注册复杂**: 需要同时注册Plugin、Executor、Tool
3. **调试困难**: 错误需要在三层之间追踪

**代码示例**:
```typescript
// 1. Plugin定义
export const BufferAnalysisPlugin: Plugin = {
  id: 'buffer_analysis',
  name: 'Buffer Analysis',
  // ... metadata
};

// 2. Executor实现
export class BufferAnalysisExecutor implements IPluginExecutor {
  constructor(private db: Database, private workspaceBase: string) {}
  
  async execute(params: BufferAnalysisParams): Promise<any> {
    // 实际执行逻辑
  }
}

// 3. ToolWrapper转换
export class PluginToolWrapper extends StructuredTool {
  async _call(input: Record<string, any>): Promise<string> {
    const executor = ExecutorRegistryInstance.getExecutor(this.pluginId);
    const result = await executor.execute(input);
    return JSON.stringify(result);
  }
}

// 4. 三重注册
PluginCapabilityRegistry.register(pluginId, plugin, capability);
ExecutorRegistryInstance.register(pluginId, factory);
ToolRegistryInstance.registerTool(tool);
```

#### 3.2 重构方案 (v2.0)

**统一为SpatialOperator**:
```typescript
// server/src/spatial-operators/SpatialOperator.ts
export abstract class SpatialOperator {
  abstract readonly operatorId: string;
  abstract readonly operatorType: 'buffer' | 'overlay' | 'filter' | 'visualization';
  abstract readonly inputSchema: ZodSchema;
  abstract readonly outputSchema: ZodSchema;
  
  // 元数据
  getMetadata(): OperatorMetadata {
    return {
      id: this.operatorId,
      type: this.operatorType,
      name: this.getName(),
      description: this.getDescription(),
      capabilities: this.getCapabilities()
    };
  }
  
  // 核心执行方法
  abstract execute(params: any, context: OperatorContext): Promise<OperatorResult>;
  
  // 可选:流式执行(用于大规模数据)
  async *executeStream?(params: any, context: OperatorContext): AsyncGenerator<PartialResult> {
    yield* this.defaultStreamExecution(params, context);
  }
  
  // 钩子方法
  protected abstract getName(): string;
  protected abstract getDescription(): string;
  protected abstract getCapabilities(): string[];
}

export interface OperatorContext {
  dataSourceService: DataSourceService;
  dataAccessFacade: DataAccessFacade;
  workspaceBase: string;
  conversationId: string;
  stepId: string;
}

export interface OperatorResult {
  success: boolean;
  resultId?: string;
  type: 'native_data' | 'visualization_service' | 'report';
  reference?: string;
  metadata?: Record<string, any>;
  error?: string;
}
```

**具体Operator实现**:
```typescript
// server/src/spatial-operators/BufferOperator.ts
export class BufferOperator extends SpatialOperator {
  readonly operatorId = 'buffer_analysis';
  readonly operatorType = 'buffer';
  
  inputSchema = z.object({
    dataSourceId: z.string().describe('Source data ID'),
    distance: z.number().positive().describe('Buffer distance'),
    unit: z.enum(['meters', 'kilometers', 'degrees']).default('meters'),
    dissolve: z.boolean().optional().default(false)
  });
  
  outputSchema = z.object({
    resultId: z.string(),
    type: z.literal('native_data'),
    reference: z.string()
  });
  
  async execute(params: z.infer<typeof this.inputSchema>, context: OperatorContext): Promise<OperatorResult> {
    try {
      // 1. 获取数据源
      const dataSource = await context.dataSourceService.getDataSource(params.dataSourceId);
      
      // 2. 构建Operator
      const bufferOp: BufferOperator = {
        operatorType: 'buffer',
        params: {
          distance: params.distance,
          unit: params.unit,
          dissolve: params.dissolve
        }
      };
      
      // 3. 通过DataAccessFacade执行
      const result = await context.dataAccessFacade.execute(bufferOp, dataSource);
      
      // 4. 注册结果
      const resultId = await context.dataSourceService.registerResult(result, {
        conversationId: context.conversationId,
        stepId: context.stepId
      });
      
      return {
        success: true,
        resultId,
        type: 'native_data',
        reference: result.reference,
        metadata: result.metadata
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  protected getName() { return 'Buffer Analysis'; }
  protected getDescription() { return 'Create buffer zones around features'; }
  protected getCapabilities() { return ['computational', 'spatial_analysis']; }
}
```

**统一注册表**:
```typescript
// server/src/spatial-operators/SpatialOperatorRegistry.ts
export class SpatialOperatorRegistry {
  private static instance: SpatialOperatorRegistry;
  private operators: Map<string, SpatialOperator> = new Map();
  
  static getInstance(): SpatialOperatorRegistry {
    if (!SpatialOperatorRegistry.instance) {
      SpatialOperatorRegistry.instance = new SpatialOperatorRegistry();
    }
    return SpatialOperatorRegistry.instance;
  }
  
  register(operator: SpatialOperator): void {
    this.operators.set(operator.operatorId, operator);
  }
  
  get(operatorId: string): SpatialOperator | undefined {
    return this.operators.get(operatorId);
  }
  
  listAll(): SpatialOperator[] {
    return Array.from(this.operators.values());
  }
  
  // LangChain Tool适配器(仅在需要时创建)
  toLangChainTool(operatorId: string): StructuredTool | null {
    const operator = this.get(operatorId);
    if (!operator) return null;
    
    return new OperatorAsTool(operator);
  }
}

// 简化的Tool适配器
class OperatorAsTool extends StructuredTool {
  constructor(private operator: SpatialOperator) {
    super();
    this.name = operator.operatorId;
    this.description = operator.getDescription();
    this.schema = operator.inputSchema;
  }
  
  async _call(input: Record<string, any>): Promise<string> {
    const context: OperatorContext = {
      dataSourceService: DataSourceServiceInstance,
      dataAccessFacade: DataAccessFacadeInstance,
      workspaceBase: process.env.WORKSPACE_BASE!,
      conversationId: input.conversationId,
      stepId: input.stepId
    };
    
    const result = await this.operator.execute(input, context);
    return JSON.stringify(result);
  }
}
```

**注册简化**:
```typescript
// server/src/spatial-operators/registerOperators.ts
export function registerAllOperators(): void {
  const registry = SpatialOperatorRegistry.getInstance();
  
  // 一次性注册,无需三重注册
  registry.register(new BufferOperator());
  registry.register(new OverlayOperator());
  registry.register(new FilterOperator());
  registry.register(new HeatmapOperator());
  // ...
  
  console.log(`[Operator Registry] Registered ${registry.listAll().length} operators`);
}
```

---

### 四、服务发布机制统一 (Visualization Service Publisher)

#### 4.1 问题分析 (v1.0)

**当前实现**:
- `MVTPublisher`: 专门处理MVT瓦片
- `WMSController`: 单独处理WMS服务
- `ServicePublisher`: 简单的URL生成器,无实际发布逻辑
- **问题**: 发布逻辑分散,无法统一管理TTL、缓存、清理

#### 4.2 重构方案 (v2.0)

**统一VisualizationServicePublisher**:
```typescript
// server/src/services/VisualizationServicePublisher.ts
export interface VisualizationServiceConfig {
  type: 'mvt' | 'wms' | 'geojson' | 'image' | 'report';
  sourceData: NativeData;
  styling?: StyleConfig;
  ttl?: number; // seconds
  cacheEnabled?: boolean;
}

export class VisualizationServicePublisher {
  private services: Map<string, PublishedService>;
  private mvtEngine: MVTEngine;
  private wmsEngine: WMSEngine;
  
  async publish(config: VisualizationServiceConfig): Promise<PublishedService> {
    const serviceId = generateServiceId();
    
    let serviceUrl: string;
    let metadata: Record<string, any> = {};
    
    switch (config.type) {
      case 'mvt':
        const tilesetId = await this.mvtEngine.publish(config.sourceData, config.styling);
        serviceUrl = `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`;
        metadata = { tilesetId, minZoom: 0, maxZoom: 18 };
        break;
        
      case 'wms':
        const layerId = await this.wmsEngine.publish(config.sourceData, config.styling);
        serviceUrl = `/api/services/wms/${layerId}`;
        metadata = { layerId, crs: 'EPSG:4326' };
        break;
        
      case 'geojson':
        const geojsonPath = await this.saveGeoJSON(config.sourceData);
        serviceUrl = `/api/results/${serviceId}.geojson`;
        metadata = { filePath: geojsonPath };
        break;
        
      default:
        throw new Error(`Unsupported service type: ${config.type}`);
    }
    
    const service: PublishedService = {
      id: serviceId,
      type: config.type,
      url: serviceUrl,
      ttl: config.ttl || 86400, // 默认24小时
      expiresAt: new Date(Date.now() + (config.ttl || 86400) * 1000),
      metadata,
      createdAt: new Date()
    };
    
    this.services.set(serviceId, service);
    
    // 设置自动清理
    setTimeout(() => this.cleanup(serviceId), service.ttl * 1000);
    
    return service;
  }
  
  async publishBatch(results: Map<string, AnalysisResult>): Promise<VisualizationService[]> {
    const services: VisualizationService[] = [];
    
    // 并行发布所有服务
    const publishPromises = Array.from(results.entries()).map(async ([stepId, result]) => {
      if (result.status !== 'success' || !result.data) return null;
      
      const config: VisualizationServiceConfig = {
        type: this.detectServiceType(result.data),
        sourceData: result.data,
        ttl: 86400
      };
      
      const service = await this.publish(config);
      return {
        id: service.id,
        stepId,
        goalId: result.goalId,
        type: service.type,
        url: service.url,
        ttl: service.ttl,
        expiresAt: service.expiresAt,
        metadata: service.metadata
      };
    });
    
    const publishedServices = await Promise.all(publishPromises);
    return publishedServices.filter((s): s is VisualizationService => s !== null);
  }
  
  private detectServiceType(data: NativeData): 'mvt' | 'wms' | 'geojson' {
    // 根据数据类型和大小智能选择
    if (data.type === 'raster') return 'wms';
    if (data.metadata?.featureCount > 10000) return 'mvt'; // 大数据用MVT
    return 'geojson'; // 小数据用GeoJSON
  }
  
  private async cleanup(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) return;
    
    // 清理底层资源(瓦片、图层等)
    switch (service.type) {
      case 'mvt':
        await this.mvtEngine.unpublish(service.metadata.tilesetId);
        break;
      case 'wms':
        await this.wmsEngine.unpublish(service.metadata.layerId);
        break;
    }
    
    this.services.delete(serviceId);
    console.log(`[Service Publisher] Cleaned up service: ${serviceId}`);
  }
}
```

---

### 五、工作流引擎增强 (LangGraph Workflow)

#### 5.1 问题分析 (v1.0)

**当前工作流**:
```typescript
workflow.addEdge(START, 'memoryLoader');
workflow.addEdge('memoryLoader', 'goalSplitter');
workflow.addEdge('goalSplitter', 'taskPlanner');
workflow.addEdge('taskPlanner', 'pluginExecutor'); // 串行执行所有步骤
workflow.addEdge('pluginExecutor', 'reportDecision');
workflow.addEdge('reportDecision', 'outputGenerator');
workflow.addEdge('outputGenerator', 'summaryGenerator');
workflow.addEdge('summaryGenerator', END);
```

**问题**:
1. **完全串行**: 即使TaskPlanner识别出并行任务,Executor仍串行执行
2. **无中间结果持久化**: 步骤失败后无法恢复
3. **异常处理粗糙**: 一个步骤失败导致整个工作流中断

#### 5.2 重构方案 (v2.0)

**支持并行执行的PluginExecutor**:
```typescript
// server/src/llm-interaction/workflow/nodes/EnhancedPluginExecutor.ts
export async function enhancedPluginExecutorNode(
  state: GeoAIStateType,
  context: WorkflowContext
): Promise<Partial<GeoAIStateType>> {
  console.log('[Enhanced Plugin Executor] Starting execution');
  
  const executionResults = new Map<string, AnalysisResult>();
  const allServices: VisualizationService[] = [];
  
  if (!state.executionPlans) {
    return { executionResults, visualizationServices: allServices };
  }
  
  for (const [goalId, plan] of state.executionPlans.entries()) {
    console.log(`[Enhanced Plugin Executor] Executing goal: ${goalId}`);
    
    // 检查是否有并行组信息
    if (plan.parallelGroups && plan.parallelGroups.length > 0) {
      // 混合执行模式:并行组内并行,组间串行
      await executeWithParallelism(plan, executionResults, allServices, context);
    } else {
      // 传统串行模式
      await executeSequentially(plan, executionResults, allServices, context);
    }
    
    // 每完成一个goal,立即发布服务
    const goalServices = await publishGoalServices(goalId, executionResults, context);
    allServices.push(...goalServices);
    
    // 增量推送给前端
    if (context.onPartialResult) {
      for (const service of goalServices) {
        context.onPartialResult(service);
      }
    }
  }
  
  return {
    currentStep: 'execution',
    executionResults,
    visualizationServices: allServices
  };
}

async function executeWithParallelism(
  plan: ExecutionPlan,
  results: Map<string, AnalysisResult>,
  services: VisualizationService[],
  context: WorkflowContext
): Promise<void> {
  console.log(`[Parallel Executor] Found ${plan.parallelGroups!.length} parallel groups`);
  
  // 按并行组执行
  for (const group of plan.parallelGroups!) {
    if (group.steps.length === 1) {
      // 单步骤,直接执行
      await executeSingleStep(group.steps[0], results, context);
    } else {
      // 多步骤,并行执行
      console.log(`[Parallel Executor] Executing ${group.steps.length} steps in parallel`);
      
      const stepPromises = group.steps.map(step => 
        executeSingleStep(step, results, context).catch(error => {
          console.error(`[Parallel Executor] Step ${step.stepId} failed:`, error);
          // 记录错误但不中断其他并行步骤
          results.set(step.stepId, {
            id: step.stepId,
            goalId: plan.goalId,
            status: 'failed',
            error: error.message
          });
        })
      );
      
      await Promise.all(stepPromises);
    }
    
    // 检查组内是否有失败
    const hasFailures = group.steps.some(step => {
      const result = results.get(step.stepId);
      return result?.status === 'failed';
    });
    
    if (hasFailures && !plan.allowPartialExecution) {
      throw new Error(`Parallel group has failures, aborting goal ${plan.goalId}`);
    }
  }
}

async function executeSingleStep(
  step: ExecutionStep,
  results: Map<string, AnalysisResult>,
  context: WorkflowContext
): Promise<void> {
  console.log(`[Step Executor] Executing: ${step.stepId} (${step.pluginId})`);
  
  // 发送tool_start事件
  context.streamWriter?.write(`data: ${JSON.stringify({
    type: 'tool_start',
    tool: step.pluginId,
    stepId: step.stepId,
    timestamp: Date.now()
  })}\n\n`);
  
  try {
    // 解析占位符
    const resolvedParams = resolvePlaceholders(step.parameters, results);
    
    // 获取Operator并执行
    const operator = SpatialOperatorRegistry.getInstance().get(step.pluginId);
    if (!operator) {
      throw new Error(`Operator not found: ${step.pluginId}`);
    }
    
    const operatorContext: OperatorContext = {
      dataSourceService: DataSourceServiceInstance,
      dataAccessFacade: DataAccessFacadeInstance,
      workspaceBase: context.workspaceBase,
      conversationId: context.conversationId,
      stepId: step.stepId
    };
    
    const result = await operator.execute(resolvedParams, operatorContext);
    
    // 保存结果
    results.set(step.stepId, {
      id: step.stepId,
      goalId: context.goalId!,
      status: result.success ? 'success' : 'failed',
      data: result.success ? {
        id: result.resultId,
        type: result.type,
        reference: result.reference,
        metadata: result.metadata
      } : undefined,
      error: result.error,
      metadata: {
        pluginId: step.pluginId,
        executedAt: new Date().toISOString()
      }
    });
    
    // 注册虚拟数据源
    if (result.success && result.resultId) {
      VirtualDataSourceManagerInstance.register({
        id: result.resultId,
        conversationId: context.conversationId,
        stepId: step.stepId,
        data: { /* ... */ }
      });
    }
    
    // 发送tool_complete事件
    context.streamWriter?.write(`data: ${JSON.stringify({
      type: 'tool_complete',
      tool: step.pluginId,
      stepId: step.stepId,
      success: result.success,
      timestamp: Date.now()
    })}\n\n`);
    
  } catch (error) {
    console.error(`[Step Executor] Failed:`, error);
    
    results.set(step.stepId, {
      id: step.stepId,
      goalId: context.goalId!,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // 发送tool_error事件
    context.streamWriter?.write(`data: ${JSON.stringify({
      type: 'tool_error',
      tool: step.pluginId,
      stepId: step.stepId,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    })}\n\n`);
    
    // 如果配置了严格模式,抛出异常中断工作流
    if (context.strictMode) {
      throw error;
    }
  }
}
```

**更新GeoAIGraph**:
```typescript
// server/src/llm-interaction/workflow/GeoAIGraph.ts
export function createGeoAIGraph(/* ... */) {
  const workflow = new StateGraph(GeoAIStateAnnotation)
    .addNode('memoryLoader', memoryLoaderNode)
    .addNode('goalSplitter', goalSplitterNode)
    .addNode('taskPlanner', taskPlannerNode)
    .addNode('pluginExecutor', enhancedPluginExecutorNode) // 使用新版本
    .addNode('reportDecision', reportDecisionNode)
    .addNode('outputGenerator', outputGeneratorNode)
    .addNode('summaryGenerator', summaryGeneratorNode);
  
  // 保持不变
  workflow.addEdge(START, 'memoryLoader');
  workflow.addEdge('memoryLoader', 'goalSplitter');
  workflow.addEdge('goalSplitter', 'taskPlanner');
  workflow.addEdge('taskPlanner', 'pluginExecutor');
  workflow.addEdge('pluginExecutor', 'reportDecision');
  workflow.addEdge('reportDecision', 'outputGenerator');
  workflow.addEdge('outputGenerator', 'summaryGenerator');
  workflow.addEdge('summaryGenerator', END);
  
  return workflow;
}
```

---

## 📂 目录结构调整

### v2.0 新目录结构

```
server/src/
├── spatial-operators/              # 新增:统一算子层
│   ├── SpatialOperator.ts         # 基础抽象
│   ├── operators/                 # 具体算子实现
│   │   ├── BufferOperator.ts
│   │   ├── OverlayOperator.ts
│   │   ├── FilterOperator.ts
│   │   ├── AggregateOperator.ts
│   │   ├── HeatmapOperator.ts
│   │   └── ChoroplethOperator.ts
│   ├── backends/                  # 数据后端
│   │   ├── DataBackend.ts
│   │   ├── GDALBackend.ts
│   │   ├── PostGISBackend.ts
│   │   └── WebServiceBackend.ts
│   ├── facade/                    # 统一入口
│   │   └── DataAccessFacade.ts
│   ├── SpatialOperatorRegistry.ts # 注册表
│   └── registerOperators.ts       # 注册函数
│
├── llm-interaction/
│   ├── agents/
│   │   ├── GoalSplitterAgent.ts   # 重构版
│   │   └── TaskPlannerAgent.ts    # 重构版
│   ├── knowledge/                 # 新增:知识库
│   │   ├── GISIndustryKnowledgeBase.ts
│   │   └── industry-factor-library.json
│   ├── validators/                # 新增:校验器
│   │   └── DataAvailabilityChecker.ts
│   ├── analyzers/                 # 新增:分析器
│   │   └── ParallelTaskAnalyzer.ts
│   └── workflow/
│       ├── nodes/
│       │   └── EnhancedPluginExecutor.ts # 新增
│       └── ServicePublisher.ts    # 重构版
│
├── services/
│   └── VisualizationServicePublisher.ts # 新增:统一发布器
│
├── data-access/                   # 保留但简化
│   ├── interfaces.ts              # 保留接口定义
│   ├── managers/
│   └── utils/
│   # 移除: accessors/, factories/, repositories/
│
├── plugin-orchestration/          # 逐步废弃
│   # 标记为deprecated,迁移到spatial-operators
│
└── api/
    └── controllers/
        └── SpatialOperatorController.ts # 新增:统一API
```

---

## 🔄 迁移路径

### Phase 1: 基础设施准备 (Week 1-2)
- [ ] 创建`spatial-operators/`目录结构
- [ ] 定义`SpatialOperator`抽象基类
- [ ] 实现`DataAccessFacade`和`DataBackend`接口
- [ ] 编写单元测试框架

### Phase 2: 核心算子迁移 (Week 3-4)
- [ ] 迁移BufferOperator (从BufferAnalysisExecutor)
- [ ] 迁移OverlayOperator
- [ ] 迁移FilterOperator
- [ ] 迁移可视化算子(Heatmap, Choropleth)
- [ ] 实现GDALBackend和PostGISBackend

### Phase 3: LLM Agents升级 (Week 5-6)
- [ ] 构建GISIndustryKnowledgeBase
- [ ] 实现DataAvailabilityChecker
- [ ] 实现ParallelTaskAnalyzer
- [ ] 重构GoalSplitterAgent
- [ ] 重构TaskPlannerAgent
- [ ] 编写新版提示词模板

### Phase 4: 工作流引擎增强 (Week 7)
- [ ] 实现EnhancedPluginExecutor
- [ ] 集成并行执行逻辑
- [ ] 添加中间结果持久化
- [ ] 实现异常回退机制

### Phase 5: 服务发布统一 (Week 8)
- [ ] 实现VisualizationServicePublisher
- [ ] 整合MVT/WMS/GeoJSON发布
- [ ] 添加TTL管理和自动清理
- [ ] 更新ServicePublisher节点

### Phase 6: API层适配 (Week 9)
- [ ] 创建SpatialOperatorController
- [ ] 更新ToolController适配新架构
- [ ] 废弃旧的Plugin API(标记deprecated)
- [ ] 更新API文档

### Phase 7: 测试与优化 (Week 10-11)
- [ ] 端到端集成测试
- [ ] 性能基准测试
- [ ] 内存泄漏检测
- [ ] 并发压力测试

### Phase 8: 文档与部署 (Week 12)
- [ ] 更新架构文档
- [ ] 编写迁移指南
- [ ] 更新API文档
- [ ] 生产环境部署

---

## ⚠️ Breaking Changes

由于v2.0不考虑向后兼容,以下变更将影响现有代码:

### 1. Plugin系统废弃
```typescript
// v1.0
import { BUILT_IN_PLUGINS } from './plugin-orchestration/plugins';
await ToolRegistryInstance.registerPlugins(BUILT_IN_PLUGINS);

// v2.0
import { registerAllOperators } from './spatial-operators/registerOperators';
registerAllOperators();
```

### 2. DataAccessor接口变更
```typescript
// v1.0
const accessor = DataAccessorFactory.getAccessor('shapefile');
const result = await accessor.buffer(filePath, 500);

// v2.0
const facade = DataAccessFacade.getInstance();
const bufferOp: BufferOperator = { operatorType: 'buffer', params: { distance: 500 } };
const result = await facade.execute(bufferOp, dataSource);
```

### 3. API端点变更
```
# v1.0
POST /api/tools/:id/execute
GET  /api/plugins

# v2.0
POST /api/operators/:id/execute
GET  /api/operators
```

### 4. 工作流状态字段变更
```typescript
// v1.0
interface ExecutionPlan {
  goalId: string;
  steps: ExecutionStep[];
  requiredPlugins: string[];
}

// v2.0
interface ExecutionPlan {
  goalId: string;
  steps: ExecutionStep[];
  requiredOperators: string[]; // 改名
  parallelGroups?: ParallelGroup[]; // 新增
  executionMode: 'sequential' | 'parallel' | 'hybrid'; // 新增
}
```

---

## 📊 预期收益

### 性能提升
- **任务规划速度**: +50% (缓存行业因子库)
- **空间分析执行**: +40-60% (并行计算)
- **内存占用**: -30% (流式处理+延迟加载)
- **API响应时间**: -25% (简化注册逻辑)

### 代码质量
- **代码行数**: -35% (消除重复)
- **Cyclomatic Complexity**: -50% (简化分支)
- **测试覆盖率**: 60% → 85%
- **维护成本**: -40% (统一抽象)

### 用户体验
- **任务成功率**: 75% → 95% (数据预校验)
- **等待时间**: -40% (并行执行)
- **错误提示**: 更明确(指出缺失数据和替代方案)
- **可解释性**: 提供中间结果查看
- **智能化程度**: 
  - **无需显式指定因子**: LLM自动从知识库推断 (80%场景)
  - **支持半自动模式**: 用户强调某些因子，LLM调整权重 (15%场景)
  - **保留专家模式**: 专业用户可直接指定算子序列 (5%场景)
  - **透明决策过程**: 展示为什么选择/跳过每个因子

---

## 🎓 技术债务清理

### 已识别的技术债务
1. ❌ **重复的Accessor实现** → 统一为DataBackend
2. ❌ **三层Plugin架构** → 简化为SpatialOperator
3. ❌ **硬编码的行业因子** → 外部化配置文件
4. ❌ **串行执行瓶颈** → 并行DAG编排
5. ❌ **分散的服务发布** → 统一Publisher
6. ❌ **缺失的数据校验** → DataAvailabilityChecker

### 清理优先级
- **P0 (必须)**: 1, 2, 4 (核心架构问题)
- **P1 (重要)**: 3, 5 (用户体验问题)
- **P2 (优化)**: 6 (增强功能)

---

## 📝 下一步行动

1. **评审本文档**: 团队讨论重构方案的可行性
2. **细化技术方案**: 为每个Phase编写详细设计文档
3. **搭建开发环境**: 创建dev-v2.0分支的开发规范
4. **开始Phase 1**: 基础设施准备工作

---

## 🔗 相关文档

- [四层递进式GIS任务拆分策略](./GIS-TASK-SPLITTING-STRATEGY.md)
- [SpatialOperator架构设计](./SPATIAL-OPERATOR-ARCHITECTURE.md)
- [并行执行引擎设计](./PARALLEL-EXECUTION-ENGINE.md)
- [迁移指南: v1.0 → v2.0](./MIGRATION-GUIDE.md)

---

**文档版本**: 1.0  
**最后更新**: 2026-05-09  
**作者**: GeoAI-UP Architecture Team
