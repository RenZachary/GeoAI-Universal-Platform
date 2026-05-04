# 数据库设计 - 迁移与维护

## 1. 数据库迁移

### 1.1 迁移策略

使用版本化迁移脚本，确保数据库结构可演进：

```
server/src/storage/database/migrations/
├── 001_initial_schema.sql
├── 002_add_plugin_metadata.sql
├── 003_optimize_indexes.sql
└── ...
```

### 1.2 MigrationManager

```typescript
class MigrationManager {
  private db: SQLiteManager;
  
  /**
   * 运行所有待执行的迁移
   */
  async migrate(): Promise<void>;
  
  /**
   * 回滚最后一次迁移
   */
  async rollback(): Promise<void>;
  
  /**
   * 获取当前版本
   */
  getCurrentVersion(): number;
  
  /**
   * 检查是否需要迁移
   */
  needsMigration(): boolean;
}
```

---

## 2. 查询优化

### 2.1 常用查询模式

#### 获取对话及其消息

```sql
-- 获取最近10个对话
SELECT c.*, COUNT(m.id) as message_count
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY c.id
ORDER BY c.updated_at DESC
LIMIT 10;

-- 获取单个对话的所有消息
SELECT m.*
FROM messages m
WHERE m.conversation_id = ?
ORDER BY m.timestamp ASC;
```

#### 获取任务及其结果

```sql
-- 获取对话的所有任务
SELECT t.*, 
       json_array_length(t.plan->'$.steps') as step_count
FROM tasks t
WHERE t.conversation_id = ?
ORDER BY t.created_at DESC;

-- 获取任务的执行结果
SELECT tr.*, t.status as task_status
FROM task_results tr
JOIN tasks t ON tr.task_id = t.id
WHERE tr.task_id = ?
ORDER BY tr.created_at ASC;
```

#### 获取数据源列表

```sql
-- 按类型筛选数据源
SELECT ds.*
FROM data_sources ds
WHERE ds.type = ?
ORDER BY ds.created_at DESC;

-- 搜索数据源
SELECT ds.*
FROM data_sources ds
WHERE ds.name LIKE ? OR ds.metadata->>'$.name' LIKE ?
ORDER BY ds.created_at DESC;
```

### 2.2 性能优化建议

1. **使用WAL模式**: 提高并发读写性能
2. **定期VACUUM**: 回收空间，优化性能
3. **合理使用索引**: 避免过度索引
4. **批量操作**: 使用事务批量插入/更新
5. **分页查询**: 避免一次性加载大量数据

---

## 3. 数据安全

### 3.1 敏感数据加密

PostGIS密码等敏感信息应加密存储：

```typescript
class CryptoUtils {
  static encrypt(text: string): string;
  static decrypt(encryptedText: string): string;
}

// 存储时加密
const encryptedPassword = CryptoUtils.encrypt(postgisConfig.password);
config.password = encryptedPassword;

// 读取时解密
const password = CryptoUtils.decrypt(config.password);
```

### 3.2 备份策略

```typescript
class DatabaseBackup {
  /**
   * 创建数据库备份
   */
  async createBackup(): Promise<string>;
  
  /**
   * 从备份恢复
   */
  async restoreFromBackup(backupPath: string): Promise<void>;
  
  /**
   * 清理旧备份
   */
  cleanupOldBackups(keepCount: number): void;
}
```

**备份策略**:
- 每天自动备份
- 保留7天备份
- 备份文件命名: `geoai-up_YYYYMMDD_HHMMSS.db`

---

## 4. 监控和维护

### 4.1 数据库健康检查

```typescript
class DatabaseHealthCheck {
  /**
   * 检查数据库状态
   */
  async checkHealth(): Promise<HealthStatus>;
  
  /**
   * 获取数据库统计信息
   */
  async getStats(): Promise<DatabaseStats>;
  
  /**
   * 检查索引使用情况
   */
  async analyzeIndexes(): Promise<IndexAnalysis[]>;
}

interface DatabaseStats {
  tableSizes: Record<string, number>;
  totalRows: Record<string, number>;
  indexCount: number;
  databaseSize: number;
}
```

### 4.2 定期维护任务

1. **VACUUM**: 每周执行，回收空间
2. **ANALYZE**: 每月执行，更新统计信息
3. **备份**: 每天执行，保留7天
4. **清理过期数据**: 根据配置清理旧对话、任务等

---

## 5. 数据字典

### 5.1 枚举值定义

**TaskStatus**:
- `pending`: 等待执行
- `running`: 执行中
- `completed`: 已完成
- `failed`: 执行失败
- `cancelled`: 已取消

**DataSourceType**:
- `shapefile`: Shapefile格式
- `geojson`: GeoJSON格式
- `postgis`: PostGIS数据库
- `tif`: TIFF影像

**PluginCategory**:
- `spatial_analysis`: 空间分析
- `data_transform`: 数据转换
- `visualization`: 可视化
- `report_generation`: 报告生成
- `utility`: 工具类

**PluginStatus**:
- `active`: 激活
- `inactive`: 未激活
- `error`: 错误状态

**MessageRole**:
- `user`: 用户消息
- `assistant`: AI助手消息
- `system`: 系统消息

### 5.2 JSON字段验证

所有JSON字段应有明确的schema定义，使用zod进行验证：

```typescript
import { z } from 'zod';

export const TaskPlanSchema = z.object({
  goalId: z.string(),
  steps: z.array(z.object({
    id: z.string(),
    type: z.enum(['load_data', 'analyze', 'transform', 'visualize', 'report']),
    pluginName: z.string(),
    parameters: z.record(z.any()),
    dependencies: z.array(z.string()),
  })),
  estimatedTime: z.number(),
});

export const NativeDataSchema = z.object({
  id: z.string(),
  type: z.enum(['shapefile', 'geojson', 'postgis', 'tif']),
  metadata: z.record(z.any()),
  reference: z.object({
    type: z.enum(['file', 'database']),
    path: z.string().optional(),
    connectionId: z.string().optional(),
    tableName: z.string().optional(),
    isTemporary: z.boolean().optional(),
  }),
  createdAt: z.string().datetime(),
});
```

---

## 6. 文档索引

本系列文档已拆分为：

1. [DATABASE-CORE-TABLES.md](./DATABASE-CORE-TABLES.md) - 核心业务表
2. [DATABASE-CONFIG-TABLES.md](./DATABASE-CONFIG-TABLES.md) - 配置与数据源表
3. [DATABASE-MIGRATIONS.md](./DATABASE-MIGRATIONS.md) - 迁移与维护（本文档）

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
