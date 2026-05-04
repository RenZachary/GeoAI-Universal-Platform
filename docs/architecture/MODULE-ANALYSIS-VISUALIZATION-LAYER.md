# 空间分析与可视化层详细设计

## 1. 空间分析层 (Spatial Analysis Layer)

### 1.1 模块职责

- 提供常见空间分析功能
- 基于Turf.js和GDAL实现
- 支持多数据源联合分析
- **注意**: 具体的分析方法实现在DataAccessor中，Analyzer只负责编排

### 1.2 AnalyzerFactory（分析器工厂）

```typescript
class AnalyzerFactory {
  private accessorFactory: DataAccessorFactory;
  
  /**
   * 创建分析器实例
   */
  create(type: AnalysisType): SpatialAnalyzer {
    switch (type) {
      case 'buffer':
        return new BufferAnalyzer(this.accessorFactory);
      case 'overlay':
        return new OverlayAnalyzer(this.accessorFactory);
      case 'statistics':
        return new StatisticsAnalyzer(this.accessorFactory);
      case 'heatmap':
        return new HeatmapAnalyzer(this.accessorFactory);
      default:
        throw new Error(`Unsupported analysis type: ${type}`);
    }
  }
}

type AnalysisType = 'buffer' | 'overlay' | 'statistics' | 'heatmap';

interface SpatialAnalyzer {
  execute(data: NativeData | NativeData[], params: any): Promise<NativeData>;
}
```

### 1.3 BufferAnalyzer（缓冲区分析器）

详见 [MODULE-DATA-ACCESS-LAYER.md](./MODULE-DATA-ACCESS-LAYER.md) 中的实现。

**核心逻辑**:
```typescript
class BufferAnalyzer implements SpatialAnalyzer {
  private accessorFactory: DataAccessorFactory;
  
  async execute(data: NativeData, params: any): Promise<NativeData> {
    const accessor = this.accessorFactory.createAccessor(data.type, data.reference);
    return await accessor.buffer(params.distance, params.unit);
  }
}
```

### 1.4 OverlayAnalyzer（叠加分析器）

```typescript
class OverlayAnalyzer implements SpatialAnalyzer {
  private accessorFactory: DataAccessorFactory;
  
  async execute(data: NativeData | NativeData[], params: any): Promise<NativeData> {
    if (!Array.isArray(data) || data.length < 2) {
      throw new Error('Overlay analysis requires at least two datasets');
    }
    
    const data1 = data[0];
    const data2 = data[1];
    const operation = params.operation; // 'intersect' | 'union' | 'difference'
    
    // 通过工厂获取Accessor，由Accessor处理跨数据源逻辑
    const accessor1 = this.accessorFactory.createAccessor(data1.type, data1.reference);
    
    switch (operation) {
      case 'intersect':
        return await accessor1.intersect(data2);
      case 'union':
        return await accessor1.union(data2);
      case 'difference':
        return await accessor1.difference(data2);
      default:
        throw new Error(`Unsupported overlay operation: ${operation}`);
    }
  }
}
```

### 1.5 StatisticsAnalyzer（统计分析器）

```typescript
class StatisticsAnalyzer implements SpatialAnalyzer {
  private accessorFactory: DataAccessorFactory;
  
  async execute(data: NativeData, params: any): Promise<NativeData> {
    const accessor = this.accessorFactory.createAccessor(data.type, data.reference);
    return await accessor.calculateStatistics(params.field);
  }
}

interface StatisticsResult {
  area?: {
    count: number;
    min: number;
    max: number;
    mean: number;
    sum: number;
  };
  field?: {
    fieldName: string;
    count: number;
    min: number;
    max: number;
    mean: number;
    sum: number;
  };
  totalFeatures: number;
}
```

### 1.6 HeatmapAnalyzer（热力图分析器）

```typescript
class HeatmapAnalyzer implements SpatialAnalyzer {
  private accessorFactory: DataAccessorFactory;
  
  async execute(data: NativeData, params: any): Promise<NativeData> {
    const accessor = this.accessorFactory.createAccessor(data.type, data.reference);
    
    // 加载为GeoJSON进行热力图计算
    const loader = new UniversalDataLoader(this.accessorFactory);
    const geojson = await loader.loadAsGeoJSON(data);
    
    // 提取点坐标和强度
    const points = this.extractPoints(geojson, params.intensityField);
    
    // 生成网格密度
    const gridData = this.calculateDensity(points, params.radius);
    
    // 转换为GeoJSON
    const heatmapGeoJSON = this.gridToGeoJSON(gridData);
    
    // 保存结果
    return await loader.saveAs(heatmapGeoJSON, 'geojson');
  }
  
  private extractPoints(geojson: GeoJSON, intensityField?: string): Point[] {
    return geojson.features
      .filter(f => f.geometry.type === 'Point')
      .map(f => ({
        coordinates: f.geometry.coordinates,
        intensity: intensityField ? f.properties?.[intensityField] || 1 : 1,
      }));
  }
  
  private calculateDensity(points: Point[], radius: number): GridData {
    // 核密度估计算法
    // ...
  }
}
```

---

## 2. 可视化服务层 (Visualization Service Layer)

### 2.1 模块职责

- 发布MVT服务（矢量数据）
- 发布WMS服务（影像数据）
- 生成热力图数据
- 管理服务的生命周期（过期清理）

### 2.2 VisualizationFactory（可视化服务工厂）

```typescript
class VisualizationFactory {
  /**
   * 创建可视化服务
   */
  createService(type: VisualizationType): VisualizationService {
    switch (type) {
      case 'mvt':
        return new MVTService();
      case 'wms':
        return new WMSService();
      case 'heatmap':
        return new HeatmapService();
      default:
        throw new Error(`Unsupported visualization type: ${type}`);
    }
  }
}

type VisualizationType = 'mvt' | 'wms' | 'heatmap';

interface VisualizationService {
  publish(data: NativeData): Promise<ServiceMetadata>;
  unpublish(serviceId: string): Promise<void>;
}
```

### 2.3 MVTService（MVT服务）

```typescript
class MVTService implements VisualizationService {
  private tileCache: Map<string, Buffer> = new Map();
  private serviceRegistry: MVTServiceRegistry;
  
  /**
   * 发布MVT服务
   */
  async publish(data: NativeData): Promise<MVTServiceMetadata> {
    const serviceId = `mvt_${Date.now()}`;
    
    // 加载数据为GeoJSON
    const loader = new UniversalDataLoader(DataAccessorFactory);
    const geojson = await loader.loadAsGeoJSON(data);
    
    // 生成瓦片索引
    const tileIndex = geojsonVt(geojson, {
      maxZoom: 18,
      extent: 4096,
    });
    
    // 注册服务
    const metadata: MVTServiceMetadata = {
      serviceId,
      type: 'mvt',
      bbox: this.calculateBBox(geojson),
      minZoom: 0,
      maxZoom: 18,
      tileUrlTemplate: `/api/visualization/mvt/${serviceId}/{z}/{x}/{y}`,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),  // TTL 24小时
    };
    
    this.serviceRegistry.register(metadata);
    
    // 缓存tileIndex用于后续瓦片请求
    this.tileCache.set(serviceId, tileIndex);
    
    return metadata;
  }
  
  /**
   * 获取瓦片（带缓存）
   */
  async getTile(serviceId: string, z: number, x: number, y: number): Promise<Buffer> {
    const cacheKey = `${serviceId}_${z}_${x}_${y}`;
    
    // 检查缓存
    if (this.tileCache.has(cacheKey)) {
      return this.tileCache.get(cacheKey)!;
    }
    
    // 生成瓦片
    const tileIndex = this.tileCache.get(serviceId);
    if (!tileIndex) {
      throw new Error(`Service not found: ${serviceId}`);
    }
    
    const tile = tileIndex.getTile(z, x, y);
    const pbf = vtpbf.fromGeojsonVt({ layer: tile });
    
    // 缓存瓦片（限制缓存大小）
    if (this.tileCache.size < 10000) {  // 最多缓存10000个瓦片
      this.tileCache.set(cacheKey, pbf);
    }
    
    return pbf;
  }
  
  /**
   * 取消发布服务并清理缓存
   */
  async unpublish(serviceId: string): Promise<void> {
    // 清理该服务的所有瓦片缓存
    const keysToDelete = [];
    for (const key of this.tileCache.keys()) {
      if (key.startsWith(serviceId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.tileCache.delete(key));
    
    // 从注册表中移除
    this.serviceRegistry.unregister(serviceId);
  }
  
  private calculateBBox(geojson: GeoJSON): BBox {
    // 计算边界框
    return turf.bbox(geojson);
  }
}
```

**MVT瓦片缓存策略**:

1. **内存缓存**: 使用Map存储常用瓦片，限制最大数量（如10000个）
2. **LRU淘汰**: 当缓存满时，淘汰最少使用的瓦片
3. **TTL过期**: 服务注册时设置TTL（默认24小时），到期自动清理
4. **主动清理**: 用户删除服务或任务完成时立即清理

interface MVTServiceMetadata extends ServiceMetadata {
  type: 'mvt';
  bbox: BBox;
  minZoom: number;
  maxZoom: number;
  tileUrlTemplate: string;
  createdAt: Date;
  expiresAt?: Date;
}
```

---

### 2.4 WMSService（WMS服务）

```typescript
class WMSService implements VisualizationService {
  private serviceRegistry: WMSServiceRegistry;
  
  async publish(data: NativeData): Promise<WMSServiceMetadata> {
    if (data.type !== 'tif') {
      throw new Error('WMS service only supports raster data (TIF)');
    }
    
    const serviceId = `wms_${Date.now()}`;
    
    // 读取TIF元数据
    const tiff = await fromArrayBuffer(await fs.readFile(data.reference.path!));
    const image = await tiff.getImage();
    
    const metadata: WMSServiceMetadata = {
      serviceId,
      type: 'wms',
      bbox: image.getBoundingBox(),
      crs: 'EPSG:4326',
      imageUrlTemplate: `/api/visualization/wms/${serviceId}?width={width}&height={height}&bbox={bbox}`,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),  // TTL 24小时
    };
    
    this.serviceRegistry.register(metadata);
    
    return metadata;
  }
  
  /**
   * 获取WMS图片（带尺寸限制）
   */
  async getImage(
    serviceId: string,
    width: number,
    height: number,
    bbox: string
  ): Promise<Buffer> {
    // 限制图片最大尺寸，防止内存溢出
    const MAX_WIDTH = 4096;
    const MAX_HEIGHT = 4096;
    
    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
      throw new Error(`Image size exceeds limit: max ${MAX_WIDTH}x${MAX_HEIGHT}`);
    }
    
    // 渲染图片逻辑
    // ...
  }
  
  /**
   * 取消发布服务
   */
  async unpublish(serviceId: string): Promise<void> {
    this.serviceRegistry.unregister(serviceId);
  }
}

interface WMSServiceMetadata extends ServiceMetadata {
  type: 'wms';
  bbox: BBox;
  crs: string;
  imageUrlTemplate: string;
  createdAt: Date;
  expiresAt?: Date;
}

interface WMSParams {
  width: number;
  height: number;
  bbox: string;  // minX,minY,maxX,maxY
  crs?: string;
  format?: 'png' | 'jpeg';
}
```

### 2.5 HeatmapService（热力图服务）

```typescript
class HeatmapService implements VisualizationService {
  /**
   * 生成热力图GeoJSON
   * 注意：热力图不发布为服务，直接返回GeoJSON
   */
  async generateHeatmapGeoJSON(
    data: NativeData, 
    options: HeatmapOptions
  ): Promise<NativeData> {
    const analyzer = new HeatmapAnalyzer(DataAccessorFactory);
    return await analyzer.execute(data, options);
  }
}

interface HeatmapOptions {
  radius: number;        // 热力半径（米）
  intensityField?: string;  // 强度字段
}
```

### 2.6 服务注册与清理

```typescript
interface ServiceRegistry {
  register(service: ServiceMetadata): void;
  unregister(serviceId: string): void;
  getService(serviceId: string): ServiceMetadata | undefined;
  cleanupExpired(): void;
}

class MVTServiceRegistry implements ServiceRegistry {
  private services: Map<string, ServiceEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;
  
  constructor() {
    // 启动定期清理任务（每小时检查一次）
    this.startCleanupTask(3600000);
  }
  
  register(service: MVTServiceMetadata): void {
    this.services.set(service.serviceId, {
      service,
      createdAt: Date.now(),
      expiresAt: service.expiresAt?.getTime() || Date.now() + 86400000,
      accessCount: 0,
    });
  }
  
  unregister(serviceId: string): void {
    this.services.delete(serviceId);
  }
  
  getService(serviceId: string): MVTServiceMetadata | undefined {
    const entry = this.services.get(serviceId);
    if (entry) {
      entry.accessCount++;
      return entry.service as MVTServiceMetadata;
    }
    return undefined;
  }
  
  async cleanupExpired(): Promise<void> {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [id, entry] of this.services.entries()) {
      if (now > entry.expiresAt) {
        await this.unpublishService(entry.service);
        this.services.delete(id);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired services`);
    }
  }
  
  /**
   * 启动定期清理任务
   */
  private startCleanupTask(interval: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired().catch(err => {
        console.error('Service cleanup failed:', err);
      });
    }, interval);
  }
  
  /**
   * 停止清理任务
   */
  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
  
  private async unpublishService(service: ServiceMetadata): Promise<void> {
    // 清理服务资源（瓦片缓存、临时文件等）
    console.log(`Unpublishing service: ${service.serviceId}`);
    // ...
  }
}

interface ServiceEntry {
  service: ServiceMetadata;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
}
```

---

## 3. 服务发布规范

### 3.1 矢量数据 → MVT服务

- **适用**: Shapefile, GeoJSON, PostGIS矢量数据
- **优势**: 瓦片化，前端加载快，支持缩放
- **TTL**: 24小时自动过期

### 3.2 影像数据 → WMS服务

- **适用**: TIF栅格数据
- **优势**: 按需渲染，支持多种投影
- **TTL**: 24小时自动过期

### 3.3 热力图 → GeoJSON

- **适用**: 点数据密度可视化
- **优势**: 前端直接渲染，无需服务端瓦片
- **不发布服务**: 直接返回GeoJSON数据

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
