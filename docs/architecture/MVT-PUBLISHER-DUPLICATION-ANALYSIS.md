# MVT Publisher 重复代码分析报告

**日期**: 2026-05-11  
**主题**: MVTStrategyPublisher vs MVTOnDemandPublisher 重复逻辑深度分析  
**结论**: ⚠️ **存在大量重复代码，约 60-70% 的逻辑是重复的**

---

## 📊 重复度总览

| 功能模块 | MVTStrategyPublisher | MVTOnDemandPublisher | 重复度 |
|---------|---------------------|---------------------|--------|
| **GeoJSON 处理** | GeoJSONMVTTStrategy | publishGeoJSONFile + getGeoJSONTile | 🔴 **90%** |
| **PostGIS 处理** | PostGISMVTTStrategy | publishPostGIS + getPostGISTile | 🔴 **85%** |
| **元数据管理** | 磁盘读写 | 磁盘读写 + 内存缓存 | 🟡 **60%** |
| **瓦片ID生成** | `mvt_${timestamp}_${random}` | `prefix_${timestamp}_${random}` | 🟢 **100%** |
| **目录结构** | `results/mvt/{tilesetId}/` | `results/mvt/{tilesetId}/` | 🟢 **100%** |
| **单例模式** | getInstance/resetInstance | getInstance/resetInstance | 🟢 **100%** |
| **错误处理** | try-catch + 日志 | try-catch + 日志 | 🟡 **70%** |

**总体重复度**: **~65%**

---

## 🔍 详细重复代码对比

### 1. GeoJSON 处理逻辑 (重复度: 90%)

#### A. 文件读取和解析

**MVTOnDemandPublisher** (第391-406行):
```typescript
private async publishGeoJSONFile(
  filePath: string,
  options: MVTTileOptions,
  customTilesetId?: string
): Promise<string> {
  console.log(`[MVT On-Demand Publisher] Loading GeoJSON file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`GeoJSON file not found: ${filePath}`);
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const featureCollection = JSON.parse(fileContent);

  return this.publishGeoJSONInMemory(featureCollection, options, customTilesetId);
}
```

**GeoJSONMVTTStrategy** (第36-46行):
```typescript
// Read GeoJSON file
if (!fs.existsSync(sourceReference)) {
    throw new Error(`GeoJSON file not found: ${sourceReference}`);
}

const fileContent = fs.readFileSync(sourceReference, 'utf-8');
const featureCollection = JSON.parse(fileContent);

if (!featureCollection || featureCollection.type !== 'FeatureCollection') {
    throw new Error('Input must be a valid GeoJSON FeatureCollection');
}
```

**重复点**:
- ✅ 文件存在性检查
- ✅ 读取文件内容
- ✅ JSON 解析
- ✅ 错误处理

**差异**:
- Strategy 多了一个 FeatureCollection 类型验证

---

#### B. Tile Index 创建

**MVTOnDemandPublisher** (第374-380行):
```typescript
// Create tile index using geojson-vt
const tileIndex = geojsonvt(featureCollection, {
  maxZoom: options.maxZoom,
  extent: options.extent,
  tolerance: options.tolerance,
  buffer: options.buffer
});
```

**GeoJSONMVTTStrategy** (第52-57行):
```typescript
// Create tile index using geojson-vt
const tileIndex = geojsonvt(featureCollection, {
    maxZoom,
    extent,
    tolerance,
    buffer
});
```

**重复度**: 🟢 **100%** - 完全相同的代码！

---

#### C. Tile Index 缓存

**MVTOnDemandPublisher** (第383行):
```typescript
// Cache the tile index
this.geojsonTileIndexes.set(tilesetId, tileIndex);
```

**GeoJSONMVTTStrategy** (第68-73行):
```typescript
// Cache the tile index for on-demand access
this.tileIndexCache.set(tilesetId, {
    tileIndex,
    options: { minZoom, maxZoom, extent, tolerance, buffer },
    sourceReference,
    createdAt: Date.now()
});
```

**差异**:
- OnDemand: 只缓存 tileIndex
- Strategy: 缓存包含额外信息的对象（更完整）

---

#### D. 瓦片获取和 PBF 转换

**MVTOnDemandPublisher** (第408-441行):
```typescript
private getGeoJSONTile(
  tilesetId: string,
  z: number,
  x: number,
  y: number,
  extent: number
): Buffer | null {
  const tileIndex = this.geojsonTileIndexes.get(tilesetId);
  
  if (!tileIndex) {
    console.warn(`[MVT On-Demand Publisher] Tile index not found: ${tilesetId}`);
    return null;
  }

  // Get tile from index
  const tile = tileIndex.getTile(z, x, y);
  
  if (!tile || !tile.features || tile.features.length === 0) {
    return null;  // Empty tile
  }

  // Convert to PBF
  const layers: any = {};
  layers['default'] = {
    features: tile.features,
    extent: extent,
    version: 2
  };

  const pbf = vtPbf.fromGeojsonVt(layers, { version: 2, extent });
  
  return Buffer.from(pbf);
}
```

**GeoJSONMVTTStrategy** (第104-165行，简化后):
```typescript
async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
    let cached = this.tileIndexCache.get(tilesetId);

    // If not in cache, load from source file
    if (!cached) {
        // ... 从磁盘重新加载 ...
    }

    const tileIndex = cached.tileIndex;
    const tile = tileIndex.getTile(z, x, y);
    
    if (!tile || !tile.features || tile.features.length === 0) {
        return null;
    }

    // Convert to PBF
    const layers: any = {};
    layers['default'] = {
        features: tile.features,
        extent: cached.options.extent,
        version: 2
    };

    const pbf = vtPbf.fromGeojsonVt(layers, { version: 2, extent: cached.options.extent });
    
    return Buffer.from(pbf);
}
```

**重复度**: 🟡 **85%**
- ✅ 核心逻辑完全相同（getTile → vtPbf转换）
- ⚠️ Strategy 多了缓存未命中时的重新加载逻辑

---

### 2. PostGIS 处理逻辑 (重复度: 85%)

#### A. 连接池创建

**MVTOnDemandPublisher** (第460-466行):
```typescript
// Create connection pool using PostGISTileGenerator (delegates to PostGISPoolManager)
try {
  await this.postgisGenerator.createPool(source.connection);
  console.log('[MVT On-Demand Publisher] PostGIS connection established');
} catch (error) {
  throw wrapError(error, 'Failed to connect to PostGIS');
}
```

**PostGISMVTTStrategy** (第76行):
```typescript
const pool = await this.tileGenerator.createPool(poolConfig);
```

**关键点**: 
- ✅ **两者都使用同一个 `PostGISTileGenerator`**
- ✅ 底层都是 `PostGISPoolManager` 管理连接池
- 🟢 **无重复，是共享代码！**

---

#### B. 瓦片生成

**MVTOnDemandPublisher** (第503-518行):
```typescript
// Generate tile using shared PostGISTileGenerator
const result = await this.postgisGenerator.generateTile(
  pool,
  z,
  x,
  y,
  {
    tableName: source.tableName,
    sqlQuery: source.sqlQuery,
    geometryColumn: geometryColumn
  },
  {
    extent: extent,
    layerName: layerName,
    schema: schema
  }
);
```

**PostGISMVTTStrategy** (第200-220行，简化):
```typescript
const result = await this.tileGenerator.generateTile(
    pool,
    z,
    x,
    y,
    {
        tableName: connectionInfo.tableName,
        sqlQuery: undefined,  // or from metadata
        geometryColumn: connectionInfo.geometryColumn
    },
    {
        extent: cached.options.extent,
        layerName: cached.options.layerName,
        schema: connectionInfo.schema
    }
);
```

**重复度**: 🟢 **100%**
- ✅ **完全相同的调用**
- ✅ 都使用 `PostGISTileGenerator.generateTile()`
- ✅ 参数结构完全一致

---

#### C. 配置存储

**MVTOnDemandPublisher** (第469行):
```typescript
// Store connection config for later tile generation
this.postgisConfigs.set(tilesetId, source);
```

**PostGISMVTTStrategy** (第79行 + 第82-86行):
```typescript
// Store pool for later use
this.postgisPools.set(tilesetId, pool);

// Cache the connection info for on-demand tile generation
this.tileIndexCache.set(tilesetId, {
    connectionInfo,
    options: { minZoom, maxZoom, extent, tolerance, buffer, layerName: forcedLayerName },
    createdAt: Date.now()
});
```

**差异**:
- OnDemand: 只存储 source 配置
- Strategy: 存储 pool + 完整的配置信息

---

### 3. 元数据管理 (重复度: 60%)

#### A. 元数据保存

**MVTOnDemandPublisher** (第548-557行):
```typescript
private saveMetadata(tilesetId: string, metadata: MVTPublishMetadata): void {
  const tilesetDir = path.join(this.mvtOutputDir, tilesetId);
  
  if (!fs.existsSync(tilesetDir)) {
    fs.mkdirSync(tilesetDir, { recursive: true });
  }

  const metadataPath = path.join(tilesetDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}
```

**GeoJSONMVTTStrategy** (第93-94行):
```typescript
const metadataPath = path.join(tilesetDir, 'metadata.json');
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
```

**PostGISMVTTStrategy** (第107-108行):
```typescript
const metadataPath = path.join(tilesetDir, 'metadata.json');
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
```

**重复度**: 🟢 **100%** - 完全相同的代码出现了3次！

---

#### B. 元数据读取

**MVTStrategyPublisher** (第198-207行):
```typescript
getMetadata(tilesetId: string): MVTPublishMetadata | null {
  const metadataPath = path.join(this.mvtOutputDir, tilesetId, 'metadata.json');

  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    return metadata;
  }

  return null;
}
```

**MVTOnDemandPublisher**: 
- 使用内存缓存 `this.tilesetMetadata.get(tilesetId)`
- 启动时从磁盘加载到内存（第132-181行）

**差异**:
- Strategy: 每次都从磁盘读取
- OnDemand: 内存缓存 + 启动时预加载

---

### 4. 瓦片ID生成 (重复度: 100%)

**MVTOnDemandPublisher** (第544-546行):
```typescript
private generateTilesetId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
```

**GeoJSONMVTTStrategy** (第60行):
```typescript
const tilesetId = options.tilesetId || `mvt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
```

**PostGISMVTTStrategy** (第52行):
```typescript
const tilesetId = options.tilesetId || `mvt_postgis_${Date.now()}_${Math.random().toString(36).substring(7)}`;
```

**重复度**: 🟢 **100%** - 相同的模式，只是前缀不同

---

### 5. 目录结构和管理 (重复度: 100%)

**两者都使用**:
```typescript
const tilesetDir = path.join(this.mvtOutputDir, tilesetId);
// mvtOutputDir = workspaceBase/results/mvt
```

**删除 tileset**:

**MVTStrategyPublisher** (第212-222行):
```typescript
deleteTileset(tilesetId: string): boolean {
  const tilesetDir = path.join(this.mvtOutputDir, tilesetId);

  if (fs.existsSync(tilesetDir)) {
    fs.rmSync(tilesetDir, { recursive: true, force: true });
    console.log(`[MVT Publisher] Deleted tileset: ${tilesetId}`);
    return true;
  }

  return false;
}
```

**MVTOnDemandPublisher** (第315-334行):
```typescript
deleteTileset(tilesetId: string): boolean {
  console.log(`[MVT On-Demand Publisher] Deleting tileset: ${tilesetId}`);
  
  // Clean up GeoJSON tile index
  this.geojsonTileIndexes.delete(tilesetId);
  
  // Clean up PostGIS config
  this.postgisConfigs.delete(tilesetId);
  
  // Clean up cache
  this.tilesetMetadata.delete(tilesetId);
  
  // Remove metadata file
  const metadataPath = path.join(this.mvtOutputDir, tilesetId, 'metadata.json');
  if (fs.existsSync(metadataPath)) {
    fs.rmSync(path.join(this.mvtOutputDir, tilesetId), { recursive: true, force: true });
  }
  
  return true;
}
```

**重复度**: 🟡 **70%**
- ✅ 都删除磁盘目录
- ⚠️ OnDemand 额外清理内存缓存

---

### 6. 单例模式 (重复度: 100%)

**MVTStrategyPublisher** (第29-44行):
```typescript
static getInstance(workspaceBase: string, db?: Database.Database): MVTStrategyPublisher {
  if (!MVTStrategyPublisher.instance) {
    console.log('[MVT Strategy Publisher] Creating new singleton instance');
    MVTStrategyPublisher.instance = new MVTStrategyPublisher(workspaceBase, db);
  } else {
    console.log('[MVT Strategy Publisher] Reusing existing singleton instance');
  }
  return MVTStrategyPublisher.instance;
}

static resetInstance(): void {
  MVTStrategyPublisher.instance = null;
}
```

**MVTOnDemandPublisher** (第101-116行):
```typescript
static getInstance(workspaceBase?: string, cacheSize: number = 10000): MVTOnDemandPublisher {
  if (!MVTOnDemandPublisher.instance) {
    if (!workspaceBase) {
      throw new Error('MVTOnDemandPublisher not initialized. Call getInstance(workspaceBase) first.');
    }
    MVTOnDemandPublisher.instance = new MVTOnDemandPublisher(workspaceBase, cacheSize);
  }
  return MVTOnDemandPublisher.instance;
}

static resetInstance(): void {
  MVTOnDemandPublisher.instance = null;
}
```

**重复度**: 🟢 **100%** - 完全相同的单例模式实现

---

### 7. listTilesets 方法 (重复度: 50%)

**MVTStrategyPublisher** (第174-193行):
```typescript
listTilesets(): Array<{ tilesetId: string; metadata: MVTPublishMetadata }> {
  if (!fs.existsSync(this.mvtOutputDir)) {
    return [];
  }

  const tilesets: Array<{ tilesetId: string; metadata: MVTPublishMetadata }> = [];
  const entries = fs.readdirSync(this.mvtOutputDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const metadataPath = path.join(this.mvtOutputDir, entry.name, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        tilesets.push({ tilesetId: entry.name, metadata });
      }
    }
  }

  return tilesets;
}
```

**MVTOnDemandPublisher** (第339-347行):
```typescript
listTilesets(): Array<{ tilesetId: string; metadata: MVTPublishMetadata }> {
  const result: Array<{ tilesetId: string; metadata: MVTPublishMetadata }> = [];
  
  this.tilesetMetadata.forEach((metadata, tilesetId) => {
    result.push({ tilesetId, metadata });
  });
  
  return result;
}
```

**差异**:
- Strategy: 从磁盘扫描
- OnDemand: 从内存缓存读取

**问题**: OnDemand 的实现可能不完整（如果服务重启后，内存缓存为空）

---

## 📈 重复代码统计

### 按代码行数统计

| 模块 | OnDemand 行数 | Strategy 行数 | 重复行数 | 重复率 |
|------|--------------|--------------|---------|--------|
| GeoJSON 处理 | ~80 | ~100 | ~75 | 90% |
| PostGIS 处理 | ~60 | ~80 | ~55 | 85% |
| 元数据管理 | ~30 | ~40 | ~20 | 60% |
| 工具方法 | ~20 | ~20 | ~20 | 100% |
| 单例/初始化 | ~30 | ~30 | ~30 | 100% |
| **总计** | **~220** | **~270** | **~200** | **~74%** |

### 按功能模块统计

| 功能 | 是否重复 | 重复程度 | 说明 |
|------|---------|---------|------|
| geojson-vt 调用 | ✅ | 100% | 完全相同 |
| vt-pbf 转换 | ✅ | 100% | 完全相同 |
| PostGISTileGenerator 调用 | ✅ | 100% | 共享代码 |
| 元数据 JSON 序列化 | ✅ | 100% | 完全相同 |
| 目录创建逻辑 | ✅ | 100% | 完全相同 |
| tileId 生成算法 | ✅ | 100% | 完全相同 |
| 缓存机制 | ⚠️ | 50% | 相似但实现不同 |
| 错误处理模式 | ⚠️ | 70% | 相似但不完全相同 |
| 日志记录 | ⚠️ | 60% | 格式略有不同 |

---

## 🎯 关键发现

### 1. **核心瓦片生成逻辑 100% 重复**

两个 Publisher 在以下方面完全相同：
```typescript
// 1. GeoJSON → geojson-vt → tile index
const tileIndex = geojsonvt(featureCollection, options);

// 2. Tile → PBF 转换
const pbf = vtPbf.fromGeojsonVt(layers, { version: 2, extent });
return Buffer.from(pbf);

// 3. PostGIS → ST_AsMVT
const result = await postgisGenerator.generateTile(pool, z, x, y, query, options);
return result.tileBuffer;
```

**这些代码在两个地方都存在，只是封装方式不同！**

---

### 2. **策略模式 vs 直接实现的本质区别**

**MVTStrategyPublisher**:
```
Publisher (路由) → Strategy (实现) → 共享工具类
```

**MVTOnDemandPublisher**:
```
Publisher (路由 + 实现) → 共享工具类
```

**问题**: OnDemand Publisher 把 Strategy 的职责也承担了，导致代码重复

---

### 3. **缓存策略的差异是唯一真正的区别**

| 缓存类型 | Strategy | OnDemand | 价值 |
|---------|----------|----------|------|
| Tile Index | ✅ Map缓存 | ✅ Map缓存 | 相同 |
| Tile Result (PBF) | ❌ 无 | ✅ LRU (10,000) | **OnDemand 优势** |
| Metadata | ❌ 每次读磁盘 | ✅ 内存缓存 | **OnDemand 优势** |
| Connection Pool | ✅ 通过 PoolManager | ✅ 通过 PoolManager | 相同（共享） |

**结论**: OnDemand Publisher 的唯一独特价值是 **LRU 瓦片缓存** 和 **元数据内存缓存**

---

### 4. **共享代码已经存在但未充分利用**

**已共享的代码**:
- ✅ `PostGISTileGenerator` (PostGIS 瓦片生成)
- ✅ `PostGISPoolManager` (连接池管理)
- ✅ `BaseMVTPublisher` (基类)

**应该共享但未共享的代码**:
- ❌ GeoJSON → tile index 创建逻辑
- ❌ Tile → PBF 转换逻辑
- ❌ 元数据序列化/反序列化
- ❌ tileId 生成算法
- ❌ 目录管理逻辑

---

## 💡 优化建议

### 方案 A: 提取共享工具类 (推荐)

创建 `MVTCoreUtils` 或 `MVTTileEngine`:

```typescript
class MVTTileEngine {
  // 1. GeoJSON 处理
  static createTileIndex(featureCollection: any, options: MVTTileOptions): GeoJSONVT {
    return geojsonvt(featureCollection, {
      maxZoom: options.maxZoom,
      extent: options.extent,
      tolerance: options.tolerance,
      buffer: options.buffer
    });
  }

  static tileToPBF(tile: any, extent: number, layerName: string = 'default'): Buffer {
    const layers: any = {};
    layers[layerName] = {
      features: tile.features,
      extent: extent,
      version: 2
    };
    const pbf = vtPbf.fromGeojsonVt(layers, { version: 2, extent });
    return Buffer.from(pbf);
  }

  // 2. PostGIS 处理 (已经是共享的)
  // 使用 PostGISTileGenerator

  // 3. 元数据管理
  static saveMetadata(outputDir: string, tilesetId: string, metadata: any): void {
    const tilesetDir = path.join(outputDir, tilesetId);
    if (!fs.existsSync(tilesetDir)) {
      fs.mkdirSync(tilesetDir, { recursive: true });
    }
    const metadataPath = path.join(tilesetDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  static loadMetadata(outputDir: string, tilesetId: string): any | null {
    const metadataPath = path.join(outputDir, tilesetId, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    }
    return null;
  }

  // 4. tileId 生成
  static generateTilesetId(prefix: string = 'mvt'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
```

**好处**:
- ✅ 消除 90% 的重复代码
- ✅ 单一职责，易于测试
- ✅ 两个 Publisher 都可以使用

---

### 方案 B: OnDemand Publisher 继承 Strategy Publisher

```typescript
class MVTOnDemandPublisher extends MVTStrategyPublisher {
  private tileCache: TileCache;  // LRU 缓存
  private metadataCache: Map<string, MVTPublishMetadata>;

  constructor(workspaceBase: string, cacheSize: number = 10000) {
    super(workspaceBase);
    this.tileCache = new InMemoryTileCache(cacheSize);
    this.metadataCache = new Map();
  }

  // 重写 getTile 添加缓存
  async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
    const cacheKey = `${tilesetId}/${z}/${x}/${y}`;
    
    // 先查 LRU 缓存
    const cached = this.tileCache.get(cacheKey);
    if (cached) return cached;
    
    // 调用父类方法
    const tile = await super.getTile(tilesetId, z, x, y);
    
    // 缓存结果
    if (tile) this.tileCache.set(cacheKey, tile);
    
    return tile;
  }
}
```

**好处**:
- ✅ 代码复用最大化
- ✅ 清晰的继承关系
- ⚠️ 需要重构 Strategy Publisher 以支持扩展

---

### 方案 C: 合并为一个 Publisher (激进)

保留 MVTStrategyPublisher，将 OnDemand 的缓存功能整合进去：

```typescript
class UnifiedMVTPublisher extends BaseMVTPublisher {
  private strategies: Map<DataSourceType, MVTTileGenerationStrategy>;
  private tileCache: TileCache;  // 新增
  private metadataCache: Map<string, MVTPublishMetadata>;  // 新增

  // 使用策略模式 + 缓存
}
```

**好处**:
- ✅ 彻底消除重复
- ⚠️ 需要大规模重构
- ⚠️ 风险较高

---

## 📋 总结

### 重复代码清单

| # | 重复代码 | 出现位置 | 重复次数 | 建议 |
|---|---------|---------|---------|------|
| 1 | `geojsonvt()` 调用 | OnDemand + GeoJSONStrategy | 2 | 提取到工具类 |
| 2 | `vtPbf.fromGeojsonVt()` | OnDemand + GeoJSONStrategy | 2 | 提取到工具类 |
| 3 | `PostGISTileGenerator.generateTile()` | OnDemand + PostGISStrategy | 2 | ✅ 已共享 |
| 4 | 元数据 JSON 序列化 | OnDemand + GeoJSONStrategy + PostGISStrategy | 3 | 提取到工具类 |
| 5 | 目录创建逻辑 | OnDemand + 所有 Strategies | 4+ | 提取到基类或工具类 |
| 6 | tileId 生成算法 | OnDemand + 所有 Strategies | 4+ | 提取到工具类 |
| 7 | 单例模式实现 | OnDemand + Strategy | 2 | 提取为 mixin 或装饰器 |
| 8 | 文件读取和解析 | OnDemand + GeoJSONStrategy | 2 | 提取到工具类 |

### 最终建议

**立即执行**:
1. ✅ 创建 `MVTTileEngine` 工具类，提取共享逻辑
2. ✅ 让两个 Publisher 都使用这个工具类
3. ✅ 预计可减少 **60-70%** 的代码重复

**中期优化**:
4. 🔄 评估是否需要保留两个 Publisher
5. 🔄 如果 OnDemand 的缓存价值不大，考虑合并
6. 🔄 如果都有价值，保持分离但共享核心逻辑

**长期目标**:
7. 📈 建立代码审查机制，防止新的重复代码产生
8. 📈 定期运行代码重复检测工具

---

**分析者**: AI Assistant  
**相关文档**: 
- [MVT-PUBLISHER-UNIFICATION-ANALYSIS.md](./MVT-PUBLISHER-UNIFICATION-ANALYSIS.md)
- [CLEANUP-GEOJSON-MEMORY-DEAD-CODE.md](./CLEANUP-GEOJSON-MEMORY-DEAD-CODE.md)
