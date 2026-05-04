# GeoAI-UP Critical Path Implementation Plan

**Priority**: Product Launch Focus  
**Timeline**: 2 Weeks to MVP  
**Strategy**: Frontend-first with Backend Integration

---

## Week 1: Foundation & Core Functionality

### Day 1-2: Frontend Project Setup

#### Task 1.1: Initialize Vue 3 Project
```bash
cd e:\codes\GeoAI-UP
npm create vite@latest web -- --template vue-ts
cd web
npm install
```

**Required Dependencies**:
```json
{
  "dependencies": {
    "vue": "^3.5.32",
    "vue-router": "^5.0.4",
    "pinia": "^3.0.4",
    "element-plus": "^2.13.7",
    "@element-plus/icons-vue": "^2.3.1",
    "maplibre-gl": "^4.7.1",
    "axios": "^1.15.0",
    "vue-i18n": "^9.14.4"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.6",
    "typescript": "^6.0.3",
    "vite": "^8.0.8",
    "vue-tsc": "^3.2.4"
  }
}
```

#### Task 1.2: Project Structure
```
web/
├── src/
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatWindow.vue
│   │   │   ├── MessageBubble.vue
│   │   │   └── StreamingText.vue
│   │   ├── map/
│   │   │   ├── MapView.vue
│   │   │   └── LayerControl.vue
│   │   ├── upload/
│   │   │   └── FileUpload.vue
│   │   └── layout/
│   │       ├── AppHeader.vue
│   │       ├── Sidebar.vue
│   │       └── MainLayout.vue
│   ├── views/
│   │   ├── HomeView.vue (Chat + Map)
│   │   ├── DataManagementView.vue
│   │   └── SettingsView.vue
│   ├── stores/
│   │   ├── chat.ts
│   │   ├── map.ts
│   │   └── config.ts
│   ├── router/
│   │   └── index.ts
│   ├── i18n/
│   │   └── index.ts
│   ├── api/
│   │   ├── chat.ts
│   │   ├── tools.ts
│   │   └── dataSources.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.vue
│   └── main.ts
├── public/
├── index.html
├── vite.config.ts
└── package.json
```

#### Task 1.3: Basic Layout Implementation
- Create responsive layout with sidebar + main content
- Implement dark/light theme support
- Set up internationalization (en-US, zh-CN)

**Deliverable**: Running Vue app with basic shell

---

### Day 3-4: Chat Interface with SSE

#### Task 2.1: SSE Consumer Implementation
```typescript
// web/src/api/chat.ts
export function streamChat(message: string, conversationId?: string) {
  return new ReadableStream({
    async start(controller) {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId })
      });
      
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const event = JSON.parse(line.slice(6));
            controller.enqueue(event);
          }
        }
      }
      
      controller.close();
    }
  });
}
```

#### Task 2.2: Chat Store (Pinia)
```typescript
// web/src/stores/chat.ts
export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as Message[],
    currentConversationId: null as string | null,
    isStreaming: false
  }),
  
  actions: {
    async sendMessage(message: string) {
      // Add user message
      this.messages.push({ role: 'user', content: message });
      
      // Start streaming
      this.isStreaming = true;
      const assistantMessage = { role: 'assistant', content: '' };
      this.messages.push(assistantMessage);
      
      // Consume SSE stream
      const stream = streamChat(message, this.currentConversationId);
      const reader = stream.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        this.handleSSEEvent(value, assistantMessage);
      }
      
      this.isStreaming = false;
    },
    
    handleSSEEvent(event: SSEEvent, message: Message) {
      switch (event.type) {
        case 'token':
          message.content += event.content;
          break;
        case 'visualization':
          this.addMapLayer(event);
          break;
        case 'complete':
          this.currentConversationId = event.conversationId;
          break;
      }
    }
  }
});
```

#### Task 2.3: Chat UI Components
- **ChatWindow.vue**: Main chat container with scroll
- **MessageBubble.vue**: User/AI message display with markdown support
- **StreamingText.vue**: Animated typing effect for tokens

**Deliverable**: Functional chat interface with real-time streaming

---

### Day 5: Agent Integration (Backend)

#### Task 3.1: Wire Agents into LangGraph Workflow

Update `GeoAIGraph.ts`:
```typescript
import { GoalSplitterAgent } from '../agents/GoalSplitterAgent';
import { TaskPlannerAgent } from '../agents/TaskPlannerAgent';
import { ToolRegistry } from '../../plugin-orchestration/registry/ToolRegistry';

export function createGeoAIGraph(
  llmConfig: LLMConfig,
  promptManager: PromptManager,
  toolRegistry: ToolRegistry
) {
  const goalSplitter = new GoalSplitterAgent(llmConfig, promptManager);
  const taskPlanner = new TaskPlannerAgent(llmConfig, promptManager, toolRegistry);
  
  const workflow = new StateGraph(GeoAIStateAnnotation)
    .addNode('goalSplitter', async (state) => {
      return await goalSplitter.execute(state);
    })
    .addNode('taskPlanner', async (state) => {
      return await taskPlanner.execute(state);
    })
    // ... rest of workflow
}
```

#### Task 3.2: Update ChatController to Use Configured Graph

```typescript
// ChatController.ts
constructor(
  db: Database.Database,
  llmConfig: LLMConfig,
  promptManager: PromptManager,
  toolRegistry: ToolRegistry
) {
  this.db = db;
  this.llmConfig = llmConfig;
  this.promptManager = promptManager;
  this.toolRegistry = toolRegistry;
}

async handleChat(req: Request, res: Response) {
  // ... existing setup
  
  const graph = createGeoAIGraph(
    this.llmConfig,
    this.promptManager,
    this.toolRegistry
  ).compile();
  
  // Execute with agents
  const stream = await graph.stream(initialState, {
    callbacks: [streamingHandler]
  });
  
  // Process stream...
}
```

#### Task 3.3: Update ApiRouter to Pass Dependencies

```typescript
constructor(db: Database.Database, llmConfig: LLMConfig) {
  this.router = Router();
  
  const toolRegistry = new ToolRegistry();
  const promptManager = new PromptManager(WORKSPACE_BASE);
  
  this.toolController = new ToolController(toolRegistry);
  this.chatController = new ChatController(
    db, 
    llmConfig,
    promptManager,
    toolRegistry
  );
  
  // Initialize tools
  await this.toolController.initialize();
}
```

**Deliverable**: End-to-end workflow with actual agent execution

---

## Week 2: Data Management & Visualization

### Day 6-7: File Upload & Data Sources

#### Task 4.1: Backend Upload Endpoint

Create `DataController.ts`:
```typescript
export class DataController {
  private workspaceBase: string;
  private db: Database.Database;
  
  constructor(workspaceBase: string, db: Database.Database) {
    this.workspaceBase = workspaceBase;
    this.db = db;
  }
  
  async uploadFile(req: Request, res: Response) {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Validate file type
    const allowedTypes = ['.shp', '.geojson', '.json', '.tif'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (!allowedTypes.includes(ext)) {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    
    // Save to workspace
    const destDir = path.join(this.workspaceBase, 'data/local');
    const destPath = path.join(destDir, `${Date.now()}_${file.originalname}`);
    
    fs.writeFileSync(destPath, file.buffer);
    
    // Register in database
    const dataSource = {
      id: generateId(),
      name: file.originalname,
      type: this.detectType(ext),
      reference: destPath,
      metadata: await this.extractMetadata(destPath, ext),
      createdAt: new Date()
    };
    
    this.db.prepare(`
      INSERT INTO data_sources (id, name, type, reference, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      dataSource.id,
      dataSource.name,
      dataSource.type,
      dataSource.reference,
      JSON.stringify(dataSource.metadata),
      dataSource.createdAt.toISOString()
    );
    
    res.json({ success: true, dataSource });
  }
}
```

Add multer middleware to `index.ts`:
```typescript
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/upload', upload.single('file'), (req, res) => {
  dataController.uploadFile(req, res);
});
```

#### Task 4.2: Frontend Upload Component

```vue
<!-- web/src/components/upload/FileUpload.vue -->
<template>
  <el-upload
    drag
    :action="uploadUrl"
    :on-success="handleSuccess"
    :on-error="handleError"
    accept=".shp,.geojson,.json,.tif"
  >
    <el-icon class="el-icon--upload"><upload-filled /></el-icon>
    <div class="el-upload__text">
      Drop file here or <em>click to upload</em>
    </div>
    <template #tip>
      <div class="el-upload__tip">
        Supported: Shapefile, GeoJSON, TIFF
      </div>
    </template>
  </el-upload>
</template>

<script setup lang="ts">
const uploadUrl = '/api/upload';

function handleSuccess(response: any) {
  ElMessage.success('File uploaded successfully');
  // Refresh data source list
}
</script>
```

#### Task 4.3: Data Source List View
- Table showing all uploaded files
- Metadata display (CRS, feature count, bbox)
- Delete functionality
- Preview button (opens map with data)

**Deliverable**: Users can upload and manage spatial data files

---

### Day 8-9: Map Visualization

#### Task 5.1: MapLibre GL Integration

```vue
<!-- web/src/components/map/MapView.vue -->
<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const mapContainer = ref<HTMLDivElement>();
let map: maplibregl.Map;

onMounted(() => {
  map = new maplibregl.Map({
    container: mapContainer.value!,
    style: 'https://demotiles.maplibre.org/style.json',
    center: [0, 0],
    zoom: 2
  });
  
  map.addControl(new maplibregl.NavigationControl());
});

// Expose method to add layers
defineExpose({
  addMVTLayer(serviceId: string, url: string) {
    map.addSource(serviceId, {
      type: 'vector',
      tiles: [url],
      minzoom: 0,
      maxzoom: 14
    });
    
    map.addLayer({
      id: `${serviceId}-fill`,
      type: 'fill',
      source: serviceId,
      'source-layer': 'default',
      paint: {
        'fill-color': '#088',
        'fill-opacity': 0.5
      }
    });
  }
});
</script>
```

#### Task 5.2: Handle Visualization Events from SSE

Update chat store:
```typescript
handleSSEEvent(event: SSEEvent, message: Message) {
  switch (event.type) {
    case 'visualization':
      // Notify map component to add layer
      this.emit('addLayer', {
        id: event.serviceId,
        type: event.type,
        url: event.url
      });
      break;
  }
}
```

#### Task 5.3: Layer Control Panel
- Toggle layer visibility
- Adjust opacity
- Change styling
- Remove layers

**Deliverable**: Interactive map showing analysis results

---

### Day 10: Plugin Execution Implementation

#### Task 6.1: Buffer Analysis Plugin

```typescript
// server/src/plugin-orchestration/plugins/executors/BufferAnalysisExecutor.ts
import * as turf from '@turf/turf';
import { NativeData } from '../../../core/types';

export class BufferAnalysisExecutor {
  async execute(params: {
    dataSourceId: string;
    distance: number;
    unit: string;
  }): Promise<NativeData> {
    // Load source data
    const sourceData = await this.loadDataSource(params.dataSourceId);
    
    // Parse GeoJSON
    const geojson = JSON.parse(fs.readFileSync(sourceData.reference, 'utf-8'));
    
    // Perform buffer
    const buffered = turf.buffer(geojson, params.distance, {
      units: params.unit as any
    });
    
    // Save result
    const resultPath = path.join(
      WORKSPACE_BASE,
      'results',
      `buffer_${Date.now()}.geojson`
    );
    fs.writeFileSync(resultPath, JSON.stringify(buffered));
    
    return {
      id: generateId(),
      type: 'geojson',
      reference: resultPath,
      metadata: {
        featureCount: this.countFeatures(buffered),
        bbox: turf.bbox(buffered)
      },
      createdAt: new Date()
    };
  }
}
```

#### Task 6.2: MVT Publisher Plugin

```typescript
// server/src/plugin-orchestration/plugins/executors/MVTPublisherExecutor.ts
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

export class MVTPublisherExecutor {
  async execute(params: {
    dataSourceId: string;
    minZoom: number;
    maxZoom: number;
  }): Promise<any> {
    // Load source data
    const sourceData = await this.loadDataSource(params.dataSourceId);
    const geojson = JSON.parse(fs.readFileSync(sourceData.reference, 'utf-8'));
    
    // Convert to vector tiles
    const tileIndex = geojsonvt(geojson, {
      minZoom: params.minZoom,
      maxZoom: params.maxZoom
    });
    
    // Create Express route for serving tiles
    const serviceId = `mvt_${Date.now()}`;
    const tileRoute = `/api/mvt/${serviceId}/{z}/{x}/{y}.pbf`;
    
    // Register route dynamically
    app.get(tileRoute, (req, res) => {
      const { z, x, y } = req.params;
      const tile = tileIndex.getTile(parseInt(z), parseInt(x), parseInt(y));
      
      if (!tile) {
        return res.status(404).send('Tile not found');
      }
      
      const pbf = vtpbf.fromGeojsonVt({ default: tile });
      res.send(Buffer.from(pbf));
    });
    
    return {
      serviceId,
      type: 'mvt',
      url: tileRoute,
      ttl: 3600, // 1 hour
      expiresAt: new Date(Date.now() + 3600000)
    };
  }
}
```

#### Task 6.3: Update PluginToolWrapper to Use Executors

```typescript
static wrapPlugin(plugin: Plugin): DynamicStructuredTool {
  return tool(
    async (input: Record<string, any>) => {
      try {
        // Route to appropriate executor based on plugin ID
        let result;
        
        switch (plugin.id) {
          case 'buffer_analysis':
            const bufferExecutor = new BufferAnalysisExecutor();
            result = await bufferExecutor.execute(input);
            break;
          
          case 'mvt_publisher':
            const mvtExecutor = new MVTPublisherExecutor();
            result = await mvtExecutor.execute(input);
            break;
          
          default:
            throw new Error(`No executor for plugin: ${plugin.id}`);
        }
        
        return JSON.stringify({
          success: true,
          resultId: result.id,
          metadata: result.metadata
        });
        
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error.message
        });
      }
    },
    {
      name: this.sanitizeName(plugin.name),
      description: this.enrichDescription(plugin),
      schema: this.convertToZodSchema(plugin.inputSchema)
    }
  );
}
```

**Deliverable**: Working spatial analysis plugins with real results

---

## Success Criteria

### End of Week 1
- ✅ Vue 3 app running with chat interface
- ✅ SSE streaming displays tokens in real-time
- ✅ Agents execute in workflow (visible in logs)
- ✅ Can have multi-turn conversations

### End of Week 2
- ✅ Users can upload GeoJSON files
- ✅ Uploaded files appear in data source list
- ✅ Chat can reference uploaded data
- ✅ Buffer analysis produces visible results on map
- ✅ MVT tiles display correctly in MapLibre

---

## Risk Mitigation

### Risk 1: LangChain Integration Complexity
**Mitigation**: Start with simple mock agents, gradually replace with real LLM calls

### Risk 2: Spatial Data Processing Performance
**Mitigation**: Use worker threads for heavy computations, implement progress indicators

### Risk 3: SSE Connection Stability
**Mitigation**: Implement reconnection logic, fallback to polling if needed

### Risk 4: Browser Compatibility for MapLibre
**Mitigation**: Test on Chrome/Firefox/Safari early, provide fallback messages

---

## Next Steps After MVP

1. Add authentication system
2. Implement remaining plugins (overlay, statistics)
3. Add prompt template editor UI
4. Build plugin marketplace
5. Optimize performance
6. Write comprehensive tests
7. Create deployment documentation

---

**Plan Created**: 2026-05-03  
**Target MVP Date**: 2026-05-17  
**Review Cadence**: Daily standups, weekly demos
