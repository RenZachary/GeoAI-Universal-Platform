# Example Custom Plugin

This is a demonstration of how to create custom plugins for GeoAI-UP.

## Structure

```
example_analysis/
├── plugin.json      # Plugin metadata and schema
├── executor.js      # Execution logic (ES module)
└── README.md        # This file
```

## plugin.json

Defines the plugin's metadata, input/output schemas, and capabilities:

```json
{
  "id": "unique_plugin_id",
  "name": "Display Name",
  "version": "1.0.0",
  "description": "What this plugin does",
  "category": "analysis|visualization|data_import|report|utility",
  "main": "executor.js",  // ← Entry point file
  "inputSchema": [...],   // Parameter definitions
  "outputSchema": {...},  // Output type
  "capabilities": [...]   // Tags for filtering
}
```

## executor.js

Implements the execution logic. Must export a default async function:

```javascript
export default async function execute(params, context) {
  const { db, workspaceBase } = context;
  
  // Your custom logic here
  
  return {
    id: 'result_id',
    type: 'geojson',  // or 'mvt', 'statistics', etc.
    reference: '/path/to/result',
    metadata: { /* custom metadata */ },
    createdAt: new Date()
  };
}
```

### Parameters

- **params**: Object containing input parameters (validated against inputSchema)
- **context.db**: SQLite database instance for querying data sources
- **context.workspaceBase**: Base directory of the workspace

### Return Value

Must return an object compatible with NativeData interface:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique result identifier |
| type | string | Yes | Result type (geojson, mvt, statistics, etc.) |
| reference | string | No | Path to result file or service URL |
| metadata | object | No | Custom metadata |
| createdAt | Date | No | Timestamp (defaults to now) |

## Testing

### 1. Via API

```bash
# List available tools (should include example_analysis)
curl http://localhost:3000/api/tools

# Execute the plugin
curl -X POST http://localhost:3000/api/tools/example_analysis/execute \
  -H "Content-Type: application/json" \
  -d '{
    "dataSourceId": "your_data_source_id",
    "multiplier": 3,
    "operation": "sum"
  }'
```

### 2. Via Chat

```
User: "Run the example analysis on my data with multiplier 5"
LLM: [Selects example_analysis plugin]
System: [Executes custom executor]
```

## Development Tips

1. **Use console.log** for debugging (visible in server logs)
2. **Handle errors** gracefully with try-catch
3. **Validate inputs** before processing
4. **Return consistent format** matching NativeData structure
5. **Use ESM syntax** (import/export) not CommonJS (require/module.exports)

## Advanced Features

### Accessing Database

```javascript
const stmt = db.prepare('SELECT * FROM data_sources WHERE id = ?');
const dataSource = stmt.get(dataSourceId);
```

### Reading Files

```javascript
import fs from 'fs';
import path from 'path';

const filePath = path.join(workspaceBase, 'data', 'file.geojson');
const content = fs.readFileSync(filePath, 'utf-8');
```

### Creating Output Files

```javascript
import fs from 'fs';
import path from 'path';

const outputDir = path.join(workspaceBase, 'results', 'custom');
fs.mkdirSync(outputDir, { recursive: true });

const outputPath = path.join(outputDir, `result_${Date.now()}.geojson`);
fs.writeFileSync(outputPath, JSON.stringify(geojsonData));

return {
  id: 'result_123',
  type: 'geojson',
  reference: outputPath,
  // ...
};
```

## Limitations

- ❌ No sandboxing (custom code runs with full server privileges)
- ❌ No hot reload (must restart server after changes)
- ⚠️ Errors in custom plugins can crash the server
- ⚠️ No automatic dependency management

## Security Considerations

Since custom plugins run without sandboxing:

1. **Only load trusted plugins** from verified sources
2. **Review code** before installing third-party plugins
3. **Avoid production use** until proper sandboxing is implemented
4. **Monitor resource usage** to prevent infinite loops

## Next Steps

1. Modify this example to implement your own analysis
2. Check other built-in plugins for patterns
3. Read the CustomPluginLoader source code for implementation details
4. Contribute useful plugins back to the community!
