# GeoAI-UP 核心模块设计概览

本文档提供GeoAI-UP平台核心模块的设计概览。详细的各层设计请参考以下独立文档：

## 文档索引

### 分层设计文档

1. [接口层详细设计](./MODULE-INTERFACE-LAYER.md) (320�?
   - 控制器、中间件、路由设�?
   
2. [LLM交互层详细设计](./MODULE-LLM-LAYER.md) (433�?
   - 需求解析、任务分解、LLM适配�?
   
3. [插件调度层详细设计](./MODULE-PLUGIN-LAYER.md) (423�?
   - 插件加载、执行、生命周期管�?
   
4. [数据接入层详细设计](./MODULE-DATA-ACCESS-LAYER.md) (684�?
   - 数据访问器、工厂模式、空间分析实�?
   
5. [空间分析与可视化层详细设计](./MODULE-ANALYSIS-VISUALIZATION-LAYER.md) (465�?
   - 分析器、MVT/WMS服务、服务注�?
   
6. [存储层详细设计](./MODULE-STORAGE-LAYER.md) (726�?
   - 工作区管理、SQLite、临时文件清�?

### 核心类型与流�?

7. [核心数据类型与交互流程](./CORE-TYPES-AND-FLOWS.md) (382�?
   - NativeData、ServiceMetadata等核心类�?
   - 模块间交互流程图
   - 错误处理机制
   - 日志系统

---

## 架构原则

- **工厂模式**: 每一层通过工厂类实�?
- **NativeData**: 保持原始数据格式
- **多态替代条件判�?*: 消除if-else分支
- **插件�?*: 所有功能封装为插件

---

**文档版本**: 1.0  
**最后更�?*: 2026-05-03

## 2. 接口�?(Interface Layer)

