# Plugin Manager API - Quick Reference

## Base URL
```
http://localhost:3000/api
```

## Endpoints

### List All Plugins
```bash
GET /api/plugins
```

### Scan for New Plugins
```bash
POST /api/plugins/scan
```

### Enable a Plugin
```bash
POST /api/plugins/{plugin_id}/enable
```

### Disable a Plugin
```bash
POST /api/plugins/{plugin_id}/disable
```

### Delete a Plugin
```bash
DELETE /api/plugins/{plugin_id}
```

### Upload Plugin (Not Implemented)
```bash
POST /api/plugins/upload
# Returns 501 - Use manual placement instead
```

---

## Creating a Plugin

### 1. Create Directory
```bash
mkdir workspace/plugins/custom/my_plugin
```

### 2. Create plugin.json
```json
{
  "id": "my_plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Description here",
  "category": "utility",
  "inputSchema": [
    {
      "name": "param1",
      "type": "string",
      "required": true,
      "description": "Parameter description"
    }
  ],
  "outputSchema": {
    "type": "object",
    "description": "Output description"
  },
  "capabilities": ["capability1"],
  "isBuiltin": false
}
```

### 3. Create main.js
```javascript
module.exports = {
  execute: async (params) => {
    // Your logic here
    return {
      success: true,
      result: { /* your result */ }
    };
  }
};
```

### 4. Load the Plugin
```bash
curl -X POST http://localhost:3000/api/plugins/scan
```

---

## Testing with curl

### List plugins
```bash
curl http://localhost:3000/api/plugins
```

### Enable plugin
```bash
curl -X POST http://localhost:3000/api/plugins/my_plugin/enable
```

### Disable plugin
```bash
curl -X POST http://localhost:3000/api/plugins/my_plugin/disable
```

### Delete plugin
```bash
curl -X DELETE http://localhost:3000/api/plugins/my_plugin
```

---

## Testing with Node.js Scripts

### Run all tests
```bash
node scripts/test-plugin-manager.js
```

### Quick test
```bash
node scripts/test-plugin-simple.js
```

### Tool integration test
```bash
node scripts/test-plugin-as-tool.js
```

### Real-world example
```bash
node scripts/test-real-world-plugin.js
```

---

## Valid Categories
- `analysis`
- `visualization`
- `data_import`
- `report`
- `utility`

## Plugin ID Rules
- Alphanumeric + underscores only
- No spaces or special characters
- Must be unique (can't conflict with built-in plugins)

## Status Values
- `enabled` - Active and registered
- `disabled` - Inactive but files exist
- `error` - Failed to load

---

## Common Issues

### Plugin shows "error" status
- Check server logs for error details
- Verify plugin.json is valid JSON
- Ensure main.js has correct structure
- Check that plugin ID doesn't conflict with built-in plugins

### Plugin not appearing after scan
- Verify directory is in `workspace/plugins/custom/`
- Check that plugin.json exists (not manifest.json)
- Ensure plugin ID format is valid

### Tool execution fails
- Verify plugin is enabled (status = 'enabled')
- Check input parameters match inputSchema
- Look for errors in server console

---

## Built-in Plugin IDs (Avoid These)
- `buffer_analysis`
- `overlay_analysis`
- `filter`
- `aggregation`
- `mvt_publisher`
- `statistics_calculator`
- `report_generator`
- `heatmap`

---

## Quick Start Example

```bash
# 1. Create plugin directory
mkdir -p workspace/plugins/custom/hello_world

# 2. Create plugin.json
cat > workspace/plugins/custom/hello_world/plugin.json << EOF
{
  "id": "hello_world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "Simple hello world plugin",
  "category": "utility",
  "inputSchema": [
    {
      "name": "name",
      "type": "string",
      "required": true,
      "description": "Name to greet"
    }
  ],
  "outputSchema": {
    "type": "object",
    "description": "Greeting message"
  },
  "capabilities": ["greeting"],
  "isBuiltin": false
}
EOF

# 3. Create main.js
cat > workspace/plugins/custom/hello_world/main.js << EOF
module.exports = {
  execute: async (params) => {
    const name = params.name || 'World';
    return {
      success: true,
      result: {
        message: \`Hello, \${name}!\`,
        timestamp: new Date().toISOString()
      }
    };
  }
};
EOF

# 4. Scan to load plugin
curl -X POST http://localhost:3000/api/plugins/scan

# 5. List plugins to verify
curl http://localhost:3000/api/plugins

# 6. Execute as tool
curl -X POST http://localhost:3000/api/tools/hello_world/execute \
  -H "Content-Type: application/json" \
  -d '{"name": "GeoAI"}'

# 7. Clean up
curl -X DELETE http://localhost:3000/api/plugins/hello_world
```

---

For detailed documentation, see:
- `scripts/README_PLUGIN_TESTS.md` - Complete test documentation
- `scripts/PLUGIN_MANAGER_TEST_RESULTS.md` - Detailed test results
- `docs/implementation/IMPLEMENTATION-CUSTOM-PLUGIN-LOADER.md` - Implementation details
