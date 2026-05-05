# Phase 5: 实施路线图

## 📋 概述

本文档提供可视化渲染器重构的分步实施计划，确保平滑过渡且最小化风险。

---

## 🗺️ 实施阶段

### Stage 1: 基础设施准备（Week 1）

**目标：** 建立新的基础组件，不影响现有系统

**任务：**
1. ✅ 创建ColorResolutionEngine类
2. ✅ 创建GeometryAdapter工具类  
3. ✅ 扩展Accessor添加getUniqueValues方法
4. ✅ 创建BaseRendererExecutor基类

**交付物：**
- `server/src/utils/ColorResolutionEngine.ts`
- `server/src/utils/GeometryAdapter.ts`
- `server/src/plugin-orchestration/executor/BaseRendererExecutor.ts`

**验证：**
- 单元测试通过
- 不破坏现有功能

---

### Stage 2: 新Plugin开发（Week 2）

**目标：** 实现三种新渲染器

**任务：**
1. ✅ 创建UniformColorRendererPlugin + Executor
2. ✅ 创建CategoricalRendererPlugin + Executor
3. ✅ 创建ChoroplethRendererPlugin + Executor
4. ✅ 重构StyleFactory添加新方法

**交付物：**
- 3个Plugin定义文件
- 3个Executor实现文件
- 更新的StyleFactory

**验证：**
- 每个renderer的单元测试
- 集成测试：完整workflow

---

### Stage 3: Plugin注册与Capability系统（Week 3）

**目标：** 注册新plugin并实现capability-based filtering

**任务：**
1. ✅ 在Plugin Registry中注册3个新plugin
2. ✅ 实现PluginCapabilityRegistry类
3. ✅ 更新TaskPlanner实现三阶段决策
4. ✅ 添加终端节点约束验证

**交付物：**
- `server/src/plugin-orchestration/registry/PluginCapabilityRegistry.ts`
- 更新的TaskPlannerAgent
- 更新的Plugin索引文件

**验证：**
- Capability filtering正常工作
- Terminal node约束生效

---

### Stage 4: Prompt更新与LLM训练（Week 4）

**目标：** 教育LLM使用新renderers

**任务：**
1. ✅ 更新goal-splitting.md添加新scenarios
2. ✅ 更新task-planning.md添加execution category说明
3. ✅ 添加三种renderer的使用示例
4. ✅ 测试LLM能否正确选择renderer

**交付物：**
- 更新的prompt templates
- LLM测试报告

**验证：**
- "红色显示五虎林河" → uniform_color_renderer ✓
- "按土地利用类型显示" → categorical_renderer ✓
- "用面积等级专题图显示" → choropleth_renderer ✓

---

### Stage 5: 迁移与废弃（Week 5）

**目标：** 废弃旧choropleth_map plugin，迁移到新架构

**任务：**
1. ✅ 标记旧choropleth_map为deprecated
2. ✅ 添加migration guide文档
3. ✅ 更新所有引用旧plugin的代码
4. ✅ 前端适配新的style URL格式

**交付物：**
- Migration Guide文档
- 更新的前端代码
- 废弃通知

**验证：**
- 旧query仍然工作（兼容性）
- 新query使用新renderers

---

### Stage 6: 全面测试与优化（Week 6）

**目标：** 确保系统稳定性和性能

**任务：**
1. ✅ 端到端测试所有场景
2. ✅ 性能基准测试
3. ✅ 错误处理完善
4. ✅ 文档完善

**交付物：**
- 测试报告
- 性能报告
- 完整文档

**验证：**
- 所有test cases通过
- 性能满足要求（<2s响应）
- 无内存泄漏

---

## 📊 时间线

```
Week 1: [████████] Stage 1 - Infrastructure
Week 2: [████████] Stage 2 - New Plugins
Week 3: [████████] Stage 3 - Registration & Capability
Week 4: [████████] Stage 4 - Prompts & LLM
Week 5: [████████] Stage 5 - Migration
Week 6: [████████] Stage 6 - Testing & Optimization
```

---

## ⚠️ 风险评估

### 高风险
1. **LLM选择不准确**
   - 缓解：充分的prompt工程和测试
   - 回滚：保留旧plugin作为fallback

2. **性能下降**
   - 缓解：性能基准测试
   - 回滚：优化或简化逻辑

### 中风险
3. **前端兼容性问题**
   - 缓解：渐进式部署
   - 回滚：保持API兼容

4. **数据迁移问题**
   - 缓解：详细的migration guide
   - 回滚：双版本并行运行

### 低风险
5. **文档不完整**
   - 缓解：同步编写文档
   - 回滚：补充文档

---

## 🔄 回滚策略

如果实施过程中遇到重大问题：

1. **立即停止新代码部署**
2. **切换到旧branch**
3. **评估问题严重性**
4. **制定修复计划或放弃重构**

**关键原则：**
- 每个stage完成后都要有可工作的系统
- 保持向后兼容直到Stage 5完成
- 充分的自动化测试覆盖

---

## ✅ 成功标准

重构完成后，以下指标必须达成：

### 功能指标
- ✅ 三种新renderers全部工作
- ✅ 支持点、线、面所有几何类型
- ✅ "红色显示五虎林河"正确渲染
- ✅ 终端节点约束生效

### 性能指标
- ✅ 平均响应时间 < 2秒
- ✅ 内存使用增加 < 10%
- ✅ 并发请求支持 > 10 QPS

### 质量指标
- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试全部通过
- ✅ 无critical bugs
- ✅ 文档完整度100%

### 用户体验指标
- ✅ LLM选择准确率 > 90%
- ✅ 用户query成功率 > 95%
- ✅ 错误提示清晰易懂

---

## 📝 下一步

1. **审查本路线图**
2. **确认时间安排合理**
3. **分配开发资源**
4. **开始Stage 1实施**

---

**文档版本：** v1.0  
**最后更新：** 2026-05-05  
**状态：** Ready for Review
