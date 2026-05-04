# 数据接入层详细设计

## 1. 模块职责

- 统一访问不同数据源（Shapefile、GeoJSON、PostGIS、TIF）
- **保持数据原生格式**（NativeData原则）
- 提供数据读取和写入能力
- 实现空间分析方法（每种数据类型用自己的方式实现）
- 数据类型验证

---

## 2. 核心设计原则

### 2.1 NativeData原则

**核心**: 系统运行期间保持原始数据格式，严禁随意转换

- **PostGIS数据**: 直接在数据库内执行查询和分析，使用SQL（如ST_Buffer）
- **Shapefile/GeoJSON**: 保持原始文件结构，分析时加载到内存处理
- **TIF影像**: 保持原始文件，通过GDAL直接读取
- **跨数据源操作**: 仅在必要时临时转换（如GeoJSON临时入库）

### 2.2 工厂模式

每一层通过工厂类创建实例，DBAccessorFactory是数据接入层的统一入口：

```typescript
class DataAccessorFactory {
  createAccessor(type: DataType, config: DataSourceConfig): DataAccessor;
}
```

### 2.3 多态替代条件判断

每个Accessor实现自己的空间分析方法，上层调用者无需关心具体实现：

```typescript
// 上层代码
const accessor = factory.createAccessor(data.type, config);
const result = await accessor.buffer(500, 'meters');  // 不关心内部实现

// PostGISAccessor内部：执行SQL ST_Buffer
// ShapefileAccessor内部：加载→Turf.js→保存
```

### 2.4 坐标系统一处理

不同数据源可能使用不同的坐标系（CRS），需要进行统一处理：

- **读取时检测**: 每个Accessor读取数据时提取CRS信息到metadata
- **分析前转换**: 跨数据源操作时，统一转换到目标CRS（默认EPSG:4326）
- **Proj4集成**: 使用proj4库进行坐标转换
- **PostGIS特殊处理**: PostGIS数据在数据库内保持原始SRID，查询时按需转换

```typescript
interface DataMetadata {
  crs?: string;  // EPSG:4326, EPSG:3857等
  srid?: number; // PostGIS SRID
  // ... 其他元数据
}

// 示例：坐标转换
import proj4 from 'proj4';

function transformCoordinates(
  geojson: GeoJSON,
  fromCRS: string,
  toCRS: string = 'EPSG:4326'
): GeoJSON {
  proj4.defs(fromCRS, getProjDefinition(fromCRS));
  proj4.defs(toCRS, getProjDefinition(toCRS));
  
  return turf.transformRewind(geojson); // 简化示例
}
```

---

## 3. 核心接口设计

### 3.1 DataAccessor接口

```typescript
interface DataAccessor {
  // ========== 基础数据访问 ==========
  
  /**
   * 读取数据
   */
  read(query: DataQuery): Promise<NativeData>;
  
  /**
   * 写入数据
   */
  write(data: NativeData, options?: WriteOptions): Promise<void>;
  
  /**
   * 获取元数据
   */
  getMetadata(sourceId: string): Promise<DataMetadata>;
  
  /**
   * 验证数据源
   */
  validate(sourceConfig: DataSourceConfig): Promise<ValidationResult>;
  
  /**
   * 关闭连接
   */
  close(): void;
  
  // ========== 空间分析方法 ==========
  
  /**
   * 缓冲区分析
   * @param distance 缓冲距离
   * @param unit 距离单位
   */
  buffer(distance: number, unit: DistanceUnit): Promise<NativeData>;
  
  /**
   * 相交分析
   */
  intersect(other: NativeData): Promise<NativeData>;
  
  /**
   * 联合分析
   */
  union(other: NativeData): Promise<NativeData>;
  
  /**
   * 差异分析
   */
  difference(other: NativeData): Promise<NativeData>;
  
  /**
   * 统计分析
   */
  calculateStatistics(field?: string): Promise<StatisticsResult>;
}

/**
 * PostGISAccessor额外方法
 */
interface PostGISAccessor extends DataAccessor {
  /**
   * 测试数据库连接
   */
  testConnection(): Promise<boolean>;
}

interface DataQuery {
  sourceId: string;
  filter?: FilterCondition;
  fields?: string[];
  limit?: number;
  offset?: number;
}

type DistanceUnit = 'meters' | 'kilometers' | 'miles' | 'feet';
```

---

## 4. Accessor实现

### 4.1 ShapefileAccessor

```typescript
class ShapefileAccessor implements DataAccessor {
  private filePath: string;
  private workspaceManager: WorkspaceManager;
  
  constructor(config: ShapefileConfig) {
    this.filePath = config.path;
    this.workspaceManager = new WorkspaceManager();
  }
  
  async read(query: DataQuery): Promise<NativeData> {
    // 验证文件完整性
    this.validateShapefileIntegrity(this.filePath);
    
    // 读取shapefile
    const geojson = await shapefile.read(this.filePath);
    
    return {
      id: query.sourceId,
      type: 'shapefile',
      metadata: this.extractMetadata(geojson),
      reference: {
        type: 'file',
        path: this.filePath,
      },
      createdAt: new Date(),
    };
  }
  
  async buffer(distance: number, unit: DistanceUnit): Promise<NativeData> {
    // 1. 加载Shapefile为GeoJSON
    const geojson = await shapefile.read(this.filePath);
    
    // 2. 使用Turf.js执行缓冲区分析
    const buffered = turf.buffer(geojson, distance, { 
      units: this.convertUnit(unit) 
    });
    
    // 3. 保存结果为新的Shapefile
    const resultPath = this.workspaceManager.generateFilename('buffer_', '.shp');
    await this.saveAsShapefile(buffered, resultPath);
    
    return {
      id: `buffer_${Date.now()}`,
      type: 'shapefile',
      metadata: this.extractMetadata(buffered),
      reference: {
        type: 'file',
        path: resultPath,
      },
      createdAt: new Date(),
    };
  }
  
  async intersect(other: NativeData): Promise<NativeData> {
    // 加载两个Shapefile为GeoJSON
    const geo1 = await shapefile.read(this.filePath);
    const geo2 = await this.loadOtherAsGeoJSON(other);
    
    // 使用Turf.js执行相交分析
    const result = turf.intersect(geo1, geo2);
    
    // 保存结果
    const resultPath = this.workspaceManager.generateFilename('intersect_', '.shp');
    await this.saveAsShapefile(result, resultPath);
    
    return this.createResultData(resultPath, result);
  }
  
  private convertUnit(unit: DistanceUnit): turf.Units {
    const unitMap: Record<DistanceUnit, turf.Units> = {
      'meters': 'meters',
      'kilometers': 'kilometers',
      'miles': 'miles',
      'feet': 'feet',
    };
    return unitMap[unit];
  }
  
  private validateShapefileIntegrity(basePath: string): void {
    const requiredExtensions = ['.shp', '.shx', '.dbf'];
    for (const ext of requiredExtensions) {
      const filePath = basePath.replace(/\.\w+$/, ext);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing required file: ${filePath}`);
      }
    }
  }
  
  close(): void {
    // Shapefile无需关闭连接
  }
}
```

### 4.2 GeoJSONAccessor

```typescript
class GeoJSONAccessor implements DataAccessor {
  private filePath: string;
  private workspaceManager: WorkspaceManager;
  
  async read(query: DataQuery): Promise<NativeData> {
    const content = await fs.readFile(this.filePath, 'utf-8');
    const geojson = JSON.parse(content);
    
    this.validateGeoJSON(geojson);
    
    return {
      id: query.sourceId,
      type: 'geojson',
      metadata: this.extractMetadata(geojson),
      reference: {
        type: 'file',
        path: this.filePath,
      },
      createdAt: new Date(),
    };
  }
  
  async buffer(distance: number, unit: DistanceUnit): Promise<NativeData> {
    // 1. 读取GeoJSON
    const content = await fs.readFile(this.filePath, 'utf-8');
    const geojson = JSON.parse(content);
    
    // 2. 使用Turf.js执行缓冲区分析
    const buffered = turf.buffer(geojson, distance, { 
      units: this.convertUnit(unit) 
    });
    
    // 3. 保存结果
    const resultPath = this.workspaceManager.generateFilename('buffer_', '.geojson');
    await fs.writeFile(resultPath, JSON.stringify(buffered));
    
    return {
      id: `buffer_${Date.now()}`,
      type: 'geojson',
      metadata: this.extractMetadata(buffered),
      reference: {
        type: 'file',
        path: resultPath,
      },
      createdAt: new Date(),
    };
  }
  
  private validateGeoJSON(geojson: any): void {
    if (!geojson.type || !['Feature', 'FeatureCollection'].includes(geojson.type)) {
      throw new Error('Invalid GeoJSON format');
    }
  }
  
  close(): void {
    // GeoJSON无需关闭连接
  }
}
```

### 4.3 PostGISAccessor

```typescript
class PostGISAccessor implements DataAccessor {
  private pool: pg.Pool;
  private config: PostGISConfig;
  
  constructor(config: PostGISConfig) {
    this.config = config;
    this.pool = new pg.Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    });
  }
  
  /**
   * 测试数据库连接
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('PostGIS connection test failed:', error);
      return false;
    }
  }
  
  async read(query: DataQuery): Promise<NativeData> {
    const tableName = query.sourceId;
    const sql = this.buildQuery(tableName, query);
    
    const result = await this.pool.query(sql);
    
    return {
      id: query.sourceId,
      type: 'postgis',
      metadata: {
        rowCount: result.rowCount || 0,
        fields: result.fields.map(f => f.name),
      },
      reference: {
        type: 'database',
        connectionId: this.config.id,
        tableName: tableName,
      },
      createdAt: new Date(),
    };
  }
  
  async buffer(distance: number, unit: DistanceUnit): Promise<NativeData> {
    // 将距离转换为度数（PostGIS需要）
    const distanceInDegrees = this.convertToDegrees(distance, unit);
    
    // 在PostGIS中直接执行ST_Buffer，结果存入临时表
    const tempTableName = `temp_buffer_${Date.now()}`;
    const sql = `
      CREATE TABLE "${tempTableName}" AS
      SELECT ST_Buffer(geom, ${distanceInDegrees}) as geom, *
      FROM "${this.config.tableName}"
    `;
    
    await this.pool.query(sql);
    
    return {
      id: `buffer_${Date.now()}`,
      type: 'postgis',
      metadata: {
        rowCount: await this.getRowCount(tempTableName),
      },
      reference: {
        type: 'database',
        connectionId: this.config.id,
        tableName: tempTableName,
        isTemporary: true,  // 标记为临时表
      },
      createdAt: new Date(),
    };
  }
  
  async intersect(other: NativeData): Promise<NativeData> {
    // 如果other也是PostGIS，直接在数据库中执行
    if (other.type === 'postgis') {
      return await this.intersectPostGIS(other);
    }
    
    // 如果other是文件型，临时导入到PostGIS
    const tempTable = await this.importToPostGIS(other);
    const result = await this.intersectPostGIS({
      ...other,
      type: 'postgis',
      reference: {
        type: 'database',
        connectionId: this.config.id,
        tableName: tempTable,
        isTemporary: true,
      },
    });
    
    // 清理临时表
    await this.dropTable(tempTable);
    
    return result;
  }
  
  /**
   * 执行PostGIS相交分析
   */
  private async intersectPostGIS(other: NativeData): Promise<NativeData> {
    const tempTableName = `temp_intersect_${Date.now()}`;
    const sql = `
      CREATE TABLE "${tempTableName}" AS
      SELECT ST_Intersection(a.geom, b.geom) as geom, a.*, b.*
      FROM "${this.config.tableName}" a, "${other.reference.tableName}" b
      WHERE ST_Intersects(a.geom, b.geom)
    `;
    
    await this.pool.query(sql);
    
    return {
      id: `intersect_${Date.now()}`,
      type: 'postgis',
      metadata: {
        rowCount: await this.getRowCount(tempTableName),
      },
      reference: {
        type: 'database',
        connectionId: this.config.id,
        tableName: tempTableName,
        isTemporary: true,
      },
      createdAt: new Date(),
    };
  }
  
  /**
   * 将文件型数据临时导入PostGIS
   */
  private async importToPostGIS(data: NativeData): Promise<string> {
    const tempTableName = `temp_import_${Date.now()}`;
    
    // 根据数据类型选择导入方式
    if (data.type === 'geojson') {
      await this.importGeoJSON(data.reference.path!, tempTableName);
    } else if (data.type === 'shapefile') {
      await this.importShapefile(data.reference.path!, tempTableName);
    }
    
    return tempTableName;
  }
  
  private convertToDegrees(distance: number, unit: DistanceUnit): number {
    // 根据单位转换为度数
    if (unit === 'meters') {
      return distance / 111320; // 近似值
    }
    // ... 其他单位转换
    return distance;
  }
  
  private buildQuery(tableName: string, query: DataQuery): string {
    let sql = `SELECT * FROM "${tableName}"`;
    
    if (query.filter) {
      sql += ` WHERE ${this.buildWhereClause(query.filter)}`;
    }
    
    if (query.limit) {
      sql += ` LIMIT ${query.limit}`;
    }
    
    return sql;
  }
  
  close(): void {
    this.pool.end();
  }
}
```

### 4.4 TifAccessor

```typescript
class TifAccessor implements DataAccessor {
  private filePath: string;
  
  async read(query: DataQuery): Promise<NativeData> {
    // 使用geotiff.js读取
    const tiff = await fromArrayBuffer(await fs.readFile(this.filePath));
    const image = await tiff.getImage();
    
    return {
      id: query.sourceId,
      type: 'tif',
      metadata: {
        width: image.getWidth(),
        height: image.getHeight(),
        bands: image.getSamplesPerPixel(),
        bbox: image.getBoundingBox(),
      },
      reference: {
        type: 'file',
        path: this.filePath,
      },
      createdAt: new Date(),
    };
  }
  
  // TIF是栅格数据，不支持矢量空间分析
  async buffer(distance: number, unit: DistanceUnit): Promise<NativeData> {
    throw new Error('Buffer analysis not supported for raster data');
  }
  
  close(): void {
    // TIF无需关闭连接
  }
}
```

---

## 5. DBAccessorFactory实现

```typescript
class DataAccessorFactory {
  private accessors: Map<string, DataAccessor> = new Map();
  private postgisPools: Map<string, PostGISAccessor> = new Map();
  
  /**
   * 创建或获取数据访问器
   * @param type 数据类型
   * @param config 数据源配置
   */
  createAccessor(type: DataType, config: DataSourceConfig): DataAccessor {
    const key = `${type}_${config.id}`;
    
    // 缓存Accessor（PostGIS需要复用连接池）
    if (this.accessors.has(key)) {
      return this.accessors.get(key)!;
    }
    
    let accessor: DataAccessor;
    
    switch (type) {
      case 'shapefile':
        accessor = new ShapefileAccessor(config as ShapefileConfig);
        break;
      case 'geojson':
        accessor = new GeoJSONAccessor(config as GeoJSONConfig);
        break;
      case 'postgis':
        accessor = this.getOrCreatePostGISAccessor(config as PostGISConfig);
        break;
      case 'tif':
        accessor = new TifAccessor(config as TifConfig);
        break;
      default:
        throw new Error(`Unsupported data source type: ${type}`);
    }
    
    this.accessors.set(key, accessor);
    return accessor;
  }
  
  private getOrCreatePostGISAccessor(config: PostGISConfig): PostGISAccessor {
    if (!this.postgisPools.has(config.id)) {
      this.postgisPools.set(config.id, new PostGISAccessor(config));
    }
    return this.postgisPools.get(config.id)!;
  }
  
  /**
   * 关闭所有连接
   */
  closeAll(): void {
    this.accessors.forEach(accessor => accessor.close());
    this.postgisPools.forEach(pool => pool.close());
  }
}
```

---

## 6. 跨数据源分析场景

### 6.1 场景：GeoJSON与PostGIS联合分析

```typescript
// OverlayAnalyzer处理跨数据源分析
class OverlayAnalyzer {
  private accessorFactory: DataAccessorFactory;
  
  async intersect(data1: NativeData, data2: NativeData): Promise<NativeData> {
    // 情况1: 两个都是PostGIS → 直接在数据库中执行
    if (data1.type === 'postgis' && data2.type === 'postgis') {
      const accessor1 = this.accessorFactory.createAccessor('postgis', data1.reference);
      return await accessor1.intersect(data2);
    }
    
    // 情况2: 一个是PostGIS，一个是文件型 → 临时导入PostGIS
    if (data1.type === 'postgis' || data2.type === 'postgis') {
      const postgisData = data1.type === 'postgis' ? data1 : data2;
      const fileData = data1.type === 'postgis' ? data2 : data1;
      
      const postgisAccessor = this.accessorFactory.createAccessor('postgis', postgisData.reference);
      return await postgisAccessor.intersect(fileData);  // Accessor内部会临时导入
    }
    
    // 情况3: 两个都是文件型 → 加载为GeoJSON用Turf.js
    const loader = new UniversalDataLoader(this.accessorFactory);
    const geo1 = await loader.loadAsGeoJSON(data1);
    const geo2 = await loader.loadAsGeoJSON(data2);
    
    const result = turf.intersect(geo1, geo2);
    
    // 保存为与data1相同的格式
    return await loader.saveAs(result, data1.type);
  }
}
```

### 6.2 UniversalDataLoader（统一数据加载器）

```typescript
/**
 * 仅在必要时进行数据格式转换
 * - 文件型数据：加载为GeoJSON用于内存分析
 * - PostGIS数据：保持原位，不转换
 */
class UniversalDataLoader {
  private accessorFactory: DataAccessorFactory;
  
  /**
   * 将文件型数据加载为GeoJSON（用于Turf.js分析）
   */
  async loadAsGeoJSON(data: NativeData): Promise<GeoJSON> {
    if (data.type === 'postgis') {
      throw new Error('PostGIS data should not be converted to GeoJSON');
    }
    
    const accessor = this.accessorFactory.createAccessor(data.type, data.reference);
    
    // 不同Accessor实现自己的读取逻辑
    if (data.type === 'geojson') {
      const content = await fs.readFile(data.reference.path!, 'utf-8');
      return JSON.parse(content);
    } else if (data.type === 'shapefile') {
      return await shapefile.read(data.reference.path!);
    }
    
    throw new Error(`Unsupported data type for GeoJSON conversion: ${data.type}`);
  }
  
  /**
   * 将GeoJSON保存为指定格式
   */
  async saveAs(geojson: GeoJSON, format: DataType, path?: string): Promise<NativeData> {
    const workspaceManager = new WorkspaceManager();
    
    switch (format) {
      case 'geojson': {
        const filePath = path || workspaceManager.generateFilename('result_', '.geojson');
        await fs.writeFile(filePath, JSON.stringify(geojson));
        return this.createFileData(filePath, 'geojson', geojson);
      }
      
      case 'shapefile': {
        const filePath = path || workspaceManager.generateFilename('result_', '.shp');
        await this.saveAsShapefile(geojson, filePath);
        return this.createFileData(filePath, 'shapefile', geojson);
      }
      
      default:
        throw new Error(`Unsupported save format: ${format}`);
    }
  }
}
```

---

## 7. 设计优势总结

✅ **符合NativeData原则**
- PostGIS数据在数据库内分析，不转换格式
- 文件型数据保持原始结构

✅ **符合工厂模式**
- DBAccessorFactory统一入口
- 上层代码无需关心具体类型

✅ **多态替代条件判断**
- 每个Accessor实现自己的方法
- 消除if-else分支

✅ **性能最优**
- PostGIS直接用SQL，避免数据传输
- 文件型用Turf.js，简单高效

✅ **易于扩展**
- 新增数据类型只需实现新Accessor
- 新增分析方法只需在接口中添加

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03

