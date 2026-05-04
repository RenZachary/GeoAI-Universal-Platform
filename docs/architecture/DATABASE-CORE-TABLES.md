# 数据库设计 - 核心业务表

## 1. 数据库概述

### 1.1 数据库选型

- **类型**: SQLite (better-sqlite3)
- **版本**: SQLite 3.x
- **特性**: WAL模式、事务支持、外键约束、JSON字段

### 1.2 数据库文件位置

```
GeoAI-UP/
└── server/
    └── database/
        └── geoai-up.db
```

---

## 2. ER图

```
┌─────────────────┐       ┌──────────────────────┐
│   conversations │1     *│      messages         │
│                 │───────│                       │
│ - id (PK)       │       │ - id (PK)             │
│ - title         │       │ - conversation_id(FK) │
│ - created_at    │       │ - role                │
│ - updated_at    │       │ - content             │
└─────────────────┘       │ - timestamp           │
                          └──────────────────────┘
          │
          │1
          │
         *│
┌─────────────────┐       ┌──────────────────────┐
│      tasks      │1     *│    task_results       │
│                 │───────│                       │
│ - id (PK)       │       │ - id (PK)             │
│ - conversation  │       │ - task_id (FK)        │
│   _id (FK)      │       │ - step_id             │
│ - goal_id       │       │ - success             │
│ - status        │       │ - result_data         │
│ - plan (JSON)   │       │ - error_message       │
│ - created_at    │       │ - execution_time      │
│ - started_at    │       │ - created_at          │
│ - completed_at  │       └──────────────────────┘
└─────────────────┘
```

---

## 3. 对话相关表

### 3.1 conversations（对话表）

```sql
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

CREATE TRIGGER update_conversations_updated_at
AFTER UPDATE ON conversations
BEGIN
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

**字段说明**:

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | TEXT | 对话ID (UUID) | PRIMARY KEY |
| title | TEXT | 对话标题 | NOT NULL |
| created_at | TIMESTAMP | 创建时间 | NOT NULL |
| updated_at | TIMESTAMP | 更新时间 | NOT NULL |

---

### 3.2 messages（消息表）

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSON,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_messages_conv_timestamp ON messages(conversation_id, timestamp DESC);
```

**字段说明**:

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | TEXT | 消息ID (UUID) | PRIMARY KEY |
| conversation_id | TEXT | 所属对话ID | FOREIGN KEY, NOT NULL |
| role | TEXT | 角色: user/assistant/system | NOT NULL, CHECK |
| content | TEXT | 消息内容 | NOT NULL |
| timestamp | TIMESTAMP | 消息时间 | NOT NULL |
| metadata | JSON | 元数据（token使用量等） | OPTIONAL |

**metadata示例**:

```json
{
  "taskId": "task_123",
  "tokenUsage": {
    "promptTokens": 100,
    "completionTokens": 200,
    "totalTokens": 300
  },
  "model": "qwen-plus"
}
```

---

## 4. 任务相关表

### 4.1 tasks（任务表）

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    goal_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    plan JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_tasks_conversation_id ON tasks(conversation_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);

CREATE TRIGGER set_task_started_at
AFTER UPDATE OF status ON tasks
WHEN NEW.status = 'running' AND OLD.status != 'running'
BEGIN
    UPDATE tasks SET started_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER set_task_completed_at
AFTER UPDATE OF status ON tasks
WHEN NEW.status IN ('completed', 'failed', 'cancelled') 
   AND OLD.status NOT IN ('completed', 'failed', 'cancelled')
BEGIN
    UPDATE tasks SET completed_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

**字段说明**:

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | TEXT | 任务ID (UUID) | PRIMARY KEY |
| conversation_id | TEXT | 所属对话ID | FOREIGN KEY, NOT NULL |
| goal_id | TEXT | 输出目标ID | NOT NULL |
| status | TEXT | 任务状态 | NOT NULL, CHECK |
| plan | JSON | 执行计划 | NOT NULL |
| created_at | TIMESTAMP | 创建时间 | NOT NULL |
| started_at | TIMESTAMP | 开始时间 | OPTIONAL |
| completed_at | TIMESTAMP | 完成时间 | OPTIONAL |
| error_message | TEXT | 错误信息 | OPTIONAL |

---

### 4.2 task_results（任务结果表）

```sql
CREATE TABLE task_results (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    success BOOLEAN NOT NULL DEFAULT 0,
    result_data JSON,
    error_message TEXT,
    execution_time INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_task_results_task_id ON task_results(task_id);
CREATE INDEX idx_task_results_step_id ON task_results(step_id);
CREATE UNIQUE INDEX idx_task_results_task_step ON task_results(task_id, step_id);
```

**字段说明**:

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | TEXT | 结果ID (UUID) | PRIMARY KEY |
| task_id | TEXT | 所属任务ID | FOREIGN KEY, NOT NULL |
| step_id | TEXT | 步骤ID | NOT NULL |
| success | BOOLEAN | 是否成功 | NOT NULL |
| result_data | JSON | 结果数据 | OPTIONAL |
| error_message | TEXT | 错误信息 | OPTIONAL |
| execution_time | INTEGER | 执行时间（毫秒） | NOT NULL |
| created_at | TIMESTAMP | 创建时间 | NOT NULL |

---

## 5. 文档索引

本系列文档已拆分为：

1. [DATABASE-CORE-TABLES.md](./DATABASE-CORE-TABLES.md) - 核心业务表（本文档）
2. [DATABASE-CONFIG-TABLES.md](./DATABASE-CONFIG-TABLES.md) - 配置与数据源表
3. [DATABASE-MIGRATIONS.md](./DATABASE-MIGRATIONS.md) - 迁移与维护

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
