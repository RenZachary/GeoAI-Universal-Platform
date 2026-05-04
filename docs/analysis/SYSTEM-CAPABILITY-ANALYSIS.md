# System Capability Analysis - Three User Scenarios

## Date: 2026-05-04

---

## Executive Summary

After comprehensive code walkthrough and architectural analysis, I've evaluated whether the GeoAI-UP system can fully support three specific user scenarios. Here are the findings:

| Scenario | Fully Supported? | Critical Gaps | Risk Level |
|----------|------------------|---------------|------------|
| **1. River Buffer (500m)** | ❌ **NO** | Missing result endpoint, no data source resolution | HIGH |
| **2. Residential Heatmap** | ❌ **NO** | Same gaps + heatmap needs point data validation | HIGH |
| **3. Leshan TIF Display** | ⚠️ **PARTIAL** | GeoTIFF accessor incomplete, no result endpoint | MEDIUM |

**Overall Assessment**: The system has **~70% of required components** but lacks critical infrastructure to complete the workflows end-to-end.

---

## Scenario 1: "对河流数据集生成500米缓冲区并显示"

### User Context
- **Data Source**: PostGIS connection configured in frontend with river data
- **Operation**: Generate 500-meter buffer around rivers
- **Expected Output**: Visualization of buffered rivers

### Workflow Trace

#### Step 1: User Input → ChatController ✅ SUPPORTED
```typescript
POST /api/chat
{
  "message": "对河流数据集生成500米缓冲区并显示",
  "conversationId": "conv_123"
}
```

**Status**: ✅ Endpoint exists  
**File**: `server/src/api/controllers/ChatController.ts`

---

#### Step 2: LangGraph Workflow Execution ✅ SUPPORTED

**2.1 Memory Loader** ✅
- Loads conversation history from SQLite
- Appends current message

**2.2 Goal Splitter Agent** ⚠️ PARTIAL
```typescript
// Expected output:
{
  goals: [{
    id: "goal_1",
    description: "Generate 500m buffer around river dataset",
    type: "spatial_analysis",
    priority: 8
  }]
}
```

**Issues**:
- ❓ LLM may not correctly identify "河流数据集" refers to PostGIS data source
- ❓ No mechanism to link natural language "河流数据集" to actual database connection
- ⚠️ Relies on LLM understanding context (may work with good prompt engineering)

**File**: `server/src/llm-interaction/agents/GoalSplitterAgent.ts`

---

**2.3 Task Planner Agent** ⚠️ PARTIAL
```typescript
// Expected output:
{
  executionPlans: {
    "goal_1": {
      steps: [{
        stepId: "step_1",
        pluginId: "buffer_analysis",
        parameters: {
          dataSourceId: "???",  // ← CRITICAL ISSUE
          distance: 500,
          unit: "meters"
        }
      }]
    }
  }
}
```

**Critical Issues**:
- ❌ **No Data Source Resolution**: How does `dataSourceId` map to "河流数据集"?
- ❌ **Missing PostGIS Connection Context**: System doesn't know which PostGIS connection contains rivers
- ❌ **No Data Source Discovery**: TaskPlanner cannot query available data sources

**File**: `server/src/llm-interaction/agents/TaskPlannerAgent.ts`

---

**2.4 Plugin Executor** ⚠️ PARTIAL

**What Works**:
✅ Retrieves `buffer_analysis` tool from ToolRegistry  
✅ Executes BufferAnalysisExecutor  
✅ Returns NativeData with result

**What Fails**:
❌ **Invalid dataSourceId**: If TaskPlanner passes wrong ID, executor fails
❌ **PostGIS Accessor Needs Configuration**: Requires `configurePostGIS()` call before use

**BufferAnalysisExecutor Capabilities**:
```typescript
// Supports PostGIS operations
async execute(params): Promise<NativeData> {
  const accessor = factory.createAccessor('postgis');
  const result = await accessor.buffer(
    params.dataSourceId,  // Table name or SQL query
    params.distance,
    params.unit
  );
  return result;
}
```

**File**: `server/src/plugin-orchestration/executor/analysis/BufferAnalysisExecutor.ts`

---

**2.5 Output Generator** ⚠️ PARTIAL

**ServicePublisher Logic**:
```typescript
// Determines service type based on result.data.type
switch (result.data.type) {
  case 'geojson':
  case 'shapefile':
  case 'postgis':
    return 'geojson';  // Maps to /api/results/{stepId}.geojson
}
```

**Issue**:
⚠️ Generates URL: `/api/results/step_1.geojson`  
❌ **Endpoint Doesn't Exist**: No route handler for `/api/results/:id.geojson`

**File**: `server/src/llm-interaction/workflow/ServicePublisher.ts`

---

**2.6 Summary Generator** ✅ SUPPORTED
- Generates markdown summary
- Lists visualization services
- Provides next steps

**File**: `server/src/llm-interaction/workflow/SummaryGenerator.ts`

---

#### Step 3: Frontend Receives SSE Stream ✅ SUPPORTED
```typescript
// Events received:
data: {"type":"step_start","step":"goal_splitting"}
data: {"type":"step_complete","step":"goal_splitting"}
data: {"type":"visualization","service":{"url":"/api/results/step_1.geojson"}}
data: {"type":"complete"}
```

**Status**: ✅ Streaming works

---

#### Step 4: Frontend Requests Result ❌ NOT SUPPORTED

**Request**:
```
GET /api/results/step_1.geojson
```

**Problem**:
❌ **No Route Defined**: Check `server/src/api/routes/index.ts` - no `/api/results` endpoint  
❌ **Result Not Persisted**: Even if endpoint existed, where is the file stored?

**Expected Behavior**:
1. BufferAnalysisExecutor saves result to `/workspace/results/geojson/step_1.geojson`
2. GET endpoint reads file and serves it
3. Frontend displays on map

**Current Reality**:
- Executor returns NativeData with `reference` field (file path)
- But file may not be written to disk
- No endpoint to serve it

---

### Gap Analysis for Scenario 1

| Component | Status | Issue |
|-----------|--------|-------|
| Chat API | ✅ Working | - |
| LangGraph Workflow | ✅ Working | - |
| Goal Splitter | ⚠️ Partial | May not resolve "河流数据集" correctly |
| Task Planner | ❌ Broken | Cannot map natural language to dataSourceId |
| Buffer Executor | ✅ Working | Requires valid dataSourceId |
| PostGIS Accessor | ✅ Working | Must be configured first |
| Service Publisher | ⚠️ Partial | Generates correct URL pattern |
| **Result Endpoint** | ❌ **MISSING** | No GET /api/results/:id |
| **Result Persistence** | ❌ **UNCLEAR** | Files may not be saved |
| **Data Source Discovery** | ❌ **MISSING** | No way to list/query data sources |

### Missing Components

1. **❌ Result Serving Endpoint** (CRITICAL)
   ```typescript
   // Need to add:
   router.get('/results/:id.geojson', (req, res) => {
     const filePath = path.join(WORKSPACE_BASE, 'results', 'geojson', `${req.params.id}.geojson`);
     res.sendFile(filePath);
   });
   ```

2. **❌ Data Source Context Injection** (CRITICAL)
   - How does TaskPlanner know "河流数据集" = PostGIS table `rivers`?
   - Need mechanism to:
     - List available data sources
     - Pass context to LLM agents
     - Resolve natural language references

3. **❌ PostGIS Connection Management** (HIGH)
   - User configures connection in frontend
   - Where is it stored?
   - How is it passed to PostGISAccessor?
   - Need: POST /api/data-sources/postgis endpoint

4. **⚠️ Result Persistence Verification** (MEDIUM)
   - Does BufferAnalysisExecutor actually write files?
   - Or just returns in-memory NativeData?
   - Need to verify file I/O implementation

---

## Scenario 2: "对小区数据生成热力图并显示"

### User Context
- **Data Source**: Uploaded residential GeoJSON with population field
- **Operation**: Generate heatmap showing population density
- **Expected Output**: Heatmap visualization

### Workflow Trace

#### Steps 1-3: Same as Scenario 1
- Chat API ✅
- LangGraph Workflow ✅
- Goal Splitter ⚠️ (same issues)
- Task Planner ⚠️ (same issues + new ones)

**Additional Issues for Heatmap**:

**Task Planner Challenges**:
```typescript
// Expected plan:
{
  steps: [{
    stepId: "step_1",
    pluginId: "heatmap_generator",  // ✅ Plugin exists
    parameters: {
      dataSourceId: "???",  // ❌ Same resolution issue
      radius: 50,           // ⚠️ Default value, user didn't specify
      cellSize: 100,        // ⚠️ Default value
      fieldName: "population"  // ❌ How does planner know field name?
    }
  }]
}
```

**Critical Issues**:
1. ❌ **Field Name Inference**: LLM must guess that "人口" = `population` field
2. ❌ **Parameter Defaults**: User didn't specify radius/cellSize
3. ❌ **Point Data Validation**: Heatmap requires point data, not polygons
   - Residential data might be polygon (building footprints)
   - Need centroid extraction or error handling

---

#### Step 4: HeatmapExecutor Execution ⚠️ PARTIAL

**HeatmapExecutor Implementation**:
```typescript
async execute(params): Promise<NativeData> {
  // 1. Load point data
  const points = await this.loadPointData(params.dataSourceId);
  
  // 2. Calculate bounds
  const bounds = this.calculateBounds(points);
  
  // 3. Generate density grid (KDE algorithm)
  const grid = this.generateDensityGrid(points, bounds, radius, cellSize);
  
  // 4. Convert to GeoJSON
  const resultPath = await this.convertToGeoJSON(grid, bounds, colorRamp);
  
  return {
    id: heatmapId,
    type: 'geojson',
    reference: resultPath,  // File path
    metadata: { ... }
  };
}
```

**What Works**:
✅ Complete KDE implementation  
✅ Sample data fallback  
✅ GeoJSON output  

**What Fails**:
❌ **dataSourceId Resolution**: Same issue as Scenario 1  
⚠️ **Point vs Polygon**: If uploaded data is polygon, needs conversion  
⚠️ **Field Extraction**: Assumes `properties[fieldName]` exists  

**File**: `server/src/plugin-orchestration/executor/visualization/HeatmapExecutor.ts`

---

#### Step 5: Output Generation ⚠️ PARTIAL

**ServicePublisher**:
```typescript
// Heatmap result.data.type = 'geojson'
// Maps to: /api/results/step_1.geojson
```

**Same Issue**: ❌ No result endpoint

---

### Gap Analysis for Scenario 2

| Component | Status | Issue |
|-----------|--------|-------|
| Heatmap Plugin | ✅ Exists | - |
| Heatmap Executor | ✅ Implemented | - |
| **Data Source Upload** | ✅ Exists | POST /api/upload/single |
| **Field Name Resolution** | ❌ **MISSING** | LLM cannot infer field names |
| **Point/Polygon Handling** | ❌ **MISSING** | No geometry type validation |
| **Result Endpoint** | ❌ **MISSING** | Same as Scenario 1 |
| **Data Source Context** | ❌ **MISSING** | Same as Scenario 1 |

### Additional Missing Components

5. **❌ Geometry Type Validation** (HIGH)
   - Heatmap requires point data
   - Residential data often polygon
   - Need: Extract centroids or reject with clear error

6. **❌ Field Name Discovery** (HIGH)
   - How does LLM know available fields?
   - Need: Schema introspection endpoint
   - Or: Pass field list to TaskPlanner context

7. **❌ Parameter Inference** (MEDIUM)
   - User didn't specify radius/cellSize
   - LLM should ask clarifying questions OR use smart defaults
   - Current: Uses hardcoded defaults (may be inappropriate)

---

## Scenario 3: "显示乐山市影像数据"

### User Context
- **Data Source**: Uploaded Leshan.tif imagery
- **Operation**: Display the TIF image
- **Expected Output**: Raster image on map

### Workflow Trace

#### Steps 1-3: Similar Issues

**Goal Splitter**:
```typescript
{
  goals: [{
    description: "Display Leshan satellite imagery",
    type: "visualization",
    priority: 7
  }]
}
```

**Task Planner**:
```typescript
{
  steps: [{
    stepId: "step_1",
    pluginId: "???",  // ❌ What plugin displays imagery?
    parameters: {
      dataSourceId: "leshan.tif"
    }
  }]
}
```

**Critical Issue**: ❌ **No "Display Imagery" Plugin**
- No built-in plugin for simple image serving
- WMS Publisher exists but for creating WMS services, not displaying
- GeoTIFFAccessor exists but minimal implementation

---

#### Step 4: GeoTIFFAccessor Status ❌ INCOMPLETE

**Current Implementation**:
```typescript
export class GeoTIFFAccessor implements DataAccessor {
  async read(reference: string): Promise<NativeData> {
    console.log('[GeoTIFFAccessor] PLACEHOLDER - Minimal implementation');
    // Returns basic metadata only
    return {
      id: 'tif_' + Date.now(),
      type: 'tif',
      reference: reference,
      metadata: {
        placeholder: true,
        message: 'GeoTIFF accessor not fully implemented'
      }
    };
  }
  
  // Other methods are placeholders
  async write(): Promise<void> { throw new Error('Not implemented'); }
  async delete(): Promise<void> { throw new Error('Not implemented'); }
  async validate(): Promise<boolean> { return false; }
}
```

**What's Missing**:
- ❌ No GDAL integration
- ❌ No raster data reading
- ❌ No tile generation for display
- ❌ No metadata extraction (bounds, resolution, bands)

**File**: `server/src/data-access/accessors/GeoTIFFAccessor.ts`

---

#### Alternative Approach: WMS Service

**Could Use WMS Publisher**:
```typescript
const wmsPublisher = new WMSPublisher();
const serviceId = await wmsPublisher.generateService({
  id: 'leshan_tif',
  type: 'tif',
  reference: '/path/to/leshan.tif'
});

// Returns: /api/services/wms/{serviceId}
```

**WMS Publisher Strategy for GeoTIFF**:
```typescript
class GeoTIFFWMSStategy implements WMSGenerationStrategy {
  async generateService(sourceReference: string): Promise<string> {
    // TODO: Implement actual WMS service for GeoTIFF
    // Currently returns placeholder
    console.warn('[GeoTIFF WMS] Not fully implemented');
    return `wms_placeholder_${Date.now()}`;
  }
}
```

**Status**: ❌ **Placeholder Implementation**

**File**: `server/src/utils/publishers/WMSPublisher.ts`

---

#### Step 5: WMS Endpoint ✅ EXISTS (Partially)

**Route Defined**:
```typescript
router.all('/services/wms/:serviceId', (req, res) => 
  this.wmsServiceController.handleWMSRequest(req, res)
);
```

**WMSServiceController**:
```typescript
async handleWMSRequest(req, res): Promise<void> {
  const { serviceId } = req.params;
  const { REQUEST } = req.query;
  
  if (REQUEST === 'GetCapabilities') {
    // Returns WMS capabilities XML ✅
  } else if (REQUEST === 'GetMap') {
    // Returns map image ⚠️ Depends on strategy
    const imageBuffer = await wmsPublisher.getMap(serviceId, params);
    res.send(imageBuffer);
  }
}
```

**Issue**:
⚠️ GetMap calls `wmsPublisher.getMap()`  
❌ GeoTIFF strategy returns null (not implemented)  
❌ No actual image rendering

**File**: `server/src/api/controllers/WMSServiceController.ts`

---

### Gap Analysis for Scenario 3

| Component | Status | Issue |
|-----------|--------|-------|
| Chat API | ✅ Working | - |
| LangGraph Workflow | ✅ Working | - |
| **Imagery Display Plugin** | ❌ **MISSING** | No dedicated plugin |
| **GeoTIFF Accessor** | ❌ **Incomplete** | Placeholder only |
| **WMS GeoTIFF Strategy** | ❌ **Incomplete** | Placeholder only |
| WMS Endpoint | ✅ Exists | Strategy not implemented |
| **GDAL Integration** | ❌ **MISSING** | Required for raster ops |
| **Result Endpoint** | ❌ **MISSING** | Same as other scenarios |

### Missing Components

8. **❌ GeoTIFF Processing** (CRITICAL)
   - Need GDAL or geotiff.js library
   - Read raster data
   - Extract metadata (bounds, CRS, resolution)
   - Generate tiles or thumbnails

9. **❌ Image Serving Endpoint** (HIGH)
   ```typescript
   // Option 1: Direct file serving
   router.get('/results/:id.tif', (req, res) => {
     res.sendFile(tifPath);
   });
   
   // Option 2: Thumbnail generation
   router.get('/results/:id/thumbnail.png', async (req, res) => {
     const thumbnail = await generateThumbnail(tifPath);
     res.send(thumbnail);
   });
   ```

10. **❌ WMS GeoTIFF Implementation** (HIGH)
    - Render GeoTIFF to PNG/JPEG
    - Handle GetMap requests
    - Support SRS transformations

11. **❌ Tile Generation for Large Images** (MEDIUM)
    - For large TIFs, need tiling
    - Could use MVT for vector, but raster needs different approach
    - Consider: geojson-vt for raster tiles? Or server-side tiling

---

## Common Gaps Across All Scenarios

### Critical Infrastructure Missing

#### 1. ❌ Result Serving Endpoints (Blocks All Scenarios)

**Required Routes**:
```typescript
// In server/src/api/routes/index.ts

// Serve GeoJSON results
router.get('/results/:id.geojson', (req, res) => {
  const filePath = path.join(WORKSPACE_BASE, 'results', 'geojson', `${req.params.id}.geojson`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Result not found' });
  }
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(filePath);
});

// Serve TIF results
router.get('/results/:id.tif', (req, res) => {
  const filePath = path.join(WORKSPACE_BASE, 'results', 'geotiff', `${req.params.id}.tif`);
  res.setHeader('Content-Type', 'image/tiff');
  res.sendFile(filePath);
});

// Serve heatmap results
router.get('/results/:id/heatmap.geojson', (req, res) => {
  const filePath = path.join(WORKSPACE_BASE, 'results', 'heatmaps', `${req.params.id}.geojson`);
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(filePath);
});
```

**Impact**: Without these, frontend cannot retrieve any results

---

#### 2. ❌ Data Source Context & Discovery (Blocks Scenarios 1 & 2)

**Problem**: LLM agents cannot resolve natural language references like:
- "河流数据集" → Which PostGIS table?
- "小区数据" → Which uploaded file?

**Required Solutions**:

**A. Data Source Listing Endpoint**:
```typescript
router.get('/data-sources/available', (req, res) => {
  // Return all registered data sources with metadata
  const sources = db.prepare(`
    SELECT id, name, type, reference, metadata 
    FROM data_sources
  `).all();
  
  res.json(sources);
});
```

**B. Context Injection into Agents**:
```typescript
// In TaskPlannerAgent.execute()
const availableSources = await this.listAvailableDataSources();

const chain = promptTemplate.pipe(modelWithStructuredOutput);
const plan = await chain.invoke({
  userInput: state.userInput,
  availableDataSources: availableSources,  // ← Inject context
  timestamp: new Date().toISOString()
});
```

**C. Prompt Template Enhancement**:
```
You are a task planner. Available data sources:
{{#each availableDataSources}}
- {{name}} (type: {{type}}, id: {{id}})
{{/each}}

User request: {{userInput}}

Map the request to specific data source IDs and plugins.
```

---

#### 3. ❌ PostGIS Connection Management (Blocks Scenario 1)

**Required Endpoints**:
```typescript
// Register PostGIS connection
router.post('/data-sources/postgis', (req, res) => {
  const { name, host, port, database, username, password } = req.body;
  
  // Store in database (encrypt password!)
  const id = db.prepare(`
    INSERT INTO data_sources (name, type, reference, metadata)
    VALUES (?, 'postgis', ?, ?)
  `).run(name, `postgresql://${username}:${password}@${host}:${port}/${database}`, JSON.stringify({
    host, port, database, username
  }));
  
  // Configure PostGISAccessor
  dataAccessorFactory.configurePostGIS({
    host, port, database, user: username, password
  });
  
  res.json({ id: id.lastInsertRowid });
});

// List PostGIS tables
router.get('/data-sources/postgis/:id/tables', (req, res) => {
  const connection = getPostGISConnection(req.params.id);
  const tables = await connection.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  res.json(tables.rows);
});
```

---

#### 4. ❌ Field Schema Discovery (Blocks Scenario 2)

**Required Endpoint**:
```typescript
router.get('/data-sources/:id/schema', (req, res) => {
  const source = getDataSource(req.params.id);
  
  if (source.type === 'geojson') {
    // Parse GeoJSON and extract field names from first feature
    const geojson = JSON.parse(fs.readFileSync(source.reference));
    const fields = Object.keys(geojson.features[0]?.properties || {});
    res.json({ fields, sampleValues: geojson.features[0]?.properties });
  } else if (source.type === 'postgis') {
    // Query PostGIS column info
    const columns = await postGISAccessor.getSchema(source.reference);
    res.json(columns);
  }
});
```

**Usage in TaskPlanner**:
```typescript
// Get schema for selected data source
const schema = await this.getDataSourceSchema(dataSourceId);

const plan = await chain.invoke({
  userInput: state.userInput,
  availableFields: schema.fields,  // ← Help LLM choose correct field
  timestamp: new Date().toISOString()
});
```

---

#### 5. ❌ Result Persistence Verification (All Scenarios)

**Question**: Do executors actually write files to disk?

**Check BufferAnalysisExecutor**:
```typescript
async execute(params): Promise<NativeData> {
  const result = await accessor.buffer(...);
  
  // Does this write to disk?
  return {
    id: resultId,
    type: 'geojson',
    reference: `/workspace/results/geojson/${resultId}.geojson`,  // ← Path
    metadata: { ... }
  };
}
```

**Verification Needed**:
- Check if file is actually created at `reference` path
- If not, add file writing logic:
  ```typescript
  const outputPath = path.join(WORKSPACE_BASE, 'results', 'geojson', `${resultId}.geojson`);
  fs.writeFileSync(outputPath, JSON.stringify(resultGeoJSON));
  ```

---

## Unreasonable Design Aspects

Even if all gaps were filled, there are architectural concerns:

### 1. ⚠️ Over-Reliance on LLM for Data Resolution

**Current Design**:
- User says "河流数据集"
- LLM must figure out:
  - It's a PostGIS table
  - Which connection
  - Which table name
  - What operation to perform

**Problem**:
- Fragile: Depends on LLM accuracy
- No validation: Wrong table = silent failure
- No feedback: User doesn't know what was selected

**Better Approach**:
```typescript
// Explicit data source selection
{
  "message": "对河流数据集生成500米缓冲区并显示",
  "dataSourceId": "postgis_rivers_123",  // ← User selects from UI
  "parameters": {
    "distance": 500,
    "unit": "meters"
  }
}
```

**Hybrid Approach**:
- UI shows available data sources
- User clicks/selects
- Natural language describes operation
- LLM focuses on operation planning, not data resolution

---

### 2. ⚠️ No Intermediate Validation

**Current Flow**:
```
User Input → Goal Splitter → Task Planner → Plugin Executor → Output
```

**Problem**: No validation between steps
- Task Planner generates invalid plan → Executor fails
- Executor uses wrong parameters → Garbage output
- No early error detection

**Better Approach**:
```
User Input → Goal Splitter → [Validate Goals] → Task Planner → [Validate Plan] → Plugin Executor → [Validate Result] → Output
```

Add validation nodes:
```typescript
workflow.addNode('validatePlan', async (state) => {
  const plan = state.executionPlans.get(goalId);
  
  // Check dataSourceId exists
  if (!await dataSourceExists(plan.steps[0].parameters.dataSourceId)) {
    return {
      errors: [...state.errors, { goalId, error: 'Data source not found' }]
    };
  }
  
  // Check plugin exists
  if (!toolRegistry.hasTool(plan.steps[0].pluginId)) {
    return {
      errors: [...state.errors, { goalId, error: 'Plugin not found' }]
    };
  }
  
  return { currentStep: 'execution' };
});

workflow.addEdge('taskPlanner', 'validatePlan');
workflow.addEdge('validatePlan', 'pluginExecutor');
```

---

### 3. ⚠️ Service URL Generation Without Service Lifecycle

**Current Design**:
```typescript
// ServicePublisher generates URL
return `/api/results/${stepId}.geojson`;
```

**Problem**:
- Who creates the service entry in database?
- Who manages TTL/expiration?
- Who cleans up expired services?
- How does frontend know service is ready?

**Missing**: Service lifecycle management
```typescript
interface VisualizationService {
  id: string;
  url: string;
  status: 'pending' | 'ready' | 'expired';  // ← Track status
  ttl: number;
  expiresAt: Date;
  createdAt: Date;
}

// When generating service:
const service = {
  id: `service_${stepId}`,
  url: `/api/results/${stepId}.geojson`,
  status: 'pending',  // ← Not ready yet
  ttl: 3600000,
  expiresAt: new Date(Date.now() + 3600000),
  createdAt: new Date()
};

// Save to database
db.prepare('INSERT INTO visualization_services ...').run(service);

// After executor completes:
db.prepare('UPDATE visualization_services SET status = ? WHERE id = ?')
  .run('ready', service.id);
```

---

### 4. ⚠️ No Progress Feedback for Long Operations

**Scenario**: Buffer analysis on 1M river segments could take minutes

**Current UX**:
- User sends request
- SSE stream starts
- Silence for 2 minutes
- Suddenly: complete

**Better UX**:
```typescript
// PluginExecutor reports progress
for (const step of plan.steps) {
  streamingHandler.sendEvent({
    type: 'progress',
    stepId: step.stepId,
    progress: 0,
    message: 'Starting buffer analysis...'
  });
  
  const result = await tool.invoke(step.parameters);
  
  streamingHandler.sendEvent({
    type: 'progress',
    stepId: step.stepId,
    progress: 100,
    message: 'Buffer analysis complete'
  });
}
```

---

### 5. ⚠️ Heatmap Parameters Hardcoded

**Current Design**:
```typescript
// HeatmapExecutor uses defaults
const radius = params.radius || 50;
const cellSize = params.cellSize || 100;
```

**Problem**:
- 50m radius may be too small for city-scale data
- 100m cellSize may be too coarse for detailed analysis
- No guidance for users

**Better Approach**:
- Analyze data extent and point density
- Suggest appropriate parameters
- Or: Ask user via conversational interface

```typescript
// Smart parameter suggestion
const suggestedRadius = this.calculateOptimalRadius(points, bounds);
const suggestedCellSize = this.calculateOptimalCellSize(bounds, points.length);

if (!params.radius || !params.cellSize) {
  // Send clarification request via SSE
  streamingHandler.sendEvent({
    type: 'clarification',
    question: `Suggested parameters: radius=${suggestedRadius}m, cellSize=${suggestedCellSize}m. Use these?`,
    suggestions: [
      { label: 'Use suggested', value: { radius: suggestedRadius, cellSize: suggestedCellSize }},
      { label: 'Custom', value: null }
    ]
  });
}
```

---

## Recommendations

### Immediate Fixes (Block Production)

1. **Implement Result Endpoints** (4-6 hours)
   - GET /api/results/:id.geojson
   - GET /api/results/:id.tif
   - GET /api/results/:id/heatmap.geojson
   - Verify executors write files to disk

2. **Add Data Source Context** (6-8 hours)
   - POST /api/data-sources/postgis (register connections)
   - GET /api/data-sources/available (list all sources)
   - Inject context into TaskPlanner
   - Enhance prompt templates

3. **Complete GeoTIFF Support** (8-10 hours)
   - Integrate geotiff.js or GDAL
   - Implement read/write/validate
   - Add WMS GeoTIFF strategy
   - Generate thumbnails

### Short-Term Improvements (Enhance UX)

4. **Add Validation Layers** (4-6 hours)
   - Validate plans before execution
   - Check data source existence
   - Verify plugin parameters
   - Early error detection

5. **Implement Service Lifecycle** (4-6 hours)
   - Database table for visualization_services
   - Status tracking (pending/ready/expired)
   - Cleanup scheduler integration
   - Progress reporting

6. **Add Schema Discovery** (3-4 hours)
   - GET /api/data-sources/:id/schema
   - Extract field names from GeoJSON/PostGIS
   - Pass to TaskPlanner context
   - Help LLM choose correct fields

### Long-Term Architecture (Robustness)

7. **Hybrid Input Model** (6-8 hours)
   - Structured data source selection in UI
   - Natural language for operations
   - Reduce LLM burden on data resolution
   - More reliable workflows

8. **Progress Tracking** (4-6 hours)
   - SSE progress events
   - Estimated time remaining
   - Cancellable operations
   - Better UX for long tasks

9. **Smart Parameter Suggestions** (4-6 hours)
   - Analyze data characteristics
   - Suggest optimal parameters
   - Interactive refinement
   - Reduce trial-and-error

---

## Conclusion

### Can the System Support These Scenarios?

**Short Answer**: **No**, not in current state.

**Detailed Answer**:

The system has **excellent foundational architecture**:
- ✅ LangGraph workflow properly structured
- ✅ Plugin system well-designed
- ✅ Executors implemented (Buffer, Heatmap, Statistics)
- ✅ Service publishers exist
- ✅ SSE streaming works

But lacks **critical infrastructure**:
- ❌ No result serving endpoints
- ❌ No data source context/discovery
- ❌ Incomplete GeoTIFF support
- ❌ No PostGIS connection management
- ❌ No field schema discovery

**Estimated Effort to Full Support**:
- **Scenario 1** (River Buffer): 16-20 hours
- **Scenario 2** (Heatmap): 20-24 hours (includes Scenario 1 fixes)
- **Scenario 3** (TIF Display): 28-34 hours (includes all above + GeoTIFF)

**Total**: ~34 hours to fully support all three scenarios

### Architectural Quality

Despite missing features, the **architecture is sound**:
- Clear layer separation
- Extensible plugin system
- Type-safe TypeScript
- Well-documented code
- Follows best practices

The gaps are **implementation details**, not architectural flaws. With focused development on the identified missing components, the system can achieve full production readiness.

### Priority Order

1. **Result Endpoints** (Blocks everything)
2. **Data Source Context** (Enables Scenarios 1 & 2)
3. **PostGIS Management** (Enables Scenario 1)
4. **GeoTIFF Completion** (Enables Scenario 3)
5. **Validation & Lifecycle** (Improves reliability)
6. **UX Enhancements** (Polishes experience)

Following this order will systematically unlock each scenario while building a robust foundation for future features.
