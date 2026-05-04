# GeoAI-UP 数据库设计概览

本文档提供GeoAI-UP平台数据库设计的概览。详细的数据库规范请参考以下独立文档：

## 文档索引

### 数据库模块文档

1. [核心业务表](./DATABASE-CORE-TABLES.md) (234行)
   - conversations, messages
   - tasks, task_results
   
2. [配置与数据源表](./DATABASE-CONFIG-TABLES.md) (281行)
   - data_sources
   - llm_configs, prompt_templates
   - plugins, system_configs
   
3. [迁移与维护](./DATABASE-MIGRATIONS.md) (282行)
   - 迁移策略
   - 查询优化
   - 数据安全与备份
   - 监控与维护

---

## 数据库设计原则

- **规范化**: 第三范式，减少数据冗余
- **性能**: 合理索引，优化查询
- **可扩展**: 预留扩展字段
- **完整性**: 外键约束，数据验证

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
