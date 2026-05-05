# 可视化渲染器重构 - 设计完成总结

## ✅ 已完成的设计文档

### Phase 1: 问题分析与现状评估
- ✅ [01-Current-Problems.md](./01-Current-Problems.md) - 5大核心问题深度诊断
- ✅ [02-Requirements-Analysis.md](./02-Requirements-Analysis.md) - 功能需求与设计原则

### Phase 2: 核心架构设计
- ✅ [03-Renderer-Architecture.md](./03-Renderer-Architecture.md) - **完整架构蓝图**（已更新）
  - Plugin Execution Category System（4类分类）
  - Capability Schema（修正版）
  - 数据格式抽象（vector/raster）
  - TaskPlanner三阶段决策策略
  - 终端节点约束验证
  - BaseRendererExecutor统一工作流
  - StyleFactory重构方案
  - Geometry Adapter Layer

### 索引与概览
- ✅ [VISUALIZATION-REFACTOR-INDEX.md](../VISUALIZATION-REFACTOR-INDEX.md) - 总索引
- ✅ [README.md](./README.md) - 规划概览与审查指南（已更新）

---

## 🎯 核心设计决策确认

### 1. Plugin执行类别分类体系

| Category | Input | Output | Terminal? | Examples |
|----------|-------|--------|-----------|----------|
| Statistical | NativeData | JSON | No | StatisticsCalculator, Aggregation |
| Computational | NativeData | NativeData (single) | No | BufferAnalysis, OverlayAnalysis, Filter |
| Visualization | NativeData | MVT/WMS/GeoJSON | **Yes** | ChoroplethRenderer, UniformColorRenderer, CategoricalRenderer |
| Textual | ExecutionResults | HTML/PDF | **Yes** | ReportGenerator |

**关键约束：**
- ✅ 终端节点（Visualization/Textual）必须是Goal的最后一个Executor（**由LLM保证**）
- ✅ 统计类和运算类可串联形成pipeline
- ✅ **所有Plugin均为单输出**：每次执行只返回一个NativeData或JSON结果
- ❌ 不支持分支执行（通过重复执行实现）
- ❌ 不支持循环依赖

---

### 2. 数据格式抽象

**原则：** Plugin capability只区分`vector`/`raster`，不细分具体数据源类型。

```typescript
// ✅ 新设计
inputRequirements: {
  supportedDataFormats: ['vector'],  // 或 ['raster']
  supportedGeometryTypes: ['Polygon']
}

// Accessor层负责映射具体DataSourceType到DataFormat
```

**特殊场景处理：**
- **WMS服务**：不需要WMS Accessor，WMS是远程服务而非本地数据
- **PostGIS Raster**：当前架构不考虑，使用GeoTIFF处理栅格数据
- **Plugin数据源限制**：可在capability中声明supportedDataSourceTypes进行额外约束

**优势：**
- Plugin capability更简洁
- 新增数据源类型无需修改所有Plugin
- Accessor层封装具体实现细节

---

### 3. 统计类输出格式

**决策：** 使用JSON而非Table，方便后续扩展。

```typescript
outputCapabilities: {
  outputType: 'json',  // StatisticsCalculator输出JSON
  isTerminalNode: false
}

// 示例输出
{
  "count": 100,
  "mean": 45.6,
  "median": 42.0,
  "std": 12.3,
  "min": 10.0,
  "max": 98.5
}
```

---

### 4. 运算类单输出设计

**决策：** 所有Plugin均为单输出，包括运算类。

```typescript
// OverlayAnalysis每次只返回一个结果（根据operation参数）
outputCapabilities: {
  outputType: 'native_data',
  isTerminalNode: false,
}

// 如果需要多种叠加结果，需分别调用三次：
// - operation: 'intersect' → 交集
// - operation: 'union' → 并集
// - operation: 'difference' → 差集
```

**理由：**
- ✅ 简化Executor实现和返回值处理
- ✅ Placeholder解析更简单（`{{step.result}}`）
- ✅ 避免复杂的多输出管理逻辑

---

### 5. 终端节点约束

**决策：** 由LLM在生成执行计划时保证终端节点约束，不在TaskPlanner中进行规则验证。

**规则：**
1. Visualization和Textual类Plugin必须是Goal的最后一个Executor
2. 一个Plan最多只能有一个终端节点
3. Textual类Plugin必须有前序步骤（statistical/computational/visualization）

**实现方式：**
- ✅ 在Prompt中明确说明约束规则
- ✅ LLM通过Chain of Thought推理遵守约束
- ✅ PluginExecutor执行时检测违反约束的情况并报错
- ❌ 不在TaskPlanner中实现复杂的验证逻辑

**错误处理：**
```typescript
// PluginExecutor检测到违反约束时
if (capability.isTerminalNode && !isLastStep(step, context.plan)) {
  throw new ValidationError(
    `Plugin ${step.pluginId} is a terminal node and must be the last step. ` +
    `This is likely an LLM planning error.`
  );
}
```

详细设计请参考：[15-Terminal-Node-Constraints.md](./15-Terminal-Node-Constraints.md)

---

## 📊 三种渲染器的Capability声明

### Uniform Color Renderer
```typescript
{
  executionCategory: 'visualization',
  inputRequirements: {
    supportedDataFormats: ['vector'],
    supportedGeometryTypes: ['Point', 'LineString', 'Polygon', ...],
    requiredFields: []
  },
  outputCapabilities: {
    outputType: 'mvt',
    isTerminalNode: true,
    supportsMultipleOutputs: false
  },
  scenarios: ['simple_display', 'single_color_visualization'],
  priority: 8
}
```

### Categorical Renderer
```typescript
{
  executionCategory: 'visualization',
  inputRequirements: {
    supportedDataFormats: ['vector'],
    supportedGeometryTypes: ['Point', 'LineString', 'Polygon', ...],
    requiredFields: [
      { name: 'categoryField', type: 'string' }
    ]
  },
  outputCapabilities: {
    outputType: 'mvt',
    isTerminalNode: true,
    supportsMultipleOutputs: false
  },
  scenarios: ['categorical_visualization', 'land_use_mapping'],
  priority: 6
}
```

### Choropleth Renderer
```typescript
{
  executionCategory: 'visualization',
  inputRequirements: {
    supportedDataFormats: ['vector'],
    supportedGeometryTypes: ['Point', 'LineString', 'Polygon', ...],
    requiredFields: [
      { name: 'valueField', type: 'number' }
    ]
  },
  outputCapabilities: {
    outputType: 'mvt',
    isTerminalNode: true,
    supportsMultipleOutputs: false
  },
  scenarios: ['thematic_mapping', 'statistical_visualization'],
  priority: 5
}
```

---

## 🔄 TaskPlanner三阶段决策流程

```
Stage 1: Rule-Based Filtering
  ├─ Infer execution category from goal.type
  ├─ Detect data format (vector/raster) from data source
  ├─ Filter plugins by capability criteria
  └─ Returns: compatible plugins (3-5 candidates)

Stage 2: Terminal Node Constraint Validation
  ├─ Check if plan already has terminal node
  ├─ Validate textual plugin predecessor requirements
  └─ Returns: validated plugins

Stage 3: LLM Chain of Thought Selection
  ├─ Analyze user intent
  ├─ Match to plugin capabilities
  ├─ Extract parameters (colorRamp, valueField, etc.)
  ├─ Verify constraint compliance
  └─ Returns: execution plan
```

---

## 📝 待编写文档（Phase 3-5）

### Phase 3: 三种渲染器详细设计
- ⏳ [06-Uniform-Color-Renderer.md](./06-Uniform-Color-Renderer.md)
- ⏳ [07-Categorical-Renderer.md](./07-Categorical-Renderer.md)
- ⏳ [08-Choropleth-Renderer.md](./08-Choropleth-Renderer.md)

**内容要点：**
- 适用场景详解
- 参数验证逻辑
- Style JSON生成规则
- 测试用例设计

---

### Phase 4: 支撑系统设计
- ⏳ [09-StyleFactory-Refactor.md](./09-StyleFactory-Refactor.md)
- ⏳ [10-Color-Resolution-Engine.md](./10-Color-Resolution-Engine.md)
- ⏳ [11-Geometry-Adapter-Layer.md](./11-Geometry-Adapter-Layer.md)

**内容要点：**
- StyleFactory新方法签名
- ColorEngine配置管理
- Geometry Adapter算法

---

### Phase 5: 实施计划
- ⏳ [12-Implementation-Roadmap.md](./12-Implementation-Roadmap.md)
- ⏳ [13-Migration-Guide.md](./13-Migration-Guide.md)
- ⏳ [14-Testing-Strategy.md](./14-Testing-Strategy.md)

**内容要点：**
- 分步实施路线图（5个阶段）
- 旧Plugin废弃计划
- 测试策略与用例

---

## 🔍 审查要点

请在审查时重点关注：

### 架构层面
1. **执行类别分类是否合理？**
   - Statistical/Computational/Visualization/Textual四类是否覆盖所有场景？
   - 终端节点约束是否过于严格？

2. **数据格式抽象是否恰当？**
   - vector/raster二分法是否足够？
   - 是否有需要区分的具体数据源类型？

3. **多输出支持是否必要？**
   - OverlayAnalysis的多输出如何在前端展示？
   - 是否需要特殊的UI支持？

### 技术层面
4. **终端节点验证如何实现？**
   - 在TaskPlanner中验证还是在Plugin Executor中验证？
   - 验证失败如何反馈给用户？

5. **统计类JSON输出的schema？**
   - 不同统计Plugin的输出格式是否统一？
   - 是否需要标准化的统计结果接口？

6. **运算类多输出的数据结构？**
   - 如何表示多个NativeData输出？
   - PlaceholderResolver如何处理多输出引用？

---

## 🚀 下一步行动

### 立即行动
1. **审查Phase 1-2文档**
   - 确认执行类别分类合理
   - 确认终端节点约束可行
   - 确认数据格式抽象恰当

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

## 📊 文档统计

| Phase | 文档数 | 状态 | 总行数 |
|-------|--------|------|--------|
| Phase 1: 问题分析 | 2 | ✅ 完成 | ~730 |
| Phase 2: 核心架构 | 1 | ✅ 完成（已更新） | ~1200+ |
| Phase 3: 渲染器设计 | 3 | ⏳ 待编写 | 0 |
| Phase 4: 支撑系统 | 3 | ⏳ 待编写 | 0 |
| Phase 5: 实施计划 | 3 | ⏳ 待编写 | 0 |
| **总计** | **14** | **21%完成** | **~1930+** |

---

**最后更新：** 2026-05-05  
**作者：** GeoAI-UP Architecture Team  
**版本：** v0.2 (Updated with Execution Category System)
