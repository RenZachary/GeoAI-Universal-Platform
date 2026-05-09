# Data Access Facade Design

## 📋 Overview

This document describes the **DataAccessFacade** pattern in GeoAI-UP v2.0, which provides a unified interface for all spatial data operations, abstracting away backend-specific implementations (GDAL, PostGIS, Web Services).

**Core Principle**: Operators don't care *where* data is stored, only *what* operation to perform.

---

## 🏗️ Architecture

### Problem (v1.0)

In v1.0, each accessor implemented all operations independently:

```
GeoJSONAccessor: buffer(), overlay(), filter()  ← Turf.js implementation ✅
PostGISAccessor: buffer(), overlay(), filter()  ← SQL implementation ✅
ShapefileAccessor: Convert → GeoJSON → Turf.js  ← Conversion overhead ⚠️
```

**Issues**:
- ❌ Code duplication across accessors
- ❌ Shapefile requires format conversion (performance penalty)
- ❌ No unified routing logic for operator dispatch

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

### 2. VectorBackend Implementation (Turf.js)

**Why Turf.js?**
- ✅ Already in use (v1.0 uses `@turf/turf` v7.3.5)
- ✅ Pure JavaScript, no native dependencies
- ✅ Excellent for GeoJSON operations
- ✅ Active community and good documentation
- ✅ Lightweight compared to GDAL

```typescript

```typescript
// server/src/data-access/backends/VectorBackend.ts

import * as turf from '@turf/turf';
import { DataBackend, BackendType } from './DataBackend';

export class VectorBackend implements DataBackend {
  readonly backendType: BackendType = 'vector';
  
  supports(operatorType: string): boolean {
    // Turf.js supports most vector operations
    const supported = [
      'buffer',
      'overlay',
      'filter',
      'aggregate',
      'spatial_join',
      'distance_analysis'
    ];
    return supported.includes(operatorType);
  }
  
  async execute(
    operator: SpatialOperator,
    source: DataSource,
    options?: ExecutionOptions
  ): Promise<NativeData> {
    console.log(`[VectorBackend] Executing ${operator.operatorType} on ${source.reference}`);
    
    // Load GeoJSON data
    const geojson = await this.loadGeoJSON(source.reference);
    
    switch (operator.operatorType) {
      case 'buffer':
        return this.executeBuffer(operator as BufferOperator, geojson);
      
      case 'overlay':
        return this.executeOverlay(operator as OverlayOperator, geojson);
      
      default:
        throw new Error(`Unsupported operator type: ${operator.operatorType}`);
    }
  }
  
  private async executeBuffer(
    operator: BufferOperator,
    geojson: GeoJSON.FeatureCollection
  ): Promise<NativeData> {
    // Use Turf.js for buffer operation
    const bufferedFeatures = geojson.features.map(feature => {
      return turf.buffer(feature, operator.params.distance, {
        units: operator.params.unit || 'meters'
      });
    }).filter(Boolean);
    
    const result: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: bufferedFeatures
    };
    
    // Apply dissolve if requested
    if (operator.params.dissolve && bufferedFeatures.length > 0) {
      const dissolved = turf.dissolve(result);
      result.features = dissolved.features;
    }
    
    // Save and return NativeData
    const outputPath = await this.saveResult(result, 'buffer');
    return this.createNativeData(outputPath, result);
  }
  async testConnection(): Promise<boolean> {
    // Turf.js is always available if installed
    return true;
  }
  
  private async loadGeoJSON(reference: string): Promise<GeoJSON.FeatureCollection> {
    const content = await fs.promises.readFile(reference, 'utf-8');
    return JSON.parse(content);
  }
  
  private async saveResult(geojson: GeoJSON.FeatureCollection, prefix: string): Promise<string> {
    const outputPath = path.join(
      process.env.WORKSPACE_BASE!,
      'temp',
      `${prefix}_${Date.now()}.geojson`
    );
    await fs.promises.writeFile(outputPath, JSON.stringify(geojson));
    return outputPath;
  }
  
  private createNativeData(reference: string, geojson: GeoJSON.FeatureCollection): NativeData {
    return {
      id: generateId(),
      type: 'geojson',
      reference,
      metadata: {
        featureCount: geojson.features.length,
        geometryType: geojson.features[0]?.geometry.type,
        srid: 4326
      },
      createdAt: new Date()
    };
  }
}
```

### 3. RasterBackend Implementation (GDAL)

**Why GDAL for Raster?**
- ✅ Industry standard for raster data
- ✅ Supports GeoTIFF, NetCDF, HDF, etc.
- ✅ High-performance operations on large datasets
- ✅ Already used in v1.0 (`geotiff` package)

```typescript
// server/src/data-access/backends/RasterBackend.ts

import { fromFile } from 'geotiff';
import { DataBackend, BackendType } from './DataBackend';

export class RasterBackend implements DataBackend {
  readonly backendType: BackendType = 'raster';
  
  supports(operatorType: string): boolean {
    // GDAL supports raster-specific operations
    const supported = [
      'kernel_density',
      'reclassify',
      'resample',
      'clip_raster',
      'mosaic'
    ];
    return supported.includes(operatorType);
  }
  
  async execute(
    operator: SpatialOperator,
    source: DataSource,
    options?: ExecutionOptions
  ): Promise<NativeData> {
    console.log(`[RasterBackend] Executing ${operator.operatorType} on ${source.reference}`);
    
    switch (operator.operatorType) {
      case 'kernel_density':
        return this.executeKernelDensity(operator as KernelDensityOperator, source);
      
      case 'reclassify':
        return this.executeReclassify(operator as ReclassifyOperator, source);
      
      default:
        throw new Error(`Unsupported operator type: ${operator.operatorType}`);
    }
  }
  
  private async executeKernelDensity(
    operator: KernelDensityOperator,
    source: DataSource
  ): Promise<NativeData> {
    // Read input raster
    const tiff = await fromFile(source.reference);
    const image = await tiff.getImage();
    
    // Extract pixel values
    const rasters = await image.readRasters();
    const width = image.getWidth();
    const height = image.getHeight();
    
    // Apply kernel density algorithm
    const densityValues = this.calculateKernelDensity(rasters, operator.params);
    
    // Create output GeoTIFF
    const outputPath = await this.saveRaster(densityValues, width, height, 'density');
    
    return {
      id: generateId(),
      type: 'tif',
      reference: outputPath,
      metadata: {
        width,
        height,
        bandCount: 1,
        cellSize: operator.params.cellSize,
        srid: 4326
      },
      createdAt: new Date()
    };
  }
  
  private calculateKernelDensity(rasters: any, params: any): number[] {
    // Simplified kernel density calculation
    // In production, use proper spatial statistics algorithms
    const data = rasters[0];
    const result = new Float32Array(data.length);
    
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] > 0 ? data[i] * params.weight : 0;
    }
    
    return Array.from(result);
  }
  
  private async saveRaster(values: number[], width: number, height: number, prefix: string): Promise<string> {
    const outputPath = path.join(
      process.env.WORKSPACE_BASE!,
      'temp',
      `${prefix}_${Date.now()}.tif`
    );
    
    // Write GeoTIFF using geotiff library
    // Implementation depends on specific requirements
    
    return outputPath;
  }
  
  async testConnection(): Promise<boolean> {
    // Check if geotiff library is available
    try {
      await fromFile('/dev/null');
      return false; // Expected to fail for invalid file
    } catch (error) {
      return true; // Library loaded successfully
    }
  }
}
```

### 4. PostGISBackend Implementation

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

**Core Logic**: Route operator to appropriate backend based on data source type and operator requirements.

```typescript
// server/src/data-access/facade/DataAccessFacade.ts

import { DataBackend, BackendType } from '../backends/DataBackend';
import { VectorBackend } from '../backends/VectorBackend';
import { RasterBackend } from '../backends/RasterBackend';
import { PostGISBackend } from '../backends/PostGISBackend';

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
    // Register Vector backend (Turf.js for GeoJSON)
    this.backends.set('vector', new VectorBackend());
    
    // Register Raster backend (GDAL for GeoTIFF)
    this.backends.set('raster', new RasterBackend());
    
    // Register PostGIS backend (SQL for database)
    const postgisUrl = process.env.POSTGIS_CONNECTION_STRING || 'postgresql://localhost:5432/geoai';
    this.backends.set('postgis', new PostGISBackend(postgisUrl));
  }
  
  /**
   * Execute a spatial operator by routing to the appropriate backend
   */
  async executeOperator(
    operator: SpatialOperator,
    source: DataSource,
    options?: ExecutionOptions
  ): Promise<NativeData> {
    console.log(`[DataAccessFacade] Routing ${operator.operatorType} for ${source.type}`);
    
    // Select backend based on data source type
    const backend = this.selectBackend(source.type, operator.operatorType);
    
    if (!backend) {
      throw new Error(
        `No backend found for data source type '${source.type}' with operator '${operator.operatorType}'`
      );
    }
    
    // Check if backend supports the operator
    if (!backend.supports(operator.operatorType)) {
      throw new Error(
        `Backend '${backend.backendType}' does not support operator '${operator.operatorType}'`
      );
    }
    
    // Execute via selected backend
    return await backend.execute(operator, source, options);
  }
  
  /**
   * Select the best backend for given data source type and operator
   */
  private selectBackend(dataSourceType: string, operatorType: string): DataBackend | null {
    // Priority-based selection
    switch (dataSourceType) {
      case 'geojson':
      case 'shapefile':
        return this.backends.get('vector'); // Turf.js
      
      case 'tif':
      case 'geotiff':
        return this.backends.get('raster'); // GDAL
      
      case 'postgis':
        return this.backends.get('postgis'); // SQL
      
      default:
        // Fallback: try vector backend first
        return this.backends.get('vector');
    }
  }
  
  /**
   * Test all backend connections
   */
  async testAllConnections(): Promise<Map<BackendType, boolean>> {
    const results = new Map<BackendType, boolean>();
    
    for (const [type, backend] of this.backends) {
      const isConnected = await backend.testConnection();
      results.set(type, isConnected);
    }
    
    return results;
  }
}
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

## 💡 Why Turf.js for Vector Operations?

### Decision Rationale

In v1.0, we already use `@turf/turf` v7.3.5 for GeoJSON spatial operations. In v2.0, we continue this approach because:

#### ✅ Advantages of Turf.js

1. **Already in Production**: No new dependency, proven stability
   - Current usage: `GeoJSONBufferOperation`, `GeoJSONOverlayOperation`, `GeoJSONSpatialJoinOperation`
   - Package size: ~2MB (lightweight)

2. **Pure JavaScript**: No native compilation required
   - Easy deployment across platforms (Windows/Linux/macOS)
   - No GDAL C++ bindings complexity
   - Works in browser if needed

3. **Excellent GeoJSON Support**
   - Native GeoJSON format (no conversion overhead)
   - Comprehensive spatial operations (buffer, intersect, union, etc.)
   - Active community and good documentation

4. **Performance is Adequate**
   - For small-medium datasets (<10K features): Excellent
   - For large datasets: Use PostGIS backend instead
   - Streaming support available via GeoJSON streaming libraries

#### ❌ Why NOT GDAL for Vector?

1. **Heavy Dependency**
   - Requires C++ compilation
   - Large binary size (~50MB+)
   - Platform-specific builds needed

2. **Overkill for Simple Operations**
   - Buffer/overlay on GeoJSON doesn't need GDAL's power
   - Turf.js is faster for in-memory operations

3. **Complexity**
   - GDAL bindings can be tricky to install
   - Version compatibility issues
   - Memory management challenges

#### 🎯 When to Use Each Backend

| Scenario | Recommended Backend | Reason |
|----------|-------------------|--------|
| GeoJSON < 10K features | **VectorBackend (Turf.js)** | Fast, no conversion |
| Shapefile | **VectorBackend (Turf.js)** | Convert once → GeoJSON, then Turf |
| PostGIS table | **PostGISBackend (SQL)** | Database-native, uses indexes |
| GeoTIFF raster | **RasterBackend (GDAL)** | Industry standard for raster |
| Large vector (>100K features) | **PostGISBackend** | Better performance with spatial indexes |
| Complex raster analysis | **RasterBackend (GDAL)** | Advanced algorithms |

### Migration Path from v1.0

**No changes needed!** The existing Turf.js-based operations in v1.0 are already aligned with v2.0 design:

```typescript
// v1.0: Already using Turf.js ✅
import * as turf from '@turf/turf';
const buffered = turf.buffer(feature, distance, { units: 'meters' });

// v2.0: Same approach, better organization ✅
class VectorBackend {
  async executeBuffer(operator, geojson) {
    return turf.buffer(feature, operator.params.distance, {
      units: operator.params.unit || 'meters'
    });
  }
}
```

The refactoring focuses on **organization and routing**, not changing the underlying spatial operation library.

---

## 🔗 Related Documents

- [02-REFACTORING-PLAN-v2.0.md](./02-REFACTORING-PLAN-v2.0.md) - Overall refactoring plan
- [03-SPATIAL-OPERATOR-ARCHITECTURE.md](./03-SPATIAL-OPERATOR-ARCHITECTURE.md) - Operator design
- [04-GIS-TASK-SPLITTING-STRATEGY.md](./04-GIS-TASK-SPLITTING-STRATEGY.md) - Task planning

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-09  
**Author**: GeoAI-UP Architecture Team
