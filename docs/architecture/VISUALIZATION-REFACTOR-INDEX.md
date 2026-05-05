# 可视化渲染器架构重构规划

## 📋 文档概述

本文档系列规划GeoAI-UP系统的可视化渲染器架构重构，目标是建立统一、可扩展、LLM友好的可视化插件体系。

### 核心目标

1. **统一渲染器接口**：所有渲染器遵循相同的输入输出契约
2. **几何类型无关**：点、线、面要素使用相同的渲染器，内部自动适配
3. **LLM友好**：通过结构化元数据让LLM能够准确选择渲染器
4. **职责清晰**：Executor编排流程，StyleFactory生成样式，Accessor提供数据
5. **彻底解耦**：颜色解析、分类算法、样式生成分离到独立模块

---

## 📚 文档结构

### Phase 1: 问题分析与现状评估
- [01-Current-Problems.md](./01-Current-Problems.md) - 当前架构的问题诊断
- [02-Requirements-Analysis.md](./02-Requirements-Analysis.md) - 需求分析与设计原则

### Phase 2: 核心架构设计
- [03-Renderer-Architecture.md](./03-Renderer-Architecture.md) - 渲染器整体架构
- [04-Plugin-Capability-System.md](./04-Plugin-Capability-System.md) - Plugin能力注册系统
- [05-TaskPlanner-Decision-Strategy.md](./05-TaskPlanner-Decision-Strategy.md) - TaskPlanner决策策略

### Phase 3: 三种渲染器详细设计
- [06-Uniform-Color-Renderer.md](./06-Uniform-Color-Renderer.md) - 统一颜色渲染器
- [07-Categorical-Renderer.md](./07-Categorical-Renderer.md) - 分类渲染器
- [08-Choropleth-Renderer.md](./08-Choropleth-Renderer.md) - 分级统计渲染器

### Phase 4: 支撑系统设计
- [09-StyleFactory-Refactor.md](./09-StyleFactory-Refactor.md) - StyleFactory重构
- [10-Color-Resolution-Engine.md](./10-Color-Resolution-Engine.md) - 颜色解析引擎
- [11-Geometry-Adapter-Layer.md](./11-Geometry-Adapter-Layer.md) - 几何适配器层

### Phase 5: 实施计划
- [12-Implementation-Roadmap.md](./12-Implementation-Roadmap.md) - 分步实施路线图
- [13-Migration-Guide.md](./13-Migration-Guide.md) - 迁移指南
- [14-Testing-Strategy.md](./14-Testing-Strategy.md) - 测试策略

---

## 🎯 设计范围

### 包含的渲染器

1. **Uniform Color Renderer（统一颜色渲染器）**
   - 用途：用单一颜色显示要素（如"红色显示五虎林河"）
   - 适用：点、线、面所有几何类型
   - 特点：简单、快速、无分类

2. **Categorical Renderer（分类渲染器）**
   - 用途：按类别字段着色（如"按土地利用类型显示"）
   - 适用：点、线、面所有几何类型
   - 特点：离散颜色映射、类别标签

3. **Choropleth Renderer（分级统计渲染器）**
   - 用途：按数值字段分级着色（如"按人口密度显示"）
   - 适用：点、线、面所有几何类型
   - 特点：连续颜色渐变、统计分类

### 关键设计决策

✅ **支持所有几何类型**：点、线、面都可用同一渲染器  
✅ **LLM参与数据源选择**：复杂场景由LLM判断  
✅ **Chain of Thought**：单次调用但分步骤推理  
✅ **StyleFactory统一输出**：后端生成标准Style JSON  
✅ **彻底重构**：不保留向后兼容，一次性完成  

❌ **不硬编码颜色映射**：prompt中不写具体规则  
❌ **不在Executor中解析颜色**：职责交给StyleFactory  
❌ **不验证几何类型**：由Geometry Adapter自动处理  

---

## 🔍 下一步

请审阅本索引文档，确认：
1. 文档结构是否完整？
2. 设计范围是否符合预期？
3. 是否有遗漏的关键设计点？

确认后，我将开始编写Phase 1的详细分析文档。
