# 元数据标准化重构技术方案

## 1. 概述

### 1.1 背景

当前系统中不同数据源（GeoJSON、Shapefile、PostGIS、GeoTIFF）在扫描注册时提取的元数据存在格式不一致、信息缺失等问题，影响了：
- LLM对数据结构的理解准确性
- 前端地图自动定位能力
- 插件执行器的字段验证可靠性
- 系统整体的可维护性

### 1.2 目标

本次重构旨在实现三项核心改进：
1. **统一字段格式**：所有矢量数据源的 `fields` 统一为 `Array<{name: string; type: string}>`
2. **Shapefile字段类型检测**：通过DBF头部信息精确获取字段类型
3. **PostGIS边界框计算**：为PostGIS数据源添加空间范围信息

### 1.3 设计原则

- **不向后兼容**：项目处于开发阶段，直接采用新标准
- **精确优先**：使用权威数据源（DBF头、PostGIS系统表），避免推断
- **简化设计**：移除冗余字段（nullable、description），保持最小化
- **性能意识**：异步计算、缓存策略、超时控制

---

## 2. 类型系统设计

### 2.1 核心类型定义

**文件位置**: `server/src/core/types/index.ts`

```typescript
/**
 * 字段信息 - 统一格式
 * 所有矢量数据源必须使用此格式
 */
export interface FieldInfo {
  /** 字段名称 */
  name: string;
  
  /** 字段类型（统一类型系统） */
  type: string;
}

/**
 * 数据元数据接口
 */
export interface DataMetadata {
  /** 坐标参考系统 (e.g., EPSG:4326) */
  crs?: string;
  
  /** PostGIS SRID */
  srid?: number;
  
  /** 边界框 [minX, minY, maxX, maxY] */
  bbox?: [number, number, number, number];
  
  /** 要素数量（矢量数据） */
  featureCount?: number;
  
  /** 字段信息数组（统一格式） */
  fields?: FieldInfo[];
  
  /** 文件大小（字节，文件型数据源） */
  fileSize?: number;
  
  /** 几何类型 (Point, LineString, Polygon等) */
  geometryType?: string;
  
  /** 其他自定义元数据 */
  [key: string]: any;
}
```

### 2.2 统一类型系统映射

| 源类型 | 目标类型 | 说明 |
|--------|---------|------|
| integer, bigint, smallint | `number` | 整数类型 |
| numeric, decimal, real, double precision | `number` | 浮点类型 |
| text, varchar, char | `string` | 字符串类型 |
| boolean, bool | `boolean` | 布尔类型 |
| date, timestamp, timestamptz | `date` | 日期时间类型 |
| geometry, geography | `geometry` | 空间几何类型 |
| json, jsonb | `object` | JSON对象 |
| C (DBF Character) | `string` | DBF字符型 |
| N (DBF Numeric, decimals=0) | `number` | DBF整型 |
| N (DBF Numeric, decimals>0) | `number` | DBF浮点型 |
| D (DBF Date) | `date` | DBF日期型 |
| L (DBF Logical) | `boolean` | DBF逻辑型 |

---

## 3. Shapefile字段类型检测方案

### 3.1 技术选型

**依赖库**: `dbf-header` (v1.x)

**选择理由**:
- 轻量级（~5KB），仅读取DBF头部
- API简洁，无需解析完整DBF文件
- 性能优异，不遍历数据记录
- 成熟稳定，npm周下载量 > 10K

### 3.2 实施架构

#### 3.2.1 依赖安装

```bash
cd server
npm install dbf-header
```

#### 3.2.2 ShapefileAccessor改造

**文件位置**: `server/src/data-access/accessors/ShapefileAccessor.ts`

**核心改动**:

1. **导入DBF解析库**
   ```typescript
   import { readDBFHeader } from 'dbf-header';
   import type { FieldInfo } from '../../core';
   ```

2. **重写getMetadata方法**
   ```typescript
   async getMetadata(reference: string): Promise<DataMetadata> {
     const stats = fs.statSync(reference);
     const baseName = path.basename(reference, path.extname(reference));
     const dir = path.dirname(reference);
     
     // 计算总文件大小
     const shxPath = path.join(dir, `${baseName}.shx`);
     const dbfPath = path.join(dir, `${baseName}.dbf`);
     const prjPath = path.join(dir, `${baseName}.prj`);
     
     let totalSize = stats.size;
     if (fs.existsSync(shxPath)) totalSize += fs.statSync(shxPath).size;
     if (fs.existsSync(dbfPath)) totalSize += fs.statSync(dbfPath).size;
     if (fs.existsSync(prjPath)) totalSize += fs.statSync(prjPath).size;
     
     // 从DBF头部获取字段定义（精确信息）
     let fields: FieldInfo[] = [];
     if (fs.existsSync(dbfPath)) {
       try {
         const dbfHeader = await readDBFHeader(dbfPath);
         fields = dbfHeader.fields.map(field => ({
           name: field.name.trim(),
           type: this.mapDBFTypeToUnified(field.type, field.decimals)
         }));
       } catch (error) {
         console.warn(`[ShapefileAccessor] Failed to read DBF header for ${reference}:`, error);
         // DBF读取失败时返回空字段列表，不进行推断
       }
     }
     
     // 读取shapefile获取要素数量和几何类型
     let featureCount = 0;
     let geometryType: string | undefined;
     try {
       const source = await shapefile.open(reference.replace('.shp', ''));
       let result;
       while (!(result = await source.read()).done) {
         featureCount++;
         if (!geometryType && result.value?.geometry?.type) {
           geometryType = result.value.geometry.type;
         }
       }
     } catch (error) {
       console.warn(`[ShapefileAccessor] Failed to read shapefile features:`, error);
     }
     
     // 提取CRS
     const crs = fs.existsSync(prjPath) 
       ? this.extractCRSFromPRJ(prjPath) 
       : undefined;
     
     return {
       fileSize: totalSize,
       crs,
       featureCount,
       geometryType,
       fields  // 统一格式：FieldInfo[]
     };
   }
   ```

3. **DBF类型映射方法**
   ```typescript
   private mapDBFTypeToUnified(dbfType: string, decimals: number): string {
     switch (dbfType) {
       case 'C': // Character
       case 'M': // Memo
         return 'string';
       case 'N': // Numeric
         // 有小数位则为浮点数，否则为整数（统一映射为number）
         return 'number';
       case 'D': // Date
         return 'date';
       case 'L': // Logical
         return 'boolean';
       default:
         console.warn(`[ShapefileAccessor] Unknown DBF type: ${dbfType}, defaulting to string`);
         return 'string';
     }
   }
   ```

4. **CRS提取方法（增强）**
   ```typescript
   private extractCRSFromPRJ(prjPath: string): string | undefined {
     try {
       const wkt = fs.readFileSync(prjPath, 'utf-8').trim();
       
       // 简单解析WKT中的EPSG代码
       // 示例: PROJCS["WGS_1984_UTM_Zone_50N",GEOGCS["GCS_WGS_1984"...
       const epsgMatch = wkt.match(/AUTHORITY\["EPSG",["']?(\d+)["']?\]/i);
       if (epsgMatch) {
         return `EPSG:${epsgMatch[1]}`;
       }
       
       // 如果没有EPSG代码，尝试识别常见投影
       if (wkt.includes('WGS_1984') || wkt.includes('WGS84')) {
         return 'EPSG:4326';
       }
       
       return undefined;
     } catch (error) {
       console.warn(`[ShapefileAccessor] Failed to parse PRJ file:`, error);
       return undefined;
     }
   }
   ```

### 3.3 错误处理策略

**原则**: DBF读取失败时静默降级，不阻断数据源注册

```typescript
try {
  const dbfHeader = await readDBFHeader(dbfPath);
  fields = dbfHeader.fields.map(...);
} catch (error) {
  // 记录警告日志
  console.warn(`[ShapefileAccessor] DBF header read failed: ${error.message}`);
  // fields保持为空数组，不影响其他元数据
}
```

### 3.4 性能优化

- **仅读取头部**: `dbf-header`只解析DBF文件头（通常<1KB），不读取数据记录
- **无缓存需求**: 元数据在注册时一次性提取并持久化到SQLite
- **并行读取**: 文件大小统计、DBF解析、SHP读取可并行执行（未来优化点）

---

## 4. PostGIS边界框计算方案

### 4.1 设计策略

**采用**: **注册时异步计算 + 持久化存储**

**理由**:
- ✅ 注册阶段计算，不影响运行时性能
- ✅ 持久化到SQLite，前端可直接使用
- ✅ 异步执行，不阻塞数据源注册流程
- ✅ 一次计算，永久有效（除非数据更新）

### 4.2 实施架构

#### 4.2.1 DataSourceService改造

**文件位置**: `server/src/services/DataSourceService.ts`

**核心改动**:

1. **registerPostGISConnection方法增强**
   ```typescript
   async registerPostGISConnection(config: PostGISConnectionConfig): Promise<{
     connectionInfo: ConnectionInfo;
     dataSources: RegisteredDataSource[];
   }> {
     // Step 1-3: 验证、测试连接、发现表（保持不变）
     this.validatePostGISConfig(config);
     await this.testConnection(config);
     const tables = await this.discoverSpatialTablesAllSchemas();
     
     // Step 4: 注册每个表并异步计算bbox
     const connectionName = config.name || `PostGIS_${config.host}_${config.database}`;
     const registeredSources: RegisteredDataSource[] = [];
     
     for (const table of tables) {
       // 4.1 立即注册数据源（不含bbox）
       const dataSource = await this.registerTableAsDataSource(table, config, connectionName);
       registeredSources.push(dataSource);
       
       // 4.2 异步计算bbox（不阻塞）
       this.calculateAndPersistBboxAsync(
         table.schema,
         table.tableName,
         table.geometryColumn,
         dataSource.id
       ).catch(err => {
         console.error(`[DataSourceService] Bbox calculation failed for ${table.tableName}:`, err);
       });
     }
     
     // Step 5: 启动清理调度器（保持不变）
     // ...
     
     return {
       connectionInfo: { /* ... */ },
       dataSources: registeredSources
     };
   }
   ```

2. **新增异步bbox计算方法**
   ```typescript
   private async calculateAndPersistBboxAsync(
     schema: string,
     tableName: string,
     geometryColumn: string,
     dataSourceId: string
   ): Promise<void> {
     console.log(`[DataSourceService] Calculating bbox for ${schema}.${tableName}...`);
     
     // 带超时控制的bbox计算
     const bbox = await this.calculateSpatialExtentWithTimeout(
       schema,
       tableName,
       geometryColumn,
       30000 // 30秒超时
     );
     
     // 持久化到metadata
     this.dataSourceRepo.updateMetadata(dataSourceId, { bbox });
     
     console.log(`[DataSourceService] Bbox persisted for ${schema}.${tableName}:`, bbox);
   }
   ```

3. **边界框计算方法**
   ```typescript
   private async calculateSpatialExtentWithTimeout(
     schema: string,
     tableName: string,
     geometryColumn: string,
     timeoutMs: number = 30000
   ): Promise<[number, number, number, number]> {
     // 超时控制
     const timeoutPromise = new Promise<never>((_, reject) => {
       setTimeout(
         () => reject(new Error(`Bbox calculation timeout (${timeoutMs}ms)`)),
         timeoutMs
       );
     });
     
     const calculationPromise = this.calculateSpatialExtent(schema, tableName, geometryColumn);
     
     try {
       return await Promise.race([calculationPromise, timeoutPromise]);
     } catch (error) {
       console.warn(`[DataSourceService] Bbox calculation failed for ${schema}.${tableName}:`, error);
       // 返回世界范围作为默认值
       return [-180, -90, 180, 90];
     }
   }
   
   private async calculateSpatialExtent(
     schema: string,
     tableName: string,
     geometryColumn: string
   ): Promise<[number, number, number, number]> {
     const accessor = this.accessorFactory.createAccessor('postgis');
     
     // 使用ST_Extent聚合函数
     const query = `
       SELECT ST_Extent("${geometryColumn}") as extent
       FROM "${schema}"."${tableName}"
       WHERE "${geometryColumn}" IS NOT NULL
     `;
     
     const result = await (accessor as any).executeRaw(query);
     const extent = result.rows[0]?.extent;
     
     if (!extent) {
       console.warn(`[DataSourceService] No spatial extent for ${schema}.${tableName}`);
       return [-180, -90, 180, 90];
     }
     
     // 解析 "BOX(xmin ymin,xmax ymax)" 格式
     return this.parseBoxExtent(extent);
   }
   
   private parseBoxExtent(extent: string): [number, number, number, number] {
     // 格式: BOX(xmin ymin,xmax ymax)
     const match = extent.match(/BOX\(([\d.eE+-]+)\s+([\d.eE+-]+),([\d.eE+-]+)\s+([\d.eE+-]+)\)/);
     
     if (!match) {
       throw new Error(`Invalid extent format: ${extent}`);
     }
     
     return [
       parseFloat(match[1]), // minX
       parseFloat(match[2]), // minY
       parseFloat(match[3]), // maxX
       parseFloat(match[4])  // maxY
     ];
   }
   ```

4. **registerTableAsDataSource方法调整**
   ```typescript
   private async registerTableAsDataSource(
     table: TableInfo,
     config: PostGISConnectionConfig,
     connectionName: string
   ): Promise<RegisteredDataSource> {
     const schema = table.schema || config.schema || 'public';
     
     const dataSource = this.dataSourceRepo.create(
       `${connectionName}.${schema}.${table.tableName}`,
       'postgis',
       `${schema}.${table.tableName}`,
       {
         connection: { /* ... */ },
         tableName: table.tableName,
         geometryColumn: table.geometryColumn,
         srid: table.srid,
         crs: `EPSG:${table.srid}`,
         geometryType: table.geometryType,
         rowCount: table.rowCount,
         featureCount: table.rowCount,
         description: table.description,
         fields: table.fields,  // 已统一为FieldInfo[]
         fieldSchemas: table.fields || [],
         // 注意：bbox将在异步计算后通过updateMetadata添加
       }
     );
     
     return {
       id: dataSource.id,
       name: dataSource.name,
       tableName: table.tableName,
       geometryType: table.geometryType,
       rowCount: table.rowCount
     };
   }
   ```

### 4.3 性能优化策略

#### 4.3.2 大表采样策略

对于千万级以上的超大表，采用采样估算：

```typescript
private async calculateSpatialExtent(
  schema: string,
  tableName: string,
  geometryColumn: string
): Promise<[number, number, number, number]> {
  // 先获取行数
  const countResult = await this.executeRowCountQuery(schema, tableName);
  const rowCount = parseInt(countResult.rows[0].count);
  
  if (rowCount > 10_000_000) {
    // 超大表：1%采样
    console.log(`[DataSourceService] Using sampling for large table ${schema}.${tableName} (${rowCount} rows)`);
    return this.calculateSampledBbox(schema, tableName, geometryColumn, 0.01);
  }
  
  // 常规表：精确计算
  return this.calculateExactBbox(schema, tableName, geometryColumn);
}

private async calculateSampledBbox(
  schema: string,
  tableName: string,
  geometryColumn: string,
  sampleRate: number
): Promise<[number, number, number, number]> {
  const accessor = this.accessorFactory.createAccessor('postgis');
  
  const query = `
    SELECT ST_Extent(geom) as extent FROM (
      SELECT "${geometryColumn}" as geom
      FROM "${schema}"."${tableName}"
      TABLESAMPLE SYSTEM($1)
    ) AS sample
  `;
  
  const result = await (accessor as any).executeRaw(query, [sampleRate * 100]);
  const extent = result.rows[0]?.extent;
  
  if (!extent) {
    return [-180, -90, 180, 90];
  }
  
  return this.parseBoxExtent(extent);
}
```



---

## 5. 统一字段格式实施方案

### 5.1 影响范围分析

需要修改的模块：
1. ✅ ShapefileAccessor - 输出统一格式（已在第3节完成）
2. ✅ GeoJSONAccessor - 已使用统一格式（无需修改）
3. ✅ PostGIS BasicOperations - 已使用统一格式（无需修改）
4. ⚠️ DataSourceRepository - 移除兼容逻辑
5. ⚠️ 前端类型定义 - 同步更新
6. ⚠️ LLM提示词模板 - 验证兼容性

### 5.2 DataSourceRepository简化

**文件位置**: `server/src/data-access/repositories/DataSourceRepository.ts`

**改动**: 移除字段格式兼容代码

```typescript
// 之前：可能有格式转换逻辑
// 现在：直接使用，因为所有Accessor都输出统一格式

create(name: string, type: DataSourceType, reference: string, metadata: Partial<DataMetadata> = {}): DataSourceRecord {
  const id = generateId();
  const now = new Date().toISOString();

  // 验证fields格式（开发阶段严格检查）
  if (metadata.fields && !Array.isArray(metadata.fields)) {
    throw new Error('metadata.fields must be an array of FieldInfo objects');
  }
  
  if (metadata.fields && metadata.fields.length > 0 && typeof metadata.fields[0] === 'string') {
    throw new Error('metadata.fields must use FieldInfo format: {name: string, type: string}');
  }

  this.db.prepare(`
    INSERT INTO data_sources (id, name, type, reference, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    type,
    reference,
    JSON.stringify(metadata),
    now,
    now
  );

  return {
    id,
    name,
    type,
    reference,
    metadata: metadata as DataMetadata,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}
```

### 5.3 前端类型同步

**文件位置**: `web/src/types/index.ts`

```typescript
export interface FieldInfo {
  name: string;
  type: string;
}

export interface DataMetadata {
  crs?: string;
  srid?: number;
  bbox?: [number, number, number, number];
  featureCount?: number;
  fields?: FieldInfo[];  // 统一格式
  fileSize?: number;
  geometryType?: string;
  [key: string]: any;
}
```

### 5.4 前端消费示例

**文件位置**: `web/src/components/map/LayerItemCard.vue` 或相关组件

```vue
<template>
  <div class="field-list">
    <div v-for="field in dataSource.metadata?.fields" :key="field.name" class="field-item">
      <span class="field-name">{{ field.name }}</span>
      <span class="field-type">{{ field.type }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DataSource } from '@/types';

const props = defineProps<{
  dataSource: DataSource;
}>();

// 直接使用field.name和field.type，无需格式判断
</script>
```

---

## 6. 测试策略

### 6.1 单元测试

#### 6.1.1 ShapefileAccessor测试

**文件位置**: `server/test/unit/ShapefileAccessor.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ShapefileAccessor } from '../src/data-access/accessors/ShapefileAccessor';
import path from 'path';

describe('ShapefileAccessor', () => {
  const accessor = new ShapefileAccessor(process.cwd());
  
  it('should extract fields from DBF header', async () => {
    const testFile = path.join(__dirname, 'fixtures', 'test.shp');
    const metadata = await accessor.getMetadata(testFile);
    
    expect(metadata.fields).toBeDefined();
    expect(Array.isArray(metadata.fields)).toBe(true);
    expect(metadata.fields!.length).toBeGreaterThan(0);
    
    // 验证格式
    metadata.fields!.forEach(field => {
      expect(field).toHaveProperty('name');
      expect(field).toHaveProperty('type');
      expect(typeof field.name).toBe('string');
      expect(typeof field.type).toBe('string');
    });
  });
  
  it('should map DBF types correctly', async () => {
    const testFile = path.join(__dirname, 'fixtures', 'mixed_types.shp');
    const metadata = await accessor.getMetadata(testFile);
    
    const fieldTypes = metadata.fields!.map(f => f.type);
    expect(fieldTypes).toContain('string');
    expect(fieldTypes).toContain('number');
    expect(fieldTypes).toContain('date');
    expect(fieldTypes).toContain('boolean');
  });
  
  it('should handle missing DBF gracefully', async () => {
    const testFile = path.join(__dirname, 'fixtures', 'no_dbf.shp');
    const metadata = await accessor.getMetadata(testFile);
    
    expect(metadata.fields).toEqual([]);
    expect(metadata.featureCount).toBeDefined();
  });
});
```

#### 6.1.2 PostGIS bbox测试

**文件位置**: `server/test/unit/DataSourceService.bbox.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DataSourceService } from '../src/services/DataSourceService';
import { SQLiteManagerInstance } from '../src/storage';

describe('DataSourceService Bbox Calculation', () => {
  let service: DataSourceService;
  
  beforeEach(() => {
    const db = SQLiteManagerInstance.getDatabase();
    const repo = new DataSourceRepository(db);
    service = new DataSourceService(repo, process.cwd(), db);
  });
  
  it('should calculate bbox for small table', async () => {
    const bbox = await (service as any).calculateSpatialExtent(
      'public',
      'small_table',
      'geom'
    );
    
    expect(bbox).toHaveLength(4);
    expect(bbox[0]).toBeLessThan(bbox[2]); // minX < maxX
    expect(bbox[1]).toBeLessThan(bbox[3]); // minY < maxY
  });
  
  it('should handle timeout gracefully', async () => {
    const bbox = await (service as any).calculateSpatialExtentWithTimeout(
      'public',
      'huge_table',
      'geom',
      1000 // 1秒超时
    );
    
    // 应返回默认世界范围
    expect(bbox).toEqual([-180, -90, 180, 90]);
  });
  
  it('should parse BOX extent format', () => {
    const extent = 'BOX(-122.5 37.7,-122.3 37.9)';
    const bbox = (service as any).parseBoxExtent(extent);
    
    expect(bbox).toEqual([-122.5, 37.7, -122.3, 37.9]);
  });
});
```

### 6.2 集成测试

**文件位置**: `scripts/test-metadata-standardization.js`

```javascript
/**
 * 元数据标准化集成测试
 * 验证所有数据源的元数据格式一致性
 */

import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'http://localhost:3000/api';

async function testMetadataConsistency() {
  console.log('\n🧪 Testing Metadata Standardization\n');
  
  // 1. 列出所有数据源
  const listResponse = await axios.get(`${API_BASE}/data-sources`);
  const dataSources = listResponse.data.dataSources;
  
  console.log(`Found ${dataSources.length} data sources\n`);
  
  let passed = 0;
  let failed = 0;
  
  for (const ds of dataSources) {
    console.log(`Testing: ${ds.name} (${ds.type})`);
    
    try {
      // 验证fields格式
      if (ds.metadata.fields && ds.metadata.fields.length > 0) {
        const firstField = ds.metadata.fields[0];
        
        if (typeof firstField === 'object' && 'name' in firstField && 'type' in firstField) {
          console.log('  ✅ Fields format: correct (FieldInfo[])');
          passed++;
        } else {
          console.log('  ❌ Fields format: incorrect (expected FieldInfo[])');
          failed++;
        }
      } else {
        console.log('  ⚠️  No fields (acceptable for some types)');
        passed++;
      }
      
      // 验证PostGIS bbox
      if (ds.type === 'postgis') {
        if (ds.metadata.bbox && ds.metadata.bbox.length === 4) {
          console.log('  ✅ Bbox: present');
          passed++;
        } else {
          console.log('  ⚠️  Bbox: not yet calculated (async)');
          // 等待5秒后重试
          await new Promise(resolve => setTimeout(resolve, 5000));
          const refreshed = await axios.get(`${API_BASE}/data-sources/${ds.id}`);
          if (refreshed.data.dataSource.metadata.bbox) {
            console.log('  ✅ Bbox: calculated after wait');
            passed++;
          } else {
            console.log('  ❌ Bbox: still missing');
            failed++;
          }
        }
      }
      
      console.log();
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}\n`);
      failed++;
    }
  }
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

testMetadataConsistency().catch(console.error);
```

### 6.3 性能测试

**测试场景**:
1. Shapefile元数据提取耗时（目标: < 500ms）
2. PostGIS bbox计算耗时（小表: < 1s, 中表: < 5s, 大表采样: < 10s）
3. 并发注册多个数据源的稳定性

---

## 7. 实施计划

### 7.1 阶段划分

**Phase 1: 依赖准备与类型定义（1天）**
- [ ] 安装 `dbf-header` 依赖
- [ ] 更新 `core/types/index.ts` 类型定义
- [ ] 更新前端类型定义
- [ ] 编写单元测试框架

**Phase 2: Shapefile改造（2天）**
- [ ] 实现DBF头部读取逻辑
- [ ] 实现DBF类型映射
- [ ] 增强CRS提取（PRJ解析）
- [ ] 单元测试 + 集成测试
- [ ] 性能测试

**Phase 3: PostGIS bbox计算（2天）**
- [ ] 实现bbox计算方法
- [ ] 实现异步计算机制
- [ ] 实现超时控制
- [ ] 实现大表采样策略
- [ ] 添加手动刷新API
- [ ] 单元测试 + 集成测试

**Phase 4: 统一字段格式（1天）**
- [ ] 简化DataSourceRepository（移除兼容代码）
- [ ] 验证所有Accessor输出格式
- [ ] 前端适配（如有必要）
- [ ] 回归测试

**Phase 5: 集成测试与文档（1天）**
- [ ] 端到端测试
- [ ] 性能基准测试
- [ ] 更新API文档
- [ ] 更新开发者指南

**总计**: 7个工作日

### 7.2 验收标准

**功能验收**:
- ✅ 所有Shapefile数据源的fields为`FieldInfo[]`格式
- ✅ Shapefile字段类型准确率100%（基于DBF定义）
- ✅ 所有PostGIS数据源在注册后5分钟内完成bbox计算
- ✅ bbox计算成功率 > 99%
- ✅ 前端能正确显示字段信息和地图自动定位

**性能验收**:
- ✅ Shapefile元数据提取 < 500ms（P95）
- ✅ PostGIS小表bbox计算 < 1s
- ✅ PostGIS中表bbox计算 < 5s
- ✅ PostGIS大表bbox计算 < 10s（采样）
- ✅ 数据源注册流程不因bbox计算而阻塞

**质量验收**:
- ✅ 单元测试覆盖率 > 80%
- ✅ 零回归bug
- ✅ ESLint无警告
- ✅ TypeScript编译无错误

---

## 8. 风险与缓解

### 8.1 技术风险

| 风险项 | 概率 | 影响 | 缓解措施 |
|--------|------|------|---------|
| dbf-header库不兼容某些DBF变体 | 低 | 中 | 充分的测试用例覆盖；fallback返回空字段 |
| PostGIS超大表bbox计算超时 | 中 | 低 | 采样策略；超时返回默认值 |
| PRJ文件WKT解析失败 | 低 | 低 | 返回undefined，不影响其他元数据 |
| 并发注册导致数据库锁竞争 | 低 | 中 | SQLite WAL模式；异步更新 |

### 8.2 运维风险

| 风险项 | 缓解措施 |
|--------|---------|
| 已有数据源元数据格式不一致 | 开发阶段，直接重建测试数据库 |
| PostGIS表缺少空间索引 | 在数据库初始化脚本中强制创建索引 |
| bbox计算失败无感知 | 完善的日志记录；监控告警 |

---

## 9. 后续优化方向

### 9.1 短期优化（1-3个月）

1. **元数据缓存层**
   - Redis缓存热点数据源元数据
   - TTL策略：24小时

2. **批量bbox计算**
   - 支持一键刷新所有PostGIS数据源bbox
   - 后台任务队列

3. **字段统计信息**
   - 数值字段：min, max, mean, std
   - 分类字段：unique values, cardinality

### 9.2 中期优化（3-6个月）

1. **元数据版本控制**
   - 记录元数据变更历史
   - 支持回滚

2. **AI驱动的元数据增强**
   - 自动生成字段描述
   - 智能推荐字段类型

3. **跨系统元数据同步**
   - 与数据目录系统（Data Catalog）集成
   - OpenAPI元数据导出

### 9.3 长期愿景（6-12个月）

1. **元数据知识图谱**
   - 数据源之间的血缘关系
   - 字段级别的语义关联

2. **实时元数据监控**
   - 数据质量指标
   - 异常检测

---

## 10. 附录

### 10.1 参考资料

- [DBF文件格式规范](https://www.dbase.com/Knowledgebase/INT/db7_file_fmt.htm)
- [PostGIS ST_Extent文档](https://postgis.net/docs/ST_Extent.html)
- [GeoTIFF规范](https://gdal.org/drivers/raster/gtiff.html)
- [shapefile npm package](https://www.npmjs.com/package/shapefile)
- [dbf-header npm package](https://www.npmjs.com/package/dbf-header)

### 10.2 相关文件清单

**后端文件**:
- `server/src/core/types/index.ts` - 类型定义
- `server/src/data-access/accessors/ShapefileAccessor.ts` - Shapefile访问器
- `server/src/data-access/accessors/GeoJSONAccessor.ts` - GeoJSON访问器（无需修改）
- `server/src/data-access/accessors/impl/postgis/PostGISBasicOperations.ts` - PostGIS操作
- `server/src/services/DataSourceService.ts` - 数据源服务
- `server/src/data-access/repositories/DataSourceRepository.ts` - 数据源仓库

**前端文件**:
- `web/src/types/index.ts` - 前端类型定义
- `web/src/components/map/LayerItemCard.vue` - 图层卡片组件（示例）

**测试文件**:
- `server/test/unit/ShapefileAccessor.test.ts`
- `server/test/unit/DataSourceService.bbox.test.ts`
- `scripts/test-metadata-standardization.js`

**文档文件**:
- `docs/architecture/METADATA-STANDARDIZATION-DESIGN.md` - 本文档

---

## 修订历史

| 版本 | 日期 | 作者 | 说明 |
|------|------|------|------|
| 1.0 | 2026-05-08 | Lingma | 初始版本 |
