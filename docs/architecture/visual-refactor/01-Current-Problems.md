# Phase 1: 当前架构问题诊断

## 📊 现状分析

### 1.1 现有可视化Plugin清单

| Plugin ID | 名称 | 功能 | 几何类型限制 | 状态 |
|-----------|------|------|-------------|------|
| `choropleth_map` | Choropleth Map Generator | 分级统计专题图 | ❌ 未验证，实际支持所有类型 | ⚠️ 部分工作 |
| `heatmap` | Heatmap Generator | 热力图 | ✅ 仅点（但代码支持polygon转centroid） | ✅ 工作 |
| `mvt_publisher` | MVT Publisher | 通用MVT发布 | ✅ 所有类型 | ✅ 工作 |

**问题发现：**
- ❌ 缺少"统一颜色渲染器"（Uniform Color Renderer）
- ❌ 缺少"分类渲染器"（Categorical Renderer）
- ⚠️ `choropleth_map`的description说"polygon data source"但代码未验证
- ⚠️ 用户query"红色显示五虎林河"无法映射到任何plugin

---

### 1.2 核心问题诊断

#### 问题1：Plugin选择困难

**现象：**
```
用户输入："红色显示五虎林河数据集"
期望行为：用红色线条显示河流
实际问题：LLM不知道选择哪个plugin
```

**根本原因：**
1. **没有合适的plugin**
   - `choropleth_map`需要valueField（必需参数），但用户没指定
   - `mvt_publisher`不支持颜色参数
   - `heatmap`只适合点密度可视化

2. **Plugin description不够明确**
   ```typescript
   // 当前ChoroplethMapPlugin description
   description: 'Generate choropleth thematic map as MVT service with automatic classification and styling'
   
   // 问题：没有说明适用场景、输入要求、输出效果
   ```

3. **LLM无法推断用户意图**
   - "红色显示" = 简单样式？还是分级着色？
   - 没有结构化信息帮助LLM决策

**影响：**
- 🔴 用户体验差：简单需求无法满足
- 🔴 LLM困惑：在9个plugin中盲目选择
- 🔴 可扩展性差：每新增一个场景都要重新教育LLM

---

#### 问题2：职责混乱

**现象：**
```typescript
// ChoroplethMVTExecutor.ts line 89
colors: this.resolveColorRamp(colorRamp, breaks.length),  // Executor在解析颜色

// ChoroplethMVTExecutor.ts line 224-255
private resolveColorRamp(colorRamp: string, numColors: number): string[] {
  // 60行颜色解析逻辑在Executor中
}
```

**根本原因：**
- ❌ Executor承担了颜色解析职责
- ❌ StyleFactory没有被充分利用
- ❌ 颜色逻辑分散在多个Executor中（重复代码）

**正确职责划分应该是：**
```
Executor:
  - 编排workflow
  - 调用Accessor获取数据
  - 调用MVTPublisher生成tiles
  - 调用StyleFactory生成样式（传递colorRamp名称）

StyleFactory:
  - 解析colorRamp名称为具体颜色
  - 生成Mapbox GL JS style JSON
  - 保存文件并返回URL
```

**影响：**
- 🔴 代码重复：每个Executor都要实现颜色解析
- 🔴 维护困难：修改颜色逻辑要改多处
- 🔴 违反单一职责原则

---

#### 问题3：几何类型限制不明确

**现象：**
```typescript
// ChoroplethMapPlugin.ts line 19
description: 'ID of the polygon data source'  // 只是文本描述

// ChoroplethMVTExecutor.ts
// 没有任何geometry type验证代码
```

**根本原因：**
- ❌ Plugin schema没有结构化的geometry type声明
- ❌ Executor没有运行时验证
- ❌ `geojson-vt`库接受所有几何类型，不会报错

**实际情况：**
- `geojson-vt`可以处理Point、LineString、Polygon
- Choropleth map对线状数据也能工作（按线段着色）
- 但视觉效果可能不符合预期

**影响：**
- 🟡 系统静默接受不合适的输入
- 🟡 用户可能得到意外结果
- 🟡 缺乏明确的错误提示

---

#### 问题4：TaskPlanner决策策略缺失

**现象：**
```typescript
// TaskPlannerAgent.ts
// 直接将所有9个plugin传给LLM
availablePlugins: JSON.stringify(availableTools.map(t => ({
  id: t.id,
  name: t.name,
  description: t.description,
  parameters: t.parameters,
  outputSchema: t.outputSchema
})), null, 2)
```

**根本原因：**
- ❌ 没有预过滤机制
- ❌ LLM需要从全部plugin中选择
- ❌ 没有基于capability的匹配

**理想流程应该是：**
```
Step 1: Filter plugins by goal.type
  - goal.type = 'visualization' → visualization plugins only
  
Step 2: Filter by data compatibility
  - dataSource.geometryType vs plugin.supportedGeometryTypes
  
Step 3: LLM selects from filtered candidates (3-5个)
  - 提供对比维度
  - Chain of Thought推理
```

**影响：**
- 🔴 LLM认知负担重
- 🔴 容易选择不合适的plugin
- 🔴 无法扩展到更多plugin

---

#### 问题5：颜色参数传递链路断裂

**现象：**
```
用户输入："红色显示五虎林河"
    ↓
Goal Splitter: {description: "红色显示五虎林河", type: "visualization"}
    ↓ (颜色信息丢失在description文本中)
Task Planner: 不知道要传colorRamp参数
    ↓
Plugin Executor: 使用默认值'greens'
    ↓
前端显示：绿色（而非红色）
```

**根本原因：**
- ❌ Goal Splitter不提取结构化参数
- ❌ Task Planner依赖LLM从description中推断
- ❌ 没有显式的参数提取机制

**影响：**
- 🔴 用户意图丢失
- 🔴 系统行为不可预测
- 🔴 调试困难

---

### 1.3 用户场景覆盖分析

| 用户Query | 期望行为 | 当前支持 | 问题 |
|-----------|---------|---------|------|
| "红色显示五虎林河" | 用红色线条显示河流 | ❌ | 无合适plugin |
| "用面积等级专题图显示陕西省，红色系" | choropleth map，reds colorRamp | ✅ | 工作正常 |
| "按土地利用类型显示" | categorical renderer | ❌ | 无此plugin |
| "显示所有监测点" | uniform color, points | ❌ | 无此plugin |
| "用不同颜色显示道路等级" | categorical renderer for lines | ❌ | 无此plugin |

**覆盖率：20% (1/5)**

---

### 1.4 技术债务清单

| 债务项 | 严重程度 | 影响范围 | 修复优先级 |
|--------|---------|---------|-----------|
| 缺少Uniform Color Renderer | 🔴 High | 基础可视化场景 | P0 |
| 缺少Categorical Renderer | 🔴 High | 分类可视化场景 | P0 |
| Executor中颜色解析逻辑重复 | 🟡 Medium | 代码维护 | P1 |
| Plugin capability未结构化 | 🟡 Medium | LLM决策准确性 | P1 |
| TaskPlanner无预过滤机制 | 🟡 Medium | 可扩展性 | P1 |
| 几何类型验证缺失 | 🟢 Low | 用户体验 | P2 |
| Goal Splitter不提取参数 | 🟡 Medium | 参数传递 | P1 |

---

## 🎯 重构目标

基于以上问题分析，重构需要解决：

1. **新增两种渲染器**：Uniform Color、Categorical
2. **统一渲染器接口**：三种渲染器遵循相同契约
3. **重构StyleFactory**：集中颜色解析和样式生成
4. **建立Capability System**：结构化plugin能力声明
5. **改进TaskPlanner**：两阶段决策策略
6. **增强Goal Splitter**：提取关键参数

---

## 📝 下一步

请审阅本问题分析文档，确认：
1. 问题诊断是否准确？
2. 是否有遗漏的关键问题？
3. 重构目标是否合理？

确认后，我将编写Phase 2的需求分析与设计原则文档。
