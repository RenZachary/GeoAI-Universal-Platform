# Migration Guide: v1.0 → v2.0

## 📋 Overview

This guide provides step-by-step instructions for migrating GeoAI-UP from v1.0 to v2.0. The migration involves **breaking changes** and requires careful planning.

**Estimated Time**: 2-4 weeks (depending on codebase size)  
**Difficulty**: Medium-High  
**Backward Compatibility**: ❌ None (v2.0 is not backward compatible)

---

## 🎯 Migration Strategy

### Option 1: Big Bang Migration (Recommended for Small Teams)
- Migrate all modules at once
- Downtime: 1-2 days
- Risk: High (all-or-nothing)

### Option 2: Phased Migration (Recommended for Large Teams)
- Migrate module by module
- Downtime: Minimal (per module)
- Risk: Lower (can rollback individual modules)

This guide follows **Option 2** (Phased Migration).

---

## 📅 Migration Phases

```mermaid
graph TD
    A[Phase 1: Preparation] --> B[Phase 2: Data Access Layer]
    B --> C[Phase 3: Spatial Operators]
    C --> D[Phase 4: LLM Agents]
    D --> E[Phase 5: Workflow Engine]
    E --> F[Phase 6: API Layer]
    F --> G[Phase 7: Testing]
    G --> H[Phase 8: Deployment]
```

---

## Phase 1: Preparation (Week 1)

### 1.1 Create Migration Branch

```bash
# Create new branch from dev-v2.0
git checkout dev-v2.0
git pull origin dev-v2.0
git checkout -b migration/v1-to-v2

# Verify branch
git branch
# Should show: * migration/v1-to-v2
```

### 1.2 Backup Current Codebase

```bash
# Create backup tag
git tag backup/v1.0-pre-migration
git push origin backup/v1.0-pre-migration

# Optional: Create full backup archive
tar -czf geai-up-v1.0-backup.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  server/ web/ workspace/
```

### 1.3 Review Breaking Changes

Create a checklist of all breaking changes:

```markdown
## Breaking Changes Checklist

### API Changes
- [ ] `/api/tools/:id/execute` → `/api/operators/:id/execute`
- [ ] `/api/plugins` → `/api/operators`
- [ ] Request/response schemas changed

### Code Changes
- [ ] Plugin definitions removed
- [ ] Executor classes replaced by Operators
- [ ] ToolRegistry replaced by SpatialOperatorRegistry
- [ ] DataAccessor interface changed

### Configuration Changes
- [ ] Industry factor library removed (no config needed)
- [ ] New environment variables for backends
```

### 1.4 Setup Development Environment

```bash
# Install v2.0 dependencies
cd server
npm install

# Verify GDAL installation
node -e "require('gdal-async'); console.log('GDAL OK')"

# Verify PostGIS client
node -e "require('pg'); console.log('PostgreSQL client OK')"

# Run existing tests (should fail - expected)
npm test
```

---

## Phase 2: Migrate Data Access Layer (Week 2)

### 2.1 Create New Directory Structure

```bash
# Create new directories
mkdir -p server/src/data-access/backends
mkdir -p server/src/data-access/facade
mkdir -p server/src/spatial-operators
mkdir -p server/src/spatial-operators/operators
```

### 2.2 Implement DataAccessFacade

**File**: `server/src/data-access/facade/DataAccessFacade.ts`

Copy implementation from [05-DATA-ACCESS-FACADE.md](./05-DATA-ACCESS-FACADE.md).

### 2.3 Implement Backends

**Files to create**:
- `server/src/data-access/backends/GDALBackend.ts`
- `server/src/data-access/backends/PostGISBackend.ts`
- `server/src/data-access/backends/WebServiceBackend.ts`

**Migration steps**:
1. Copy buffer/overlay/filter logic from old accessors
2. Adapt to new backend interface
3. Add error handling and logging

### 2.4 Update DataSourceService

**File**: `server/src/services/DataSourceService.ts`

```typescript
// OLD (v1.0)
const accessor = DataAccessorFactory.getAccessor(dataSource.type);
const result = await accessor.read(dataSource.reference);

// NEW (v2.0)
const facade = DataAccessFacade.getInstance();
const result = await facade.execute(readOperator, dataSource);
```

### 2.5 Test Data Access Layer

```bash
# Run data access tests
npm test -- data-access

# Manual testing
node scripts/test-data-access.js
```

**Test checklist**:
- [ ] Read Shapefile via GDAL
- [ ] Read PostGIS table
- [ ] Buffer operation on file
- [ ] Buffer operation on database
- [ ] Overlay operation
- [ ] Error handling (missing file, connection failure)

---

## Phase 3: Migrate to Spatial Operators (Week 3)

### 3.1 Create Base Operator Class

**File**: `server/src/spatial-operators/SpatialOperator.ts`

Copy from [03-SPATIAL-OPERATOR-ARCHITECTURE.md](./03-SPATIAL-OPERATOR-ARCHITECTURE.md).

### 3.2 Migrate Existing Plugins to Operators

**Mapping table**:

| v1.0 Plugin | v2.0 Operator | File to Create |
|------------|---------------|----------------|
| BufferAnalysisPlugin | BufferOperator | `operators/BufferOperator.ts` |
| OverlayAnalysisPlugin | OverlayOperator | `operators/OverlayOperator.ts` |
| StatisticsCalculatorPlugin | AggregateOperator | `operators/AggregateOperator.ts` |
| HeatmapPlugin | KernelDensityOperator | `operators/KernelDensityOperator.ts` |
| ChoroplethPlugin | ChoroplethOperator | `operators/ChoroplethOperator.ts` |

**Migration example** (BufferAnalysis):

```typescript
// OLD: server/src/plugin-orchestration/executor/BufferAnalysisExecutor.ts
export class BufferAnalysisExecutor implements IPluginExecutor {
  async execute(params: BufferAnalysisParams): Promise<any> {
    // Direct GDAL calls
    const ds = gdal.open(params.dataSourceId);
    // ... 100+ lines
  }
}

// NEW: server/src/spatial-operators/operators/BufferOperator.ts
export class BufferOperator extends SpatialOperator {
  readonly operatorId = 'buffer_analysis';
  readonly operatorType = 'buffer';
  
  inputSchema = z.object({
    dataSourceId: z.string(),
    distance: z.number().positive(),
    unit: z.enum(['meters', 'kilometers']).default('meters')
  });
  
  protected async executeCore(params, context): Promise<OperatorResult> {
    // Use DataAccessFacade
    const dataSource = await context.dataSourceService.getDataSource(params.dataSourceId);
    const bufferOp = { operatorType: 'buffer', params };
    const nativeData = await context.dataAccessFacade.execute(bufferOp, dataSource);
    
    return {
      success: true,
      resultId: nativeData.id,
      type: 'native_data',
      reference: nativeData.reference
    };
  }
}
```

### 3.3 Create Operator Registry

**File**: `server/src/spatial-operators/SpatialOperatorRegistry.ts`

Copy from [03-SPATIAL-OPERATOR-ARCHITECTURE.md](./03-SPATIAL-OPERATOR-ARCHITECTURE.md).

### 3.4 Register All Operators

**File**: `server/src/spatial-operators/registerOperators.ts`

```typescript
import { SpatialOperatorRegistry } from './SpatialOperatorRegistry';
import { BufferOperator } from './operators/BufferOperator';
import { OverlayOperator } from './operators/OverlayOperator';
// ... import all operators

export function registerAllOperators(): void {
  const registry = SpatialOperatorRegistry.getInstance();
  
  registry.register(new BufferOperator());
  registry.register(new OverlayOperator());
  // ... register all
  
  console.log(`Registered ${registry.getCount()} operators`);
}
```

### 3.5 Update Application Initialization

**File**: `server/src/index.ts`

```typescript
// OLD (v1.0)
import { registerAllExecutors } from './plugin-orchestration/registration';
import { registerAllPluginCapabilities } from './plugin-orchestration/registration';

registerAllExecutors();
registerAllPluginCapabilities();

// NEW (v2.0)
import { registerAllOperators } from './spatial-operators/registerOperators';

registerAllOperators();
```

### 3.6 Test Operators

```bash
# Run operator tests
npm test -- spatial-operators

# Manual testing
node scripts/test-operators.js
```

---

## Phase 4: Migrate LLM Agents (Week 4)

### 4.1 Implement DataSourceSemanticAnalyzer

**File**: `server/src/llm-interaction/analyzers/DataSourceSemanticAnalyzer.ts`

```typescript
export class DataSourceSemanticAnalyzer {
  constructor(
    private dataSourceService: DataSourceService,
    private llm: BaseChatModel
  ) {}
  
  async analyzeAll(): Promise<DataSourceSemantics[]> {
    const sources = await this.dataSourceService.listAll();
    
    return await Promise.all(
      sources.map(source => this.inferSemantics(source))
    );
  }
  
  private async inferSemantics(source: DataSource): Promise<DataSourceSemantics> {
    const prompt = `Analyze this dataset:
      Name: ${source.name}
      Fields: ${JSON.stringify(source.fields)}
      
      What does this data represent?`;
    
    const result = await this.llm.invoke(prompt);
    
    return {
      id: source.id,
      semanticTags: extractTags(result),
      description: result.content
    };
  }
}
```

### 4.2 Update GoalSplitterAgent

**File**: `server/src/llm-interaction/agents/GoalSplitterAgent.ts`

Replace entire implementation with v2.0 version from [02-REFACTORING-PLAN-v2.0.md](./02-REFACTORING-PLAN-v2.0.md).

**Key changes**:
- Remove `GISIndustryKnowledgeBase` dependency
- Add `DataSourceSemanticAnalyzer` dependency
- Simplify execution flow (no industry matching)

### 4.3 Update TaskPlannerAgent

**File**: `server/src/llm-interaction/agents/TaskPlannerAgent.ts`

Simplify to single execution path (remove 3-mode logic).

### 4.4 Create New Prompt Templates

**Files to create**:
- `workspace/llm/prompts/en-US/factor-inference-v2.md`
- `workspace/llm/prompts/en-US/atomic-operator-mapping.md`

Copy from [REFACTORING-PLAN-v2.0.md](./REFACTORING-PLAN-v2.0.md).

### 4.5 Test LLM Agents

```bash
# Run agent tests
npm test -- llm-interaction

# Interactive testing
node scripts/test-llm-agents.js
```

**Test scenarios**:
- [ ] User asks for baby store location → LLM selects population + schools
- [ ] User asks for restaurant location → LLM selects foot traffic + offices
- [ ] Missing data scenario → LLM adapts plan
- [ ] Complex multi-step request → LLM creates proper workflow

---

## Phase 5: Migrate Workflow Engine (Week 5)

### 5.1 Update GeoAIGraph

**File**: `server/src/llm-interaction/workflow/GeoAIGraph.ts`

**Changes**:
1. Replace `pluginExecutor` node with `enhancedPluginExecutor`
2. Add parallel execution support
3. Update state types

```typescript
// OLD
workflow.addEdge('taskPlanner', 'pluginExecutor');

// NEW
workflow.addEdge('taskPlanner', 'enhancedPluginExecutor');
```

### 5.2 Implement EnhancedPluginExecutor

**File**: `server/src/llm-interaction/workflow/nodes/EnhancedPluginExecutor.ts`

Copy from [REFACTORING-PLAN-v2.0.md](./REFACTORING-PLAN-v2.0.md).

**Key features**:
- Parallel group execution
- Intermediate result persistence
- Error recovery

### 5.3 Update ServicePublisher

**File**: `server/src/llm-interaction/workflow/ServicePublisher.ts`

Add support for new visualization types and TTL management.

### 5.4 Test Workflow

```bash
# End-to-end workflow test
node scripts/test-complete-workflow.js

# Test parallel execution
node scripts/test-parallel-execution.js
```

---

## Phase 6: Migrate API Layer (Week 6)

### 6.1 Create New Controllers

**Files to create**:
- `server/src/api/controllers/SpatialOperatorController.ts`
- `server/src/api/controllers/DataSourceController.ts` (updated)

### 6.2 Update Routes

**File**: `server/src/api/routes/index.ts`

```typescript
// OLD (v1.0)
app.use('/api/tools', toolRouter);
app.use('/api/plugins', pluginRouter);

// NEW (v2.0)
app.use('/api/operators', operatorRouter);
app.use('/api/data-sources', dataSourceRouter);
```

### 6.3 Deprecate Old Endpoints

Add deprecation warnings to old endpoints:

```typescript
// server/src/api/controllers/ToolController.ts
async executeTool(req: Request, res: Response): Promise<void> {
  console.warn('[DEPRECATED] /api/tools/:id/execute is deprecated. Use /api/operators/:id/execute instead.');
  
  // Redirect to new endpoint or return error
  res.status(410).json({
    success: false,
    error: 'This endpoint is deprecated. Please use /api/operators/:id/execute',
    migrationGuide: 'https://docs.geai-up.com/migration/v2'
  });
}
```

### 6.4 Update API Documentation

Regenerate OpenAPI/Swagger docs:

```bash
npm run generate-api-docs
```

### 6.5 Test API

```bash
# Run API tests
npm test -- api

# Manual testing with curl
curl -X POST http://localhost:3000/api/operators/buffer_analysis/execute \
  -H "Content-Type: application/json" \
  -d '{"dataSourceId": "test_shp", "distance": 500}'
```

---

## Phase 7: Testing & Validation (Week 7)

### 7.1 Unit Tests

```bash
# Run all unit tests
npm test

# Expected: Some failures (old tests need updating)
```

**Update failing tests**:
- Replace Plugin references with Operator
- Update mock data structures
- Fix assertion expectations

### 7.2 Integration Tests

```bash
# Run integration tests
npm run test:integration

# Test scenarios:
# - Complete workflow from user input to visualization
# - Multi-step spatial analysis
# - Error handling and recovery
# - Performance under load
```

### 7.3 Performance Benchmarks

```bash
# Run performance tests
node scripts/benchmark-performance.js

# Compare with v1.0 baseline:
# - Task planning time
# - Spatial analysis execution time
# - Memory usage
# - API response time
```

**Expected improvements**:
- Task planning: +50% faster
- Spatial analysis: +40-60% faster (parallel)
- Memory: -30% lower

### 7.4 User Acceptance Testing

Create UAT checklist:

```markdown
## UAT Checklist

### Functionality
- [ ] User can describe task in natural language
- [ ] System correctly infers required data sources
- [ ] Analysis executes successfully
- [ ] Results are visualized on map
- [ ] Report is generated

### Usability
- [ ] Response time < 10 seconds for simple tasks
- [ ] Error messages are clear and actionable
- [ ] Progress indicators during long operations

### Edge Cases
- [ ] Missing data handled gracefully
- [ ] Invalid input rejected with helpful message
- [ ] Large datasets don't crash system
```

---

## Phase 8: Deployment (Week 8)

### 8.1 Prepare Production Environment

```bash
# Update environment variables
cat >> .env.production << EOF

# v2.0 Configuration
POSTGIS_CONNECTION_STRING=postgresql://user:pass@host:5432/db
GDAL_DATA_PATH=/usr/share/gdal
WORKSPACE_BASE=/opt/geai-up/workspace

# Performance tuning
MAX_PARALLEL_OPERATORS=4
OPERATOR_TIMEOUT_MS=30000
CACHE_TTL_SECONDS=3600
EOF
```

### 8.2 Database Migrations

```bash
# Run database migrations (if any)
npm run db:migrate

# Verify schema
npm run db:verify
```

### 8.3 Deploy Backend

```bash
# Build production bundle
npm run build

# Deploy to server
scp dist/* user@production:/opt/geai-up/server/

# Restart service
ssh user@production "systemctl restart geai-up"
```

### 8.4 Deploy Frontend (if changes)

```bash
cd web
npm run build
scp dist/* user@production:/opt/geai-up/web/
```

### 8.5 Monitor Deployment

```bash
# Check logs
ssh user@production "journalctl -u geai-up -f"

# Monitor metrics
# - CPU usage
# - Memory usage
# - API response times
# - Error rates
```

### 8.6 Rollback Plan

If issues occur:

```bash
# Quick rollback to v1.0
ssh user@production << 'EOF'
  systemctl stop geai-up
  cd /opt/geai-up
  mv server server-v2.0.bak
  mv server-v1.0.backup server
  systemctl start geai-up
EOF
```

---

## 🛠️ Migration Tools

### Automated Migration Script

Create `scripts/migrate-v1-to-v2.js`:

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('Starting v1.0 → v2.0 migration...');

// Step 1: Backup old files
const filesToBackup = [
  'server/src/plugin-orchestration',
  'server/src/data-access/accessors'
];

filesToBackup.forEach(dir => {
  const backupPath = `${dir}.bak`;
  if (fs.existsSync(dir)) {
    fs.renameSync(dir, backupPath);
    console.log(`✓ Backed up: ${dir}`);
  }
});

// Step 2: Create new directory structure
const dirsToCreate = [
  'server/src/spatial-operators',
  'server/src/spatial-operators/operators',
  'server/src/data-access/backends',
  'server/src/data-access/facade'
];

dirsToCreate.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created: ${dir}`);
  }
});

console.log('Migration preparation complete!');
console.log('Next: Manually implement new components');
```

### Code Search & Replace

Find all v1.0 patterns:

```bash
# Find Plugin references
grep -r "Plugin" server/src/ --include="*.ts" | grep -v ".bak"

# Find Executor references
grep -r "Executor" server/src/ --include="*.ts" | grep -v ".bak"

# Find ToolRegistry references
grep -r "ToolRegistry" server/src/ --include="*.ts" | grep -v ".bak"
```

Replace systematically:
- `Plugin` → `SpatialOperator`
- `Executor` → (removed, logic in Operator)
- `ToolRegistry` → `SpatialOperatorRegistry`

---

## ⚠️ Common Pitfalls

### 1. Forgetting to Update Imports

**Problem**: Old imports still reference v1.0 modules

**Solution**:
```typescript
// OLD
import { BufferAnalysisExecutor } from './plugin-orchestration/executor';

// NEW
import { BufferOperator } from './spatial-operators/operators/BufferOperator';
```

### 2. Not Removing Old Code

**Problem**: v1.0 code still exists, causing confusion

**Solution**:
```bash
# After migration is complete, remove backups
rm -rf server/src/plugin-orchestration.bak
rm -rf server/src/data-access/accessors.bak
```

### 3. Missing Environment Variables

**Problem**: New backends require configuration

**Solution**:
```bash
# Check for missing env vars
node scripts/check-env-vars.js

# Add to .env
POSTGIS_CONNECTION_STRING=postgresql://...
```

### 4. Incomplete Testing

**Problem**: Some edge cases not tested

**Solution**: Run comprehensive test suite before deployment

---

## 📊 Migration Checklist

```markdown
## Pre-Migration
- [ ] Backup current codebase
- [ ] Review breaking changes
- [ ] Setup development environment
- [ ] Create migration branch

## Phase 1: Data Access Layer
- [ ] Implement DataAccessFacade
- [ ] Implement GDALBackend
- [ ] Implement PostGISBackend
- [ ] Update DataSourceService
- [ ] Test data access

## Phase 2: Spatial Operators
- [ ] Create SpatialOperator base class
- [ ] Migrate all plugins to operators
- [ ] Create SpatialOperatorRegistry
- [ ] Update initialization code
- [ ] Test operators

## Phase 3: LLM Agents
- [ ] Implement DataSourceSemanticAnalyzer
- [ ] Update GoalSplitterAgent
- [ ] Update TaskPlannerAgent
- [ ] Create new prompt templates
- [ ] Test agents

## Phase 4: Workflow Engine
- [ ] Update GeoAIGraph
- [ ] Implement EnhancedPluginExecutor
- [ ] Update ServicePublisher
- [ ] Test workflows

## Phase 5: API Layer
- [ ] Create new controllers
- [ ] Update routes
- [ ] Deprecate old endpoints
- [ ] Update API docs
- [ ] Test API

## Phase 6: Testing
- [ ] Run unit tests
- [ ] Run integration tests
- [ ] Performance benchmarks
- [ ] User acceptance testing

## Phase 7: Deployment
- [ ] Prepare production environment
- [ ] Run database migrations
- [ ] Deploy backend
- [ ] Deploy frontend
- [ ] Monitor deployment
- [ ] Have rollback plan ready

## Post-Migration
- [ ] Remove old code backups
- [ ] Update documentation
- [ ] Train team on new architecture
- [ ] Collect feedback
```

---

## 🔗 Related Documents

- [02-REFACTORING-PLAN-v2.0.md](./02-REFACTORING-PLAN-v2.0.md) - Overall refactoring plan
- [05-DATA-ACCESS-FACADE.md](./05-DATA-ACCESS-FACADE.md) - Data access design
- [03-SPATIAL-OPERATOR-ARCHITECTURE.md](./03-SPATIAL-OPERATOR-ARCHITECTURE.md) - Operator design

---

## 💬 Support

For migration issues:
1. Check this guide first
2. Review related architecture documents
3. Contact architecture team
4. Create GitHub issue with details

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-09  
**Author**: GeoAI-UP Architecture Team
