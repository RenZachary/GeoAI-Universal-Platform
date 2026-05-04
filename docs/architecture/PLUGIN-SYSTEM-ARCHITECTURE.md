# Plugin System Architecture

## Overview

The GeoAI-UP plugin system follows a **three-layer architecture** that separates concerns and enables extensibility:

```
┌─────────────────────────────────────────┐
│ 1. Plugin Definition (WHAT)             │
│    - Metadata, schema, capabilities     │
│    - Serializable, storable in DB       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 2. Plugin Executor (HOW)                │
│    - Business logic implementation      │
│    - Uses Data Access Layer             │
│    - Format-agnostic processing         │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 3. LangChain Tool Wrapper (INTERFACE)   │
│    - Converts to LangChain Tool         │
│    - Zod schema validation              │
│    - JSON response formatting           │
└─────────────────────────────────────────┘
```

---

## Directory Structure

```
server/src/plugin-orchestration/
│
├── plugins/                    # Layer 1: Definitions
│   ├── built-in/              # Built-in plugin schemas
│   │   ├── BufferAnalysisPlugin.ts
│   │   ├── OverlayAnalysisPlugin.ts
│   │   ├── MVTPublisherPlugin.ts
│   │   ├── StatisticsCalculatorPlugin.ts
│   │   └── index.ts           # Exports all + BUILT_IN_PLUGINS array
│   └── custom/                # Dynamically loaded (future)
│       └── [plugin-name]/
│           ├── plugin.json    # Metadata
│           └── executor.js    # Implementation
│
├── executor/                   # Layer 2: Execution Logic
│   ├── BufferAnalysisExecutor.ts
│   ├── OverlayAnalysisExecutor.ts    # TODO
│   ├── MVTPublisherExecutor.ts       # TODO
│   ├── StatisticsCalculatorExecutor.ts  # TODO
│   └── index.ts               # Executor registry/factory
│
├── tools/                      # Layer 3: LangChain Integration
│   └── PluginToolWrapper.ts   # Converts plugins to Tools
│
├── registry/                   # Tool Management
│   └── ToolRegistry.ts        # Register/unregister tools
│
├── loader/                     # Dynamic Loading (Future)
│   └── PluginLoader.ts        # Load custom plugins at runtime
│
├── lifecycle/                  # Lifecycle Management (Future)
│   └── PluginLifecycleManager.ts  # Install, update, remove
│
└── index.ts                    # Module exports
```

---

## Creating a Custom Plugin

### Option A: Built-in Plugin (TypeScript, Compiled)

**Files Required**: 2 files

#### 1. Plugin Definition (`plugins/built-in/MyPlugin.ts`)

```typescript
import { Plugin } from '../../core/types/index.js';

export const MyPlugin: Plugin = {
  id: 'my_plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'Description of what this plugin does',
  category: 'analysis',  // or 'visualization', 'data_import', etc.
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'data_reference',
      required: true,
      description: 'Input data source'
    },
    {
      name: 'parameter1',
      type: 'number',
      required: true,
      defaultValue: 100,
      description: 'Some parameter',
      validation: { min: 0, max: 1000 }
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'Output description'
  },
  capabilities: ['spatial_analysis'],
  isBuiltin: true,
  installedAt: new Date()
};
```

#### 2. Plugin Executor (`executor/MyPluginExecutor.ts`)

```typescript
import fs from 'fs';
import path from 'path';
import { NativeData, DataSourceType } from '../../core/types/index.js';
import { generateId } from '../../core/utils/helpers.js';
import { DataAccessorFactory } from '../../data-access/factories/DataAccessorFactory.js';

export interface MyPluginParams {
  dataSourceId: string;
  parameter1: number;
}

export class MyPluginExecutor {
  private workspaceBase: string;

  constructor(workspaceBase: string) {
    this.workspaceBase = workspaceBase;
  }

  async execute(params: MyPluginParams): Promise<NativeData> {
    // 1. Load data using Data Access Layer (format-agnostic)
    const sourcePath = params.dataSourceId;
    const ext = path.extname(sourcePath).toLowerCase();
    const dataSourceType = this.detectType(ext);
    
    const accessorFactory = new DataAccessorFactory();
    const accessor = accessorFactory.createAccessor(dataSourceType);
    const nativeData = await accessor.read(sourcePath);

    // 2. Convert to working format (usually GeoJSON for vector ops)
    const geojson = this.convertToGeoJSON(nativeData, sourcePath);

    // 3. Perform actual analysis (use Turf.js, GDAL, etc.)
    const result = this.performAnalysis(geojson, params);

    // 4. Save result
    const resultPath = this.saveResult(result);

    // 5. Return NativeData reference
    return {
      id: generateId(),
      type: 'geojson',
      reference: resultPath,
      metadata: { /* ... */ },
      createdAt: new Date()
    };
  }

  private detectType(ext: string): DataSourceType { /* ... */ }
  private convertToGeoJSON(nativeData: any, path: string): any { /* ... */ }
  private performAnalysis(geojson: any, params: any): any { /* ... */ }
  private saveResult(result: any): string { /* ... */ }
}
```

#### 3. Register the Plugin

Add to `plugins/built-in/index.ts`:
```typescript
export { MyPlugin } from './MyPlugin';

// Add to array
export const BUILT_IN_PLUGINS = [
  // ... existing plugins
  MyPlugin
];
```

Add executor routing in `tools/PluginToolWrapper.ts`:
```typescript
switch (plugin.id) {
  case 'my_plugin':
    const executor = new MyPluginExecutor(this.workspaceBase);
    result = await executor.execute(input as MyPluginParams);
    break;
  // ... other cases
}
```

---

### Option B: Custom Plugin (JavaScript, Dynamic Loading - Future)

**Files Required**: 2-3 files

```
workspace/plugins/custom/my-plugin/
├── plugin.json          # Metadata (same structure as Plugin interface)
├── executor.js          # CommonJS module with execute() function
└── README.md            # Documentation (optional)
```

#### plugin.json
```json
{
  "id": "my_custom_plugin",
  "name": "My Custom Plugin",
  "version": "1.0.0",
  "description": "Custom plugin loaded at runtime",
  "category": "analysis",
  "inputSchema": [...],
  "outputSchema": {...},
  "capabilities": ["spatial_analysis"],
  "isBuiltin": false
}
```

#### executor.js
```javascript
const turf = require('@turf/turf');
const fs = require('fs');

module.exports = {
  async execute(params, context) {
    // context provides: workspaceBase, db, logger, etc.
    const { dataSourceId, parameter1 } = params;
    
    // Load data
    const geojson = JSON.parse(fs.readFileSync(dataSourceId, 'utf-8'));
    
    // Process
    const result = turf.buffer(geojson, parameter1, { units: 'meters' });
    
    // Save and return
    const resultPath = `/path/to/result.geojson`;
    fs.writeFileSync(resultPath, JSON.stringify(result));
    
    return {
      id: crypto.randomUUID(),
      type: 'geojson',
      reference: resultPath,
      metadata: { /* ... */ }
    };
  }
};
```

---

## Key Architectural Principles

### 1. Separation of Concerns

| Layer | Responsibility | Changes When |
|-------|---------------|--------------|
| **Definition** | WHAT the plugin does | API changes, schema updates |
| **Executor** | HOW it does it | Algorithm improvements, bug fixes |
| **Tool Wrapper** | Interface to LLM | LangChain API changes |

**Benefit**: Can swap executors without changing API (e.g., local vs. cloud execution)

### 2. Format Agnosticism

Executors should work with ANY data source type through the Data Access Layer:

```typescript
// ❌ WRONG - Direct file I/O, only works with GeoJSON
const geojson = JSON.parse(fs.readFileSync(path, 'utf-8'));

// ✅ CORRECT - Uses Data Access Layer, works with Shapefile, GeoJSON, PostGIS, etc.
const accessor = factory.createAccessor(dataSourceType);
const nativeData = await accessor.read(reference);
const geojson = convertToGeoJSON(nativeData);
```

### 3. NativeData Principle

All results must be returned as `NativeData` references:
- Keeps original data formats intact
- Enables lazy loading
- Provides metadata for downstream operations
- Supports result chaining (output of one plugin → input of another)

### 4. Executor Isolation

Each executor is:
- **Stateless**: No shared state between executions
- **Independent**: Can be tested in isolation
- **Swappable**: Replace implementation without affecting callers
- **Sandboxed** (future): Run in separate process/container for security

---

## Executor Design Patterns

### Pattern 1: Template Method

```typescript
abstract class BasePluginExecutor {
  async execute(params: any): Promise<NativeData> {
    // 1. Validate inputs
    this.validate(params);
    
    // 2. Load data (template method - subclasses override)
    const data = await this.loadData(params);
    
    // 3. Process (abstract - subclasses implement)
    const result = await this.process(data, params);
    
    // 4. Save result (template method)
    return this.saveResult(result);
  }
  
  protected abstract loadData(params: any): Promise<any>;
  protected abstract process(data: any, params: any): Promise<any>;
  protected saveResult(result: any): NativeData { /* common logic */ }
}
```

### Pattern 2: Strategy Pattern for Multi-format Support

```typescript
interface DataConverter {
  convert(nativeData: NativeData, path: string): any;
}

class GeoJSONConverter implements DataConverter { /* ... */ }
class ShapefileConverter implements DataConverter { /* ... */ }
class PostGISConverter implements DataConverter { /* ... */ }

class BufferAnalysisExecutor {
  private converters: Map<DataSourceType, DataConverter> = new Map();
  
  convertToGeoJSON(nativeData: NativeData, path: string): any {
    const converter = this.converters.get(nativeData.type);
    if (!converter) throw new Error(`No converter for ${nativeData.type}`);
    return converter.convert(nativeData, path);
  }
}
```

---

## Current Implementation Status

| Plugin | Definition | Executor | Status |
|--------|-----------|----------|--------|
| Buffer Analysis | ✅ | ✅ (GeoJSON only) | Partial |
| Overlay Analysis | ✅ | ❌ | Not Started |
| MVT Publisher | ✅ | ❌ | Not Started |
| Statistics Calculator | ✅ | ❌ | Not Started |

### BufferAnalysisExecutor Limitations:
- ✅ Works with GeoJSON
- ⚠️ Shapefile support: Detected but conversion not implemented
- ❌ PostGIS support: Not implemented
- ❌ TIFF support: Not applicable (raster data)

---

## Testing Strategy (Future)

### Unit Tests
```typescript
describe('BufferAnalysisExecutor', () => {
  it('should buffer GeoJSON points', async () => {
    const executor = new BufferAnalysisExecutor('/tmp');
    const result = await executor.execute({
      dataSourceId: 'test/data/points.geojson',
      distance: 100,
      unit: 'meters'
    });
    
    expect(result.type).toBe('geojson');
    expect(result.metadata.featureCount).toBeGreaterThan(0);
  });
});
```

### Integration Tests
```typescript
describe('Plugin Tool Integration', () => {
  it('should execute buffer_analysis tool via LangChain', async () => {
    const tool = PluginToolWrapper.wrapPlugin(BufferAnalysisPlugin);
    const result = await tool.invoke({
      dataSourceId: 'test/data/river.geojson',
      distance: 500,
      unit: 'meters'
    });
    
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
  });
});
```

---

## Future Enhancements

### 1. Plugin Marketplace
- npm-like registry for plugins
- Version management
- Dependency resolution
- Rating/review system

### 2. Distributed Execution
- Run executors on remote workers
- Load balancing across multiple nodes
- GPU acceleration for heavy computations

### 3. Plugin Sandboxing
- Web Workers for browser-based execution
- Docker containers for server-side isolation
- Resource limits (CPU, memory, time)

### 4. Visual Plugin Builder
- Drag-and-drop interface for creating plugins
- Auto-generate schema from code
- Test harness included

---

## Summary

**For a custom plugin, you need**:
- **Built-in (TypeScript)**: 2 files (definition + executor) + registration
- **Custom (JavaScript)**: 2 files (plugin.json + executor.js) + dynamic loading

**Key principles**:
1. Separate WHAT (definition) from HOW (executor)
2. Use Data Access Layer for format agnosticism
3. Return NativeData references
4. Keep executors stateless and testable

**Current gaps**:
- Only BufferAnalysisExecutor implemented
- Limited to GeoJSON format
- Need Shapefile/PostGIS converters
- No dynamic plugin loading yet
