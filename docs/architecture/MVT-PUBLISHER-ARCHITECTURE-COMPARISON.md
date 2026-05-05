# MVT Publisher 架构对比

## 📊 重构前后对比

### 重构前 (Before)

```
┌─────────────────────────────────────────────────────────┐
│                  混乱的命名                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  MVTPublisher          MVTDynamicPublisher              │
│  ❓ 哪个是动态？       ❓ Dynamic 是什么意思？            │
│  ❓ 有什么区别？       ❓ 为什么有两个？                  │
│                                                         │
│  问题:                                                     │
│  - 命名不清晰                                              │
│  - 职责重叠                                                │
│  - 缺少统一接口                                            │
│  - 难以扩展                                                │
└─────────────────────────────────────────────────────────┘
```

### 重构后 (After)

```
┌─────────────────────────────────────────────────────────┐
│              BaseMVTPublisher (抽象基类)                  │
│  ✅ 统一的接口定义                                        │
│  ✅ 公共逻辑复用                                          │
│  ✅ 易于测试和扩展                                        │
└──────────────┬───────────────────────┬──────────────────┘
               │                       │
     ┌─────────▼────────────┐  ┌──────▼────────────────┐
     │                      │  │                       │
     │ MVTOnDemandPublisher │  │ MVTStrategyPublisher  │
     │                      │  │                       │
     │ 💡 按需生成           │  │ 💡 策略模式            │
     │ 📍 数据源自动发布     │  │ 📍 插件工作流          │
     │ 🔧 PostGIS 原生支持   │  │ 🔧 NativeData 集成    │
     │ 💾 内存缓存           │  │ 💾 预生成 + 按需      │
     │ 📁 mvt-dynamic/      │  │ 📁 mvt/               │
     │                      │  │                       │
     └──────────────────────┘  └───────────────────────┘
     
✅ 清晰的命名
✅ 明确的职责
✅ 统一的接口
✅ 易于维护
```

---

## 🔑 核心差异对比表

| 特性 | MVTOnDemandPublisher | MVTStrategyPublisher |
|------|---------------------|---------------------|
| **设计模式** | 直接实现 | 策略模式 (Strategy Pattern) |
| **主要用途** | 数据源自动发布 | 插件工作流可视化 |
| **输入类型** | `MVTSource` (联合类型) | `NativeData` |
| **生成模式** | 仅 on-demand | pre-generate + on-demand |
| **PostGIS** | ✅ 完整实现 (使用 pg 库) | ⚠️ 占位符 (TODO) |
| **Shapefile** | ❌ 不支持 | ✅ 转换为 GeoJSON |
| **GeoJSON** | ✅ in-memory + file | ✅ file only |
| **存储方式** | 仅元数据 + 内存缓存 | 文件系统 (.pbf 文件) |
| **输出目录** | `results/mvt-dynamic/` | `results/mvt/` |
| **API 端点** | `/api/mvt-dynamic/*` | `/api/services/mvt/*` |
| **使用场景** | 用户上传数据后自动发布 | 聊天触发可视化 |
| **内存占用** | 较高 (缓存 tileIndex) | 较低 (按需加载) |
| **适用数据量** | 大数据集 (>10MB) | 小数据集 (<10MB) |

---

## 🎯 使用场景示例

### 场景 1: 用户上传 Shapefile → 自动发布为 MVT

```typescript
// 使用 MVTOnDemandPublisher (通过 DataSourcePublishingService)

// 1. 用户上传文件
POST /api/upload
{
  "file": "provinces.shp",
  "type": "shapefile"
}

// 2. 系统自动创建数据源并发布
// DataSourcePublishingService 内部调用:
const publisher = MVTOnDemandPublisher.getInstance(workspaceBase);
const result = await publisher.publish({
  type: 'geojson-file',  // Shapefile 已转换为 GeoJSON
  filePath: '/path/to/converted.geojson'
}, {
  minZoom: 0,
  maxZoom: 10,
  tilesetId: dataSource.id  // 使用数据源 ID
});

// 3. 前端获取服务 URL
GET /api/data-sources/:id/service-url
→ { url: "/api/mvt-dynamic/ds_123/{z}/{x}/{y}.pbf", type: "mvt" }
```

**为什么用 MVTOnDemandPublisher?**
- ✅ 自动处理数据源转换 (Shapefile → GeoJSON)
- ✅ 支持大数据集（按需生成，不预先生成所有瓦片）
- ✅ 使用数据源 ID 作为 tilesetId，便于管理

---

### 场景 2: 用户聊天 → "显示陕西省人口分布图"

```typescript
// 使用 MVTStrategyPublisher (通过 MVTPublisherExecutor)

// 1. 用户发送聊天消息
POST /api/chat
{
  "message": "显示陕西省人口分布图",
  "dataSourceId": "ds_shaanxi_population"
}

// 2. TaskPlanner 规划任务，选择 choropleth-mvt 插件

// 3. MVTPublisherExecutor 执行
const publisher = MVTStrategyPublisher.getInstance(workspaceBase);
const tilesetId = await publisher.generateTiles(nativeData, {
  minZoom: 5,
  maxZoom: 10,
  layerName: 'population'
});

// 4. 返回 MVT 服务 URL 给前端
{
  "type": "choropleth-map",
  "mvtUrl": "/api/services/mvt/mvt_1234567890/{z}/{x}/{y}.pbf",
  "style": { ... }
}
```

**为什么用 MVTStrategyPublisher?**
- ✅ 与 NativeData 深度集成
- ✅ 支持策略模式（自动选择合适的生成策略）
- ✅ 适合插件工作流

---

### 场景 3: 连接 PostGIS 数据库 → 实时地图服务

```typescript
// 使用 MVTOnDemandPublisher

const publisher = MVTOnDemandPublisher.getInstance(workspaceBase);
const result = await publisher.publish({
  type: 'postgis',
  connection: {
    host: 'localhost',
    port: 5432,
    database: 'gis_db',
    user: 'postgres',
    password: 'secret'
  },
  tableName: 'cities',
  geometryColumn: 'geom'
}, {
  minZoom: 0,
  maxZoom: 15,
  layerName: 'cities'
});

// PostGIS 使用 ST_AsMVT() 原生函数，实时生成瓦片
// 数据更新立即可见，无需重新生成
```

**为什么用 MVTOnDemandPublisher?**
- ✅ PostGIS 完整实现（使用 `pg` 库）
- ✅ 利用 PostGIS 原生 `ST_AsMVT()` 函数
- ✅ 数据实时更新，无需重新发布

---

## 🔄 数据流向对比

### MVTOnDemandPublisher 数据流

```
用户上传文件
    ↓
DataSourceController
    ↓
DataSourcePublishingService
    ↓
MVTOnDemandPublisher.publish()
    ├─ GeoJSON: geojson-vt (内存索引)
    ├─ Shapefile: 转换为 GeoJSON → geojson-vt
    └─ PostGIS: pg.Pool + ST_AsMVT()
    ↓
内存缓存 (InMemoryTileCache)
    ↓
前端请求瓦片: GET /api/mvt-dynamic/:id/:z/:x/:y.pbf
    ↓
MVTOnDemandPublisher.getTile()
    ├─ 检查缓存 → 命中则返回
    └─ 未命中 → 生成瓦片 → 缓存 → 返回
```

### MVTStrategyPublisher 数据流

```
用户聊天请求
    ↓
ChatController → TaskPlanner
    ↓
Plugin Executor (e.g., ChoroplethMVTExecutor)
    ↓
MVTStrategyPublisher.generateTiles()
    ├─ GeoJSON Strategy: geojson-vt
    ├─ Shapefile Strategy: 转换 → GeoJSON Strategy
    └─ PostGIS Strategy: (TODO)
    ↓
文件系统存储 (results/mvt/:tilesetId/)
    ├─ metadata.json
    └─ :z/:x/:y.pbf (预生成) 或 按需生成
    ↓
前端请求瓦片: GET /api/services/mvt/:id/:z/:x/:y.pbf
    ↓
MVTServiceController.serveTile()
    ├─ 检查文件系统 → 存在则返回
    └─ 不存在 → 策略生成 → 返回
```

---

## 📈 性能对比

| 指标 | MVTOnDemandPublisher | MVTStrategyPublisher |
|------|---------------------|---------------------|
| **首次发布速度** | ⚡ 快 (秒级) | 🐢 慢 (分钟级，如果预生成) |
| **首次瓦片访问** | 🐢 慢 (需要生成) | ⚡ 快 (已预生成) |
| **后续瓦片访问** | ⚡ 快 (缓存命中) | ⚡ 快 (文件系统) |
| **内存占用** | 🔴 高 (缓存 tileIndex) | 🟢 低 (按需加载) |
| **磁盘占用** | 🟢 低 (仅元数据) | 🔴 高 (所有 .pbf 文件) |
| **数据更新响应** | ⚡ 即时 | 🐢 需重新生成 |
| **适合数据量** | >10MB | <10MB |

---

## 🎨 代码示例对比

### 发布 MVT 服务

#### MVTOnDemandPublisher
```typescript
import { MVTOnDemandPublisher } from './utils/publishers/MVTOnDemandPublisher';

const publisher = MVTOnDemandPublisher.getInstance(workspaceBase, 10000);

// 发布 GeoJSON 文件
const result = await publisher.publish({
  type: 'geojson-file',
  filePath: '/path/to/data.geojson'
}, {
  minZoom: 0,
  maxZoom: 10,
  layerName: 'my_layer',
  tilesetId: 'custom_id'  // 可选自定义 ID
});

console.log(result.serviceUrl); 
// → /api/mvt-dynamic/custom_id/{z}/{x}/{y}.pbf
```

#### MVTStrategyPublisher
```typescript
import { MVTStrategyPublisher } from './utils/publishers/MVTStrategyPublisher';
import { DataAccessorFactory } from './data-access/factories/DataAccessorFactory';

const publisher = MVTStrategyPublisher.getInstance(workspaceBase, db);
const factory = new DataAccessorFactory(workspaceBase);

// 读取数据源为 NativeData
const accessor = factory.createAccessor('geojson');
const nativeData = await accessor.read('/path/to/data.geojson');

// 生成瓦片
const tilesetId = await publisher.generateTiles(nativeData, {
  minZoom: 0,
  maxZoom: 10,
  layerName: 'my_layer'
});

console.log(`/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`);
```

---

## ✅ 重构验证清单

### 代码层面
- [x] 所有类名已更新
- [x] 所有导入语句已更新
- [x] 基类已创建并正确继承
- [x] 抽象方法已实现
- [x] 无编译错误

### 功能层面
- [ ] 数据源自动发布正常
- [ ] 插件工作流 MVT 生成正常
- [ ] API 端点返回正确数据
- [ ] 缓存机制正常工作
- [ ] 清理调度器正常工作

### 文档层面
- [x] 重构计划文档已创建
- [x] 完成报告已创建
- [x] 架构对比文档已创建
- [ ] API 文档已更新（待办）

---

## 🚀 下一步行动

1. **立即**: 运行测试套件验证功能
2. **本周**: 手动测试所有 API 端点
3. **下周**: 更新 API 文档中的类名引用
4. **下月**: 考虑将 `DataSourcePublishingService` 改为依赖 `BaseMVTPublisher`

---

**文档版本**: 1.0  
**最后更新**: 2026-05-06  
**作者**: AI Assistant
