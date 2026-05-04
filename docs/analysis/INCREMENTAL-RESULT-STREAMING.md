# Incremental Result Streaming Implementation

## Overview

This document describes the implementation of **incremental result streaming** for the GeoAI-UP platform, allowing the frontend to render visualization layers progressively as each analysis goal completes, rather than waiting for all goals to finish.

---

## Problem Statement

### Before (Batch Mode)
```
User Query → Goal 1 Execution → Goal 2 Execution → Publish ALL Services → Send Completion
                                                                        ↓
                                                    Frontend receives all URLs at once
```

**Issues:**
- User waits for entire workflow to complete before seeing any results
- Poor UX for complex multi-goal queries
- No progress feedback during long-running operations

### After (Incremental Streaming)
```
User Query → Goal 1 Execution → Stream Service 1 → Goal 2 Execution → Stream Service 2
                                    ↓                                        ↓
                              Frontend renders                          Frontend renders
                              layer immediately                         layer immediately
```

**Benefits:**
- Progressive rendering - users see results as they become available
- Better perceived performance
- Real-time feedback on query progress

---

## Architecture Changes

### 1. Modified `GeoAIGraph.ts`

#### Added Callback Parameter
```typescript
export function createGeoAIGraph(
  llmConfig: LLMConfig, 
  workspaceBase: string, 
  toolRegistry: ToolRegistry,
  db?: Database.Database,
  onPartialResult?: (service: VisualizationService) => void  // ← NEW
) {
  // ...
}
```

#### Incremental Publishing in PluginExecutor
```typescript
// After completing ALL steps for a goal, publish services immediately
for (const [goalId, plan] of state.executionPlans.entries()) {
  // Execute all steps for this goal...
  
  // Filter results for THIS goal only
  const goalResults = new Map<string, any>();
  for (const [stepId, result] of executionResults.entries()) {
    if (result.goalId === goalId && result.status === 'success') {
      goalResults.set(stepId, result);
    }
  }
  
  // Publish services for this goal
  if (goalResults.size > 0) {
    const goalServices = servicePublisher.publishBatch(goalResults);
    
    // Add to accumulated services
    allServices.push(...goalServices);
    
    // Stream partial results to frontend via callback
    if (onPartialResult) {
      for (const service of goalServices) {
        onPartialResult(service);  // ← Triggers SSE event
      }
    }
  }
}
```

**Key Points:**
- Services are published **after each goal completes**, not after all goals
- Callback is invoked for each service, triggering SSE event
- Services are accumulated in `allServices` array for final completion event

---

### 2. Modified `ChatController.ts`

#### Pass Streaming Callback
```typescript
const graph = compileGeoAIGraph(
  this.llmConfig, 
  this.workspaceBase, 
  this.toolRegistry,
  this.db,
  // Incremental streaming callback
  (service) => {
    console.log(`[Chat API] Streaming partial result: ${service.id}`);
    res.write(`data: ${JSON.stringify({
      type: 'partial_result',
      service: {
        id: service.id,
        type: service.type,
        url: service.url,
        goalId: service.goalId,
        stepId: service.stepId,
        metadata: service.metadata
      },
      timestamp: Date.now()
    })}\n\n`);
  }
);
```

#### Capture Final Services
```typescript
let finalServices: any[] = [];

for await (const chunk of stream) {
  // Capture visualization services from outputGenerator node
  if (chunk.outputGenerator && chunk.outputGenerator.visualizationServices) {
    finalServices = chunk.outputGenerator.visualizationServices;
  }
}

// Send completion event with all accumulated services
res.write(`data: ${JSON.stringify({
  type: 'complete',
  conversationId: convId,
  services: finalServices,  // Include all services
  timestamp: Date.now()
})}\n\n`);
```

---

## SSE Event Flow

### Event Types

| Event Type | When Sent | Content |
|------------|-----------|---------|
| `token` | During LLM generation | Individual LLM tokens |
| `step_start` | Workflow node starts | Node name |
| `step_complete` | Workflow node ends | - |
| `tool_start` | Plugin execution starts | Plugin ID, parameters |
| `tool_complete` | Plugin execution ends | Result summary |
| **`partial_result`** | **After each goal completes** | **Service URL, metadata** |
| `complete` | Entire workflow finishes | All services, summary |

---

## Example Execution Timeline

### Query: "把小区数据集中面积最大的小区包含的建筑物显示出来，把小区也显示出来"

```
Time 0ms:     POST /api/chat
              ↓
Time 50ms:    SSE headers set
              ↓
Time 100ms:   Goal splitting starts (LLM streaming)
              ↓ SSE: token events...
Time 2000ms:  Goals identified: [Goal1, Goal2]
              ↓
Time 2100ms:  Task planning starts (LLM streaming)
              ↓ SSE: token events...
Time 4000ms:  Execution plans created
              ↓
Time 4100ms:  Goal 1, Step 1 executes (Aggregation - find MAX area)
Time 4500ms:  ✅ File written: aggregated_1234567890.geojson
Time 4600ms:  Goal 1, Step 2 executes (Spatial Join - find buildings)
Time 5200ms:  ✅ File written: spatial_join_1234567891.geojson
              ↓
Time 5300ms:  🎯 Goal 1 COMPLETE → Publish 2 services
              ↓ SSE: partial_result {url: "/api/results/spatial_join_1234567891.geojson"}
              ↓ SSE: partial_result {url: "/api/results/aggregated_1234567890.geojson"}
              ↓ Frontend fetches files and renders layers immediately!
              ↓
Time 5400ms:  Goal 2, Step 1 executes (Aggregation - reuse cached result)
Time 5500ms:  ✅ File written: aggregated_1234567892.geojson
              ↓
Time 5600ms:  🎯 Goal 2 COMPLETE → Publish 1 service
              ↓ SSE: partial_result {url: "/api/results/aggregated_1234567892.geojson"}
              ↓ Frontend fetches file and renders layer!
              ↓
Time 5700ms:  Summary generated
              ↓
Time 5800ms:  SSE: complete {services: [...], summary: "..."}
              ↓ Frontend knows all goals finished
```

---

## Frontend Integration

### JavaScript Example

```javascript
const eventSource = new EventSource('/api/chat');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'token':
      // Update LLM thinking display
      appendToThinkingBuffer(data.content);
      break;
      
    case 'partial_result':
      // 🎯 INCREMENTAL RENDERING
      const service = data.service;
      console.log(`Received partial result: ${service.url}`);
      
      // Fetch and render this layer immediately
      fetch(service.url)
        .then(res => res.json())
        .then(geojson => {
          map.addLayer({
            id: `layer_${service.id}`,
            type: service.type === 'geojson' ? 'fill' : 'raster',
            source: { type: 'geojson', data: geojson },
            paint: getStyleForGoal(service.goalId)
          });
          
          // Show notification
          showNotification(`Layer rendered: ${service.metadata?.pluginId}`);
        });
      break;
      
    case 'complete':
      // All goals finished
      console.log(`Workflow complete. Total services: ${data.services.length}`);
      eventSource.close();
      hideLoadingIndicator();
      break;
      
    case 'error':
      console.error('Workflow error:', data.message);
      eventSource.close();
      showError(data.message);
      break;
  }
};
```

### React Hook Example

```typescript
import { useState, useEffect } from 'react';

interface VisualizationService {
  id: string;
  type: 'geojson' | 'mvt' | 'image';
  url: string;
  goalId?: string;
  metadata?: any;
}

export function useGeoAIStreaming(query: string) {
  const [services, setServices] = useState<VisualizationService[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [thinking, setThinking] = useState('');

  useEffect(() => {
    const eventSource = new EventSource('/api/chat');
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'partial_result') {
        // Add service incrementally
        setServices(prev => [...prev, data.service]);
      } else if (data.type === 'complete') {
        setIsComplete(true);
        eventSource.close();
      } else if (data.type === 'token') {
        setThinking(prev => prev + data.content);
      }
    };
    
    return () => eventSource.close();
  }, [query]);

  return { services, isComplete, thinking };
}
```

---

## Benefits

### 1. Improved User Experience
- **Progressive Rendering**: Users see results as they become available
- **Reduced Perceived Latency**: First layer appears ~5s instead of ~6s
- **Visual Feedback**: Loading indicators per layer instead of global spinner

### 2. Better Performance Perception
```
Batch Mode:        [=====Wait 6s=====] → Render all layers
Incremental Mode:  [=2s=]→Layer1 [=1s=]→Layer2 [=1s=]→Layer3
```

### 3. Error Resilience
- If Goal 2 fails, Goal 1 results are already rendered
- Partial results still valuable to user
- Can retry failed goals independently

### 4. Scalability
- Works for any number of goals
- No changes needed as query complexity increases
- Frontend can handle N layers dynamically

---

## Trade-offs

### Advantages
✅ Better UX with progressive rendering  
✅ Real-time progress feedback  
✅ Error isolation per goal  
✅ No architectural changes to existing plugins  

### Considerations
⚠️ Slightly more complex state management in frontend  
⚠️ Multiple HTTP requests instead of one batch (mitigated by parallel fetching)  
⚠️ LangGraph state accumulates services incrementally (minimal overhead)  

---

## Testing

### Manual Test Scenario

1. **Start server**: `npm run dev`
2. **Send complex query**: "显示陕西省行政区划并做1000米缓冲区"
3. **Observe SSE events** in browser DevTools Network tab:
   ```
   EventStream response:
   data: {"type":"token","content":"I"}
   data: {"type":"token","content":" need"}
   ...
   data: {"type":"partial_result","service":{"url":"/api/results/buffer_xxx.geojson"}}
   data: {"type":"partial_result","service":{"url":"/api/results/shaanxi_xxx.geojson"}}
   data: {"type":"complete","services":[...]}
   ```
4. **Verify frontend behavior**:
   - Layers appear one by one
   - No waiting for all goals to complete
   - Each layer renders independently

### Automated Test (Future)

```typescript
describe('Incremental Streaming', () => {
  it('should stream partial results after each goal', async () => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Complex query...' })
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const events: any[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data: '));
      
      for (const line of lines) {
        const data = JSON.parse(line.replace('data: ', ''));
        events.push(data);
      }
    }
    
    // Verify partial_result events exist
    const partialResults = events.filter(e => e.type === 'partial_result');
    expect(partialResults.length).toBeGreaterThan(0);
    
    // Verify partial results come before complete event
    const completeIndex = events.findIndex(e => e.type === 'complete');
    const lastPartialIndex = events.lastIndexOf(
      events.find(e => e.type === 'partial_result')
    );
    expect(lastPartialIndex).toBeLessThan(completeIndex);
  });
});
```

---

## Future Enhancements

### 1. Parallel Goal Execution
Currently goals execute sequentially. Could enable parallel execution for independent goals:

```typescript
// Future: Execute independent goals in parallel
const independentGoals = partitionGoalsByDependencies(state.executionPlans);
await Promise.all(
  independentGoals.map(goal => executeGoal(goal, onPartialResult))
);
```

### 2. WebSocket Support
Replace SSE with WebSocket for bidirectional communication:
- Client can cancel specific goals
- Server can push more detailed progress updates
- Better support for real-time collaboration

### 3. Service Prioritization
Stream high-priority goals first:

```typescript
// Sort goals by priority before execution
const sortedGoals = Array.from(state.executionPlans.entries())
  .sort((a, b) => a[1].priority - b[1].priority);
```

### 4. Streaming File Downloads
Instead of writing to disk then serving via HTTP, stream file content directly:

```typescript
// Future: Stream GeoJSON content as it's generated
res.write(`data: ${JSON.stringify({
  type: 'file_chunk',
  serviceId: service.id,
  chunk: geojsonChunk,
  isLast: false
})}\n\n`);
```

---

## Migration Guide

### For Existing Code

No changes required! The incremental streaming is **opt-in**:

1. **If you don't pass `onPartialResult` callback**: Behavior is identical to before (batch mode)
2. **If you pass `onPartialResult` callback**: Services stream incrementally

### For New Plugins

No changes needed. Plugins continue to write files to disk and return `NativeData`. The streaming happens at the workflow level, not plugin level.

---

## Summary

The incremental result streaming implementation provides a significant UX improvement with minimal code changes:

- **Backend**: Added callback parameter to workflow, invoke after each goal
- **Frontend**: Listen for `partial_result` events, render layers progressively
- **Compatibility**: Fully backward compatible, opt-in feature

This enables responsive, progressive rendering for complex multi-goal geospatial analysis queries.
