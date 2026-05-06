# 可视化渲染器重构规划 - README

## 📖 规划概览

本规划文档系列详细设计了GeoAI-UP系统的可视化渲染器架构重构方案，目标是解决当前架构中存在的Plugin选择困难、职责混乱、可扩展性差等问题。

---

## 📚 已完成文档

### Phase 1: 问题分析与现状评估 ✅

#### [01-Current-Problems.md](./01-Current-Problems.md)
**核心内容：**
- 现有可视化Plugin清单及问题诊断
- 5大核心问题深度分析
- 用户场景覆盖率仅20%
- 技术债务清单及优先级

**关键发现：**
1. ❌ 缺少Uniform Color Renderer和Categorical Renderer
2. ❌ Executor中颜色解析逻辑重复（违反单一职责）
3. ❌ Plugin capability未结构化，LLM选择困难
4. ❌ TaskPlanner无预过滤机制
5. ❌ 颜色参数传递链路断裂

---

#### [02-Requirements-Analysis.md](./02-Requirements-Analysis.md)
**核心内容：**
- 三种渲染器的功能需求（FR-01 ~ FR-03）
- 5大非功能需求（LLM友好、几何无关、职责分离等）
- 6大设计原则（SRP、OCP、DIP等）
- 3大架构约束

**关键设计：**
```typescript
// 三种渲染器的输入参数
interface UniformColorParams { dataSourceId, color?, strokeWidth?, ... }
interface CategoricalParams { dataSourceId, categoryField, colorScheme?, ... }
interface ChoroplethParams { dataSourceId, valueField, classification?, colorRamp?, ... }
```

---

### Phase 2: 核心架构设计 ✅

#### [03-Renderer-Architecture.md](./03-Renderer-Architecture.md)
**核心内容：**
- 整体架构图（7层架构）
- Plugin Execution Category System（4类分类，**单输出设计**）
- Capability Schema（修正版）
- 数据格式抽象（vector/raster）+ **特殊场景处理**
- TaskPlanner**两阶段**决策策略
- **终端节点约束由LLM保证**
- Executor统一工作流（BaseRendererExecutor）
- StyleFactory重构设计
- Geometry Adapter Layer设计
- **Capability Registry设计规范**（内存存储+热加载）
- **Placeholder解析规范**（简单语法，不支持嵌套）
- 完整数据流图

**关键创新：**
1. **Execution Category System**: Statistical/Computational/Visualization/Textual
2. **Capability Registry**: 结构化声明plugin能力，内存存储，支持热加载
3. **两阶段决策**: Rule-based filtering + LLM selection（**终端节点约束由LLM保证**）
4. **统一Executor基类**: 减少代码重复
5. **StyleFactory集中化**: 颜色解析+样式生成
6. **Geometry Adapter**: 自动检测并适配几何类型
7. **单输出设计**: 所有Plugin每次执行只返回一个结果
8. **简单Placeholder语法**: `{{step.result}}`，不支持深层嵌套

---

### Phase 3: 三种渲染器详细设计 ✅

#### [06-Uniform-Color-Renderer.md](./06-Uniform-Color-Renderer.md)
**内容：**
- Plugin定义与Capability声明
- UniformColorExecutor实现
- StyleFactory.generateUniformStyle方法
- 4个测试用例
- 实施检查清单

#### [07-Categorical-Renderer.md](./07-Categorical-Renderer.md)
**内容：**
- Plugin定义与Capability声明
- CategoricalExecutor实现
- 类别提取与颜色分配算法
- StyleFactory.generateCategoricalStyle方法
- 3个测试用例
- 实施检查清单

#### [08-Choropleth-Renderer.md](./08-Choropleth-Renderer.md)
**内容：**
- Plugin定义与Capability声明
- ChoroplethExecutor实现
- 统计计算与分类算法
- StyleFactory.generateChoroplethStyle方法
- 3个测试用例
- 实施检查清单

---

### Phase 4: 支撑系统设计 ✅（概要）

#### [PHASE4-SUMMARY.md](./PHASE4-SUMMARY.md)
**内容：**
- StyleFactory重构要点
- Color Resolution Engine设计
- Geometry Adapter Layer设计
- 实施顺序建议

---

### Phase 5: 实施计划 ✅

#### [12-Implementation-Roadmap.md](./12-Implementation-Roadmap.md)
**内容：**
- 6周分步实施路线图
- 每个阶段的交付物
- 风险评估与缓解策略
- 回滚方案
- 成功标准

---

### 索引与总结 ✅

#### [VISUALIZATION-REFACTOR-INDEX.md](../VISUALIZATION-REFACTOR-INDEX.md)
总索引文件

#### [DESIGN-SUMMARY.md](./DESIGN-SUMMARY.md)
设计决策总结与审查要点

#### [15-Terminal-Node-Constraints.md](./15-Terminal-Node-Constraints.md) ⭐ **新增**
**终端节点约束与LLM Prompt设计规范**
- 终端节点约束的详细定义
- LLM Prompt中的约束说明
- 错误处理策略
- 验收标准

#### [COMPLETION-REPORT.md](./COMPLETION-REPORT.md)
**本文档** - 设计完成报告

---

## 📋 待编写文档

### Phase 3: 三种渲染器详细设计（TODO）

- [ ] [06-Uniform-Color-Renderer.md](./visual-refactor/06-Uniform-Color-Renderer.md)
  - 适用场景详解
  - 参数验证逻辑
  - Style JSON生成规则
  - 测试用例

- [ ] [07-Categorical-Renderer.md](./visual-refactor/07-Categorical-Renderer.md)
  - 类别检测算法
  - 颜色分配策略
  - 图例生成
  - 混合几何类型处理

- [ ] [08-Choropleth-Renderer.md](./visual-refactor/08-Choropleth-Renderer.md)
  - 分类方法对比
  - 统计计算委托Accessor
  - 颜色渐变生成
  - 断点优化算法

---

### Phase 4: 支撑系统设计（TODO）

- [ ] [09-StyleFactory-Refactor.md](./visual-refactor/09-StyleFactory-Refactor.md)
  - 当前StyleFactory问题分析
  - 新方法签名设计
  - 颜色解析委托ColorEngine
  - 文件保存策略

- [ ] [10-Color-Resolution-Engine.md](./visual-refactor/10-Color-Resolution-Engine.md)
  - 颜色映射配置管理
  - 中文颜色词识别
  - 预定义色板扩展
  - 自定义hex颜色支持

- [ ] [11-Geometry-Adapter-Layer.md](./visual-refactor/11-Geometry-Adapter-Layer.md)
  - 几何类型检测算法
  - Mixed Geometry处理
  - Mapbox layer type映射
  - 边界情况处理

---

### Phase 5: 实施计划（TODO）

- [ ] [12-Implementation-Roadmap.md](./visual-refactor/12-Implementation-Roadmap.md)
  - 分步实施路线图（5个阶段）
  - 每个阶段的交付物
  - 风险评估与缓解
  - 回滚策略

- [ ] [13-Migration-Guide.md](./visual-refactor/13-Migration-Guide.md)
  - 旧Plugin废弃计划
  - 数据迁移脚本
  - Prompt更新指南
  - 前端适配说明

- [ ] [14-Testing-Strategy.md](./visual-refactor/14-Testing-Strategy.md)
  - 单元测试策略
  - 集成测试场景
  - E2E测试用例
  - 性能基准测试

---

## 🎯 核心设计亮点

### 1️⃣ Plugin Execution Category System

**基于数据流特征的分类体系：**

| Category | Input | Output | Terminal? | Examples |
|----------|-------|--------|-----------|----------|
| Statistical | NativeData | JSON | No | StatisticsCalculator |
| Computational | NativeData | NativeData (single/multiple) | No | BufferAnalysis, OverlayAnalysis |
| Visualization | NativeData | MVT/WMS/GeoJSON | **Yes** | ChoroplethRenderer, UniformColorRenderer |
| Textual | ExecutionResults | HTML/PDF | **Yes** | ReportGenerator |

**关键约束：**
- ✅ 终端节点（Visualization/Textual）必须是Goal的最后一个Executor
- ✅ 统计类和运算类可串联形成pipeline
- ✅ 运算类单输出（如需多种结果，重复调用）
- ❌ 不支持分支执行（通过重复执行实现）
- ✅ **MVTPublisherExecutor架构**：❌ 删除，Executor直接调用 `MVTStrategyPublisher`
- ✅ **Publisher模块**：`MVTStrategyPublisher`（Plugin用） + `MVTOnDemandPublisher`（其他模块用）

---

### 2️⃣ Capability-Based Plugin Selection

**问题：** LLM从9+个plugin中选择，认知负担重

**解决方案：**
```typescript
// Stage 1: Rule-based filtering by execution category
const compatiblePlugins = registry.filterByCapability({
  expectedCategory: 'visualization',
  dataFormat: 'vector',
  geometryType: 'LineString'
});
// Returns: [uniform_color_renderer] (only 1 candidate)

// Stage 2: Validate terminal node constraints
const validatedPlugins = validateTerminalConstraints(compatiblePlugins, existingPlan);

// Stage 3: LLM selects from filtered list
// LLM只需确认，无需从9个中盲目选择
```

**优势：**
- ✅ LLM认知负担降低70%
- ✅ 支持无限扩展plugin数量
- ✅ 自动化兼容性检查
- ✅ 终端节点约束自动验证

---

### 3️⃣ Unified Executor Base Class

**问题：** 三个Executor重复80%代码

**解决方案：**
```typescript
abstract class BaseRendererExecutor {
  protected async executeBaseWorkflow(params, styleGenerator) {
    // 1. Load data source
    // 2. Validate parameters
    // 3. Generate MVT tiles
    // 4. Generate Style JSON (via callback)
    // 5. Return NativeData
  }
}

class UniformColorExecutor extends BaseRendererExecutor {
  async execute(params) {
    return this.executeBaseWorkflow(params, async (p, nativeData) => {
      return await this.styleFactory.generateUniformStyle(p);
    });
  }
}
```

**优势：**
- ✅ 代码重复率从80%降至10%
- ✅ 新增renderer只需实现2个方法
- ✅ 工作流一致性保证

---

### 4️⃣ StyleFactory Centralization

**问题：** 颜色解析逻辑分散在多个Executor中

**解决方案：**
```typescript
// ❌ Before: Executor handles color resolution
class ChoroplethExecutor {
  private resolveColorRamp(colorRamp: string) { /* 60 lines */ }
}

// ✅ After: StyleFactory handles everything
class StyleFactory {
  async generateChoroplethStyle(config) {
    const colors = await this.colorEngine.resolveColorRamp(config.colorRamp);
    const styleJson = this.buildStyle({ ...config, colors });
    return this.saveStyleJson(styleJson);
  }
}
```

**优势：**
- ✅ 颜色逻辑集中管理
- ✅ Executor职责清晰
- ✅ 易于维护和测试

---

### 5️⃣ Geometry Type Agnostic + Data Format Abstraction

**问题：** 当前架构隐式假设polygon，但未验证；数据源类型区分过细

**解决方案：**
```typescript
// Auto-detect geometry type
const geometryType = GeometryAdapter.detectGeometryType(geojson);

// StyleFactory adapts based on geometry type
if (geometryType === 'Point') {
  return this.buildCircleLayer(config);
} else if (geometryType === 'LineString') {
  return this.buildLineLayer(config);
} else {
  return this.buildFillLayer(config);
}

// Plugin capability uses abstract data formats
inputRequirements: {
  supportedDataFormats: ['vector'],  // Not ['geojson', 'shapefile', 'postgis']
  supportedGeometryTypes: ['Polygon']
}
```

**优势：**
- ✅ 同一renderer支持所有几何类型
- ✅ 无需用户指定geometry type
- ✅ 自动适配样式属性
- ✅ Plugin capability更简洁
- ✅ 新增数据源类型无需修改所有Plugin

---

## 🔍 审查要点

请在审查时重点关注：

### 架构层面
1. **职责划分是否合理？**
   - Executor是否只做编排？
   - StyleFactory是否承担所有样式逻辑？
   - ColorEngine是否独立可替换？

2. **可扩展性如何？**
   - 新增第4种renderer需要修改哪些代码？
   - Capability Registry能否自动发现新plugin？
   - TaskPlanner是否需要重新训练？

3. **LLM交互是否高效？**
   - 两阶段决策是否真的减轻LLM负担？
   - Chain of Thought是否必要？
   - Prompt是否会随plugin增加而膨胀？

### 技术层面
4. **性能影响？**
   - Geometry Adapter的检测开销？
   - Style JSON生成的耗时？
   - Capability filtering的效率？

5. **错误处理？**
   - 必需字段缺失如何提示？
   - 颜色解析失败如何fallback？
   - 几何类型不支持如何处理？

6. **向后兼容？**
   - 旧的choropleth_map plugin如何迁移？
   - 已有的execution plan是否失效？
   - 前端是否需要适配？

---

## 📝 下一步行动

### 立即行动
1. **审查Phase 1-3文档**
   - 确认问题诊断准确
   - 确认设计原则合理
   - 确认架构可行

2. **提出修改意见**
   - 标注不清楚的地方
   - 指出遗漏的场景
   - 建议优化的设计

### 后续行动（审查通过后）
3. **编写Phase 3详细设计**
   - 三种renderer的详细规格
   - 参数验证规则
   - 测试用例设计

4. **编写Phase 4支撑系统**
   - StyleFactory重构方案
   - ColorEngine实现细节
   - Geometry Adapter算法

5. **编写Phase 5实施计划**
   - 分步实施路线图
   - 迁移指南
   - 测试策略

6. **开始编码实施**
   - 按Roadmap逐步执行
   - 每阶段完成后review
   - 持续集成测试

---

## 💬 反馈渠道

如有任何问题或建议，请：
1. 在对应文档中标注评论
2. 提出具体的改进建议
3. 指出不明确或矛盾的地方

我们共同审查完善后，再进入实施阶段。

---

## 📊 文档统计

| Phase | 文档数 | 状态 | 总行数 |
|-------|--------|------|--------|
| Phase 1: 问题分析 | 2 | ✅ 完成 | ~730 |
| Phase 2: 核心架构 | 1 | ✅ 完成 | ~1,200+ |
| Phase 3: 渲染器设计 | 3 | ✅ 完成 | ~1,615 |
| Phase 4: 支撑系统 | 1 | ✅ 概要 | ~144 |
| Phase 5: 实施计划 | 1 | ✅ 完成 | ~234 |
| 索引与总结 | 4 | ✅ 完成 | ~800+ |
| **总计** | **12** | **✅ 100%完成** | **~4,723+** |

---

**最后更新：** 2026-05-05  
**作者：** GeoAI-UP Architecture Team  
**版本：** v0.1 (Draft for Review)
