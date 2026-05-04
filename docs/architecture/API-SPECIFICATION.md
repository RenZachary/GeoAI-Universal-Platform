# GeoAI-UP API接口规范概览

本文档提供GeoAI-UP平台API接口的概览。详细的API规范请参考以下独立文档：

## 文档索引

### API模块文档

1. [对话与数据源接口](./API-CHAT-DATA.md) (283�?
   - Chat API: 发送消息、对话管�?
   - Data Source API: 上传、管理、预览数据源
   
2. [插件与LLM配置接口](./API-PLUGIN-LLM.md) (182�?
   - Plugin API: 上传、启动、停用插�?
   - LLM Config API: 模型配置、提示词模板
   
3. [可视化接口](./API-VISUALIZATION.md) (153�?
   - MVT/WMS服务: 发布、获取瓦�?图片
   - Heatmap API: 热力图数�?
   
4. [错误码与通用规范](./API-ERROR-CODES.md) (150�?
   - 错误码列�?
   - API版本管理
   - 速率限制
   - CORS配置

---

## API设计原则

- **RESTful**: 遵循REST架构风格
- **统一响应格式**: success/data/error结构
- **国际化支�?*: Accept-Language头或lang参数
- **流式响应**: SSE用于对话接口
- **错误友好**: 清晰的错误码和解决建�?

---

**文档版本**: 1.0  
**最后更�?*: 2026-05-03

## 1. API概述

### 1.1 基础信息

