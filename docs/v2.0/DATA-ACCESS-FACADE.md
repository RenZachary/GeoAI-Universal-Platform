# Data Access Facade Design

## 📋 Overview

This document describes the **DataAccessFacade** pattern in GeoAI-UP v2.0, which provides a unified interface for all spatial data operations, abstracting away backend-specific implementations (GDAL, PostGIS, Web Services).

**Core Principle**: Operators don't care *where* data is stored, only *what* operation to perform.

---

## 🏗️ Architecture

### Problem (v1.0)

In v1.0, each accessor implemented all operations independently:

```
FileAccessor: buffer(), overlay(), filter()  ← GDAL implementation
PostGISAccessor: buffer(), overlay(), filter()  ← SQL implementation
WebServiceAccessor: buffer(), overlay(), filter()  ← WPS implementation
```

**Issues**:
- ❌ Code duplication (same logic, different backends)
- ❌ Inconsistent behavior across backends
- ❌ Hard to add new backends (must implement all operations)

### Solution (v2.0)

Separate concerns into two layers:

```
SpatialOperator (WHAT to do)
    ↓
DataAccessFacade (Route to appropriate backend)
    ↓
DataBackend (HOW to do it)
    ├─ GDALBackend (file-based)
    ├─ PostGISBackend (database)
    └─ WebServiceBackend (WMS/WFS)
```

---

## 🎨 Interface Design

### 1. DataBackend Interface

```typescript
// server/src/data-access/backends/DataBackend.ts

export type BackendType = 'gdal' | 'postgis' | 'web_service';

export interface DataBackend {
  readonly backendType: BackendType;
  
  /**
   * Check if this backend supports the given operator type
   */
  supports(operatorType: string): boolean;
  
  /**
   * Execute a spatial operator on a data source
   */
  execute(
    operator: SpatialOperator,
    source: DataSource,
    options?: ExecutionOptions
  ): Promise<NativeData>;
  
  /**
   * Test backend connectivity
   */
  testConnection(): Promise<boolean>;
}

export interface ExecutionOptions {
  timeout?: number; // milliseconds
  useCache?: boolean;
  parallel?: boolean;
}
```

### 2. GDALBackend Implementation

```typescript
// server/src/data-access/backends/GDALBackend.ts

import gdal from 'gdal-async';
import { DataBackend, BackendType } from './DataBackend';

export class GDALBackend implements DataBackend {
  readonly backendType: BackendType = 'gdal';
  
  supports(operatorType: string): boolean {
    // GDAL supports most vector/raster operations
    const supported = [
      'buffer',
      'overlay',
      'filter',
      'aggregate',
      'spatial_join',
      'kernel_density',
      'reclassify',
      'distance_analysis'
    ];
    return supported.includes(operatorType);
  }
  
  async execute(
    operator: SpatialOperator,
    source: DataSource,
    options?: ExecutionOptions
  ): Promise<NativeData> {
    console.log(`[GDALBackend] Executing ${operator.operatorType} on ${source.reference}`);
    
    switch (operator.operatorType) {
      case 'buffer':
        return this.executeBuffer(operator as BufferOperator, source);
      
      case 'overlay':
        return this.executeOverlay(operator as OverlayOperator, source);
      
      case 'kernel_density':
        return this.executeKernelDensity(operator as KernelDensityOperator, source);
      
      default:
        throw new Error(`Unsupported operator type: ${operator.operatorType}`);
    }
  }
  
  private async executeBuffer(
    operator: BufferOperator,
    source: DataSource
  ): Promise<NativeData> {
    // Open dataset
    const ds = gdal.open(source.reference);
    const layer = ds.layers.get(0);
    
    // Apply buffer
    const bufferedLayer = layer.executeSQL(
      `SELECT ST_Buffer(geometry, ${operator.params.distance}) AS geometry, * FROM ${layer.name}`
    );
    
    // Save to temporary file
    const outputPath = this.generateTempPath('buffer');
    this.saveLayer(bufferedLayer, outputPath);
    
    return {
      id: generateId(),
      type: 'vector',
      reference: outputPath,
      metadata: {
        featureCount: bufferedLayer.features.count(),
        geometryType: 'Polygon',
        srid: layer.srs.authority
      }
    };
  }
  
  private async executeKernelDensity(
    operator: KernelDensityOperator,
    source: DataSource
  ): Promise<NativeData> {
    // Use GDAL grid module for kernel density
    const outputPath = this.generateTempPath('density.tif');
    
    await gdal.grid({
      input: source.reference,
      output: outputPath,
      algorithm: 'invdist',
      radius: operator.params.searchRadius,
      cellSize: operator.params.cellSize
    });
    
    return {
      id: generateId(),
      type: 'raster',
      reference: outputPath,
      metadata: {
        width: 1000,
        height: 1000,
        cellSize: operator.params.cellSize,
        srid: 4326
      }
    };
  }
  
  async testConnection(): Promise<boolean> {
    // GDAL is always available if installed
    return true;
  }
  
  private generateTempPath(prefix: string): string {
    return path.join(
      process.env.WORKSPACE_BASE!,
      'temp',
      `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.geojson`
    );
  }
  
  private saveLayer(layer: any, outputPath: string): void {
    // Implementation depends on GDAL bindings
  }
}
```

### 3. PostGISBackend Implementation

```typescript
// server/src/data-access/backends/PostGISBackend.ts

import { Pool } from 'pg';
import { DataBackend, BackendType } from './DataBackend';

export class PostGISBackend implements DataBackend {
  readonly backendType: BackendType = 'postgis';
  private pool: Pool | null = null;
  
  constructor(private connectionString: string) {}
  
  supports(operatorType: string): boolean {
    // PostGIS supports all spatial operations via SQL
    return true;
  }
  
  async execute(
    operator: SpatialOperator,
    source: DataSource,
    options?: ExecutionOptions
  ): Promise<NativeData> {
    // Ensure connection pool exists
    if (!this.pool) {
      this.pool = new Pool({ connectionString: this.connectionString });
    }
    
    console.log(`[PostGISBackend] Executing ${operator.operatorType} on ${source.reference}`);
    
    switch (operator.operatorType) {
      case 'buffer':
        return this.executeBuffer(operator as BufferOperator, source);
      
      case 'overlay':
        return this.executeOverlay(operator as OverlayOperator, source);
      
      case 'filter':
        return this.executeFilter(operator as FilterOperator, source);
      
      default:
        throw new Error(`Unsupported operator type: ${operator.operatorType}`);
    }
  }
  
  private async executeBuffer(
    operator: BufferOperator,
    source: DataSource
  ): Promise<NativeData> {
    const tableName = source.reference;
    const distance = operator.params.distance;
    const unit = operator.params.unit === 'meters' ? '' : operator.params.unit;
    
    // PostGIS ST_Buffer
    const query = `
      SELECT 
        ST_Buffer(geom, ${distance}${unit}) AS geom,
        *
      FROM ${tableName}
    `;
    
    const result = await this.pool!.query(query);
    
    // Create temporary table for result
    const tempTable = `temp_buffer_${Date.now()}`;
    await this.pool!.query(`
      CREATE TABLE ${tempTable} AS
      ${query}
    `);
    
    return {
      id: generateId(),
      type: 'vector',
      reference: tempTable,
      metadata: {
        featureCount: result.rows.length,
        geometryType: 'Polygon',
        srid: 4326,
        backend: 'postgis'
      }
    };
  }
  
  private async executeOverlay(
    operator: OverlayOperator,
    source: DataSource
  ): Promise<NativeData> {
    const { reference: table1 } = source;
    const table2 = operator.params.secondDataSource;
    const operation = operator.params.operation; // 'intersect', 'union', etc.
    
    let sqlQuery: string;
    
    switch (operation) {
      case 'intersect':
        sqlQuery = `
          SELECT 
            ST_Intersection(t1.geom, t2.geom) AS geom,
            t1.*, t2.*
          FROM ${table1} t1
          INNER JOIN ${table2} t2
          ON ST_Intersects(t1.geom, t2.geom)
        `;
        break;
      
      case 'union':
        sqlQuery = `
          SELECT 
            ST_Union(geom) AS geom,
            *
          FROM (
            SELECT geom, * FROM ${table1}
            UNION ALL
            SELECT geom, * FROM ${table2}
          ) combined
        `;
        break;
      
      default:
        throw new Error(`Unsupported overlay operation: ${operation}`);
    }
    
    const tempTable = `temp_overlay_${Date.now()}`;
    await this.pool!.query(`CREATE TABLE ${tempTable} AS ${sqlQuery}`);
    
    return {
      id: generateId(),
      type: 'vector',
      reference: tempTable,
      metadata: {
        operation,
        backend: 'postgis'
      }
    };
  }
  
  async testConnection(): Promise<boolean> {
    try {
      if (!this.pool) {
        this.pool = new Pool({ connectionString: this.connectionString });
      }
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('[PostGISBackend] Connection test failed:', error);
      return false;
    }
  }
}
```

### 4. DataAccessFacade

```typescript
// server/src/data-access/facade/DataAccessFacade.ts

import { DataBackend, BackendType } from '../backends/DataBackend';
import { GDALBackend } from '../backends/GDALBackend';
import { PostGISBackend } from '../backends/PostGISBackend';
import { WebServiceBackend } from '../backends/WebServiceBackend';

export class DataAccessFacade {
  private static instance: DataAccessFacade;
  private backends: Map<BackendType, DataBackend>;
  
  private constructor() {
    this.backends = new Map();
    this.initializeBackends();
  }
  
  static getInstance(): DataAccessFacade {
    if (!DataAccessFacade.instance) {
      DataAccessFacade.instance = new DataAccessFacade();
    }
    return DataAccessFacade.instance;
  }
  
  private initializeBackends(): void {
    // Register GDAL backend (for file-based data)
    this.backends.set('gdal', new GDALBackend());
    
    // Register PostGIS backend (if configured)
    if (process.env.POSTGIS_CONNECTION_STRING) {
      this.backends.set(
        'postgis',
        new PostGISBackend(process.env.POSTGIS_CONNECTION_STRING)
      );
    }
    
    // Register Web Service backend
    this.backends.set('web_service', new WebServiceBackend());
    
    console.log(`[DataAccessFacade] Initialized ${this.backends.size} backends`);
  }
  
  /**
   * Execute a spatial operator on a data source
   * Automatically routes to the appropriate backend
   */
  async execute(
    operator: SpatialOperator,
    source: DataSource,
    options?: ExecutionOptions
  ): Promise<NativeData> {
    console.log(`[DataAccessFacade] Executing ${operator.operatorType} on ${source.type}`);
    
    // Step 1: Select appropriate backend based on data source type
    const backend = this.selectBackend(source);
    
    if (!backend) {
      throw new Error(`No backend available for data source type: ${source.type}`);
    }
    
    // Step 2: Check if backend supports the operator
    if (!backend.supports(operator.operatorType)) {
      throw new Error(
        `Backend ${backend.backendType} does not support operator: ${operator.operatorType}`
      );
    }
    
    // Step 3: Execute operation
    try {
      const result = await backend.execute(operator, source, options);
      console.log(`[DataAccessFacade] Operation successful: ${result.id}`);
      return result;
    } catch (error) {
      console.error(`[DataAccessFacade] Operation failed:`, error);
      throw error;
    }
  }
  
  /**
   * Select the appropriate backend for a data source
   */
  private selectBackend(source: DataSource): DataBackend | null {
    switch (source.type) {
      // File-based sources → GDAL
      case 'shapefile':
      case 'geojson':
      case 'geotiff':
      case 'csv':
        return this.backends.get('gdal') || null;
      
      // Database sources → PostGIS
      case 'postgis':
        return this.backends.get('postgis') || null;
      
      // Web services → WebService backend
      case 'wms':
      case 'wfs':
      case 'wcs':
        return this.backends.get('web_service') || null;
      
      default:
        console.warn(`[DataAccessFacade] Unknown source type: ${source.type}`);
        return null;
    }
  }
  
  /**
   * Test all backend connections
   */
  async testAllConnections(): Promise<Map<BackendType, boolean>> {
    const results = new Map<BackendType, boolean>();
    
    for (const [type, backend] of this.backends.entries()) {
      const isConnected = await backend.testConnection();
      results.set(type, isConnected);
      console.log(`[DataAccessFacade] Backend ${type}: ${isConnected ? '✓' : '✗'}`);
    }
    
    return results;
  }
  
  /**
   * Get backend by type
   */
  getBackend(type: BackendType): DataBackend | undefined {
    return this.backends.get(type);
  }
  
  /**
   * List available backends
   */
  listBackends(): BackendType[] {
    return Array.from(this.backends.keys());
  }
}
```

---

## 🔄 Operator to Backend Mapping

### Supported Operations by Backend

| Operator | GDAL | PostGIS | WebService | Notes |
|----------|------|---------|------------|-------|
| **buffer** | ✅ | ✅ | ⚠️ | WPS required for web |
| **overlay** | ✅ | ✅ | ❌ | Not supported by WMS |
| **filter** | ✅ | ✅ | ⚠️ | CQL filter for WFS |
| **aggregate** | ✅ | ✅ | ❌ | Server-side only |
| **spatial_join** | ✅ | ✅ | ❌ | Complex operation |
| **kernel_density** | ✅ | ⚠️ | ❌ | PostGIS needs extension |
| **reclassify** | ✅ | ❌ | ❌ | Raster-only operation |
| **weighted_overlay** | ✅ | ❌ | ❌ | Raster-only operation |
| **distance_analysis** | ✅ | ✅ | ❌ | Euclidean distance |

### Routing Logic

```typescript
// Example: User wants to buffer a Shapefile

source.type = 'shapefile'
operator.type = 'buffer'

↓ DataAccessFacade.selectBackend()

Backend selected: GDALBackend

↓ GDALBackend.supports('buffer')

Result: true ✓

↓ GDALBackend.execute()

Implementation: GDAL OGR buffer
Output: Temporary GeoJSON file
```

---

## 💡 Usage Examples

### Example 1: Buffer Analysis

```typescript
// In a SpatialOperator (e.g., BufferOperator)

export class BufferOperator extends SpatialOperator {
  protected async executeCore(
    params: BufferParams,
    context: OperatorContext
  ): Promise<OperatorResult> {
    // Step 1: Get data source
    const dataSource = await context.dataSourceService.getDataSource(params.dataSourceId);
    
    // Step 2: Create operator object
    const bufferOp: BufferOperator = {
      operatorType: 'buffer',
      params: {
        distance: params.distance,
        unit: params.unit,
        dissolve: params.dissolve
      }
    };
    
    // Step 3: Execute via DataAccessFacade (backend-agnostic!)
    const nativeData = await context.dataAccessFacade.execute(bufferOp, dataSource);
    
    // Step 4: Return result
    return {
      success: true,
      resultId: nativeData.id,
      type: 'native_data',
      reference: nativeData.reference,
      metadata: nativeData.metadata
    };
  }
}
```

**Key Point**: The operator doesn't know or care whether the data is in a Shapefile, PostGIS, or WFS. It just calls `execute()` and gets a result.

### Example 2: Multi-Step Workflow

```typescript
// Complex workflow: Buffer → Overlay → Filter

async function complexAnalysis(context: OperatorContext): Promise<NativeData> {
  // Step 1: Buffer schools (500m)
  const schoolBuffer = await context.dataAccessFacade.execute(
    {
      operatorType: 'buffer',
      params: { distance: 500, unit: 'meters' }
    },
    await context.dataSourceService.getDataSource('poi_schools')
  );
  
  // Step 2: Buffer hospitals (1km)
  const hospitalBuffer = await context.dataAccessFacade.execute(
    {
      operatorType: 'buffer',
      params: { distance: 1000, unit: 'meters' }
    },
    await context.dataSourceService.getDataSource('poi_hospitals')
  );
  
  // Step 3: Intersect buffers
  const intersection = await context.dataAccessFacade.execute(
    {
      operatorType: 'overlay',
      params: {
        operation: 'intersect',
        secondDataSource: hospitalBuffer.reference
      }
    },
    schoolBuffer
  );
  
  // Step 4: Filter by population density
  const result = await context.dataAccessFacade.execute(
    {
      operatorType: 'filter',
      params: {
        condition: 'population > 1000'
      }
    },
    intersection
  );
  
  return result;
}
```

**Automatic Backend Selection**:
- If `poi_schools` is a Shapefile → GDAL executes buffer
- If `poi_hospitals` is in PostGIS → PostGIS executes buffer
- Intersection happens in whichever backend holds the first dataset

---

## 🚀 Performance Optimizations

### 1. Caching Strategy

```typescript
export class DataAccessFacade {
  private cache: Map<string, NativeData> = new Map();
  
  async execute(
    operator: SpatialOperator,
    source: DataSource,
    options?: ExecutionOptions
  ): Promise<NativeData> {
    // Generate cache key
    const cacheKey = this.generateCacheKey(operator, source);
    
    // Check cache first
    if (options?.useCache !== false && this.cache.has(cacheKey)) {
      console.log(`[DataAccessFacade] Cache hit: ${cacheKey}`);
      return this.cache.get(cacheKey)!;
    }
    
    // Execute operation
    const result = await this.executeWithBackend(operator, source);
    
    // Cache result
    if (options?.useCache !== false) {
      this.cache.set(cacheKey, result);
      
      // Set TTL for cache cleanup
      setTimeout(() => this.cache.delete(cacheKey), 3600000); // 1 hour
    }
    
    return result;
  }
  
  private generateCacheKey(operator: SpatialOperator, source: DataSource): string {
    return `${source.id}_${operator.operatorType}_${JSON.stringify(operator.params)}`;
  }
}
```

### 2. Parallel Execution

```typescript
async function executeParallelGroup(
  operators: Array<{ operator: SpatialOperator; source: DataSource }>,
  context: OperatorContext
): Promise<NativeData[]> {
  // Execute all operators in parallel
  const promises = operators.map(({ operator, source }) =>
    context.dataAccessFacade.execute(operator, source, { parallel: true })
  );
  
  return await Promise.all(promises);
}

// Usage: Run multiple buffer analyses simultaneously
const results = await executeParallelGroup([
  { operator: bufferOp1, source: schools },
  { operator: bufferOp2, source: hospitals },
  { operator: bufferOp3, source: parks }
], context);
```

### 3. Backend-Specific Optimizations

```typescript
// PostGIS: Use spatial indexes
export class PostGISBackend {
  private async ensureSpatialIndex(tableName: string): Promise<void> {
    await this.pool!.query(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_geom
      ON ${tableName} USING GIST (geom)
    `);
  }
  
  async execute(operator: SpatialOperator, source: DataSource): Promise<NativeData> {
    // Ensure index exists before query
    await this.ensureSpatialIndex(source.reference);
    
    // Now execute with optimized performance
    // ...
  }
}

// GDAL: Use multi-threading for raster operations
export class GDALBackend {
  private async executeKernelDensity(
    operator: KernelDensityOperator,
    source: DataSource
  ): Promise<NativeData> {
    await gdal.grid({
      input: source.reference,
      output: outputPath,
      threads: 4, // Use 4 CPU cores
      // ...
    });
  }
}
```

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
describe('DataAccessFacade', () => {
  let facade: DataAccessFacade;
  
  beforeEach(() => {
    facade = DataAccessFacade.getInstance();
  });
  
  test('should route Shapefile to GDAL backend', async () => {
    const source: DataSource = {
      id: 'test_shp',
      type: 'shapefile',
      reference: '/path/to/file.shp'
    };
    
    const operator: BufferOperator = {
      operatorType: 'buffer',
      params: { distance: 500, unit: 'meters' }
    };
    
    const result = await facade.execute(operator, source);
    
    expect(result.type).toBe('vector');
    expect(result.metadata?.backend).toBe('gdal');
  });
  
  test('should route PostGIS table to PostGIS backend', async () => {
    const source: DataSource = {
      id: 'test_pg',
      type: 'postgis',
      reference: 'public.schools'
    };
    
    const operator: BufferOperator = {
      operatorType: 'buffer',
      params: { distance: 500, unit: 'meters' }
    };
    
    const result = await facade.execute(operator, source);
    
    expect(result.metadata?.backend).toBe('postgis');
  });
  
  test('should throw error for unsupported operation', async () => {
    const source: DataSource = {
      id: 'test_wms',
      type: 'wms',
      reference: 'http://example.com/wms'
    };
    
    const operator: OverlayOperator = {
      operatorType: 'overlay',
      params: { operation: 'intersect' }
    };
    
    await expect(facade.execute(operator, source)).rejects.toThrow(
      'does not support operator: overlay'
    );
  });
});
```

### Integration Tests

```typescript
describe('DataAccessFacade Integration', () => {
  test('should handle cross-backend workflow', async () => {
    // Buffer a Shapefile (GDAL)
    const shpBuffer = await facade.execute(bufferOp, shapefileSource);
    
    // Buffer a PostGIS table (PostGIS)
    const pgBuffer = await facade.execute(bufferOp, postgisSource);
    
    // Intersect results (uses first dataset's backend)
    const intersection = await facade.execute(
      overlayOp,
      shpBuffer,
      { secondDataSource: pgBuffer.reference }
    );
    
    expect(intersection).toBeDefined();
  });
});
```

---

## 📊 Benefits Comparison

| Aspect | v1.0 (Accessor Pattern) | v2.0 (Facade Pattern) |
|--------|------------------------|----------------------|
| **Code Duplication** | High (each accessor implements all ops) | Low (backend implements once) |
| **Adding New Backend** | Must implement all operations | Implement only supported ops |
| **Consistency** | Varies by accessor | Guaranteed by facade routing |
| **Testing** | Test N accessors × M operations | Test backends independently |
| **Performance** | No cross-backend optimization | Backend-specific optimizations |
| **Maintenance** | Update all accessors | Update only affected backend |

---

## 🔗 Related Documents

- [REFACTORING-PLAN-v2.0.md](./REFACTORING-PLAN-v2.0.md) - Overall refactoring plan
- [SPATIAL-OPERATOR-ARCHITECTURE.md](./SPATIAL-OPERATOR-ARCHITECTURE.md) - Operator design
- [GIS-TASK-SPLITTING-STRATEGY.md](./GIS-TASK-SPLITTING-STRATEGY.md) - Task planning

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-09  
**Author**: GeoAI-UP Architecture Team
