# v2.0 文档层次结构

> **本文档提供阅读决策树和版本对比**
>
> 快速导航 → [00-README.md](./00-README.md)  
> 技术实现 → [02-REFACTORING-PLAN-v2.0.md](./02-REFACTORING-PLAN-v2.0.md)

---

## 🎯 阅读决策树

```
你是?
├─ 架构师/技术负责人
│  └─ 阅读: 02-REFACTORING-PLAN-v2.0.md (整体把握)
│
├─ 后端开发者
│  ├─ 首先: 02-REFACTORING-PLAN-v2.0.md (了解目标)
│  └─ 然后: 03-SPATIAL-OPERATOR-ARCHITECTURE.md (实现细节)
│
├─ AI/LLM开发者
│  ├─ 首先: 02-REFACTORING-PLAN-v2.0.md (了解目标)
│  └─ 然后: 04-GIS-TASK-SPLITTING-STRATEGY.md (Agent设计)
│
├─ 产品经理
│  └─ 阅读: 02-REFACTORING-PLAN-v2.0.md 的"预期收益"章节
│
└─ 新加入团队
   └─ 阅读: 02-REFACTORING-PLAN-v2.0.md (快速上手)
```

---

## 📊 v1.0 vs v2.0 关键对比

| 维度 | v1.0初版 | v2.0最终版 | 改进 |
|------|---------|-----------|------|
| **总文件数** | 4个 | 7个 (含导航) | +75% |
| **核心概念** | 行业知识库+3种模式 | LLM自主推断 | 零配置 |
| **迁移支持** | ❌ 无 | ✅ 8周计划 | 可实施 |

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

### 🎯 设计理念转变

**从"配置驱动"到"智能驱动"**

| 维度 | v1.0 | v2.0 |
|------|------|------|
| **因子来源** | 预定义行业库 | LLM自主推断 |
| **数据校验** | 手动检查 | 自动语义分析 |
| **用户干预** | 需指定因子 | 零配置 |
| **灵活性** | 受限于模板 | 适应任意场景 |

---

## 💡 快速开始

1. **首次接触**: 阅读 [02-REFACTORING-PLAN-v2.0.md](./02-REFACTORING-PLAN-v2.0.md)
2. **深入实现**: 根据角色选择 03-05 技术文档
3. **迁移升级**: 参考 [06-MIGRATION-GUIDE.md](./06-MIGRATION-GUIDE.md)

---

**最后更新**: 2026-05-09  
**维护者**: GeoAI-UP Architecture Team
