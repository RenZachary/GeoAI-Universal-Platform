# 存储层详细设计

## 1. 模块职责

- 管理平台统一工作目录
- SQLite数据库操作
- 临时文件清理
- 文件组织和管理

---

## 2. 工作区管理

### 2.1 WorkspaceManager（工作区管理器）

```typescript
class WorkspaceManager {
  private baseDir: string;
  
  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.ensureDirectories();
  }
  
  /**
   * 确保目录结构存在
   */
  private ensureDirectories(): void {
    const dirs = [
      'data/local',           // 本地上传数据
      'data/postgis',         // PostGIS配置
      'llm/config',           // LLM配置
      'llm/prompts/en-US',    // 英文提示词模板（默认）
      'llm/prompts/zh-CN',    // 中文提示词模板（可选）
      'plugins/builtin',      // 内置插件
      'plugins/custom',       // 自定义插件
      'database',             // SQLite数据库
      'database/backups',     // 数据库备份
      'temp',                 // 临时文件
      'results/geojson',      // 分析结果-GeoJSON
      'results/shapefile',    // 分析结果-Shapefile
      'results/mvt',          // MVT服务元信息
      'results/wms',          // WMS服务元信息
      'results/reports',      // 报告文件
    ];
    
    dirs.forEach(dir => {
      const fullPath = path.join(this.baseDir, dir);
      fs.ensureDirSync(fullPath);
    });
    
    // 初始化默认提示词模板（如果不存在）
    this.initializeDefaultPrompts();
  }
  
  /**
   * 初始化默认提示词模板
   */
  private initializeDefaultPrompts(): void {
    const promptsDir = path.join(this.baseDir, 'llm/prompts/en-US');
    const defaultTemplates = [
      'goal-splitting.md',
      'task-planning.md',
      'response-summary.md',
    ];
    
    for (const template of defaultTemplates) {
      const templatePath = path.join(promptsDir, template);
      if (!fs.existsSync(templatePath)) {
        this.createDefaultTemplate(templatePath, template);
      }
    }
  }
  
  /**
   * 创建默认模板文件
   */
  private createDefaultTemplate(filePath: string, templateName: string): void {
    const templates: Record<string, string> = {
      'goal-splitting.md': `Identify and split the user's request into independent goals.\n\nUser input: {{userInput}}\n\nReturn a JSON array of goals:\n[\n  {\n    "id": "goal_1",\n    "description": "string",\n    "type": "visualization" | "analysis" | "report" | "query"\n  }\n]\n\nRules:\n- Each goal should be independently achievable\n- Don't plan execution steps yet, just identify goals\n- If only one goal, return array with single element\n`,
      'task-planning.md': `Create an execution plan for the given goal using available plugins and data sources.\n\nGoal: {{goalDescription}}\nGoal Type: {{goalType}}\n\nAvailable Data Sources:\n{{dataSourcesMetadata}}\n\nAvailable Plugins:\n{{availablePlugins}}\n\nContext from Previous Steps (if any):\n{{previousResults}}\n\nCreate a step-by-step execution plan. For each step specify:\n- pluginName: Which plugin to use\n- parameters: What parameters to pass\n- dependencies: Which previous steps this depends on\n\nReturn JSON with goalId and steps array.\n\nImportant:\n- Choose plugins based on their capabilities and the goal type\n- Consider data source metadata (CRS, fields, geometry type) when selecting plugins\n- Ensure proper dependency ordering\n- Parameters must match plugin's expected input schema\n`,
      'response-summary.md': `Generate a friendly, concise summary of the analysis results for the user.\n\nOriginal User Request: {{userInput}}\n\nCompleted Tasks:\n{{executionResults}}\n\nGenerated Outputs:\n- Visualizations: {{visualizations}}\n- Analyses: {{analyses}}\n- Reports: {{reports}}\n\nCreate a natural language summary that:\n1. Confirms what was done\n2. Highlights key findings\n3. Mentions available outputs (maps, charts, reports)\n4. Is conversational and helpful\n\nKeep it concise (2-4 sentences).\n`,
    };
    
    const content = templates[templateName] || `# ${templateName}\n\nAdd your prompt template here.\n\nVariables: {{variable1}}, {{variable2}}\n`;
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  
  /**
   * 获取目录路径
   */
  getDirectory(type: DirectoryType): string {
    const dirMap: Record<DirectoryType, string> = {
      'local_data': path.join(this.baseDir, 'data/local'),
      'llm_config': path.join(this.baseDir, 'llm/config'),
      'llm_prompts': path.join(this.baseDir, 'llm/prompts'),
      'plugins_builtin': path.join(this.baseDir, 'plugins/builtin'),
      'plugins_custom': path.join(this.baseDir, 'plugins/custom'),
      'database': path.join(this.baseDir, 'database'),
      'temp': path.join(this.baseDir, 'temp'),
      'results_geojson': path.join(this.baseDir, 'results/geojson'),
      'results_shapefile': path.join(this.baseDir, 'results/shapefile'),
      'results_mvt': path.join(this.baseDir, 'results/mvt'),
      'results_wms': path.join(this.baseDir, 'results/wms'),
      'results_reports': path.join(this.baseDir, 'results/reports'),
    };
    
    return dirMap[type];
  }
  
  /**
   * 生成唯一文件名
   */
  generateFilename(prefix: string, extension: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${prefix}${timestamp}_${random}${extension}`;
  }
  
  /**
   * 获取存储空间使用情况
   */
  getStorageUsage(): StorageUsageInfo {
    const usage: StorageUsageInfo = {
      totalSize: 0,
      directories: {},
    };
    
    const dirs = [
      'data/local',
      'temp',
      'results/geojson',
      'results/shapefile',
      'results/reports',
    ];
    
    for (const dir of dirs) {
      const fullPath = path.join(this.baseDir, dir);
      const size = this.calculateDirectorySize(fullPath);
      usage.directories[dir] = size;
      usage.totalSize += size;
    }
    
    return usage;
  }
  
  /**
   * 检查存储空间警告
   */
  checkStorageWarning(thresholdGB: number = 10): StorageWarning | null {
    const usage = this.getStorageUsage();
    const thresholdBytes = thresholdGB * 1024 * 1024 * 1024;
    
    if (usage.totalSize > thresholdBytes) {
      return {
        level: 'warning',
        message: `存储空间使用超过${thresholdGB}GB，建议清理临时文件和旧结果`,
        currentSizeGB: usage.totalSize / (1024 * 1024 * 1024),
        thresholdGB,
        recommendations: [
          '清理临时目录',
          '删除过期的分析结果',
          '清理旧的对话记录',
        ],
      };
    }
    
    return null;
  }
  
  /**
   * 计算目录大小
   */
  private calculateDirectorySize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }
    
    let totalSize = 0;
    const files = fs.readdirSync(dirPath, { recursive: true });
    
    for (const file of files) {
      const filePath = path.join(dirPath, file.toString());
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
      } catch (error) {
        // 忽略无法访问的文件
      }
    }
    
    return totalSize;
  }
}

interface StorageUsageInfo {
  totalSize: number;  // bytes
  directories: Record<string, number>;  // dir -> size in bytes
}

interface StorageWarning {
  level: 'warning' | 'critical';
  message: string;
  currentSizeGB: number;
  thresholdGB: number;
  recommendations: string[];
}

type DirectoryType = 
  | 'local_data'
  | 'llm_config'
  | 'llm_prompts'
  | 'plugins_builtin'
  | 'plugins_custom'
  | 'database'
  | 'temp'
  | 'results_geojson'
  | 'results_shapefile'
  | 'results_mvt'
  | 'results_wms'
  | 'results_reports';
```

---

## 3. 数据库管理

### 3.1 SQLiteManager（SQLite管理器）

```typescript
class SQLiteManager {
  private db: Database;
  private dbPath: string;
  
  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = betterSqlite3(dbPath);
    this.initializeDatabase();
  }
  
  /**
   * 初始化数据库
   */
  private initializeDatabase(): void {
    // 启用WAL模式
    this.db.pragma('journal_mode = WAL');
    
    // 启用外键
    this.db.pragma('foreign_keys = ON');
    
    // 运行迁移
    this.runMigrations();
  }
  
  /**
   * 运行迁移
   */
  private runMigrations(): void {
    const migrationFiles = this.getMigrationFiles();
    
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(file, 'utf-8');
      this.db.exec(sql);
    }
  }
  
  /**
   * 执行查询
   */
  query(sql: string, params?: any[]): any[] {
    return this.db.prepare(sql).all(...(params || []));
  }
  
  /**
   * 执行插入
   */
  insert(sql: string, params: any[]): number {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return result.lastInsertRowid as number;
  }
  
  /**
   * 执行更新
   */
  update(sql: string, params: any[]): void {
    this.db.prepare(sql).run(...params);
  }
  
  /**
   * 执行删除
   */
  delete(sql: string, params: any[]): void {
    this.db.prepare(sql).run(...params);
  }
  
  /**
   * 事务执行
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
  
  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close();
  }
  
  /**
   * 备份数据库
   */
  async backup(backupPath?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultBackupPath = path.join(
      path.dirname(this.dbPath),
      `backups`,
      `geoai-up_${timestamp}.db`
    );
    
    const targetPath = backupPath || defaultBackupPath;
    
    // 确保备份目录存在
    fs.ensureDirSync(path.dirname(targetPath));
    
    // 使用SQLite的backup API
    const sourceDb = betterSqlite3(this.dbPath, { readonly: true });
    const backupDb = betterSqlite3(targetPath);
    
    try {
      sourceDb.backup(backupDb);
      console.log(`Database backed up to: ${targetPath}`);
      return targetPath;
    } finally {
      sourceDb.close();
      backupDb.close();
    }
  }
  
  /**
   * 获取数据库大小
   */
  getDatabaseSize(): number {
    const stats = fs.statSync(this.dbPath);
    return stats.size;  // bytes
  }
  
  private getMigrationFiles(): string[] {
    const migrationDir = path.join(__dirname, 'migrations');
    return fs.readdirSync(migrationDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
      .map(f => path.join(migrationDir, f));
  }
}
```

### 3.2 数据仓库 (Repositories)

#### ConfigRepository

```typescript
class ConfigRepository {
  private db: SQLiteManager;
  
  constructor(db: SQLiteManager) {
    this.db = db;
  }
  
  getLLMConfig(): LLMConfig | null {
    const rows = this.db.query(
      'SELECT * FROM llm_configs WHERE is_active = 1 LIMIT 1'
    );
    
    if (rows.length === 0) return null;
    
    return {
      id: rows[0].id,
      modelType: rows[0].model_type,
      modelName: rows[0].model_name,
      config: JSON.parse(rows[0].config),
      isActive: rows[0].is_active === 1,
    };
  }
  
  saveLLMConfig(config: LLMConfig): void {
    this.db.transaction(() => {
      // 停用所有配置
      this.db.update('UPDATE llm_configs SET is_active = 0', []);
      
      // 插入新配置
      this.db.insert(
        'INSERT INTO llm_configs (id, model_type, model_name, config, is_active) VALUES (?, ?, ?, ?, ?)',
        [
          config.id,
          config.modelType,
          config.modelName,
          JSON.stringify(config.config),
          config.isActive ? 1 : 0,
        ]
      );
    })();
  }
  
  getSystemConfig(key: string): any {
    const rows = this.db.query(
      'SELECT value FROM system_configs WHERE key = ?',
      [key]
    );
    
    if (rows.length === 0) return null;
    
    return JSON.parse(rows[0].value);
  }
  
  saveSystemConfig(key: string, value: any): void {
    this.db.update(
      'INSERT OR REPLACE INTO system_configs (key, value) VALUES (?, ?)',
      [key, JSON.stringify(value)]
    );
  }
}
```

#### ConversationRepository

```typescript
class ConversationRepository {
  private db: SQLiteManager;
  
  createConversation(title: string): string {
    const id = `conv_${Date.now()}`;
    
    this.db.insert(
      'INSERT INTO conversations (id, title) VALUES (?, ?)',
      [id, title]
    );
    
    return id;
  }
  
  getConversation(id: string): Conversation | null {
    const rows = this.db.query(
      'SELECT * FROM conversations WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) return null;
    
    return this.mapRowToConversation(rows[0]);
  }
  
  listConversations(limit: number = 20, offset: number = 0): Conversation[] {
    const rows = this.db.query(
      'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    
    return rows.map(row => this.mapRowToConversation(row));
  }
  
  addMessage(conversationId: string, message: Message): void {
    this.db.insert(
      'INSERT INTO messages (id, conversation_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)',
      [
        message.id,
        conversationId,
        message.role,
        message.content,
        message.metadata ? JSON.stringify(message.metadata) : null,
      ]
    );
  }
  
  getMessages(conversationId: string): Message[] {
    const rows = this.db.query(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC',
      [conversationId]
    );
    
    return rows.map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }
  
  deleteConversation(id: string): void {
    // 级联删除消息和任务
    this.db.delete('DELETE FROM conversations WHERE id = ?', [id]);
  }
  
  private mapRowToConversation(row: any): Conversation {
    return {
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
```

#### TaskRepository

```typescript
class TaskRepository {
  private db: SQLiteManager;
  
  createTask(task: Task): void {
    this.db.insert(
      'INSERT INTO tasks (id, conversation_id, goal_id, status, plan) VALUES (?, ?, ?, ?, ?)',
      [
        task.id,
        task.conversationId,
        task.goalId,
        task.status,
        JSON.stringify(task.plan),
      ]
    );
  }
  
  getTask(id: string): Task | null {
    const rows = this.db.query('SELECT * FROM tasks WHERE id = ?', [id]);
    
    if (rows.length === 0) return null;
    
    return this.mapRowToTask(rows[0]);
  }
  
  updateTaskStatus(id: string, status: TaskStatus): void {
    this.db.update(
      'UPDATE tasks SET status = ? WHERE id = ?',
      [status, id]
    );
  }
  
  saveTaskResult(result: ExecutionResult): void {
    this.db.insert(
      'INSERT INTO task_results (id, task_id, step_id, success, result_data, error_message, execution_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        result.stepId, // 使用stepId作为主键
        result.taskId,
        result.stepId,
        result.success ? 1 : 0,
        result.data ? JSON.stringify(result.data) : null,
        result.error?.message || null,
        result.executionTime,
      ]
    );
  }
  
  getTaskResults(taskId: string): ExecutionResult[] {
    const rows = this.db.query(
      'SELECT * FROM task_results WHERE task_id = ? ORDER BY created_at ASC',
      [taskId]
    );
    
    return rows.map(row => ({
      stepId: row.step_id,
      taskId: row.task_id,
      success: row.success === 1,
      data: row.result_data ? JSON.parse(row.result_data) : undefined,
      error: row.error_message ? new Error(row.error_message) : undefined,
      executionTime: row.execution_time,
      createdAt: new Date(row.created_at),
    }));
  }
  
  private mapRowToTask(row: any): Task {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      goalId: row.goal_id,
      status: row.status,
      plan: JSON.parse(row.plan),
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }
}
```

#### DataSourceRepository

```typescript
class DataSourceRepository {
  private db: SQLiteManager;
  
  addDataSource(dataSource: DataSource): void {
    this.db.insert(
      'INSERT INTO data_sources (id, name, type, config, metadata) VALUES (?, ?, ?, ?, ?)',
      [
        dataSource.id,
        dataSource.name,
        dataSource.type,
        JSON.stringify(dataSource.config),
        dataSource.metadata ? JSON.stringify(dataSource.metadata) : null,
      ]
    );
  }
  
  getDataSource(id: string): DataSource | null {
    const rows = this.db.query(
      'SELECT * FROM data_sources WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) return null;
    
    return this.mapRowToDataSource(rows[0]);
  }
  
  listDataSources(type?: DataType): DataSource[] {
    let sql = 'SELECT * FROM data_sources';
    const params: any[] = [];
    
    if (type) {
      sql += ' WHERE type = ?';
      params.push(type);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const rows = this.db.query(sql, params);
    return rows.map(row => this.mapRowToDataSource(row));
  }
  
  deleteDataSource(id: string): void {
    this.db.delete('DELETE FROM data_sources WHERE id = ?', [id]);
  }
  
  private mapRowToDataSource(row: any): DataSource {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      config: JSON.parse(row.config),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
```

---

## 4. 临时文件管理

### 4.1 TempFileCleaner（临时文件清理器）

```typescript
class TempFileCleaner {
  private workspaceManager: WorkspaceManager;
  private config: CleanupConfig;
  private intervalId?: NodeJS.Timeout;
  
  constructor(workspaceManager: WorkspaceManager, config: CleanupConfig) {
    this.workspaceManager = workspaceManager;
    this.config = config;
  }
  
  /**
   * 启动定期清理
   */
  start(): void {
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, this.config.interval);
  }
  
  /**
   * 停止清理
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
  
  /**
   * 清理过期临时文件
   */
  cleanup(): void {
    const tempDir = this.workspaceManager.getDirectory('temp');
    const now = Date.now();
    
    try {
      const files = fs.readdirSync(tempDir);
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        
        // 检查是否过期
        const age = now - stats.mtimeMs;
        if (age > this.config.maxAge) {
          fs.removeSync(filePath);
          logger.info(`Cleaned up expired temp file: ${file}`);
        }
      }
      
      // 检查总大小
      const totalSize = this.calculateTotalSize(tempDir);
      if (totalSize > this.config.maxSize) {
        this.cleanupBySize(tempDir, totalSize);
      }
    } catch (error) {
      logger.error('Temp file cleanup failed:', error);
    }
  }
  
  /**
   * 注册临时文件
   */
  registerTempFile(filePath: string, ttl: number): void {
    // 记录文件信息和过期时间
    // 可用于精确控制单个文件的TTL
  }
  
  /**
   * 立即清理指定文件
   */
  cleanupFile(filePath: string): void {
    try {
      fs.removeSync(filePath);
    } catch (error) {
      logger.warn(`Failed to cleanup file: ${filePath}`, error);
    }
  }
  
  private calculateTotalSize(dir: string): number {
    let totalSize = 0;
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
    }
    
    return totalSize;
  }
  
  private cleanupBySize(dir: string, currentSize: number): void {
    // 按修改时间排序，删除最旧的文件直到低于限制
    const files = fs.readdirSync(dir)
      .map(f => ({
        name: f,
        path: path.join(dir, f),
        mtime: fs.statSync(path.join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => a.mtime - b.mtime);
    
    let size = currentSize;
    for (const file of files) {
      if (size <= this.config.maxSize * 0.8) break; // 清理到80%
      
      const stats = fs.statSync(file.path);
      fs.removeSync(file.path);
      size -= stats.size;
      
      logger.info(`Cleaned up temp file by size: ${file.name}`);
    }
  }
}

interface CleanupConfig {
  maxAge: number;        // 最大存活时间（毫秒）
  maxSize: number;       // 最大总大小（字节）
  interval: number;      // 清理间隔（毫秒）
}
```

---

## 5. 数据库迁移

### 5.1 迁移文件示例

```sql
-- migrations/001_initial_schema.sql

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSON,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- ... 其他表
```

### 5.2 MigrationManager

```typescript
class MigrationManager {
  private db: SQLiteManager;
  
  async migrate(): Promise<void> {
    const currentVersion = this.getCurrentVersion();
    const pendingMigrations = this.getPendingMigrations(currentVersion);
    
    for (const migration of pendingMigrations) {
      logger.info(`Running migration: ${migration.name}`);
      
      const sql = fs.readFileSync(migration.path, 'utf-8');
      this.db.db.exec(sql);
      
      this.recordMigration(migration.version);
    }
  }
  
  getCurrentVersion(): number {
    // 从system_configs读取当前版本
  }
  
  getPendingMigrations(currentVersion: number): Migration[] {
    // 获取待执行的迁移列表
  }
  
  recordMigration(version: number): void {
    // 记录已执行的迁移版本
  }
}

interface Migration {
  version: number;
  name: string;
  path: string;
}
```

---

## 6. 目录结构示例

```
workspace/
├── data/
│   ├── local/              # 用户上传的本地文件
│   │   ├── districts_123456.shp
│   │   ├── districts_123456.shx
│   │   └── districts_123456.dbf
│   └── postgis/            # PostGIS配置（仅元数据）
├── llm/
│   ├── config/             # LLM配置文件
│   │   └── qwen_config.json
│   └── prompts/            # 提示词模板
│       └── intent_detection_zh.json
├── plugins/
│   ├── builtin/            # 内置插件
│   └── custom/             # 用户上传插件
├── database/
│   └── geoai-up.db         # SQLite数据库
├── temp/                   # 临时文件（定期清理）
│   ├── temp_buffer_123.shp
│   └── temp_import_456.geojson
└── results/
    ├── geojson/            # 分析结果
    ├── shapefile/
    ├── mvt/                # MVT服务元信息
    ├── wms/                # WMS服务元信息
    └── reports/            # 生成的报告
```

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
