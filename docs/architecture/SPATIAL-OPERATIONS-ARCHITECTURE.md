# Spatial Operations in Data Accessor Layer - Architecture Implementation

**Date**: 2026-05-04  
**Status**: Interface Complete, GeoJSONAccessor Implemented, Others Pending  
**Pattern**: Strategy Pattern with Native Optimization

---

## Architectural Decision

### Problem
Previous design had executors handling format conversion and spatial operations, violating separation of concerns.

### Solution
**Move spatial operations to Data Accessor layer** where each accessor implements operations using native capabilities:
- **GeoJSON**: Turf.js (in-memory)
- **Shapefile**: Convert to GeoJSON → Turf.js
- **PostGIS**: SQL spatial functions (`ST_Buffer`, `ST_Intersect`)
- **Raster**: GDAL operations

### Benefits
1. ✅ **Performance**: PostGIS stays in database, uses spatial indexes
2. ✅ **Simplicity**: Executor has zero format knowledge
3. ✅ **Extensibility**: Add new data source? Just implement interface methods
4. ✅ **Maintainability**: Format-specific logic isolated in accessors

---

## Interface Design

### New Methods in DataAccessor

```typescript
export interface DataAccessor {
  // Basic CRUD (existing)
  read(reference: string): Promise<NativeData>;
  write(data: any, metadata?: Partial<DataMetadata>): Promise<string>;
  delete(reference: string): Promise<void>;
  getMetadata(reference: string): Promise<DataMetadata>;
  validate(reference: string): Promise<boolean>;
  
  // NEW: Spatial Operations
  buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData>;
  overlay(reference1: string, reference2: string, options: OverlayOptions): Promise<NativeData>;
}
```

### Supporting Types

```typescript
export interface BufferOptions {
  unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
  dissolve?: boolean;
  segments?: number;
}

export type OverlayOperation = 'intersect' | 'union' | 'difference' | 'symmetric_difference';

export interface OverlayOptions {
  operation: OverlayOperation;
}
```

---

## Implementation Examples

### 1. GeoJSONAccessor (✅ Complete)

**Location**: [`server/src/data-access/accessors/GeoJSONAccessor.ts`](file://e:\codes\GeoAI-UP\server\src\data-access\accessors\GeoJSONAccessor.ts)

#### buffer() Implementation
```typescript
async buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
  // 1. Read GeoJSON file
  const content = fs.readFileSync(reference, 'utf-8');
  let geojson = JSON.parse(content);
  
  // 2. Ensure FeatureCollection
  if (geojson.type === 'Feature') {
    geojson = { type: 'FeatureCollection', features: [geojson] };
  }
  
  // 3. Perform buffer with Turf.js
  const buffered = turf.buffer(geojson, distance, {
    units: options?.unit || 'kilometers'
  });
  
  // 4. Dissolve if requested
  let result = buffered;
  if (options?.dissolve) {
    result = turf.dissolve(buffered as any);
  }
  
  // 5. Save result
  const resultPath = this.saveResult(result, 'buffer');
  
  // 6. Return NativeData
  return {
    id: generateId(),
    type: 'geojson',
    reference: resultPath,
    metadata: {
      bbox: turf.bbox(result),
      featureCount: this.countFeatures(result),
      bufferSize: distance,
      bufferUnit: options?.unit,
      dissolved: options?.dissolve,
      processedAt: new Date().toISOString()
    },
    createdAt: new Date()
  };
}
```

#### overlay() Implementation
```typescript
async overlay(reference1: string, reference2: string, options: OverlayOptions): Promise<NativeData> {
  // 1. Read both GeoJSON files
  const geojson1 = JSON.parse(fs.readFileSync(reference1, 'utf-8'));
  const geojson2 = JSON.parse(fs.readFileSync(reference2, 'utf-8'));
  
  // 2. Perform overlay operation
  let result: any;
  switch (options.operation) {
    case 'intersect':
      result = turf.intersect(geojson1 as any, geojson2 as any);
      break;
    case 'union':
      result = turf.union(geojson1 as any, geojson2 as any);
      break;
    case 'difference':
      // TODO: Turf.js v7 API changed
      throw new Error('Difference not yet implemented');
    case 'symmetric_difference':
      throw new Error('Symmetric difference not yet implemented');
  }
  
  // 3. Save and return NativeData
  const resultPath = this.saveResult(result, `overlay_${options.operation}`);
  return { /* ... */ };
}
```

**Helper Method**:
```typescript
private saveResult(geojson: any, prefix: string): string {
  const workspaceDir = process.env.WORKSPACE_DIR || './workspace';
  const resultsDir = path.join(workspaceDir, 'results', 'geojson');
  
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const filename = `${prefix}_${Date.now()}_${generateId().substring(0, 8)}.geojson`;
  const filepath = path.join(resultsDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(geojson, null, 2));
  return filepath;
}
```

---

### 2. ShapefileAccessor (📝 Placeholder)

**Strategy**: Convert to GeoJSON first, then use same logic as GeoJSONAccessor

```typescript
async buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
  // Step 1: Convert Shapefile to GeoJSON
  // TODO: Use shapefile-js or GDAL
  const geojsonPath = await this.convertToGeoJSON(reference);
  
  // Step 2: Use GeoJSON logic (could delegate to GeoJSONAccessor)
  const geojsonAccessor = new GeoJSONAccessor();
  return geojsonAccessor.buffer(geojsonPath, distance, options);
}

private async convertToGeoJSON(shapefilePath: string): Promise<string> {
  // TODO: Implement conversion
  // Option 1: Use 'shapefile' npm package
  // Option 2: Use GDAL bindings
  // Option 3: Call ogr2ogr command-line tool
  
  throw new Error('Shapefile to GeoJSON conversion not yet implemented');
}
```

**Why this approach?**
- ✅ Simplicity: Reuse GeoJSON implementation
- ✅ One-time cost: Convert once, process many times
- ✅ Consistency: All file-based formats use same processing pipeline

---

### 3. PostGISAccessor (📝 Placeholder)

**Strategy**: Use native SQL spatial functions - NO conversion!

```typescript
async buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
  // reference = "cities_table"
  const tableName = reference;
  const resultTable = `buffer_${tableName}_${Date.now()}`;
  
  // Use PostGIS ST_Buffer - runs in database!
  const unitMultiplier = this.getUnitMultiplier(options?.unit || 'meters');
  
  await this.executeQuery(`
    CREATE TABLE ${resultTable} AS
    SELECT 
      ST_Buffer(geom, ${distance * unitMultiplier}) as geom,
      *
    FROM ${tableName}
  `);
  
  // If dissolve requested
  if (options?.dissolve) {
    await this.executeQuery(`
      CREATE TABLE ${resultTable}_dissolved AS
      SELECT 
        ST_Union(geom) as geom
      FROM ${resultTable}
    `);
    // Update resultTable to point to dissolved version
  }
  
  // Get metadata
  const bbox = await this.getSpatialExtent(resultTable, 'geom');
  const featureCount = await this.getFeatureCount(resultTable);
  
  return {
    id: generateId(),
    type: 'postgis',
    reference: resultTable,
    metadata: {
      srid: 4326,
      bbox,
      featureCount,
      bufferSize: distance,
      bufferUnit: options?.unit,
      dissolved: options?.dissolve,
      processedAt: new Date().toISOString()
    },
    createdAt: new Date()
  };
}

private getUnitMultiplier(unit: string): number {
  // Convert to meters (PostGIS default)
  switch (unit) {
    case 'meters': return 1;
    case 'kilometers': return 1000;
    case 'feet': return 0.3048;
    case 'miles': return 1609.34;
    default: return 1;
  }
}
```

**Performance Advantage**:
- ✅ No data transfer from database
- ✅ Uses spatial indexes
- ✅ Parallel processing by PostgreSQL
- ✅ Handles millions of features efficiently

---

## Executor Simplification

### Before (WRONG - 150+ lines)
```typescript
class BufferAnalysisExecutor {
  async execute(params: BufferAnalysisParams): Promise<NativeData> {
    // ❌ Query DB for metadata
    const dataSource = this.dataSourceRepo.getById(params.dataSourceId);
    
    // ❌ Create accessor
    const accessor = factory.createAccessor(dataSource.type);
    
    // ❌ Read data
    const nativeData = await accessor.read(dataSource.reference);
    
    // ❌ Detect format and convert to GeoJSON
    let geojsonContent: string;
    if (dataSource.type === 'geojson') {
      geojsonContent = fs.readFileSync(nativeData.reference, 'utf-8');
    } else if (dataSource.type === 'shapefile') {
      // Convert shapefile...
    } else if (dataSource.type === 'postgis') {
      // Query PostGIS...
    }
    
    // ❌ Parse GeoJSON
    const geojson = JSON.parse(geojsonContent);
    
    // ❌ Perform buffer with Turf.js
    const buffered = turf.buffer(geojson, params.distance, { units: params.unit });
    
    // ❌ Dissolve if needed
    if (params.dissolve) {
      result = turf.dissolve(buffered);
    }
    
    // ❌ Save result to file
    const resultPath = this.saveResult(result);
    
    // ❌ Extract metadata
    const bbox = turf.bbox(result);
    const featureCount = this.countFeatures(result);
    
    // ❌ Return NativeData
    return { /* ... */ };
  }
}
```

### After (CORRECT - 30 lines)
```typescript
class BufferAnalysisExecutor {
  private db: Database.Database;
  private dataSourceRepo: DataSourceRepository;
  private accessorFactory: DataAccessorFactory;

  constructor(db: Database.Database) {
    this.db = db;
    this.dataSourceRepo = new DataSourceRepository(db);
    this.accessorFactory = new DataAccessorFactory();
  }

  async execute(params: BufferAnalysisParams): Promise<NativeData> {
    // 1. Get data source metadata
    const dataSource = this.dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }

    // 2. Create accessor
    const accessor = this.accessorFactory.createAccessor(dataSource.type);

    // 3. Call buffer - accessor handles EVERYTHING!
    const result = await accessor.buffer(
      dataSource.reference,
      params.distance,
      {
        unit: params.unit,
        dissolve: params.dissolve
      }
    );

    return result;
  }
}
```

**Executor knows NOTHING about**:
- ❌ File formats
- ❌ Conversion logic
- ❌ Turf.js vs SQL vs GDAL
- ❌ How to save results
- ❌ How to extract metadata

---

## Comparison Table

| Aspect | Old Approach | New Approach |
|--------|--------------|--------------|
| **Executor Lines** | 150+ | 30 |
| **Format Knowledge** | In executor | In accessor |
| **Conversion Logic** | Duplicated in each executor | Centralized in accessor |
| **PostGIS Performance** | Poor (converts to GeoJSON) | Excellent (native SQL) |
| **Add New Format** | Modify ALL executors | Create new accessor only |
| **Add New Operation** | Modify ALL executors | Add method to interface |
| **Testing** | Complex (mock everything) | Simple (test accessors separately) |

---

## Implementation Status

| Accessor | buffer() | overlay() | Notes |
|----------|----------|-----------|-------|
| **GeoJSON** | ✅ Complete | ⚠️ Partial | Intersect/Union work, Difference needs Turf.js fix |
| **Shapefile** | 📝 Placeholder | 📝 Placeholder | Needs shapefile-to-GeoJSON conversion |
| **PostGIS** | 📝 Placeholder | 📝 Placeholder | Needs pg library + SQL implementation |
| **GeoTIFF** | ❌ N/A | ❌ N/A | Raster operations different |
| **MVT** | ❌ N/A | ❌ N/A | Tile-based, different approach |
| **WMS** | ❌ N/A | ❌ N/A | Web service, client-side ops |

---

## Next Steps

### Priority 1: Complete GeoJSONAccessor
- [ ] Fix Turf.js `difference` API (v7 changed signature)
- [ ] Implement `symmetric_difference`
- [ ] Add unit tests

### Priority 2: Implement ShapefileAccessor
- [ ] Install `shapefile` or `@mapbox/shp-write` package
- [ ] Implement `convertToGeoJSON()` method
- [ ] Delegate to GeoJSONAccessor for operations

### Priority 3: Implement PostGISAccessor
- [ ] Install `pg` package
- [ ] Implement connection pooling
- [ ] Implement `buffer()` with `ST_Buffer()`
- [ ] Implement `overlay()` with `ST_Intersection()`, etc.

### Priority 4: Update Other Executors
- [ ] OverlayAnalysisExecutor → Use `accessor.overlay()`
- [ ] StatisticsCalculator → Add `statistics()` method to interface
- [ ] Any other spatial operations

---

## Key Takeaways

1. **Accessor Layer Owns Spatial Operations**: Each accessor implements using best tool for format
2. **Executor is Pure Orchestration**: No format knowledge, no conversion logic
3. **Native Optimization**: PostGIS uses SQL, GeoJSON uses Turf.js, no unnecessary conversions
4. **Extensible**: Add operations to interface, implement in each accessor
5. **Testable**: Test accessors independently, mock them in executor tests

This architecture properly separates concerns and enables optimal performance for each data source type.
