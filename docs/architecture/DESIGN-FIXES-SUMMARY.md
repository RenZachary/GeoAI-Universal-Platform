# 架构设计修正总结

## 修正日期
2026-05-03

---

## 一、核心问题修正

### 1. BufferAnalyzer职责混乱 → 工厂模式 + 多态

**问题**: 原设计在Analyzer层使用Strategy模式区分数据类型，违反分层原则

**修正**: 
- ✅ **BufferAnalyzer**: 仅负责任务编排，通过DBAccessorFactory获取Accessor
- ✅ **DataAccessor接口**: 扩展空间分析方法（buffer, intersect等）
- ✅ **每个Accessor**: 自己实现分析方法（PostGIS用SQL，文件型用Turf.js）
- ✅ **DataAccessorFactory**: 统一入口，根据类型返回对应Accessor

**关键代码**:
```typescript
// BufferAnalyzer - 只负责编排
class BufferAnalyzer {
  async createBuffer(data: NativeData, distance: number, unit: string): Promise<NativeData> {
    const accessor = this.accessorFactory.createAccessor(data.type, data.reference);
    return await accessor.buffer(distance, unit);  // Accessor自己决定如何实现
  }
}

// PostGISAccessor - 内部用SQL
async buffer(distance: number, unit: string): Promise<NativeData> {
  const sql = `SELECT ST_Buffer(geom, ${distance}) FROM table`;
  return await this.executeSQL(sql);
}

// ShapefileAccessor - 内部用Turf.js
async buffer(distance: number, unit: string): Promise<NativeData> {
  const geojson = await shapefile.read(this.filePath);
  const buffered = turf.buffer(geojson, distance, { units: unit });
  return await this.saveResult(buffered);
}
```

**优势**:
- 符合NativeData原则：PostGIS数据不转换格式
- 符合工厂模式：每层通过工厂类实现
- 多态替代条件判断：消除if-else分支
- 性能最优：每种数据类型用最合适的方式

---

### 2. ChatStreamChunk设计不完整 → 增加步骤级反馈

**问题**: 原设计只有task级别状态，前端无法了解详细执行进度

**修正**: 增加step级别的事件和进度信息

**新增类型**:
```typescript
type StreamEventType = 
  | 'text' | 'task_start' | 'task_complete'
  | 'step_start'      // 新增
  | 'step_complete'   // 新增
  | 'progress'        // 新增
  | 'visualization' | 'report' | 'error';

type StepType = 'load_data' | 'analyze' | 'transform' | 'visualize' | 'report';

interface ChatStreamChunk {
  type: StreamEventType;
  taskId?: string;
  stepId?: string;           // 新增
  stepType?: StepType;       // 新增
  stepDescription?: string;  // 新增
  progress?: ProgressInfo;   // 新增
  visualization?: VisualizationResult;
  report?: ReportResult;
}

interface ProgressInfo {
  currentStep: number;
  totalSteps: number;
  percentage: number;
  currentStepDescription: string;
  estimatedTimeRemaining?: number;
}
```

**SSE事件流示例**:
```
event: message
data: {"type":"task_start","taskId":"t1","taskDescription":"显示小区数据"}

event: message
data: {"type":"step_start","taskId":"t1","stepId":"s1","stepType":"load_data","stepDescription":"加载小区数据源"}

event: message
data: {"type":"progress","taskId":"t1","progress":{"currentStep":1,"totalSteps":2,"percentage":50}}

event: message
data: {"type":"step_complete","taskId":"t1","stepId":"s1","content":"加载成功"}

event: message
data: {"type":"visualization","taskId":"t1","visualization":{"serviceId":"mvt_001","tileUrl":"/api/mvt/..."}}

event: message
data: {"type":"task_complete","taskId":"t1","content":"完成"}
```

**优势**:
- 前端可展示详细进度条
- 用户了解每一步执行状态
- 便于调试和问题定位
- 支持细粒度错误处理

---

### 3. BufferPlugin重复判断 → 简化调用

**问题**: Plugin层也有if-else判断数据类型，与Analyzer职责重叠

**修正**: Plugin直接调用Analyzer，不再关心数据类型

**修正前**:
```typescript
// ❌ 错误：Plugin层判断数据类型
if (inputData.type === 'postgis') {
  result = await this.executePostGISBuffer(...);
} else {
  const geojson = await this.loadAsGeoJSON(inputData);
  result = turf.buffer(geojson, ...);
}
```

**修正后**:
```typescript
// ✅ 正确：直接调用Analyzer
const analyzer = AnalyzerFactory.create('buffer');
const result = await analyzer.createBuffer(inputData, distance, unit);
```

**优势**:
- 职责清晰：Plugin只负责接口，Analyzer负责业务逻辑
- 代码简洁：消除重复判断
- 易于维护：逻辑集中在Analyzer

---

### 4. 缺少统一数据加载抽象 → UniversalDataLoader

**问题**: 跨数据源分析时，数据转换逻辑分散

**修正**: 引入UniversalDataLoader，仅在必要时转换

**设计原则**:
- **PostGIS数据**: 保持原位，不转换为GeoJSON
- **文件型数据**: 加载为GeoJSON用于Turf.js分析
- **跨数据源**: 临时导入PostGIS或加载为GeoJSON

```typescript
class UniversalDataLoader {
  /**
   * 将文件型数据加载为GeoJSON
   * PostGIS数据不应调用此方法
   */
  async loadAsGeoJSON(data: NativeData): Promise<GeoJSON> {
    if (data.type === 'postgis') {
      throw new Error('PostGIS data should not be converted to GeoJSON');
    }
    
    const accessor = this.accessorFactory.createAccessor(data.type, data.reference);
    // 不同Accessor实现自己的读取逻辑
  }
  
  /**
   * 将GeoJSON保存为指定格式
   */
  async saveAs(geojson: GeoJSON, format: DataType): Promise<NativeData> {
    // 根据目标格式选择保存方式
  }
}
```

**使用场景**:
```typescript
// OverlayAnalyzer处理跨数据源分析
async intersect(data1: NativeData, data2: NativeData): Promise<NativeData> {
  // 情况1: 两个都是PostGIS → 直接在数据库中执行
  if (data1.type === 'postgis' && data2.type === 'postgis') {
    const accessor = factory.createAccessor('postgis', data1.reference);
    return await accessor.intersect(data2);
  }
  
  // 情况2: 一个是PostGIS，一个是文件型 → 临时导入PostGIS
  if (data1.type === 'postgis' || data2.type === 'postgis') {
    const postgisAccessor = factory.createAccessor('postgis', ...);
    return await postgisAccessor.intersect(fileData);  // 内部临时导入
  }
  
  // 情况3: 两个都是文件型 → 加载为GeoJSON用Turf.js
  const loader = new UniversalDataLoader(factory);
  const geo1 = await loader.loadAsGeoJSON(data1);
  const geo2 = await loader.loadAsGeoJSON(data2);
  const result = turf.intersect(geo1, geo2);
  return await loader.saveAs(result, data1.type);
}
```

---

## 二、文档拆分

为避免文档过大，已将module-design.md拆分为：

1. **module-interface-layer.md** (321行) - 接口层设计
2. **module-llm-layer.md** (434行) - LLM交互层设计
3. **module-data-access-layer.md** (684行) - 数据接入层设计（新增）
4. **module-design.md** (保留其他层设计)

---

## 三、架构原则验证

### ✅ 符合需求文档要求

1. **文档驱动开发（DDD）**: 所有设计先文档化
2. **分层架构**: 接口层、LLM层、插件层、数据接入层、分析层、存储层
3. **工厂模式**: 每一层通过工厂类实现（DataAccessorFactory、AnalyzerFactory、LLMFactory等）
4. **NativeData**: 保持原始数据格式，PostGIS不转换
5. **插件化**: 所有功能封装为插件

### ✅ 设计模式应用

- **工厂模式**: DataAccessorFactory、AnalyzerFactory、LLMFactory、PluginFactory
- **多态**: 每个Accessor实现自己的方法，消除条件判断
- **策略模式**: （已移除，改用多态+工厂）
- **观察者模式**: 插件生命周期管理

### ✅ 关键设计决策

1. **PostGIS数据分析**: 直接在数据库内执行SQL，不转换为GeoJSON
2. **文件型数据分析**: 加载为GeoJSON，使用Turf.js
3. **跨数据源分析**: 临时导入PostGIS或加载为GeoJSON
4. **插件执行**: 不需要回滚机制，临时文件由清理器处理
5. **服务发布**: MVT用于矢量，WMS用于影像，GeoJSON用于热力图

---

## 四、下一步工作

### P0 - 必须完成
- [x] BufferAnalyzer职责修正
- [x] ChatStreamChunk完整性增强
- [x] BufferPlugin简化
- [x] 数据接入层独立文档

### P1 - 建议补充
- [ ] 插件执行流程图（时序图）
- [ ] 完整的数据流示例
- [ ] 错误处理机制详细说明
- [ ] 缓存策略设计

### P2 - 长期优化
- [ ] 性能基准测试方案
- [ ] 监控指标定义
- [ ] 安全加固措施
- [ ] 部署架构细化

---

## 五、关键洞察

### 1. 层次职责必须清晰
- **Plugin层**: 对外接口，参数验证
- **Analyzer层**: 业务逻辑编排
- **Accessor层**: 数据访问 + 该数据类型的分析实现
- **Factory层**: 统一入口，类型分发

### 2. 多态优于条件判断
- 每个Accessor实现自己的方法
- 上层调用者无需关心具体实现
- 符合开闭原则

### 3. NativeData是核心原则
- PostGIS数据就在数据库中分析
- 避免不必要的数据转换
- 性能优先

### 4. LLM调用要简洁
- 插件接口统一，不暴露内部实现
- LLM只需关注业务参数
- 不需要知道底层用什么算法

---

**文档版本**: 1.0  
**创建日期**: 2026-05-03  
**状态**: 已完成核心修正
