# GeoAI-UP 核心数据类型与交互流程

## 1. 核心数据类型定义

### 1.1 NativeData（原生数据）

```typescript
interface NativeData {
  id: string;
  type: DataType;
  metadata: DataMetadata;
  reference: DataReference;
  createdAt: Date;
}

type DataType = 'shapefile' | 'geojson' | 'postgis' | 'tif';

interface DataMetadata {
  name?: string;
  bbox?: BBox;
  crs?: string;
  featureCount?: number;
  fields?: FieldInfo[];
  [key: string]: any;
}

interface DataReference {
  type: 'file' | 'database';
  path?: string;              // 文件路径
  connectionId?: string;      // 数据库连接ID
  tableName?: string;         // 表名
  isTemporary?: boolean;      // 是否为临时数据
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface FieldInfo {
  name: string;
  type: string;
  nullable: boolean;
}
```

### 1.2 ServiceMetadata（服务元数据）

```typescript
type ServiceMetadata = MVTServiceMetadata | WMSServiceMetadata;

interface MVTServiceMetadata {
  serviceId: string;
  type: 'mvt';
  bbox: BBox;
  minZoom: number;
  maxZoom: number;
  tileUrlTemplate: string;
  createdAt: Date;
}

interface WMSServiceMetadata {
  serviceId: string;
  type: 'wms';
  bbox: BBox;
  crs: string;
  imageUrlTemplate: string;
  createdAt: Date;
}
```

### 1.3 任务和执行相关类型

```typescript
interface Task {
  id: string;
  conversationId: string;
  goalId: string;
  status: TaskStatus;
  plan: ExecutionPlan;
  results: ExecutionResult[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface ExecutionPlan {
  goalId: string;
  steps: ExecutionStep[];
  estimatedTime: number;
}

interface ExecutionStep {
  id: string;
  type: StepType;
  pluginName: string;
  parameters: Record<string, any>;
  dependencies: string[];
}

type StepType = 'load_data' | 'analyze' | 'transform' | 'visualize' | 'report';

interface ExecutionResult {
  stepId: string;
  taskId?: string;
  success: boolean;
  data?: NativeData | ServiceMetadata;
  error?: Error;
  executionTime: number;
  metadata: Record<string, any>;
  createdAt?: Date;
}
```

### 1.4 LLM相关类型

```typescript
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

interface ChatResponse {
  content: string;
  usage: TokenUsage;
  model: string;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ParsedRequirement {
  intent: Intent;
  goals: OutputGoal[];
  parameters: Record<string, any>;
  confidence: number;
}

interface OutputGoal {
  id: string;
  description: string;
  type: GoalType;
  parameters: GoalParameters;
}

type Intent = 'visualization' | 'analysis' | 'report' | 'query';
type GoalType = 'visualization' | 'analysis' | 'report' | 'query';
```

---

## 2. 模块间交互流程

### 2.1 完整对话流程时序图

```
用户 → ChatController
         ↓
   RequirementParser (LLM调用1: 意图识别)
         ↓
   GoalSplitter (LLM调用2: 目标拆分)
         ↓
   TaskDecomposer (LLM调用3-N: 任务分解)
         ↓
   PluginExecutor
         ↓
   ┌────┴────┬─────────┐
   ↓         ↓         ↓
DataAccess  Spatial   Visualization
            Analysis   Service
   └────┬────┴─────────┘
        ↓
   ResultAggregator
        ↓
   StreamManager (流式返回)
        ↓
      User
```

### 2.2 数据源加载流程

```
Plugin (load_data step)
    ↓
DataAccessorFactory.createAccessor(type, config)
    ↓
DataAccessor.read(query)
    ↓
NativeData (保持原生格式)
    ↓
返回给Plugin
```

### 2.3 跨数据源分析流程

```
需要联合分析GeoJSON和PostGIS数据
    ↓
OverlayAnalyzer.intersect(geojsonData, postgisData)
    ↓
PostGISAccessor.intersect(fileData)
    ↓
内部：临时导入GeoJSON到PostGIS
    ↓
执行SQL ST_Intersect
    ↓
NativeData (临时表引用)
    ↓
清理临时表（可选，由TempFileCleaner定期清理）
```

### 2.4 缓冲区分析流程

```
BufferPlugin.execute(input)
    ↓
BufferAnalyzer.createBuffer(data, distance, unit)
    ↓
DataAccessorFactory.createAccessor(data.type, config)
    ↓
根据数据类型选择Accessor:
  - ShapefileAccessor.buffer() → Turf.js
  - PostGISAccessor.buffer() → SQL ST_Buffer
    ↓
返回NativeData结果
```

### 2.5 MVT服务发布流程

```
MVTPublisherPlugin.execute(input)
    ↓
MVTService.publish(data)
    ↓
UniversalDataLoader.loadAsGeoJSON(data)
    ↓
geojsonVt生成瓦片索引
    ↓
注册服务到MVTServiceRegistry (TTL 24h)
    ↓
返回MVTServiceMetadata
    ↓
前端通过 /api/visualization/mvt/{serviceId}/{z}/{x}/{y} 访问
```

---

## 3. 错误处理机制

### 3.1 错误分类

```typescript
enum ErrorType {
  USER_ERROR = 'USER_ERROR',              // 用户输入错误
  VALIDATION_ERROR = 'VALIDATION_ERROR',  // 数据验证错误
  LLM_ERROR = 'LLM_ERROR',                // LLM调用错误
  PLUGIN_ERROR = 'PLUGIN_ERROR',          // 插件执行错误
  DATA_SOURCE_ERROR = 'DATA_SOURCE_ERROR', // 数据源错误
  SYSTEM_ERROR = 'SYSTEM_ERROR',          // 系统内部错误
}

class AppError extends Error {
  type: ErrorType;
  code: string;
  statusCode: number;
  details?: any;
  suggestion?: string;
  
  constructor(
    message: string,
    type: ErrorType,
    code: string,
    statusCode: number = 500
  ) {
    super(message);
    this.type = type;
    this.code = code;
    this.statusCode = statusCode;
  }
}
```

### 3.2 错误响应格式化

```typescript
interface ErrorResponse {
  code: string;
  message: string;           // 用户友好的中英文提示
  details?: string;          // 技术细节（开发模式）
  suggestion?: string;       // 解决建议
  timestamp: Date;
}

class ErrorFormatter {
  static format(error: AppError, language: string): ErrorResponse {
    const i18nMessages = this.getI18nMessages(language);
    
    return {
      code: error.code,
      message: i18nMessages[error.code] || error.message,
      details: process.env.NODE_ENV === 'development' ? error.details : undefined,
      suggestion: error.suggestion,
      timestamp: new Date(),
    };
  }
}
```

---

## 4. 日志系统

### 4.1 日志级别和格式

```typescript
enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  module: string;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  debug(message: string, context?: any): void;
  info(message: string, context?: any): void;
  warn(message: string, context?: any): void;
  error(message: string, error?: Error, context?: any): void;
}
```

### 4.2 使用示例

```typescript
const logger = new Logger('BufferAnalyzer');

logger.info('Starting buffer analysis', {
  dataSourceId: 'ds_001',
  distance: 500,
  unit: 'meters',
});

try {
  const result = await accessor.buffer(500, 'meters');
  logger.info('Buffer analysis completed', {
    resultId: result.id,
    featureCount: result.metadata.featureCount,
  });
} catch (error) {
  logger.error('Buffer analysis failed', error, {
    dataSourceId: 'ds_001',
  });
}
```

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
