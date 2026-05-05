# Phase 2: 需求分析与设计原则

## 📋 需求分析

### 2.1 功能需求

#### FR-01: 统一颜色渲染器（Uniform Color Renderer）

**用户场景：**
- "红色显示五虎林河数据集"
- "用蓝色显示所有监测点"
- "绿色显示主要道路"

**功能要求：**
1. 接受单一颜色参数（支持中文颜色名、hex、预定义色板名）
2. 支持点、线、面所有几何类型
3. 可选样式参数：线宽、点大小、透明度
4. 输出标准MVT服务 + Style JSON

**输入参数：**
```typescript
interface UniformColorParams {
  dataSourceId: string;        // 数据源ID
  color?: string;              // 颜色（默认'#409eff'）
  strokeWidth?: number;        // 线宽（仅线/面，默认2）
  pointSize?: number;          // 点大小（仅点，默认5）
  opacity?: number;            // 透明度（默认0.8）
  layerName?: string;          // 图层名（默认'uniform'）
}
```

**输出：**
```typescript
{
  type: 'mvt',
  reference: '/api/services/mvt/{tilesetId}/{z}/{x}/{y}.pbf',
  metadata: {
    tilesetId: string,
    styleUrl: string,          // Style JSON URL
    rendererType: 'uniform',
    color: string,
    geometryType: 'Point' | 'LineString' | 'Polygon'
  }
}
```

---

#### FR-02: 分类渲染器（Categorical Renderer）

**用户场景：**
- "按土地利用类型显示不同颜色"
- "用不同颜色显示道路等级"
- "按监测点类型着色"

**功能要求：**
1. 接受类别字段名（categorical field）
2. 自动检测字段的所有唯一值
3. 为每个类别分配颜色（支持自定义颜色映射）
4. 生成图例（legend）
5. 支持点、线、面所有几何类型

**输入参数：**
```typescript
interface CategoricalParams {
  dataSourceId: string;        // 数据源ID
  categoryField: string;       // 类别字段名（必需）
  colorScheme?: string;        // 配色方案（默认'set1'）
  customColors?: Record<string, string>; // 自定义颜色映射
  opacity?: number;            // 透明度（默认0.8）
  layerName?: string;          // 图层名（默认'categorical'）
}
```

**输出：**
```typescript
{
  type: 'mvt',
  reference: '/api/services/mvt/{tilesetId}/{z}/{x}/{y}.pbf',
  metadata: {
    tilesetId: string,
    styleUrl: string,
    rendererType: 'categorical',
    categoryField: string,
    categories: string[],      // 所有类别值
    colorMapping: Record<string, string>,  // 类别→颜色映射
    legend: Array<{category: string, color: string}>
  }
}
```

---

#### FR-03: 分级统计渲染器（Choropleth Renderer）

**用户场景：**
- "用面积等级专题图显示陕西省，红色系"
- "按人口密度分级显示各区县"
- "用5级分类显示GDP分布"

**功能要求：**
1. 接受数值字段名（numeric field）
2. 支持多种分类方法（quantile, equal_interval, std_dev, jenks）
3. 支持自定义分级数量（3-10级）
4. 支持连续颜色渐变（colorRamp）
5. 生成图例和统计信息
6. 支持点、线、面所有几何类型

**输入参数：**
```typescript
interface ChoroplethParams {
  dataSourceId: string;        // 数据源ID
  valueField: string;          // 数值字段名（必需）
  classification?: 'quantile' | 'equal_interval' | 'std_dev' | 'jenks';
  numClasses?: number;         // 分级数（默认5，范围3-10）
  colorRamp?: string;          // 颜色渐变（默认'greens'）
  opacity?: number;            // 透明度（默认0.8）
  layerName?: string;          // 图层名（默认'choropleth'）
}
```

**输出：**
```typescript
{
  type: 'mvt',
  reference: '/api/services/mvt/{tilesetId}/{z}/{x}/{y}.pbf',
  metadata: {
    tilesetId: string,
    styleUrl: string,
    rendererType: 'choropleth',
    valueField: string,
    classification: string,
    breaks: number[],          // 分级断点
    colorRamp: string,
    statistics: {min, max, mean, std},
    legend: Array<{range: string, color: string}>
  }
}
```

---

### 2.2 非功能需求

#### NFR-01: LLM友好性

**要求：**
- Plugin capability必须结构化声明
- TaskPlanner能够基于capability自动过滤
- LLM只需从3-5个候选中选择，而非全部

**实现策略：**
```typescript
interface PluginCapability {
  supportedGeometryTypes: GeometryType[];
  requiredFields?: {name: string, type: FieldType}[];
  optionalParameters: ParameterDefinition[];
  outputType: ServiceType;
  scenarios: string[];  // 适用场景标签
}
```

---

#### NFR-02: 几何类型无关性

**要求：**
- 同一渲染器处理点、线、面
- 内部自动适配样式属性
- 不拒绝任何几何类型

**实现策略：**
- Geometry Adapter Layer自动检测geometry type
- StyleFactory根据geometry type生成合适的style layers
- 例如：点用circle layer，线用line layer，面用fill layer

---

#### NFR-03: 职责分离

**要求：**
- Executor：只编排workflow
- StyleFactory：统一生成Style JSON
- ColorEngine：集中解析颜色
- Accessor：提供数据和统计

**职责边界：**
```
Executor:
  ✅ 调用Accessor加载数据
  ✅ 验证必需参数
  ✅ 调用MVTPublisher生成tiles
  ✅ 调用StyleFactory生成样式
  ❌ 不解析颜色
  ❌ 不生成style JSON
  ❌ 不直接操作文件系统

StyleFactory:
  ✅ 接收高层参数（colorRamp名称）
  ✅ 调用ColorEngine解析颜色
  ✅ 生成Mapbox GL JS style JSON
  ✅ 保存文件并返回URL
  ❌ 不访问数据库
  ❌ 不调用Accessor
```

---

#### NFR-04: 可扩展性

**要求：**
- 新增渲染器不影响现有代码
- Plugin数量增长不增加LLM负担
- 支持未来添加更多可视化类型

**实现策略：**
- Capability-based filtering自动适配新plugin
- StyleFactory采用策略模式支持新渲染类型
- Registry模式管理plugin元数据

---

#### NFR-05: 一致性

**要求：**
- 所有渲染器输出统一的NativeData格式
- Style JSON遵循Mapbox GL JS规范
- 错误处理机制一致

**标准化输出：**
```typescript
interface VisualizationResult extends NativeData {
  metadata: DataMetadata & {
    result: string;            // MVT service URL
    styleUrl: string;          // Style JSON URL
    rendererType: string;      // 'uniform' | 'categorical' | 'choropleth'
    // ... renderer-specific fields
  };
}
```

---

## 🎨 设计原则

### DP-01: 单一职责原则（Single Responsibility）

**原则：** 每个模块只做一件事，并做好。

**应用：**
- Executor只负责编排，不负责样式生成
- StyleFactory只负责样式，不负责数据访问
- ColorEngine只负责颜色解析，不负责业务逻辑

**反例（当前问题）：**
```typescript
// ❌ 错误：Executor中混合了颜色解析
class ChoroplethMVTExecutor {
  private resolveColorRamp(colorRamp: string, numColors: number): string[] {
    // 60行颜色逻辑
  }
}
```

**正例（目标设计）：**
```typescript
// ✅ 正确：委托给StyleFactory
class ChoroplethMVTExecutor {
  async execute(params: ChoroplethParams) {
    const styleUrl = await StyleFactory.generateChoroplethStyle({
      colorRamp: params.colorRamp,  // 传递名称，不解析
      // ...
    });
  }
}
```

---

### DP-02: 开闭原则（Open-Closed）

**原则：** 对扩展开放，对修改关闭。

**应用：**
- 新增渲染器只需添加新Plugin和Executor
- 不需要修改TaskPlanner核心逻辑
- Capability System自动识别新plugin

**实现：**
```typescript
// 新增HeatmapRenderer无需修改现有代码
export const HeatmapRendererPlugin: Plugin = {
  id: 'heatmap_renderer',
  capability: {
    supportedGeometryTypes: ['Point'],
    scenarios: ['density_visualization', 'point_clustering']
  }
};

// TaskPlanner自动发现并使用
const compatiblePlugins = registry.filterByCapability({
  geometryType: dataSource.geometryType,
  goalType: goal.type
});
```

---

### DP-03: 依赖倒置原则（Dependency Inversion）

**原则：** 高层模块不依赖低层模块，都依赖抽象。

**应用：**
- Executor依赖StyleFactory接口，不依赖具体实现
- StyleFactory依赖ColorEngine接口，不依赖具体颜色库
- 通过接口解耦，便于测试和替换

**实现：**
```typescript
interface IStyleGenerator {
  generateStyle(config: StyleConfig): Promise<string>;  // returns URL
}

class StyleFactory implements IStyleGenerator {
  constructor(private colorEngine: IColorResolver) {}
  
  async generateStyle(config: StyleConfig): Promise<string> {
    const colors = await this.colorEngine.resolve(config.colorRamp);
    // ...
  }
}
```

---

### DP-04: 接口隔离原则（Interface Segregation）

**原则：** 客户端不应被迫依赖它不使用的方法。

**应用：**
- 三种渲染器共享基础接口，但有各自的扩展接口
- Plugin capability细粒度声明，避免冗余信息

**实现：**
```typescript
// 基础渲染器接口
interface BaseRenderer {
  execute(params: BaseRendererParams): Promise<VisualizationResult>;
}

// 各渲染器扩展自己的参数
interface UniformColorRenderer extends BaseRenderer {
  execute(params: UniformColorParams): Promise<VisualizationResult>;
}

interface ChoroplethRenderer extends BaseRenderer {
  execute(params: ChoroplethParams): Promise<VisualizationResult>;
}
```

---

### DP-05: LLM辅助决策原则

**原则：** LLM参与复杂决策，但不替代规则引擎。

**应用：**
- 简单场景：基于capability自动匹配
- 复杂场景：LLM Chain of Thought推理
- 数据源选择：LLM基于语义理解

**决策流程：**
```
Step 1: Rule-based filtering (自动)
  - goal.type → plugin category
  - dataSource.geometryType → compatible plugins
  
Step 2: LLM selection (智能)
  - 从filtered candidates中选择最合适的
  - Chain of Thought解释选择理由
  - 提取参数（colorRamp, valueField等）
  
Step 3: Validation (自动)
  - 检查必需参数是否存在
  - 验证数据类型兼容性
```

---

### DP-06: 配置优于硬编码

**原则：** 可变配置外部化，不在代码中硬编码。

**应用：**
- ❌ Prompt中不硬编码颜色映射规则
- ✅ 颜色映射在ColorEngine中配置
- ✅ Plugin capability在注册时声明

**反例：**
```typescript
// ❌ 错误：Prompt中硬编码
"Determine color ramp: 红色 → reds, 绿色 → greens"
```

**正例：**
```typescript
// ✅ 正确：配置化
const colorMappings: ColorMappingConfig = {
  zh: {
    '红色': 'reds',
    '绿色': 'greens',
    '蓝色': 'blues'
  },
  en: {
    'red': 'reds',
    'green': 'greens'
  }
};

// LLM只需知道有colorRamp参数，具体映射由系统处理
```

---

## 📐 架构约束

### 约束1: Style JSON必须由后端生成

**原因：**
- 前端无法访问统计数据（breaks, categories）
- 后端统一生成保证一致性
- 便于缓存和复用

**实现：**
- StyleFactory生成完整Mapbox GL JS style JSON
- 保存到`workspace/results/styles/{tilesetId}.json`
- 返回URL给前端

---

### 约束2: 不验证几何类型，由Adapter自动适配

**原因：**
- `geojson-vt`支持所有几何类型
- 强制限制会降低灵活性
- 视觉效果由用户判断是否合适

**实现：**
- Geometry Adapter检测geometry type
- StyleFactory生成对应的style layer type
  - Point → circle layer
  - LineString → line layer
  - Polygon → fill layer

---

### 约束3: 彻底重构，不考虑向后兼容

**原因：**
- 当前架构问题太多，修补不如重写
- 项目处于早期阶段，迁移成本低
- 一次性完成避免技术债务累积

**影响：**
- 废弃旧的`choropleth_map` plugin
- 新的三种renderer完全独立
- 需要更新prompt templates

---

## ✅ 设计验收标准

重构完成后，以下场景应该工作：

| 场景 | 期望行为 | 验收标准 |
|------|---------|---------|
| "红色显示五虎林河" | 用红色线条显示河流 | ✅ UniformColorRenderer工作 |
| "按土地利用类型显示" | 按类别着色 | ✅ CategoricalRenderer工作 |
| "用面积等级专题图显示，红色系" | choropleth with reds | ✅ ChoroplethRenderer工作 |
| "用不同颜色显示道路等级" | 线状数据分类渲染 | ✅ CategoricalRenderer支持lines |
| "显示所有监测点" | 点状数据统一颜色 | ✅ UniformColorRenderer支持points |

---

## 📝 下一步

请审阅本需求分析与设计原则文档，确认：
1. 功能需求是否完整？
2. 设计原则是否合理？
3. 架构约束是否可接受？

确认后，我将开始编写Phase 3的核心架构设计文档。
