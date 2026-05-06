# Custom Plugin Implementation Guide

## Overview

GeoAI-UP now supports **custom plugins** that allow users to extend the system with their own analysis and visualization logic. Custom plugins consist of two parts:

1. **Plugin Manifest** (`plugin.json`) - Metadata and schema definition
2. **Executor** (`executor.js`) - Execution logic implementation

---

## Architecture

### Component Flow

```
┌─────────────────────────────────────────────────────┐
│  workspace/plugins/custom/my_plugin/                │
│                                                     │
│  plugin.json  ──→  CustomPluginLoader              │
│                       ↓                             │
│                  ToolRegistry (LLM discovery)       │
│                       ↓                             │
│  executor.js  ──→  ExecutorRegistry (execution)    │
└─────────────────────────────────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │  PluginToolWrapper      │
            │  (LangChain Tool)       │
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │  LLM Agent / API Call   │
            └─────────────────────────┘
```

### Loading Process

1. **Server Startup**: `CustomPluginLoader.scanAndRegisterDataFiles()` is called
2. **Directory Scan**: Scans `workspace/plugins/custom/` for plugin directories
3. **Manifest Loading**: Reads and validates `plugin.json`
4. **Tool Registration**: Registers plugin metadata with `ToolRegistry`
5. **Executor Loading**: Dynamically imports `executor.js` (if specified)
6. **Executor Registration**: Registers executor factory with `ExecutorRegistry`
7. **Ready State**: Plugin is now available for LLM selection and execution

---

## Creating a Custom Plugin

### Step 1: Create Plugin Directory

```bash
mkdir -p workspace/plugins/custom/my_custom_plugin
cd workspace/plugins/custom/my_custom_plugin
```

### Step 2: Create plugin.json

```json
{
  "id": "my_custom_plugin",
  "name": "My Custom Analysis",
  "version": "1.0.0",
  "description": "Performs custom spatial analysis on vector data",
  "category": "analysis",
  "main": "executor.js",
  "inputSchema": [
    {
      "name": "dataSourceId",
      "type": "string",
      "required": true,
      "description": "ID of the data source to analyze"
    },
    {
      "name": "threshold",
      "type": "number",
      "required": false,
      "defaultValue": 100,
      "description": "Threshold value for filtering"
    }
  ],
  "outputSchema": {
    "type": "geojson",
    "description": "Filtered features meeting the threshold criteria"
  },
  "capabilities": [
    "analysis",
    "filtering",
    "custom"
  ]
}
```

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (alphanumeric + underscores only) |
| `name` | string | Display name |
| `version` | string | Semver format (e.g., "1.0.0") |
| `description` | string | What the plugin does |
| `category` | string | One of: analysis, visualization, data_import, report, utility |
| `inputSchema` | array | Parameter definitions (see below) |
| `outputSchema` | object | Output type and description |
| `capabilities` | array | Tags for capability-based filtering |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `main` | string | Entry point file (executor). If omitted, returns mock data |
| `dependencies` | array | List of required dependencies (not yet enforced) |

### Step 3: Create executor.js

```javascript
/**
 * Custom Plugin Executor
 * 
 * @param {Object} params - Input parameters (validated against inputSchema)
 * @param {Object} context - Execution context
 * @param {Database} context.db - SQLite database instance
 * @param {string} context.workspaceBase - Workspace base directory
 * @returns {Object} NativeData-compatible result
 */

export default async function execute(params, context) {
  const { db, workspaceBase } = context;
  const { dataSourceId, threshold = 100 } = params;

  console.log('[My Custom Plugin] Starting execution...');
  console.log('[My Custom Plugin] Parameters:', params);

  try {
    // Step 1: Query data source from database
    const stmt = db.prepare('SELECT id, name, type, metadata FROM data_sources WHERE id = ?');
    const dataSource = stmt.get(dataSourceId);

    if (!dataSource) {
      throw new Error(`Data source not found: ${dataSourceId}`);
    }

    console.log('[My Custom Plugin] Found data source:', dataSource.name);

    // Step 2: Perform your custom analysis
    // Example: Filter features based on threshold
    const metadata = typeof dataSource.metadata === 'string'
      ? JSON.parse(dataSource.metadata)
      : dataSource.metadata;

    const featureCount = metadata.featureCount || 0;
    const filteredCount = Math.max(0, featureCount - threshold);

    // Step 3: Create result
    const result = {
      id: `custom_${dataSourceId}_${Date.now()}`,
      type: 'geojson',
      reference: '', // Or path to output file
      metadata: {
        operation: 'custom_filter',
        originalCount: featureCount,
        threshold,
        filteredCount,
        description: `Filtered ${featureCount} features with threshold ${threshold}`,
        customPlugin: true
      },
      createdAt: new Date()
    };

    console.log('[My Custom Plugin] Execution complete:', result);

    return result;

  } catch (error) {
    console.error('[My Custom Plugin] Execution failed:', error);
    throw error; // Re-throw to be caught by PluginToolWrapper
  }
}
```

#### Executor Requirements

1. **Export Format**: Must use ESM syntax (`export default`)
2. **Function Signature**: `async function execute(params, context)`
3. **Return Value**: Object compatible with NativeData interface
4. **Error Handling**: Use try-catch and re-throw errors

#### Context Object

| Property | Type | Description |
|----------|------|-------------|
| `db` | Database | Better-SQLite3 instance for querying data sources |
| `workspaceBase` | string | Absolute path to workspace directory |

#### Return Value Structure

```javascript
{
  id: string,           // Unique result ID
  type: string,         // Result type: 'geojson', 'mvt', 'statistics', etc.
  reference: string,    // Path to result file or service URL (optional)
  metadata: object,     // Custom metadata (optional)
  createdAt: Date       // Timestamp (defaults to now if omitted)
}
```

---

## Testing Custom Plugins

### Method 1: Via REST API

```bash
# 1. List all tools (verify plugin is registered)
curl http://localhost:3000/api/tools | jq '.tools[] | select(.id == "my_custom_plugin")'

# 2. Execute the plugin
curl -X POST http://localhost:3000/api/tools/my_custom_plugin/execute \
  -H "Content-Type: application/json" \
  -d '{
    "dataSourceId": "your_data_source_id",
    "threshold": 50
  }' | jq .
```

### Method 2: Via Test Script

```bash
node scripts/test-custom-plugin.js
```

### Method 3: Via Chat Interface

```
User: "Run my custom analysis on the rivers dataset with threshold 75"

LLM: [Selects my_custom_plugin based on intent]
     [Extracts parameters: dataSourceId=rivers_001, threshold=75]

System: [Executes custom executor]
        [Returns result]

Assistant: "Analysis complete! Processed X features with threshold 75..."
```

---

## Advanced Features

### Accessing Data Sources

```javascript
// Query data source metadata
const stmt = db.prepare('SELECT * FROM data_sources WHERE id = ?');
const dataSource = stmt.get(dataSourceId);

// Parse metadata
const metadata = JSON.parse(dataSource.metadata);
const geometryType = metadata.geometryType;
const fields = metadata.fields;
```

### Reading Files

```javascript
import fs from 'fs';
import path from 'path';

// Read GeoJSON file
const filePath = path.join(workspaceBase, 'data', 'myfile.geojson');
const geojson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
```

### Writing Output Files

```javascript
import fs from 'fs';
import path from 'path';

// Create output directory
const outputDir = path.join(workspaceBase, 'results', 'custom');
fs.mkdirSync(outputDir, { recursive: true });

// Write result file
const outputPath = path.join(outputDir, `result_${Date.now()}.geojson`);
fs.writeFileSync(outputPath, JSON.stringify(resultGeoJSON));

// Return with reference
return {
  id: 'result_123',
  type: 'geojson',
  reference: outputPath,
  metadata: { /* ... */ },
  createdAt: new Date()
};
```

### Using External Libraries

⚠️ **Warning**: External dependencies are NOT automatically managed. You must:

1. Install dependencies in server's node_modules:
   ```bash
   cd server
   npm install lodash
   ```

2. Import in executor:
   ```javascript
   import _ from 'lodash';
   
   export default async function execute(params, context) {
     const result = _.groupBy(data, 'category');
     // ...
   }
   ```

---

## Debugging

### Enable Verbose Logging

Add console.log statements throughout your executor:

```javascript
console.log('[My Plugin] Step 1: Loading data...');
console.log('[My Plugin] Parameters received:', params);
console.log('[My Plugin] Database query result:', dataSource);
```

View logs in server terminal or check `server/logs/` directory.

### Common Errors

#### "Executor file not found"
- Check that `main` field in plugin.json matches actual filename
- Ensure file is in the same directory as plugin.json

#### "Executor must export an execute function"
- Verify you're using `export default async function execute(...)`
- Don't use `module.exports` (CommonJS) - use ESM syntax

#### "Cannot find module"
- Restart server after adding new plugins
- Check file permissions

#### "Mock data returned"
- Verify `main` field is specified in plugin.json
- Check server logs for executor loading errors

---

## Best Practices

### 1. Validate Inputs

```javascript
if (!params.dataSourceId) {
  throw new Error('dataSourceId is required');
}

if (params.threshold < 0) {
  throw new Error('threshold must be non-negative');
}
```

### 2. Handle Errors Gracefully

```javascript
try {
  // Your logic
} catch (error) {
  console.error('[My Plugin] Failed:', error.message);
  throw new Error(`Custom plugin failed: ${error.message}`);
}
```

### 3. Return Consistent Format

Always return the same structure, even on partial success:

```javascript
return {
  id: `result_${Date.now()}`,
  type: 'geojson',
  reference: '',
  metadata: {
    success: true,
    message: 'Completed with warnings',
    warnings: ['Some features skipped']
  },
  createdAt: new Date()
};
```

### 4. Document Your Plugin

Create a README.md in your plugin directory:

```
my_custom_plugin/
├── plugin.json
├── executor.js
└── README.md  ← Usage instructions, examples, etc.
```

### 5. Version Control

Use semantic versioning and document changes:

```json
{
  "version": "1.0.0",  // Major.Minor.Patch
  "description": "Initial release"
}
```

---

## Limitations & Security

### Current Limitations

❌ **No Sandboxing**: Custom code runs with full server privileges  
❌ **No Hot Reload**: Must restart server after code changes  
❌ **No Dependency Management**: Manual npm install required  
❌ **No Isolation**: Plugins can access entire filesystem  

### Security Recommendations

1. **Only load trusted plugins** from verified sources
2. **Review code** before installing third-party plugins
3. **Avoid production use** until sandboxing is implemented
4. **Monitor resource usage** to prevent infinite loops or memory leaks
5. **Use separate workspace** for testing untrusted plugins

### Future Improvements

- [ ] VM2 sandboxing for code isolation
- [ ] Worker threads for parallel execution
- [ ] Timeout controls to prevent hangs
- [ ] Resource limits (memory, CPU)
- [ ] Automatic dependency resolution
- [ ] Hot reload support

---

## Examples

See the example plugin at:
```
workspace/plugins/custom/example_analysis/
```

This demonstrates:
- Basic plugin structure
- Database access
- Parameter handling
- Result generation
- Error handling

---

## Troubleshooting

### Plugin Not Showing in Tool List

1. Check server logs for loading errors
2. Verify plugin.json is valid JSON
3. Ensure plugin directory is in `workspace/plugins/custom/`
4. Restart server

### Executor Not Being Called

1. Verify `main` field exists in plugin.json
2. Check executor.js uses ESM syntax (`export default`)
3. Look for "Registered executor" message in logs
4. Test with simple console.log first

### Execution Fails Silently

1. Add console.log at start of execute function
2. Wrap entire function in try-catch
3. Check server logs for error messages
4. Test with minimal code first

---

## Contributing

If you create useful custom plugins, consider contributing them back to the community:

1. Document your plugin thoroughly
2. Include example usage
3. Test with various inputs
4. Share on GitHub or community forums

---

## Related Documentation

- [Phase 4 Completion Report](../../docs/architecture/visual-refactor/PHASE4-COMPLETION-REPORT.md)
- [ExecutorRegistry Implementation](../../server/src/plugin-orchestration/registry/ExecutorRegistry.ts)
- [CustomPluginLoader Source](../../server/src/plugin-orchestration/loader/CustomPluginLoader.ts)
- [Plugin System Architecture](../../docs/architecture/PLUGIN-SYSTEM-ARCHITECTURE.md)
