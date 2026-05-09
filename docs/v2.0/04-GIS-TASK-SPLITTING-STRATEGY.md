# GIS空间分析任务四层递进式拆分策略

## 📋 概述

本文档详细描述GeoAI-UP v2.0采用的**GIS专属任务拆分策略**,解决通用LLM在空间分析领域的语义鸿沟问题。

**核心公式**:
```
自然语言需求 
  → 语义抽取 + 隐含因子补全 
  → 业务阶段拆分 
  → 区分并行/串行 
  → 匹配现有GIS数据校验 
  → 拆解为原子空间算子 
  → 调度执行 + 中间结果留存 
  → 叠加融合 + 输出报告
```

---

## 🎯 设计原则

### 1. 语义先解构,再拆任务
从自然语言中提取:
- **分析目标**: 用户想要什么结果?
- **研究范围**: 地理边界在哪里?
- **约束条件**: 有哪些限制(数据、时间、成本)?
- **隐含业务因子**: 行业标准的选址/分析维度
- **可用数据**: 平台当前有哪些空间数据?
- **输出形式**: 点位、分区、报告、可视化?

### 2. 业务层先行,技术层后置
```
商业选址逻辑 (业务层)
  ↓
GIS空间分析流程 (技术层)
  ↓
原子GIS算子 (实现层)
```

**不直接拆技术**,而是先理解业务逻辑,再翻译成GIS能力。

### 3. 数据绑定原则
**每一个子任务必须明确依赖哪些空间数据**:
- 人口数据 (栅格/矢量)
- 路网数据 (线要素)
- POI数据 (点要素: 学校、医院、商场)
- 竞品数据 (点要素)
- 房价/收入数据 (栅格/面要素)

**无匹配数据则标记告警**,不盲目拆解无法执行的任务。

### 4. 隐含需求显性化
用户只说"婴幼儿用品店选址",AI必须自动补全**行业通用选址因子**:

| 维度 | 因子 | 数据来源 |
|------|------|---------|
| 人口 | 0-6岁儿童密度 | 人口栅格数据 |
| 配套 | 幼儿园距离 | POI_education |
| 配套 | 妇幼医院距离 | POI_healthcare |
| 交通 | 主干道可达性 | road_network |
| 竞争 | 同类店铺避让 | POI_competitor |
| 消费 | 小区房价 | housing_price_raster |

### 5. 并行+串行混合编排
- **并行**: 同类型多因子计算 (如多个缓冲区分析)
- **串行**: 因子叠加、权重打分、点位筛选 (有数据依赖)

### 6. 算子原子化、复用平台能力
拆解出的子任务必须是GIS平台已封装的**标准原子空间分析能力**:
- `buffer_analysis`: 缓冲区分析
- `kernel_density`: 核密度分析
- `overlay_analysis`: 空间叠加
- `weighted_overlay`: 加权叠加
- `spatial_filter`: 空间筛选
- `point_extraction`: 点位提取

**不拆解平台不支持的自定义分析**。

### 7. 分步可校验、结果可回溯
每一步空间分析输出**中间图层/统计结果**:
- 可单独查看
- 可重新计算
- 可调整参数

---

## 🏗️ 四层拆分架构

### Layer 1: 自然语言语义解析层 (AI理解)

**输入**: 用户自然语言描述  
**输出**: 结构化语义字段

**处理流程**:
```typescript
interface SemanticParsingResult {
  taskType: 'site_selection' | 'suitability_analysis' | 'risk_assessment';
  industry?: string; // 'retail_baby_store', 'healthcare', etc.
  analysisTarget: string; // "婴幼儿用品店铺"
  geographicScope: {
    type: 'administrative' | 'custom_boundary' | 'data_coverage';
    value?: string; // "北京市海淀区" or GeoJSON
  };
  constraints: {
    dataConstraint: 'use_existing_data_only';
    timeConstraint?: string;
    budgetConstraint?: number;
  };
  implicitFactors: string[]; // AI自动补全的行业因子
  expectedOutput: {
    type: 'points' | 'zones' | 'report' | 'visualization';
    format: 'geojson' | 'mvt' | 'pdf';
  };
}
```

**示例**:
```
用户输入: "帮我分析一下开婴幼儿用品店的最佳位置"

语义解析结果:
{
  "taskType": "site_selection",
  "industry": "retail_baby_store",
  "analysisTarget": "婴幼儿用品店铺",
  "geographicScope": {
    "type": "data_coverage",
    "value": "default"
  },
  "constraints": {
    "dataConstraint": "use_existing_data_only"
  },
  "implicitFactors": [
    "population_density_0_6_years",
    "proximity_to_kindergartens",
    "proximity_to_maternal_hospitals",
    "road_accessibility",
    "competitor_avoidance",
    "residential_property_value"
  ],
  "expectedOutput": {
    "type": "points",
    "format": "geojson"
  }
}
```

**实现组件**: `GoalSplitterAgent` + `GISIndustryKnowledgeBase`

---

### Layer 2: 业务逻辑阶段拆解层 (商业选址流程)

**输入**: 语义解析结果  
**输出**: 业务阶段任务列表 (串行不可乱序)

**标准选址业务流程**:
```
1. 基础条件界定与研究范围划定
   ↓
2. 选址核心影响因子筛选与数据匹配
   ↓
3. 单因子空间分析建模
   ↓
4. 多因子空间叠加 + 加权适宜性评价
   ↓
5. 竞品避让与优质点位筛选提取
   ↓
6. 选址结果分级、落位输出 + 空间分析报告
```

**代码实现**:
```typescript
interface BusinessPhase {
  phaseId: string;
  name: string;
  description: string;
  dependencies: string[]; // 依赖的前置阶段
  estimatedDuration: number; // seconds
}

function decomposeBusinessPhases(semantic: SemanticParsingResult): BusinessPhase[] {
  switch (semantic.taskType) {
    case 'site_selection':
      return [
        {
          phaseId: 'phase_1_scope_definition',
          name: '研究范围划定',
          description: '确定分析的地理边界和数据可用性',
          dependencies: [],
          estimatedDuration: 5
        },
        {
          phaseId: 'phase_2_factor_matching',
          name: '因子数据匹配',
          description: '加载所有选址因子的空间数据',
          dependencies: ['phase_1_scope_definition'],
          estimatedDuration: 10
        },
        {
          phaseId: 'phase_3_single_factor_analysis',
          name: '单因子空间分析',
          description: '对每个因子独立进行空间分析',
          dependencies: ['phase_2_factor_matching'],
          estimatedDuration: 30
        },
        {
          phaseId: 'phase_4_multi_factor_overlay',
          name: '多因子叠加评价',
          description: '加权叠加所有因子生成适宜性评分',
          dependencies: ['phase_3_single_factor_analysis'],
          estimatedDuration: 15
        },
        {
          phaseId: 'phase_5_competitor_filtering',
          name: '竞品避让筛选',
          description: '剔除竞品辐射区,提取高适宜性点位',
          dependencies: ['phase_4_multi_factor_overlay'],
          estimatedDuration: 10
        },
        {
          phaseId: 'phase_6_result_output',
          name: '结果输出与报告',
          description: '生成分级选址结果和分析报告',
          dependencies: ['phase_5_competitor_filtering'],
          estimatedDuration: 10
        }
      ];
    
    default:
      throw new Error(`Unsupported task type: ${semantic.taskType}`);
  }
}
```

**实现组件**: `TaskPlannerAgent.businessPhaseDecomposition()`

---

### Layer 3: GIS空间流程拆解层 (地理分析逻辑)

**输入**: 业务阶段  
**输出**: GIS空间分析流程子任务

**以Phase 3 (单因子空间分析)为例**:

业务阶段: "对每个因子独立进行空间分析"

拆解为GIS流程:
```
3.1 适龄儿童人口核密度分析
3.2 常住居民密度分析
3.3 幼儿园缓冲区分析 (500m)
3.4 妇幼医院缓冲区分析 (1000m)
3.5 路网可达性分析
3.6 竞品门店缓冲区辐射分析 (800m避让)
3.7 中高端社区房价圈层分级
```

**代码实现**:
```typescript
interface GISWorkflowStep {
  stepId: string;
  name: string;
  operationType: 'buffer' | 'kernel_density' | 'classification' | 'distance_analysis';
  inputDataSource: string;
  parameters: Record<string, any>;
  outputType: 'raster' | 'vector';
  isParallelizable: boolean; // 是否可与其他步骤并行
}

function decomposeToGISWorkflows(phase: BusinessPhase, factors: string[]): GISWorkflowStep[] {
  if (phase.phaseId === 'phase_3_single_factor_analysis') {
    const steps: GISWorkflowStep[] = [];
    
    for (const factor of factors) {
      switch (factor) {
        case 'population_density_0_6_years':
          steps.push({
            stepId: `step_${factor}`,
            name: '0-6岁人口核密度分析',
            operationType: 'kernel_density',
            inputDataSource: 'population_grid_0_6',
            parameters: {
              searchRadius: 1000,
              cellSize: 100,
              kernelFunction: 'quartic'
            },
            outputType: 'raster',
            isParallelizable: true
          });
          break;
        
        case 'proximity_to_kindergartens':
          steps.push({
            stepId: `step_${factor}`,
            name: '幼儿园缓冲区分析',
            operationType: 'buffer',
            inputDataSource: 'poi_education_kindergarten',
            parameters: {
              distance: 500,
              unit: 'meters',
              dissolve: false
            },
            outputType: 'vector',
            isParallelizable: true
          });
          break;
        
        case 'proximity_to_maternal_hospitals':
          steps.push({
            stepId: `step_${factor}`,
            name: '妇幼医院缓冲区分析',
            operationType: 'buffer',
            inputDataSource: 'poi_healthcare_maternal',
            parameters: {
              distance: 1000,
              unit: 'meters',
              dissolve: false
            },
            outputType: 'vector',
            isParallelizable: true
          });
          break;
        
        case 'competitor_avoidance':
          steps.push({
            stepId: `step_${factor}`,
            name: '竞品避让区分析',
            operationType: 'buffer',
            inputDataSource: 'poi_competitor_baby_store',
            parameters: {
              distance: 800,
              unit: 'meters',
              dissolve: true
            },
            outputType: 'vector',
            isParallelizable: true
          });
          break;
        
        // ... 其他因子
      }
    }
    
    return steps;
  }
  
  return [];
}
```

**实现组件**: `TaskPlannerAgent.gisWorkflowDecomposition()`

---

### Layer 4: 原子GIS算子拆解层 (平台可直接调度执行)

**输入**: GIS工作流步骤  
**输出**: 平台底层最小原子算子调用

**原子算子清单**:

| 算子ID | 功能 | 输入 | 输出 | 后端 |
|--------|------|------|------|------|
| `buffer_analysis` | 缓冲区分析 | 矢量数据 + 距离 | 缓冲多边形 | GDAL/PostGIS |
| `kernel_density` | 核密度分析 | 点数据 + 搜索半径 | 密度栅格 | GDAL |
| `overlay_intersect` | 空间相交 | 两个矢量图层 | 交集结果 | GDAL/PostGIS |
| `weighted_overlay` | 加权叠加 | 多个栅格 + 权重 | 综合评分栅格 | GDAL |
| `reclassify` | 重分类 | 栅格 + 分类规则 | 分类栅格 | GDAL |
| `distance_analysis` | 距离分析 | 源数据 | 距离栅格 | GDAL/PostGIS |
| `spatial_filter` | 空间筛选 | 矢量 + 条件 | 筛选结果 | GDAL/PostGIS |
| `point_extraction` | 点位提取 | 栅格极值 | 最优点位 | GDAL |

**映射示例**:

GIS步骤: "幼儿园缓冲区分析 (500m)"

↓ 映射为原子算子

```typescript
{
  operatorId: 'buffer_analysis',
  parameters: {
    dataSourceId: 'poi_education_kindergarten',
    distance: 500,
    unit: 'meters',
    dissolve: false,
    segments: 32
  }
}
```

**完整映射函数**:
```typescript
function mapToAtomicOperators(gisSteps: GISWorkflowStep[]): AtomicOperatorCall[] {
  return gisSteps.map(step => {
    switch (step.operationType) {
      case 'buffer':
        return {
          operatorId: 'buffer_analysis',
          stepId: step.stepId,
          parameters: {
            dataSourceId: step.inputDataSource,
            ...step.parameters
          }
        };
      
      case 'kernel_density':
        return {
          operatorId: 'kernel_density',
          stepId: step.stepId,
          parameters: {
            pointDataSourceId: step.inputDataSource,
            ...step.parameters
          }
        };
      
      case 'classification':
        return {
          operatorId: 'reclassify',
          stepId: step.stepId,
          parameters: {
            rasterDataSourceId: step.inputDataSource,
            classificationMethod: 'quantile',
            numClasses: 5,
            ...step.parameters
          }
        };
      
      default:
        throw new Error(`Unsupported operation type: ${step.operationType}`);
    }
  });
}
```

**实现组件**: `TaskPlannerAgent.atomicOperatorMapping()`

---

## 🔀 并行/串行混合编排

### 依赖关系分析

**并行任务识别规则**:
1. **无数据依赖**: 两个步骤的输入数据互不影响
2. **无输出冲突**: 两个步骤写入不同的结果ID
3. **资源可并发**: 后端支持并行执行 (PostGIS连接池、GDAL多线程)

**串行任务识别规则**:
1. **数据依赖**: 步骤B需要步骤A的输出作为输入
2. **逻辑依赖**: 步骤B必须在步骤A完成后才能开始 (如叠加分析需等待所有因子完成)
3. **资源冲突**: 两个步骤需要独占同一资源

### 依赖图构建

```typescript
interface TaskDependencyGraph {
  nodes: TaskNode[];
  edges: TaskEdge[];
  parallelGroups: ParallelGroup[];
}

interface TaskNode {
  stepId: string;
  operatorId: string;
  estimatedDuration: number; // seconds
}

interface TaskEdge {
  from: string; // stepId
  to: string;   // stepId
  dependencyType: 'data' | 'logical';
}

interface ParallelGroup {
  groupId: string;
  steps: string[]; // stepIds
  estimatedDuration: number; // max duration among steps
}

class ParallelTaskAnalyzer {
  analyzeDependencies(steps: AtomicOperatorCall[]): TaskDependencyGraph {
    const nodes: TaskNode[] = steps.map(step => ({
      stepId: step.stepId,
      operatorId: step.operatorId,
      estimatedDuration: this.estimateDuration(step.operatorId, step.parameters)
    }));
    
    const edges: TaskEdge[] = this.identifyDependencies(steps);
    
    // 使用拓扑排序识别并行组
    const parallelGroups = this.extractParallelGroups(nodes, edges);
    
    return { nodes, edges, parallelGroups };
  }
  
  private identifyDependencies(steps: AtomicOperatorCall[]): TaskEdge[] {
    const edges: TaskEdge[] = [];
    
    // 检查placeholder引用 (如 {step_xxx.result})
    for (const step of steps) {
      const referencedSteps = this.extractPlaceholderReferences(step.parameters);
      
      for (const refStepId of referencedSteps) {
        edges.push({
          from: refStepId,
          to: step.stepId,
          dependencyType: 'data'
        });
      }
    }
    
    // 添加逻辑依赖 (如所有因子分析完成后才能叠加)
    const overlaySteps = steps.filter(s => s.operatorId === 'weighted_overlay');
    const factorSteps = steps.filter(s => 
      ['buffer_analysis', 'kernel_density', 'reclassify'].includes(s.operatorId)
    );
    
    for (const overlayStep of overlaySteps) {
      for (const factorStep of factorSteps) {
        edges.push({
          from: factorStep.stepId,
          to: overlayStep.stepId,
          dependencyType: 'logical'
        });
      }
    }
    
    return edges;
  }
  
  private extractParallelGroups(nodes: TaskNode[], edges: TaskEdge[]): ParallelGroup[] {
    // 1. 构建邻接表
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    
    for (const node of nodes) {
      adjacencyList.set(node.stepId, []);
      inDegree.set(node.stepId, 0);
    }
    
    for (const edge of edges) {
      adjacencyList.get(edge.from)!.push(edge.to);
      inDegree.set(edge.to, inDegree.get(edge.to)! + 1);
    }
    
    // 2. Kahn's算法进行拓扑排序,同时识别并行组
    const parallelGroups: ParallelGroup[] = [];
    const queue: string[] = [];
    
    // 找出入度为0的节点 (可并行开始的步骤)
    for (const [stepId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(stepId);
      }
    }
    
    let groupId = 0;
    while (queue.length > 0) {
      const currentGroup: string[] = [...queue];
      queue.length = 0;
      
      const maxDuration = Math.max(
        ...currentGroup.map(stepId => 
          nodes.find(n => n.stepId === stepId)!.estimatedDuration
        )
      );
      
      parallelGroups.push({
        groupId: `group_${groupId++}`,
        steps: currentGroup,
        estimatedDuration: maxDuration
      });
      
      // 处理当前组的节点
      for (const stepId of currentGroup) {
        const neighbors = adjacencyList.get(stepId)!;
        for (const neighbor of neighbors) {
          inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
          if (inDegree.get(neighbor) === 0) {
            queue.push(neighbor);
          }
        }
      }
    }
    
    return parallelGroups;
  }
  
  private estimateDuration(operatorId: string, params: any): number {
    // 基于历史数据的估算
    const baseDurations: Record<string, number> = {
      'buffer_analysis': 5,
      'kernel_density': 15,
      'reclassify': 3,
      'weighted_overlay': 10,
      'spatial_filter': 5
    };
    
    let duration = baseDurations[operatorId] || 10;
    
    // 根据数据规模调整
    if (params.featureCount) {
      duration *= Math.log10(params.featureCount + 1);
    }
    
    return Math.ceil(duration);
  }
}
```

### 执行计划生成

```typescript
interface ExecutionPlan {
  goalId: string;
  steps: ExecutionStep[];
  requiredOperators: string[];
  parallelGroups: ParallelGroup[];
  executionMode: 'sequential' | 'parallel' | 'hybrid';
  estimatedTotalDuration: number;
}

function generateExecutionPlan(
  goal: AnalysisGoal,
  atomicOperators: AtomicOperatorCall[],
  dependencyGraph: TaskDependencyGraph
): ExecutionPlan {
  const hasParallelism = dependencyGraph.parallelGroups.some(g => g.steps.length > 1);
  
  return {
    goalId: goal.id,
    steps: atomicOperators.map(op => ({
      stepId: op.stepId,
      pluginId: op.operatorId, // 兼容旧字段名
      parameters: op.parameters,
      dependsOn: this.getDependencies(op.stepId, dependencyGraph.edges)
    })),
    requiredOperators: [...new Set(atomicOperators.map(op => op.operatorId))],
    parallelGroups: dependencyGraph.parallelGroups,
    executionMode: hasParallelism ? 'hybrid' : 'sequential',
    estimatedTotalDuration: this.calculateTotalDuration(dependencyGraph.parallelGroups)
  };
}
```

---

## ✅ 数据可用性校验

### 校验流程

```typescript
interface DataValidationResult {
  isComplete: boolean;
  missingSources: string[];
  availableSources: string[];
  suggestions: Array<{
    missingSource: string;
    alternative?: string;
    action: 'upload_data' | 'use_alternative' | 'skip_factor';
  }>;
}

class DataAvailabilityChecker {
  constructor(private dataSourceService: DataSourceService) {}
  
  async checkRequiredData(requiredDataSources: string[]): Promise<DataValidationResult> {
    const missingSources: string[] = [];
    const availableSources: string[] = [];
    const suggestions: DataValidationResult['suggestions'] = [];
    
    for (const sourceId of requiredDataSources) {
      const exists = await this.dataSourceService.exists(sourceId);
      
      if (exists) {
        availableSources.push(sourceId);
      } else {
        missingSources.push(sourceId);
        
        // 查找替代数据源
        const alternative = await this.findAlternative(sourceId);
        
        suggestions.push({
          missingSource: sourceId,
          alternative: alternative || undefined,
          action: alternative ? 'use_alternative' : 'upload_data'
        });
      }
    }
    
    return {
      isComplete: missingSources.length === 0,
      missingSources,
      availableSources,
      suggestions
    };
  }
  
  private async findAlternative(missingSource: string): Promise<string | null> {
    // 查询替代映射表
    const alternatives: Record<string, string[]> = {
      'population_income': ['housing_price_raster', 'nighttime_light'],
      'poi_competitor_baby_store': ['poi_retail_general'],
      'road_network_primary': ['road_network_all']
    };
    
    const candidates = alternatives[missingSource] || [];
    
    for (const candidate of candidates) {
      const exists = await this.dataSourceService.exists(candidate);
      if (exists) {
        return candidate;
      }
    }
    
    return null;
  }
}
```

### 校验结果处理

```typescript
// 在GoalSplitterAgent中
async execute(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
  // ... 语义解析和因子补全
  
  // 数据可用性校验
  const requiredSources = industryProfile.coreFactors
    .flatMap(f => f.requiredDataSources);
  
  const validation = await this.dataChecker.checkRequiredData(requiredSources);
  
  if (!validation.isComplete) {
    // 返回错误信息,引导用户上传数据或使用替代方案
    return {
      goals: [],
      errors: [{
        goalId: 'data_validation',
        error: `Missing required data sources: ${validation.missingSources.join(', ')}`,
        suggestions: validation.suggestions
      }]
    };
  }
  
  // 数据齐全,继续生成目标
  return { /* ... */ };
}
```

---

## 📊 行业因子库设计

### 配置文件结构

```json
// workspace/llm/prompts/en-US/industry-factor-library.json
{
  "industries": {
    "retail_baby_store": {
      "name": "Retail - Baby Store",
      "description": "婴幼儿用品零售店铺选址",
      "coreFactors": [
        {
          "factorId": "population_density_0_6",
          "name": "0-6岁人口密度",
          "dataType": "raster",
          "requiredDataSources": ["population_grid_0_6"],
          "defaultWeight": 0.25,
          "analysisOperator": "kernel_density",
          "operatorParams": {
            "searchRadius": 1000,
            "cellSize": 100
          }
        },
        {
          "factorId": "proximity_kindergarten",
          "name": "幼儿园 proximity",
          "dataType": "vector",
          "requiredDataSources": ["poi_education_kindergarten"],
          "defaultWeight": 0.20,
          "analysisOperator": "buffer_analysis",
          "operatorParams": {
            "distance": 500,
            "unit": "meters"
          }
        },
        {
          "factorId": "proximity_maternal_hospital",
          "name": "妇幼医院 proximity",
          "dataType": "vector",
          "requiredDataSources": ["poi_healthcare_maternal"],
          "defaultWeight": 0.20,
          "analysisOperator": "buffer_analysis",
          "operatorParams": {
            "distance": 1000,
            "unit": "meters"
          }
        },
        {
          "factorId": "road_accessibility",
          "name": "道路可达性",
          "dataType": "vector",
          "requiredDataSources": ["road_network"],
          "defaultWeight": 0.15,
          "analysisOperator": "distance_analysis",
          "operatorParams": {
            "maxDistance": 500
          }
        },
        {
          "factorId": "competitor_avoidance",
          "name": "竞品避让",
          "dataType": "vector",
          "requiredDataSources": ["poi_competitor_baby_store"],
          "defaultWeight": 0.10,
          "analysisOperator": "buffer_analysis",
          "operatorParams": {
            "distance": 800,
            "unit": "meters",
            "dissolve": true
          },
          "scoringRule": "negative" // 距离越远得分越高
        },
        {
          "factorId": "housing_price",
          "name": "房价 (消费能力代理)",
          "dataType": "raster",
          "requiredDataSources": ["housing_price_raster"],
          "defaultWeight": 0.10,
          "analysisOperator": "reclassify",
          "operatorParams": {
            "classificationMethod": "quantile",
            "numClasses": 5
          }
        }
      ],
      "workflowTemplate": {
        "phases": [
          "scope_definition",
          "factor_matching",
          "single_factor_analysis",
          "multi_factor_overlay",
          "competitor_filtering",
          "result_output"
        ],
        "overlayMethod": "weighted_sum",
        "outputFormat": "points_with_scores"
      }
    },
    
    "healthcare_clinic": {
      "name": "Healthcare - Community Clinic",
      "description": "社区诊所选址",
      "coreFactors": [
        // ... 医疗行业因子
      ]
    },
    
    "education_training": {
      "name": "Education - Training Center",
      "description": "教育培训中心选址",
      "coreFactors": [
        // ... 教育行业因子
      ]
    }
  }
}
```

### 知识库类实现

```typescript
// server/src/llm-interaction/knowledge/GISIndustryKnowledgeBase.ts
export class GISIndustryKnowledgeBase {
  private profiles: Map<string, IndustryFactorProfile>;
  
  constructor() {
    this.loadFromConfig();
  }
  
  private loadFromConfig(): void {
    const configPath = path.join(
      process.env.WORKSPACE_BASE!,
      'llm/prompts/en-US/industry-factor-library.json'
    );
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    this.profiles = new Map();
    for (const [industryId, profile] of Object.entries(config.industries)) {
      this.profiles.set(industryId, profile as IndustryFactorProfile);
    }
    
    console.log(`[Industry Knowledge Base] Loaded ${this.profiles.size} industry profiles`);
  }
  
  getFactorsForIndustry(industry: string): IndustryFactorProfile {
    const profile = this.profiles.get(industry);
    
    if (!profile) {
      console.warn(`[Industry Knowledge Base] Unknown industry: ${industry}, using general retail profile`);
      return this.profiles.get('retail_general')!;
    }
    
    return profile;
  }
  
  getAllIndustries(): string[] {
    return Array.from(this.profiles.keys());
  }
  
  getSuggestedFactors(userInput: string): string[] {
    // 使用简单关键词匹配 (可扩展为LLM分类)
    const keywords: Record<string, string[]> = {
      '婴幼儿|baby|child': ['retail_baby_store'],
      '医疗|clinic|hospital': ['healthcare_clinic'],
      '教育|school|training': ['education_training']
    };
    
    for (const [pattern, industries] of Object.entries(keywords)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(userInput)) {
        return industries;
      }
    }
    
    return ['retail_general'];
  }
}
```

---

## 🎯 实施路线图

### Phase 1: 知识库建设 (Week 1)
- [ ] 定义行业因子库JSON schema
- [ ] 录入3个典型行业 (零售、医疗、教育)
- [ ] 实现`GISIndustryKnowledgeBase`类
- [ ] 编写单元测试

### Phase 2: 数据校验器 (Week 2)
- [ ] 实现`DataAvailabilityChecker`
- [ ] 集成到`DataSourceService`
- [ ] 添加替代数据源映射
- [ ] 测试缺失数据场景

### Phase 3: 并行分析器 (Week 3)
- [ ] 实现`ParallelTaskAnalyzer`
- [ ] 构建依赖图算法
- [ ] 识别并行组
- [ ] 性能基准测试

### Phase 4: Agents重构 (Week 4-5)
- [ ] 重构`GoalSplitterAgent`集成知识库
- [ ] 重构`TaskPlannerAgent`集成并行分析
- [ ] 编写新版提示词模板
- [ ] 端到端测试

### Phase 5: 工作流引擎适配 (Week 6)
- [ ] 更新`EnhancedPluginExecutor`支持并行组
- [ ] 添加中间结果持久化
- [ ] 实现异常回退机制
- [ ] 压力测试

---

## 📈 预期效果

### 任务规划准确率提升

| 指标 | v1.0 | v2.0 | 提升 |
|------|------|------|------|
| **意图识别准确率** | 70% | 95% | +35% |
| **因子覆盖率** | 40% | 90% | +125% |
| **数据可用性检查** | 0% | 100% | +∞ |
| **并行任务识别** | 0% | 80% | +∞ |
| **执行成功率** | 60% | 92% | +53% |

### 性能提升

| 场景 | v1.0耗时 | v2.0耗时 | 加速比 |
|------|---------|---------|--------|
| **6因子选址分析** | 180s | 75s | 2.4x |
| **10因子适宜性评价** | 320s | 120s | 2.7x |
| **大规模缓冲区 (10万要素)** | 45s | 18s | 2.5x |

### 用户体验改进

- ✅ **明确的错误提示**: "缺少人口数据,请上传或改用夜间灯光数据"
- ✅ **进度可视化**: "正在并行执行6个因子分析 (3/6完成)"
- ✅ **中间结果查看**: 可查看每个因子的分析结果图层
- ✅ **参数可调**: 用户可调整缓冲区半径、权重系数后重算

---

## 🔗 相关文档

- [02-REFACTORING-PLAN-v2.0.md](./02-REFACTORING-PLAN-v2.0.md) - 总体重构规划
- [03-SPATIAL-OPERATOR-ARCHITECTURE.md](./03-SPATIAL-OPERATOR-ARCHITECTURE.md) - 算子架构设计
- [PARALLEL-EXECUTION-ENGINE.md](./PARALLEL-EXECUTION-ENGINE.md) - 并行执行引擎

---

**文档版本**: 1.0  
**最后更新**: 2026-05-09  
**作者**: GeoAI-UP Architecture Team
