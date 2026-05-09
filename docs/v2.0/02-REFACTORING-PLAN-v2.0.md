# GeoAI-UP v2.0 重构升级规划

## 📋 文档说明

**版本**: v2.0.0  
**分支**: dev-v2.0  
**创建日期**: 2026-05-09  
**重构原则**: **不考虑向后兼容**,彻底优化架构设计

本文档提供v2.0重构的**高层架构概览和实施路线图**。详细的技术实现请参考：

- **算子架构**: [03-SPATIAL-OPERATOR-ARCHITECTURE.md](./03-SPATIAL-OPERATOR-ARCHITECTURE.md)
- **任务拆分**: [04-GIS-TASK-SPLITTING-STRATEGY.md](./04-GIS-TASK-SPLITTING-STRATEGY.md)
- **数据访问**: [05-DATA-ACCESS-FACADE.md](./05-DATA-ACCESS-FACADE.md)
- **迁移指南**: [06-MIGRATION-GUIDE.md](./06-MIGRATION-GUIDE.md)

---

## 🎯 重构目标

### 核心问题

v1.0存在以下架构问题需要解决：

1. **任务拆分缺乏GIS语义** - 通用LLM意图识别,无法理解空间分析业务逻辑
2. **数据访问层冗余** - Accessor按格式分散,代码重复严重
3. **执行器三层嵌套** - Plugin→Executor→Tool,职责重叠,调试困难
4. **服务发布分散** - MVT/WMS独立Publisher,缺乏统一管理
5. **工作流串行执行** - 无并行优化,性能瓶颈明显

### 重构目标对比

| 维度 | v1.0现状 | v2.0目标 | 改进幅度 |
|------|---------|---------|---------|
| **任务拆分** | 通用意图识别 | LLM自主因子推断 | 准确率75%→95% |
| **数据访问** | 格式驱动Accessor | 能力驱动Backend | 代码复用+60% |
| **执行器** | 三层嵌套架构 | 单一SpatialOperator | 复杂度-67% |
| **服务发布** | 分散Publisher | 统一VisualizationService | 管理简化 |
| **工作流** | 纯串行执行 | DAG并行编排 | 速度+40-60% |
| **错误处理** | 简单try-catch | 异常回退+结果保留 | 可靠性提升 |

### 性能指标

- ✅ **任务规划准确率**: 75% → 95%
- ✅ **空间分析速度**: +40-60% (并行计算)
- ✅ **内存占用**: -30% (流式处理)
- ✅ **代码复杂度**: Cyclomatic Complexity -50%
- ✅ **维护成本**: -50% (零配置)

---

## 🏗️ 五大架构改造

### 一、任务拆分策略升级

#### 核心理念: LLM自主因子推断

**v1.0问题**:
- GoalSplitter仅做通用分类(spatial_analysis/general/query)
- TaskPlanner简单按category过滤Plugin
- 缺失: 数据可用性校验、并行/串行区分、隐含因子补全

**v2.0方案**:
完全去除行业知识库和用户干预,LLM基于以下机制自主决策:

1. **数据源驱动** - 扫描平台现有数据,通过元数据理解语义
2. **常识推理** - LLM基于地理学常识自主决定适用数据
3. **动态适配** - 不同任务自动选择不同因子组合

**新增组件**:
- `DataSourceSemanticAnalyzer` - 数据源语义分析器
- `ParallelTaskAnalyzer` - 并行任务依赖分析器

**优势**:
- ✅ 零配置: 无需维护行业因子库
- ✅ 灵活性强: 适应任意新场景
- ✅ 智能化: LLM理解数据后自主决策

**详细说明**: [04-GIS-TASK-SPLITTING-STRATEGY.md](./04-GIS-TASK-SPLITTING-STRATEGY.md)

---

### 二、数据访问层重构

#### 从"格式驱动"到"能力驱动"

**v1.0问题**:
- Accessor按数据格式分类(File/PostGIS/WebService)
- 每个Accessor重复实现buffer/overlay/filter等操作
- 代码重复率高,扩展新格式需重写所有方法

**v2.0方案**:
```
Data Access Layer v2.0
├── SpatialOperator (操作抽象)
│   ├── BufferOperator
│   ├── OverlayOperator
│   └── FilterOperator
│
├── DataBackend (后端适配器)
│   ├── VectorBackend (Turf.js for GeoJSON)
│   ├── RasterBackend (GDAL for GeoTIFF)
│   └── PostGISBackend (SQL for database)
│
└── DataAccessFacade (统一入口)
    └── execute(operator, source) → NativeData
```

**技术选型**:
- **矢量数据**: Turf.js (已在v1.0使用,纯JS,轻量级)
- **栅格数据**: GDAL via geotiff library (行业标准)
- **数据库**: PostGIS SQL (利用空间索引)

**优势**:
- ✅ 代码复用: Operator逻辑集中,Backend只负责执行
- ✅ 扩展性: 新增数据源只需添加Backend
- ✅ 一致性: 统一Operator接口保证行为一致

**详细说明**: [05-DATA-ACCESS-FACADE.md](./05-DATA-ACCESS-FACADE.md)

---

### 三、执行器架构简化

#### 从三层嵌套到单一抽象

**v1.0架构**:
```
Plugin Definition (metadata)
    ↓
Plugin Executor (business logic)
    ↓
PluginToolWrapper (LangChain adapter)
    ↓
ToolRegistry
```

**问题**:
- 职责重叠: 三层都包含部分元数据和逻辑
- 注册复杂: 需同时注册Plugin、Executor、Tool
- 调试困难: 错误需在三层间追踪

**v2.0方案**:
```
SpatialOperator (unified abstraction)
    ├── Input/Output Schema (Zod validation)
    ├── Execution Logic (core implementation)
    └── Registration (auto-discovery)
```

**关键改进**:
- 合并Plugin/Executor/Tool为单一SpatialOperator
- 使用Zod进行类型安全的输入输出验证
- 自动注册机制,减少样板代码

**详细说明**: [03-SPATIAL-OPERATOR-ARCHITECTURE.md](./03-SPATIAL-OPERATOR-ARCHITECTURE.md)

---

### 四、服务发布统一

#### 统一可视化服务发布器

**v1.0问题**:
- MVT Publisher和WMS Publisher独立实现
- 缺乏统一的TTL管理和自动清理
- 服务状态分散,难以监控

**v2.0方案**:
- 创建`VisualizationServicePublisher`统一接口
- 支持MVT/WMS/GeoJSON多种发布格式
- 集成TTL管理、自动清理、健康检查

**优势**:
- 统一管理所有可视化服务
- 自动资源清理,避免内存泄漏
- 简化的API调用方式

---

### 五、工作流引擎增强

#### 从串行到并行DAG编排

**v1.0问题**:
- LangGraph工作流纯串行执行
- 无并行优化,多个独立任务等待执行
- 缺少中间结果持久化和异常回退

**v2.0方案**:
- 引入`EnhancedPluginExecutor`支持并行执行
- 基于DAG依赖图自动识别可并行任务组
- 实现中间结果持久化和异常回退机制

**执行模式**:
- `sequential`: 严格顺序执行
- `parallel`: 完全并行执行
- `hybrid`: 混合模式(默认,智能调度)

**性能提升**:
- 独立任务并行执行,总耗时减少40-60%
- 失败任务回退,保留已完成的中间结果
- 支持断点续传,提高鲁棒性

---

## 📂 目录结构调整

### v2.0 新目录结构

```
server/src/
├── spatial-operators/              # 新增:统一算子层
│   ├── SpatialOperator.ts         # 基础抽象
│   ├── operators/                 # 具体算子实现
│   ├── backends/                  # 数据后端
│   ├── facade/                    # 统一入口
│   └── SpatialOperatorRegistry.ts # 注册表
│
├── llm-interaction/
│   ├── agents/
│   │   ├── GoalSplitterAgent.ts   # 重构版
│   │   └── TaskPlannerAgent.ts    # 重构版
│   ├── analyzers/                 # 新增:分析器
│   │   ├── DataSourceSemanticAnalyzer.ts
│   │   └── ParallelTaskAnalyzer.ts
│   └── workflow/
│       └── nodes/
│           └── EnhancedPluginExecutor.ts
│
├── services/
│   └── VisualizationServicePublisher.ts
│
├── data-access/                   # 保留但简化
│   └── interfaces.ts              # 接口定义
│
└── plugin-orchestration/          # 逐步废弃
    # 标记为deprecated,迁移到spatial-operators
```

**关键变化**:
- ✅ 新增`spatial-operators/`作为核心模块
- ✅ 移除`data-access/accessors/`等冗余目录
- ✅ `plugin-orchestration/`标记为deprecated

---

## 🔄 迁移路径 (12周计划)

### Phase 1: 基础设施准备 (Week 1-2)
- [ ] 创建`spatial-operators/`目录结构
- [ ] 定义`SpatialOperator`抽象基类
- [ ] 实现`DataAccessFacade`和`DataBackend`接口
- [ ] 搭建单元测试框架

### Phase 2: 核心算子迁移 (Week 3-4)
- [ ] 迁移Buffer/Overlay/Filter算子
- [ ] 迁移可视化算子(Heatmap, Choropleth)
- [ ] 实现VectorBackend(Turf.js)和RasterBackend(GDAL)
- [ ] 实现PostGISBackend

### Phase 3: LLM Agents升级 (Week 5-6)
- [ ] 实现DataSourceSemanticAnalyzer
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

### Phase 6: API层适配 (Week 9)
- [ ] 创建SpatialOperatorController
- [ ] 更新ToolController适配新架构
- [ ] 废弃旧的Plugin API(标记deprecated)

### Phase 7: 测试与优化 (Week 10-11)
- [ ] 端到端集成测试
- [ ] 性能基准测试
- [ ] 内存泄漏检测
- [ ] 并发压力测试

### Phase 8: 文档与部署 (Week 12)
- [ ] 更新架构文档
- [ ] 编写迁移指南
- [ ] 生产环境部署

**详细迁移步骤**: [06-MIGRATION-GUIDE.md](./06-MIGRATION-GUIDE.md)

---

## ⚠️ Breaking Changes

v2.0不考虑向后兼容,以下变更将影响现有代码:

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
const result = await facade.execute(bufferOperator, dataSource);
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
- `requiredPlugins` → `requiredOperators`
- 新增`parallelGroups`和`executionMode`字段

**完整迁移指南**: [06-MIGRATION-GUIDE.md](./06-MIGRATION-GUIDE.md)

---

## 📊 预期收益

### 性能提升
- ✅ **任务规划速度**: +50% (零配置,无需查询知识库)
- ✅ **空间分析执行**: +40-60% (并行计算)
- ✅ **内存占用**: -30% (流式处理+延迟加载)

### 代码质量
- ✅ **代码行数**: -40% (移除冗余架构)
- ✅ **Cyclomatic Complexity**: -60% (简化分支)
- ✅ **维护成本**: -50% (零配置)

### 用户体验
- ✅ **零学习成本**: 用户只需描述需求
- ✅ **透明决策**: LLM解释数据选择原因
- ✅ **灵活适应**: 自动适配任意新场景

---

## 🎓 技术债务清理

### 已识别的技术债务

| 优先级 | 问题 | 解决方案 |
|--------|------|---------|
| **P0** | 重复的Accessor实现 | 统一为DataBackend |
| **P0** | 三层Plugin架构 | 简化为SpatialOperator |
| **P0** | 串行执行瓶颈 | 并行DAG编排 |
| **P1** | 硬编码的行业因子 | LLM自主推断 |
| **P1** | 分散的服务发布 | 统一Publisher |
| **P2** | 缺失的数据校验 | DataSourceSemanticAnalyzer |

---

## 📝 下一步行动

1. **评审本文档**: 团队讨论重构方案的可行性
2. **细化技术方案**: 为每个Phase编写详细设计文档
3. **搭建开发环境**: 创建dev-v2.0分支的开发规范
4. **开始Phase 1**: 基础设施准备工作

---

## 🔗 相关文档

- [00-README.md](./00-README.md) - 快速导航
- [01-DOCUMENT-STRUCTURE.md](./01-DOCUMENT-STRUCTURE.md) - 文档层次说明
- [03-SPATIAL-OPERATOR-ARCHITECTURE.md](./03-SPATIAL-OPERATOR-ARCHITECTURE.md) - 算子架构设计
- [04-GIS-TASK-SPLITTING-STRATEGY.md](./04-GIS-TASK-SPLITTING-STRATEGY.md) - 任务拆分策略
- [05-DATA-ACCESS-FACADE.md](./05-DATA-ACCESS-FACADE.md) - 数据访问门面
- [06-MIGRATION-GUIDE.md](./06-MIGRATION-GUIDE.md) - 迁移指南

---

**文档版本**: 2.0 (精简版)  
**最后更新**: 2026-05-09  
**作者**: GeoAI-UP Architecture Team
