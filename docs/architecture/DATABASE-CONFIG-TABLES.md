# 数据库设计 - 配置与数据源表

## 1. 数据源相关表

### 1.1 data_sources（数据源表）

```sql
CREATE TABLE data_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('shapefile', 'geojson', 'postgis', 'tif')),
    config JSON NOT NULL,
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_data_sources_type ON data_sources(type);
CREATE INDEX idx_data_sources_created_at ON data_sources(created_at DESC);

CREATE TRIGGER update_data_sources_updated_at
AFTER UPDATE ON data_sources
BEGIN
    UPDATE data_sources SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

**字段说明**:

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | TEXT | 数据源ID (UUID) | PRIMARY KEY |
| name | TEXT | 数据源名称 | NOT NULL |
| type | TEXT | 数据类型 | NOT NULL, CHECK |
| config | JSON | 配置信息 | NOT NULL |
| metadata | JSON | 元数据 | OPTIONAL |
| created_at | TIMESTAMP | 创建时间 | NOT NULL |
| updated_at | TIMESTAMP | 更新时间 | NOT NULL |

**config示例** (本地文件):

```json
{
  "path": "/data/local/districts.shp",
  "size": 1048576,
  "encoding": "UTF-8"
}
```

**config示例** (PostGIS):

```json
{
  "connectionId": "pg_conn_1",
  "host": "localhost",
  "port": 5432,
  "database": "gis_db",
  "schema": "public",
  "tableName": "rivers",
  "username": "gis_user"
}
```

---

## 2. LLM配置相关表

### 2.1 llm_configs（LLM配置表）

```sql
CREATE TABLE llm_configs (
    id TEXT PRIMARY KEY,
    model_type TEXT NOT NULL CHECK(model_type IN ('qwen', 'openai', 'anthropic')),
    model_name TEXT NOT NULL,
    config JSON NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_llm_configs_active ON llm_configs(is_active) WHERE is_active = 1;
CREATE INDEX idx_llm_configs_model_type ON llm_configs(model_type);

CREATE TRIGGER ensure_single_active_llm
BEFORE UPDATE OF is_active ON llm_configs
WHEN NEW.is_active = 1
BEGIN
    UPDATE llm_configs SET is_active = 0 WHERE is_active = 1 AND id != NEW.id;
END;

CREATE TRIGGER update_llm_configs_updated_at
AFTER UPDATE ON llm_configs
BEGIN
    UPDATE llm_configs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

**字段说明**:

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | TEXT | 配置ID (UUID) | PRIMARY KEY |
| model_type | TEXT | 模型类型 | NOT NULL, CHECK |
| model_name | TEXT | 模型名称 | NOT NULL |
| config | JSON | 配置详情 | NOT NULL |
| is_active | BOOLEAN | 是否激活 | NOT NULL, DEFAULT 0 |
| created_at | TIMESTAMP | 创建时间 | NOT NULL |
| updated_at | TIMESTAMP | 更新时间 | NOT NULL |

**注意**: 通过触发器确保只有一个活跃配置

---

### 2.2 prompt_templates（提示词模板表）

```sql
CREATE TABLE prompt_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    language TEXT NOT NULL CHECK(language IN ('zh-CN', 'en-US')),
    category TEXT NOT NULL,
    variables JSON,
    is_default BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX idx_prompt_templates_language ON prompt_templates(language);

CREATE TRIGGER update_prompt_templates_updated_at
AFTER UPDATE ON prompt_templates
BEGIN
    UPDATE prompt_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

**字段说明**:

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | TEXT | 模板ID (UUID) | PRIMARY KEY |
| name | TEXT | 模板名称 | NOT NULL |
| content | TEXT | 模板内容 | NOT NULL |
| language | TEXT | 语言 | NOT NULL, CHECK |
| category | TEXT | 分类 | NOT NULL |
| variables | JSON | 变量列表 | OPTIONAL |
| is_default | BOOLEAN | 是否为默认模板 | NOT NULL, DEFAULT 0 |
| created_at | TIMESTAMP | 创建时间 | NOT NULL |
| updated_at | TIMESTAMP | 更新时间 | NOT NULL |

**category可选值**:
- `intent_detection`: 意图识别
- `goal_splitting`: 目标拆分
- `task_decomposition`: 任务分解

---

## 3. 插件相关表

### 3.1 plugins（插件表）

```sql
CREATE TABLE plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK(category IN ('spatial_analysis', 'data_transform', 'visualization', 'report_generation', 'utility')),
    path TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'inactive', 'error')) DEFAULT 'inactive',
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plugins_category ON plugins(category);
CREATE INDEX idx_plugins_status ON plugins(status);
CREATE UNIQUE INDEX idx_plugins_name_version ON plugins(name, version);

CREATE TRIGGER update_plugins_updated_at
AFTER UPDATE ON plugins
BEGIN
    UPDATE plugins SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

**字段说明**:

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | TEXT | 插件ID (UUID) | PRIMARY KEY |
| name | TEXT | 插件名称 | NOT NULL |
| version | TEXT | 版本号 | NOT NULL |
| description | TEXT | 描述 | OPTIONAL |
| category | TEXT | 分类 | NOT NULL, CHECK |
| path | TEXT | 插件文件路径 | NOT NULL |
| status | TEXT | 状态 | NOT NULL, DEFAULT 'inactive' |
| metadata | JSON | 元数据 | OPTIONAL |
| created_at | TIMESTAMP | 创建时间 | NOT NULL |
| updated_at | TIMESTAMP | 更新时间 | NOT NULL |

**metadata示例**:

```json
{
  "inputs": [
    {"name": "data", "type": "NativeData", "required": true}
  ],
  "outputs": [
    {"name": "result", "type": "NativeData"}
  ],
  "supportedDataTypes": ["geojson", "shapefile", "postgis"],
  "author": "GeoAI-UP Team"
}
```

---

## 4. 系统配置表

### 4.1 system_configs（系统配置表）

```sql
CREATE TABLE system_configs (
    key TEXT PRIMARY KEY,
    value JSON NOT NULL,
    description TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_system_configs_updated_at
AFTER UPDATE ON system_configs
BEGIN
    UPDATE system_configs SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
END;
```

**字段说明**:

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| key | TEXT | 配置键 | PRIMARY KEY |
| value | JSON | 配置值 | NOT NULL |
| description | TEXT | 描述 | OPTIONAL |
| updated_at | TIMESTAMP | 更新时间 | NOT NULL |

**配置项示例**:

```sql
-- 工作目录配置
INSERT INTO system_configs (key, value, description) VALUES 
('workspace.base_dir', '"/opt/geoai-up/workspace"', '工作区根目录');

-- 临时文件清理策略
INSERT INTO system_configs (key, value, description) VALUES 
('temp.cleanup.max_age', '3600000', '临时文件最大存活时间（毫秒）');
INSERT INTO system_configs (key, value, description) VALUES 
('temp.cleanup.interval', '300000', '清理间隔（毫秒）');

-- 国际化配置
INSERT INTO system_configs (key, value, description) VALUES 
('i18n.default_language', '"zh-CN"', '默认语言');
```

---

## 5. 文档索引

本系列文档已拆分为：

1. [DATABASE-CORE-TABLES.md](./DATABASE-CORE-TABLES.md) - 核心业务表
2. [DATABASE-CONFIG-TABLES.md](./DATABASE-CONFIG-TABLES.md) - 配置与数据源表（本文档）
3. [DATABASE-MIGRATIONS.md](./DATABASE-MIGRATIONS.md) - 迁移与维护

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
