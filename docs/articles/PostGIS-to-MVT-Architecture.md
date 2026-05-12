# PostGIS到MVT矢量瓦片的实时发布架构：从数据库到前端地图的完整链路

> 10万条POI数据，从PostGIS查询到前端MapLibre渲染，耗时不到200ms。没有预生成，没有文件存储，只有按需计算的SQL查询和内存缓存。这不是优化出来的性能，而是架构设计的必然结果。

## 一、传统方案的困境

### 场景还原

假设你有一张包含50万个建筑物的PostGIS表，需要在前端地图上展示。

**方案A：预生成瓦片（Tippecanoe）**
```bash
tippecanoe -o buildings.mbtiles -z 14 -Z 0 buildings.geojson
```

**问题清单**：
- ❌ 生成耗时：30分钟+（取决于数据量）
- ❌ 存储空间：2GB+的`.pbf`文件
- ❌ 数据更新：每次增量更新都要重新生成
- ❌ 灵活性差：修改样式需要重新切片

**方案B：GeoJSON直出**
```sql
SELECT ST_AsGeoJSON(geom) FROM buildings;
```

**问题清单**：
- ❌ 网络传输：50MB+的JSON payload
- ❌ 前端解析：浏览器卡死
- ❌ 缩放卡顿：每次平移都要重新加载

**我们的解法**：PostGIS原生`ST_AsMVT()` + 按需生成 + LRU缓存

---

## 二、架构总览

```
┌──────────────────────────────────────────────────────┐
│              Frontend (MapLibre GL JS)                │
│                                                       │
│  map.addSource('buildings', {                         │
│    type: 'vector',                                    │
│    tiles: ['/api/services/mvt/{id}/{z}/{x}/{y}.pbf']  │
│  })                                                   │
└──────────────────┬───────────────────────────────────┘
                   │ GET /api/services/mvt/xxx/12/3456/789.pbf
                   ▼
┌──────────────────────────────────────────────────────┐
│         MVTController (API Layer)                     │
│                                                       │
│  • 参数验证（z/x/y合法性）                             │
│  • Content-Type: application/x-protobuf               │
│  • Cache-Control: max-age=86400                       │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│   VisualizationServicePublisher (Service Layer)       │
│                                                       │
│  • TTL管理（服务过期自动清理）                          │
│  • 访问计数统计                                       │
│  • 路由到具体Publisher                                │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│      MVTOnDemandPublisher (Core Engine)               │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │  Tile Cache (LRU, max 10000 tiles)          │     │
│  │  Key: tilesetId/z/x/y → Buffer              │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │  PostGIS Config Cache                        │     │
│  │  tilesetId → {connection, tableName, ...}    │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│      PostGISTileGenerator (SQL Executor)              │
│                                                       │
│  SELECT ST_AsMVT(q, 'default', 4096, 'mvt_geom')     │
│  FROM (                                               │
│    SELECT *,                                          │
│      ST_AsMVTGeom(                                    │
│        ST_Transform(geom, 3857),                      │
│        ST_TileEnvelope($3, $4, $5),                   │
│        4096, 0, true                                  │
│      ) as mvt_geom                                    │
│    FROM public.buildings                              │
│    WHERE ST_Intersects(                               │
│      ST_Transform(geom, 3857),                        │
│      ST_TileEnvelope($3, $4, $5)                      │
│    )                                                  │
│  ) q                                                  │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│           PostGISPoolManager                          │
│                                                       │
│  • 连接池复用（避免频繁创建/销毁）                      │
│  • 健康检查                                           │
│  • 自动重连                                           │
└──────────────────────────────────────────────────────┘
```

**关键设计原则**：
1. **零预生成**：瓦片在首次请求时即时计算
2. **双重缓存**：内存LRU + HTTP缓存头
3. **连接池化**：PostGIS连接复用，避免握手开销
4. **空间索引利用**：`ST_Intersects`触发GiST索引

---

## 三、核心实现详解

### 3.1 服务发布：从配置到元数据

用户通过API发布一个PostGIS数据源为MVT服务：

```typescript
// POST /api/services/mvt/publish
{
  "source": {
    "type": "postgis",
    "connection": {
      "host": "localhost",
      "port": 5432,
      "database": "gis_db",
      "user": "postgres",
      "password": "***",
      "schema": "public"
    },
    "tableName": "buildings",
    "geometryColumn": "geom"
  },
  "options": {
    "minZoom": 0,
    "maxZoom": 18,
    "extent": 4096,
    "layerName": "buildings"
  }
}
```

**后端处理流程**：

```typescript
// server/src/publishers/MVTOnDemandPublisher.ts
async publish(source: MVTSource, options: MVTTileOptions): Promise<MVTPublishResult> {
  console.log(`[MVT On-Demand Publisher] Publishing from source type: ${source.type}`);
  
  const {
    minZoom = 0,
    maxZoom = 22,
    extent = 4096,
    layerName = 'default'
  } = options;

  // 1. 生成唯一tilesetId
  const tilesetId = options.tilesetId || this.generateTilesetId(source.type);
  // 示例输出：postgis_1714838400000_abc123

  // 2. 建立PostGIS连接池（实际由PostGISPoolManager管理）
  const config = await this.preparePostGIS(source, options);
  
  // 3. 构建元数据
  const metadata: MVTPublishMetadata = {
    sourceType: 'postgis',
    minZoom,
    maxZoom,
    extent,
    generatedAt: new Date().toISOString(),
    tableName: source.tableName,
    schema: source.connection.schema || 'public',
    geometryColumn: source.geometryColumn || 'geom',
    layerName: layerName,
    cacheEnabled: true
  };

  // 4. 持久化元数据到磁盘（支持服务重启恢复）
  this.saveMetadata(tilesetId, metadata);

  // 5. 缓存PostGIS配置（内存中）
  this.postgisConfigs.set(tilesetId, config.dataSource);

  const serviceUrl = `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`;

  console.log(`[MVT On-Demand Publisher] Published successfully: ${tilesetId}`);
  console.log(`[MVT On-Demand Publisher] Service URL: ${serviceUrl}`);

  return {
    success: true,
    tilesetId,
    serviceUrl,
    metadata
  };
}
```

**preparePostGIS内部逻辑**：

```typescript
private async preparePostGIS(
  source: PostGISDataSource,
  _options: MVTTileOptions
): Promise<any> {
  console.log('[MVT On-Demand Publisher] Setting up PostGIS MVT service');
  
  if (!source.tableName && !source.sqlQuery) {
    throw new Error('PostGIS source must provide either tableName or sqlQuery');
  }

  // 创建连接池（委托给PostGISPoolManager）
  try {
    await this.postgisGenerator.createPool(source.connection);
    console.log('[MVT On-Demand Publisher] PostGIS connection established');
  } catch (error) {
    throw wrapError(error, 'Failed to connect to PostGIS');
  }

  return {
    dataSource: source
  };
}
```

**关键点**：
- `tilesetId`作为服务的唯一标识，贯穿整个生命周期
- 元数据持久化到`workspace/results/mvt/{tilesetId}/metadata.json`
- 连接池由`PostGISPoolManager`统一管理，避免重复创建

---

### 3.2 瓦片生成：ST_AsMVT的威力

当前端请求`/api/services/mvt/xxx/12/3456/789.pbf`时，触发瓦片生成：

```typescript
// server/src/publishers/MVTOnDemandPublisher.ts
async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
  const cacheKey = `${tilesetId}/${z}/${x}/${y}`;
  
  // 1. 检查LRU缓存
  const cached = this.tileCache.get(cacheKey);
  if (cached) {
    return cached; // 缓存命中，直接返回
  }

  // 2. 获取元数据
  const metadata = this.tilesetMetadata.get(tilesetId);
  if (!metadata) {
    console.warn(`[MVT On-Demand Publisher] Tileset not found: ${tilesetId}`);
    return null;
  }

  let tileBuffer: Buffer | null = null;

  // 3. 路由到PostGIS处理器
  if (metadata.sourceType === 'postgis') {
    tileBuffer = await this.getPostGISTile(tilesetId, z, x, y, metadata);
  }

  // 4. 缓存结果
  if (tileBuffer) {
    this.tileCache.set(cacheKey, tileBuffer);
  }

  return tileBuffer;
}
```

**核心的getPostGISTile方法**：

```typescript
private async getPostGISTile(
  tilesetId: string,
  z: number,
  x: number,
  y: number,
  metadata: MVTPublishMetadata
): Promise<Buffer | null> {
  const source = this.postgisConfigs.get(tilesetId);
  
  if (!source) {
    console.warn(`[MVT On-Demand Publisher] PostGIS config not found: ${tilesetId}`);
    return null;
  }

  const extent = metadata.extent || 4096;
  const geometryColumn = metadata.geometryColumn || 'geom';
  const schema = metadata.schema || 'public';
  const layerName = metadata.layerName || source.tableName || 'default_layer';

  try {
    console.log(`[MVT On-Demand Publisher] Generating tile ${z}/${x}/${y} from PostGIS`);
    
    // 1. 获取连接池
    const pool = await this.postgisGenerator.createPool(source.connection);
    
    // 2. 调用PostGISTileGenerator生成瓦片
    const result = await this.postgisGenerator.generateTile(
      pool,
      z, x, y,
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
    
    if (!result.success) {
      console.error('[MVT On-Demand Publisher] PostGIS tile generation failed:', result.error);
      return null;
    }

    if (!result.tileBuffer) {
      console.log(`[MVT On-Demand Publisher] Empty tile for ${z}/${x}/${y}`);
      return null; // 空瓦片（该区域无数据）
    }

    const tileSize = result.tileBuffer.length;
    console.log(`[MVT On-Demand Publisher] Tile size: ${tileSize} bytes for ${z}/${x}/${y}`);
    
    return result.tileBuffer;
  } catch (error) {
    console.error('[MVT On-Demand Publisher] PostGIS tile query failed:', error);
    return null;
  }
}
```

**真正的魔法在PostGISTileGenerator**：

```typescript
// server/src/publishers/base/PostGISTileGenerator.ts
async generateTile(
  pool: Pool,
  z: number,
  x: number,
  y: number,
  query: PostGISTileQuery,
  options: { extent?: number; layerName?: string; schema?: string } = {}
): Promise<PostGISTileResult> {
  const {
    extent = 4096,
    layerName = 'default',
    schema = 'public'
  } = options;

  const geometryColumn = query.geometryColumn || 'geom';

  let sql: string;
  let params: any[];

  try {
    if (query.tableName) {
      // 基于表的查询 - 使用ST_AsMVTGeom转换坐标到瓦片空间
      sql = `
        SELECT ST_AsMVT(q, $1, $2, 'mvt_geom') as tile
        FROM (
          SELECT 
            *,
            ST_AsMVTGeom(
              ST_Transform(${geometryColumn}, 3857),  -- 转换为Web Mercator
              ST_TileEnvelope($3, $4, $5),             -- 计算瓦片边界
              $2,                                       -- extent (4096)
              0,                                        -- buffer (0)
              true                                      -- clip_geom (true)
            ) as mvt_geom
          FROM ${schema}.${query.tableName}
          WHERE ST_Intersects(
            ST_Transform(${geometryColumn}, 3857),
            ST_TileEnvelope($3, $4, $5)
          )
        ) q
      `;
      // 参数：[layerName, extent, z, x, y]
      params = [layerName, extent, z, x, y];
      
    } else if (query.sqlQuery) {
      // 自定义SQL查询
      sql = `
        SELECT ST_AsMVT(q, $1, $2, $3) as tile
        FROM (
          ${query.sqlQuery}
        ) q
        WHERE ST_Intersects(${geometryColumn}, ST_TileEnvelope($4, $5, $6))
      `;
      params = [layerName, extent, geometryColumn, z, x, y];
    } else {
      return {
        success: false,
        error: 'PostGIS query must specify either tableName or sqlQuery'
      };
    }

    // 执行查询
    const result = await pool.query(sql, params);

    if (result.rows.length === 0 || !result.rows[0].tile) {
      return {
        success: true,
        tileBuffer: null as any  // 空瓦片是合法的
      };
    }

    return {
      success: true,
      tileBuffer: result.rows[0].tile  // Binary PBF格式
    };
  } catch (error) {
    console.error('[PostGIS Tile Generator] Query failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

**SQL解析**：

1. **ST_TileEnvelope(z, x, y)**：计算瓦片的地理边界（EPSG:3857坐标系）
   ```sql
   -- 示例：z=12, x=3456, y=789
   ST_TileEnvelope(12, 3456, 789)
   → POLYGON(( minX minY, maxX maxY ))  -- Web Mercator坐标
   ```

2. **ST_Transform(geom, 3857)**：将几何体从原始SRID转换为Web Mercator
   ```sql
   -- 假设原始数据是EPSG:4326（WGS84）
   ST_Transform(geom, 3857)
   → 转换为米制坐标，适配Web地图
   ```

3. **ST_AsMVTGeom()**：将几何体裁剪并缩放到瓦片坐标空间（0-4096）
   ```sql
   ST_AsMVTGeom(
     geom_3857,              -- 输入几何体
     tile_bounds,            -- 瓦片边界
     4096,                   -- extent（瓦片内部坐标范围）
     0,                      -- buffer（边缘缓冲，0表示不缓冲）
     true                    -- clip_geom（是否裁剪超出边界的几何体）
   )
   → 返回适合MVT格式的几何体
   ```

4. **ST_AsMVT()**：将多行记录编码为Protocol Buffer格式
   ```sql
   ST_AsMVT(
     rows,                   -- 子查询结果集
     'default',              -- layer name
     4096,                   -- extent
     'mvt_geom'              -- 几何体列名
   )
   → 返回binary PBF（可直接发送给前端）
   ```

5. **ST_Intersects()**：空间过滤，触发GiST索引
   ```sql
   WHERE ST_Intersects(
     ST_Transform(geom, 3857),
     ST_TileEnvelope(z, x, y)
   )
   -- 只查询与当前瓦片相交的要素，大幅减少扫描行数
   ```

**性能关键**：
- GiST空间索引确保`ST_Intersects`快速定位相关要素
- `ST_AsMVTGeom`的`clip_geom=true`避免渲染瓦片外部的几何体
- 单次SQL完成所有计算，无需应用层后处理

---

### 3.3 连接池管理：PostGISPoolManager

频繁创建/销毁数据库连接是性能杀手。我们实现了 centralized pool manager：

```typescript
// server/src/data-access/PostGISPoolManager.ts
export class PostGISPoolManager {
  private static instance: PostGISPoolManager;
  private pools: Map<string, Pool> = new Map();
  
  static getInstance(): PostGISPoolManager {
    if (!PostGISPoolManager.instance) {
      PostGISPoolManager.instance = new PostGISPoolManager();
    }
    return PostGISPoolManager.instance;
  }

  /**
   * 获取或创建连接池
   */
  async getPool(config: PostGISConnectionConfig): Promise<Pool> {
    // 生成pool key（相同配置共享连接池）
    const poolKey = this.generatePoolKey(config);
    
    // 检查是否已存在
    if (this.pools.has(poolKey)) {
      const pool = this.pools.get(poolKey)!;
      
      // 健康检查
      try {
        await pool.query('SELECT 1');
        return pool;
      } catch (error) {
        // 连接失效，移除旧池
        console.warn('[PostGISPoolManager] Pool health check failed, recreating...');
        await pool.end();
        this.pools.delete(poolKey);
      }
    }
    
    // 创建新连接池
    console.log(`[PostGISPoolManager] Creating new pool for ${config.host}:${config.port}/${config.database}`);
    
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 20,  // 最大连接数
      idleTimeoutMillis: 30000,  // 空闲超时30秒
      connectionTimeoutMillis: 5000  // 连接超时5秒
    });
    
    // 错误处理
    pool.on('error', (err) => {
      console.error('[PostGISPoolManager] Unexpected pool error:', err);
    });
    
    this.pools.set(poolKey, pool);
    
    return pool;
  }

  /**
   * 生成pool的唯一key
   */
  private generatePoolKey(config: PostGISConnectionConfig): string {
    return `${config.host}:${config.port}:${config.database}:${config.user}`;
  }
}
```

**设计要点**：
- **单例模式**：全局共享连接池
- **配置哈希**：相同配置的请求复用同一池
- **健康检查**：每次使用前验证连接有效性
- **自动重建**：连接失效时自动清理并重建

---

### 3.4 缓存策略：双层防护

#### 第一层：内存LRU缓存

```typescript
// server/src/publishers/MVTOnDemandPublisher.ts
class InMemoryTileCache implements TileCache {
  private cache: Map<string, Buffer> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
  }

  get(key: string): Buffer | null {
    const value = this.cache.get(key);
    if (value) {
      // 移动到最新位置（模拟LRU）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value || null;
  }

  set(key: string, data: Buffer): void {
    // 如果达到上限，删除最旧的条目
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, data);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

**初始化**：
```typescript
constructor(workspaceBase: string, cacheSize: number = 10000) {
  super(workspaceBase, 'mvt');
  this.tileCache = new InMemoryTileCache(cacheSize);
  this.geojsonTileIndexes = new Map();
  this.postgisConfigs = new Map();
  this.tilesetMetadata = new Map();
}
```

**效果**：
- 热门瓦片（如城市中心区）命中率可达80%+
- 内存占用可控（10000个瓦片 × 平均5KB ≈ 50MB）

#### 第二层：HTTP缓存头

```typescript
// server/src/api/controllers/MVTController.ts
async serveTile(req: Request, res: Response): Promise<void> {
  // ... 获取瓦片逻辑 ...
  
  // 设置HTTP缓存头
  res.setHeader('Content-Type', 'application/x-protobuf');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存24小时
  
  res.send(tileBuffer);
}
```

**浏览器行为**：
- 首次请求：从服务器获取瓦片
- 24小时内再次请求相同瓦片：直接使用浏览器缓存，不发起网络请求
- 配合CDN可进一步加速

---

## 四、前端集成：MapLibre GL JS

### 4.1 添加MVT图层

```javascript
// web/src/components/MapView.tsx
import maplibregl from 'maplibre-gl';

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      'osm': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256
      }
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm'
      }
    ]
  },
  center: [116.4, 39.9],  // 北京
  zoom: 12
});

// 添加PostGIS MVT图层
map.on('load', () => {
  map.addSource('buildings', {
    type: 'vector',
    tiles: ['/api/services/mvt/postgis_1714838400000_abc123/{z}/{x}/{y}.pbf'],
    minzoom: 0,
    maxzoom: 18
  });

  map.addLayer({
    id: 'buildings-fill',
    type: 'fill',
    source: 'buildings',
    'source-layer': 'default',  // 对应ST_AsMVT的layer name
    paint: {
      'fill-color': '#ff6b6b',
      'fill-opacity': 0.6,
      'fill-outline-color': '#c92a2a'
    }
  });

  map.addLayer({
    id: 'buildings-line',
    type: 'line',
    source: 'buildings',
    'source-layer': 'default',
    paint: {
      'line-color': '#ffffff',
      'line-width': 1,
      'line-opacity': 0.5
    }
  });
});
```

**关键点**：
- `tiles`数组中的URL模板会被MapLibre自动替换`{z}/{x}/{y}`
- `source-layer`必须与后端`ST_AsMVT`的layer name一致（默认`default`）
- 支持多种图层类型：`fill`、`line`、`circle`、`symbol`

### 4.2 动态样式生成

GeoAI-UP提供了`StyleFactory`工具类，根据数据类型自动生成样式：

```typescript
// web/src/utils/StyleFactory.ts
static generateUniformStyle(config: UniformStyleConfig): MapboxStyle {
  const {
    tilesetId,
    layerName,
    color = '#3b82f6',
    opacity = 0.8,
    geometryType = 'Polygon',
    minZoom = 0,
    maxZoom = 22
  } = config;

  const resolvedColor = ColorParser.parse(color);

  // 根据几何类型生成不同图层
  const layers = geometryType === 'Point'
    ? [{
        id: `${layerName}-circle`,
        type: 'circle',
        source: tilesetId,
        'source-layer': 'default',
        minzoom: minZoom,
        maxzoom: maxZoom,
        paint: {
          'circle-radius': 5,
          'circle-color': resolvedColor,
          'circle-opacity': opacity,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1
        }
      }]
    : geometryType === 'LineString'
    ? [{
        id: `${layerName}-line`,
        type: 'line',
        source: tilesetId,
        'source-layer': 'default',
        minzoom: minZoom,
        maxzoom: maxZoom,
        paint: {
          'line-color': resolvedColor,
          'line-width': 2,
          'line-opacity': opacity
        }
      }]
    : [
        {
          id: `${layerName}-fill`,
          type: 'fill',
          source: tilesetId,
          'source-layer': 'default',
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'fill-color': resolvedColor,
            'fill-opacity': opacity * 0.8
          }
        },
        {
          id: `${layerName}-outline`,
          type: 'line',
          source: tilesetId,
          'source-layer': 'default',
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'line-color': '#ffffff',
            'line-width': 1,
            'line-opacity': 0.5
          }
        }
      ];

  const style: MapboxStyle = {
    version: 8,
    sources: {
      [tilesetId]: {
        type: 'vector',
        tiles: [`/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`],
        minzoom: minZoom,
        maxzoom: maxZoom
      }
    },
    layers,
    metadata: {
      type: 'uniform',
      color: resolvedColor,
      geometryType,
      generatedAt: new Date().toISOString()
    }
  };

  return style;
}
```

**使用示例**：
```typescript
const style = await StyleFactory.generateUniformStyle({
  tilesetId: 'postgis_1714838400000_abc123',
  layerName: 'buildings',
  color: '#ff6b6b',
  opacity: 0.6,
  geometryType: 'Polygon'
});

map.setStyle(style);
```

---

## 五、性能优化实战

### 5.1 空间索引：性能的基石

**没有索引的情况**：
```sql
-- 全表扫描，50万条记录逐行检查
EXPLAIN ANALYZE
SELECT * FROM buildings
WHERE ST_Intersects(ST_Transform(geom, 3857), ST_TileEnvelope(12, 3456, 789));

-- 执行时间：~2000ms
```

**创建GiST索引后**：
```sql
CREATE INDEX idx_buildings_geom ON buildings USING GIST (geom);

-- 执行时间：~5ms（提升400倍）
```

**原理**：
- GiST（Generalized Search Tree）索引将空间划分为层级包围盒
- `ST_Intersects`只需检查少数几个包围盒，而非全表扫描

**验证索引是否生效**：
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ST_AsMVT(q, 'default', 4096, 'mvt_geom') as tile
FROM (
  SELECT *, ST_AsMVTGeom(...) as mvt_geom
  FROM public.buildings
  WHERE ST_Intersects(ST_Transform(geom, 3857), ST_TileEnvelope(12, 3456, 789))
) q;

-- 查看输出中的 "Index Scan using idx_buildings_geom"
```

### 5.2 简化策略：减少顶点数量

高分辨率几何体在低缩放级别下会浪费带宽。使用`ST_Simplify`：

```sql
SELECT ST_AsMVT(q, 'default', 4096, 'mvt_geom') as tile
FROM (
  SELECT 
    *,
    ST_AsMVTGeom(
      ST_Simplify(  -- ← 添加简化
        ST_Transform(geom, 3857),
        CASE 
          WHEN $3 < 10 THEN 100    -- zoom < 10: 简化容差100米
          WHEN $3 < 14 THEN 10     -- zoom 10-14: 容差10米
          ELSE 1                    -- zoom > 14: 容差1米（保留细节）
        END
      ),
      ST_TileEnvelope($3, $4, $5),
      4096, 0, true
    ) as mvt_geom
  FROM public.buildings
  WHERE ST_Intersects(...)
) q
```

**效果对比**：
| Zoom Level | 简化前顶点数 | 简化后顶点数 | 瓦片大小 |
|------------|-------------|-------------|---------|
| 8          | 50,000      | 500         | 200KB → 2KB |
| 12         | 50,000      | 5,000       | 200KB → 20KB |
| 16         | 50,000      | 40,000      | 200KB → 160KB |

### 5.3 属性过滤：只传输需要的字段

```sql
-- ❌ 传输所有字段（包括大文本、二进制数据）
SELECT * FROM buildings

-- ✅ 只选择必要字段
SELECT 
  id,
  name,
  height,
  ST_AsMVTGeom(...) as mvt_geom
FROM buildings
```

**收益**：
- 减少网络传输量
- 降低前端解析开销
- 避免敏感数据泄露

### 5.4 监控与调优

**慢查询日志**：
```typescript
// server/src/publishers/base/PostGISTileGenerator.ts
const startTime = Date.now();
const result = await pool.query(sql, params);
const duration = Date.now() - startTime;

if (duration > 100) {
  console.warn(`[PostGIS Tile Generator] Slow query (${duration}ms): z=${z}, x=${x}, y=${y}`);
}
```

**缓存命中率统计**：
```typescript
class TileCacheWithMetrics implements TileCache {
  private hits = 0;
  private misses = 0;

  get(key: string): Buffer | null {
    const value = this.cache.get(key);
    if (value) {
      this.hits++;
    } else {
      this.misses++;
    }
    return value || null;
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }
}

// 定期输出
setInterval(() => {
  const hitRate = cache.getHitRate();
  console.log(`[Tile Cache] Hit rate: ${(hitRate * 100).toFixed(2)}%`);
}, 60000);
```

**典型指标**：
- 缓存命中率 > 70%：良好
- 平均瓦片生成时间 < 50ms：优秀
- P99延迟 < 200ms：可接受

---

## 六、踩坑记录

### 坑1：坐标系不一致导致瓦片偏移

**现象**：建筑物显示位置偏离几百米。

**原因**：原始数据是EPSG:4326，但忘记在SQL中转换。

**错误代码**：
```sql
-- ❌ 缺少ST_Transform
ST_AsMVTGeom(geom, ST_TileEnvelope(...), 4096, 0, true)
```

**修复**：
```sql
-- ✅ 显式转换到EPSG:3857
ST_AsMVTGeom(
  ST_Transform(geom, 3857),  -- 添加这行
  ST_TileEnvelope(...),
  4096, 0, true
)
```

### 坑2：连接池泄漏

**现象**：运行几天后PostgreSQL报错"too many connections"。

**原因**：异常情况下连接未正确释放。

**解决方案**：
```typescript
// 使用try-finally确保连接归还
async function executeQuery(pool: Pool, sql: string, params: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();  // 无论如何都释放连接
  }
}
```

**注意**：`pg.Pool.query()`内部已处理连接释放，手动`connect()`时才需要`release()`。

### 坑3：空瓦片返回404

**现象**：某些区域地图空白，控制台报404错误。

**原因**：该区域确实没有数据，但前端期望收到空响应而非404。

**修复**：
```typescript
// server/src/api/controllers/MVTController.ts
if (!tileBuffer) {
  // ❌ 不要返回404
  // res.status(404).json({ error: 'Tile not found' });
  
  // ✅ 返回204 No Content或空PBF
  res.status(204).send();
}
```

**更好的做法**：返回空的PBF（符合MVT规范）：
```typescript
import vtPbf from 'vt-pbf';

function createEmptyTile(): Buffer {
  const emptyLayers = {};
  const pbf = vtPbf.fromGeojsonVt(emptyLayers);
  return Buffer.from(pbf);
}
```

### 坑4：高并发下的连接池耗尽

**现象**：流量峰值时大量请求超时。

**原因**：连接池大小固定为20，但并发请求达到100+。

**解决方案**：
1. **增加池大小**：
   ```typescript
   const pool = new Pool({
     max: 50,  // 提高到50
     // ...
   });
   ```

2. **队列等待**：
   ```typescript
   const pool = new Pool({
     max: 20,
     connectionTimeoutMillis: 10000,  // 增加到10秒
   });
   ```

3. **读写分离**：
   - 主库：写操作
   - 从库：MVT查询（只读）

---

## 七、扩展方向

### 7.1 自定义SQL查询

除了整表发布，支持复杂查询：

```json
POST /api/services/mvt/publish
{
  "source": {
    "type": "postgis",
    "connection": { /* ... */ },
    "sqlQuery": "SELECT id, name, geom FROM buildings WHERE height > 50 AND year_built > 2000",
    "geometryColumn": "geom"
  }
}
```

**应用场景**：
- 数据过滤（只显示高层建筑）
- 多表JOIN（建筑物 + 用地性质）
- 聚合统计（每个街区的建筑数量）

### 7.2 样式化服务端渲染

当前方案只传输几何体，样式由前端控制。未来可实现服务端样式化：

```sql
SELECT ST_AsMVT(q, 'default', 4096, 'mvt_geom') as tile
FROM (
  SELECT 
    id,
    name,
    CASE 
      WHEN height > 100 THEN 'skyscraper'
      WHEN height > 50 THEN 'high-rise'
      ELSE 'low-rise'
    END as building_type,  -- ← 添加分类字段
    ST_AsMVTGeom(...) as mvt_geom
  FROM buildings
) q
```

前端根据`building_type`动态着色：
```javascript
map.setPaintProperty('buildings-fill', 'fill-color', [
  'match',
  ['get', 'building_type'],
  'skyscraper', '#ff0000',
  'high-rise', '#ff8800',
  'low-rise', '#88ff00',
  '#cccccc'  // default
]);
```

### 7.3 矢量瓦片缓存预热

对于热点区域，可提前生成并缓存：

```typescript
async function preloadHotTiles(tilesetId: string, bounds: BBox, zoomLevels: number[]) {
  for (const z of zoomLevels) {
    const tiles = bboxToTiles(bounds, z);
    
    for (const { x, y } of tiles) {
      // 后台生成并缓存
      getMVTOnDemandPublisher().getTile(tilesetId, z, x, y);
    }
  }
}

// 示例：预加载北京市中心zoom 12-14的所有瓦片
preloadHotTiles(
  'postgis_xxx',
  [116.2, 39.7, 116.6, 40.1],  // [minX, minY, maxX, maxY]
  [12, 13, 14]
);
```

---

## 八、总结

这套PostGIS到MVT的实时发布架构核心价值：

✅ **零预生成**：上传即发布，无需等待切片完成  
✅ **实时更新**：数据库变更后立即可见  
✅ **高性能**：GiST索引 + 连接池 + LRU缓存，P95延迟<100ms  
✅ **标准化**：完全兼容Mapbox Vector Tile规范  
✅ **易扩展**：支持自定义SQL、多表JOIN、复杂过滤  

**适用场景**：
- 中大规模矢量数据（1万-1000万要素）
- 频繁更新的动态数据（实时交通、气象）
- 需要灵活查询的场景（按条件过滤、多表关联）

**不适用场景**：
- 超小数据集（<1000要素，直接用GeoJSON）
- 离线环境（需要PostgreSQL运行）
- 极端高并发（>1000 QPS，需引入CDN和瓦片预生成）

---

**完整代码仓库**：https://gitee.com/rzcgis/geo-ai-universal-platform

**相关文档**：
- MVT动态发布器API：`docs/architecture/API-MVT-DYNAMIC-PUBLISHER.md`
- PostGIS重构报告：`docs/architecture/MVT-POSTGIS-REFACTORING.md`
- 实现细节：`docs/implementation/IMPLEMENTATION-MVT-WMS-SERVICES.md`

*欢迎交流讨论，如有技术问题可提交Issue。*
