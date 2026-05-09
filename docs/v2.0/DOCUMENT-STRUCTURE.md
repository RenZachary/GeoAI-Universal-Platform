# v2.0 文档层次结构

## 📚 文档导航 (按重要性排序)

### ⭐ 核心文档 (必读)

#### 1. [REFACTORING-PLAN-v2.0.md](./REFACTORING-PLAN-v2.0.md) - 总体重构规划
**文件大小**: ~900行 (精简后)  
**阅读时间**: 15分钟  
**核心内容**:
- ✅ LLM自主因子推断 (零配置,无需行业知识库)
- ✅ SpatialOperator统一架构 (替代Plugin/Executor/Tool三层)
- ✅ 数据访问层重构 (DataBackend抽象)
- ✅ 并行执行引擎 (DAG编排)
- ✅ 12周实施路线图

**适合**: 所有人 (架构师、开发者、产品经理)

---

### 🔧 技术细节文档 (按需阅读)

#### 2. [SPATIAL-OPERATOR-ARCHITECTURE.md](./SPATIAL-OPERATOR-ARCHITECTURE.md) - 算子架构设计
**文件大小**: ~800行  
**阅读时间**: 20分钟  
**核心内容**:
- SpatialOperator抽象基类定义
- 3个实现示例 (Buffer, KernelDensity, WeightedOverlay)
- 注册表模式与LangChain集成
- v1.0 → v2.0 迁移指南

**适合**: 后端开发者、插件开发者

---

#### 3. [GIS-TASK-SPLITTING-STRATEGY.md](./GIS-TASK-SPLITTING-STRATEGY.md) - 任务拆分策略
**文件大小**: ~700行  
**阅读时间**: 15分钟  
**核心内容**:
- DataSourceSemanticAnalyzer (数据源语义分析)
- LLM自主推断流程 (数据驱动 + 常识推理)
- 并行任务分析器 (DAG依赖图)
- 实际案例演示

**适合**: LLM Agents开发者、AI工程师

---

### 📖 待编写文档 (后续补充)

#### 4. PARALLEL-EXECUTION-ENGINE.md - 并行执行引擎 *(TODO)*
**计划内容**: DAG算法、资源管理、异常回退  
**适合**: 工作流引擎开发者

#### 5. DATA-ACCESS-FACADE.md - 数据访问门面 *(TODO)*
**计划内容**: Backend抽象、GDAL/PostGIS适配  
**适合**: 数据层开发者

#### 6. MIGRATION-GUIDE.md - 迁移指南 *(TODO)*
**计划内容**: 自动化脚本、手动步骤、测试清单  
**适合**: 运维工程师

---

## 🎯 快速决策树

```
你是?
├─ 架构师/技术负责人
│  └─ 阅读: REFACTORING-PLAN-v2.0.md (整体把握)
│
├─ 后端开发者
│  ├─ 首先: REFACTORING-PLAN-v2.0.md (了解目标)
│  └─ 然后: SPATIAL-OPERATOR-ARCHITECTURE.md (实现细节)
│
├─ AI/LLM开发者
│  ├─ 首先: REFACTORING-PLAN-v2.0.md (了解目标)
│  └─ 然后: GIS-TASK-SPLITTING-STRATEGY.md (Agent设计)
│
├─ 产品经理
│  └─ 阅读: REFACTORING-PLAN-v2.0.md 的"预期收益"章节
│
└─ 新加入团队
   └─ 阅读: REFACTORING-PLAN-v2.0.md (快速上手)
```

---

## 📊 文档对比 (v1.0 vs v2.0精简版)

| 维度 | v1.0初版 | v2.0精简版 | 改进 |
|------|---------|-----------|------|
| **总文件数** | 4个 | 3个核心 + 3个TODO | -25% |
| **总行数** | ~3,500行 | ~2,400行 | -31% |
| **核心概念** | 行业知识库+3种模式 | LLM自主推断 | 更简洁 |
| **代码示例** | 复杂多层逻辑 | 单一清晰流程 | 更易理解 |
| **阅读时间** | 60分钟+ | 30分钟 | -50% |

---

## 🔑 核心变化总结

### ❌ 移除的内容
1. **行业知识库** (GISIndustryKnowledgeBase) - 不再需要预定义因子
2. **三种交互模式** (完全自动/半自动/专家) - 简化为单一流程
3. **数据可用性校验器** (DataAvailabilityChecker) - LLM直接处理
4. **复杂的提示词模板** (5个文件) - 精简为2个文件

### ✅ 新增的内容
1. **DataSourceSemanticAnalyzer** - LLM理解数据源语义
2. **自主因子推断** - 基于数据+常识,无需模板
3. **透明决策解释** - LLM解释为什么选择某些数据

### 🎯 设计理念
**从"配置驱动"转向"智能驱动"**:
- v1.0: 维护行业因子库 → LLM查表 → 校验数据 → 执行
- v2.0: LLM理解数据语义 → 自主推理 → 直接执行

---

## 💡 使用建议

1. **第一次阅读**: 只看 REFACTORING-PLAN-v2.0.md
2. **需要实现时**: 查阅对应的技术细节文档
3. **遇到问题**: 参考迁移指南 (待编写)

---

**最后更新**: 2026-05-09  
**维护者**: GeoAI-UP Architecture Team
