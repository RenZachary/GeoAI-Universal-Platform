# AI Knowledge Base Integration - Design Decisions Summary

## Overview

This document summarizes key architectural decisions made for the AI Knowledge Base integration into GeoAI-UP.

---

## 1. Configuration Management: WorkspaceManager vs .env

### Decision
**Use `WorkspaceManager` for directory management, NOT `.env` configuration.**

### Rationale

1. **Consistency**: GeoAI-UP already uses `WorkspaceManager` (server/src/storage/filesystem/WorkspaceManager.ts) to manage all workspace directories (data, plugins, results, etc.)

2. **Centralized Control**: All path management goes through a single source of truth:
   ```typescript
   // server/src/core/constants/index.ts
   export const WORKSPACE_DIRS = {
     KB_CHROMADB: 'knowledge-base/chromadb',
     KB_DOCUMENTS: 'knowledge-base/documents',
     KB_TEMP: 'knowledge-base/temp',
   } as const;
   
   // Usage
   const chromaPath = WorkspaceManagerInstance.getDirectoryPath('KB_CHROMADB');
   ```

3. **No Environment Variable Bloat**: Avoid adding KB-specific paths to `.env`, keeping it clean for truly environment-specific settings (API keys, ports, etc.)

4. **Runtime Flexibility**: Workspace base directory can be changed at initialization without modifying `.env`

### Implementation

Add new directory constants to `WORKSPACE_DIRS`:
```typescript
// server/src/core/constants/index.ts
export const WORKSPACE_DIRS = {
  // ... existing directories
  KB_CHROMADB: 'knowledge-base/chromadb',
  KB_DOCUMENTS: 'knowledge-base/documents',
  KB_TEMP: 'knowledge-base/temp',
} as const;
```

Update `WorkspaceManager.initialize()` to create these directories automatically.

---

## 2. Reference Implementation Location

### Decision
**Move `x.md` to `docs/articles/AI-Knowledge-Base-Simple-Reference.md`**

### Rationale

1. **Proper Categorization**: The x.md file is a simple standalone reference implementation, not core architecture documentation

2. **Articles Directory Purpose**: `docs/articles/` contains tutorial-style content and practical examples (e.g., `Vue3-SSE-Workflow-Feedback.md`)

3. **Clear Naming**: New name clearly indicates:
   - It's a simple/reference implementation
   - Related to AI Knowledge Base
   - Not the production architecture

4. **Separation of Concerns**: 
   - `docs/architecture/AI-KNOWLEDGE-BASE-INTEGRATION.md` → Production design
   - `docs/articles/AI-Knowledge-Base-Simple-Reference.md` → Learning resource

---

## 3. LangGraph Integration: Intent-Based Routing

### Problem Statement

Not all user queries require the full LangGraph workflow. Three scenarios need different handling:

| Scenario | Example | Issue with Original Design |
|----------|---------|---------------------------|
| **Pure Knowledge Query** | "What are Beijing's air quality standards?" | Should NOT go through task planner or plugin executor |
| **Pure GIS Analysis** | "Create 500m buffer around rivers" | Should NOT query knowledge base (wastes ~500ms) |
| **Hybrid Query** | "Show factories in areas with strict emission policies" | Needs BOTH KB context AND spatial analysis |
| **General Chat** | "Hello, how are you?" | Should bypass entire workflow |

### Decision
**Implement Intent Classification as first node with conditional routing**

### Architecture

```
User Input
    ↓
IntentClassifierNode (NEW)
    ↓
┌─────────────────────────────────────┐
│ Classify into:                      │
│ • GIS_ANALYSIS                      │
│ • KNOWLEDGE_QUERY                   │
│ • HYBRID                            │
│ • GENERAL_CHAT                      │
└────────┬────────────────────────────┘
         ↓
Conditional Routing:
  • GENERAL_CHAT → Direct LLM → END
  • KNOWLEDGE_QUERY → KB Retriever → Summary → END
  • GIS_ANALYSIS → Goal Splitter → Task Planner → Executor → Summary
  • HYBRID → KB Retriever → Goal Splitter → Task Planner → ...
```

### Benefits

✅ **Efficiency**: Skip unnecessary nodes (no KB lookup for pure GIS tasks saves ~500ms)  
✅ **Flexibility**: Handle diverse query types without forcing all through same pipeline  
✅ **User Experience**: Faster responses for simple queries  
✅ **Maintainability**: Clear separation of concerns (KB vs GIS vs Chat)  
✅ **Extensibility**: Easy to add new intent types (e.g., DATA_UPLOAD, VISUALIZATION_ONLY)  

### Implementation Details

#### IntentClassifierNode

Position: First node after `memoryLoader`

Classification Strategy:
1. **Rule-based pre-filtering** (fast path for obvious cases):
   - General chat patterns: `/^(hi|hello|thank|bye)/i`
   - GIS keywords: "buffer", "intersect", "calculate area", "show on map"
   - KB keywords: "policy", "regulation", "standard", "what is"

2. **LLM-based classification** (for complex/ambiguous cases):
   ```typescript
   const prompt = `
   Classify the user query into one of these categories:
   
   1. GIS_ANALYSIS: Requires spatial operations
   2. KNOWLEDGE_QUERY: Asks about policies, regulations, definitions
   3. HYBRID: Combines spatial analysis with policy context
   4. GENERAL_CHAT: Greetings, small talk
   
   Query: "${userInput}"
   
   Respond with JSON: {"type": "...", "confidence": 0.0-1.0}
   `;
   ```

#### Conditional Edges in LangGraph

```typescript
.addConditionalEdges('intentClassifier', (state) => {
  switch (state.intent?.type) {
    case 'GENERAL_CHAT':
      return 'summaryGenerator'; // Direct to summary
    case 'KNOWLEDGE_QUERY':
      return 'knowledgeRetriever'; // KB only
    case 'GIS_ANALYSIS':
      return 'goalSplitter'; // Standard workflow
    case 'HYBRID':
      return 'knowledgeRetriever'; // KB + GIS
    default:
      return 'goalSplitter'; // Fallback
  }
})
```

#### Modified Summary Generator

Adapt behavior based on intent type:

```typescript
async generate(state: GeoAIStateType) {
  if (state.intent?.type === 'KNOWLEDGE_QUERY') {
    // Generate answer from knowledge context only
    return await generateKnowledgeAnswer(state.knowledgeContext);
  } else if (state.intent?.type === 'GENERAL_CHAT') {
    // Direct LLM response
    return await generateChatResponse(state.userInput);
  } else {
    // Standard GIS analysis summary
    return await summaryGenerator.generate(state.executionResults);
  }
}
```

### Handling Each Scenario

#### Pure Knowledge Query
**User**: "What are Beijing's air quality standards?"

**Flow**:
```
intentClassifier → KNOWLEDGE_QUERY
    ↓
knowledgeRetriever → Fetch relevant policy documents
    ↓
summaryGenerator → Generate answer from KB context
    ↓
END (skip goalSplitter, taskPlanner, executor)
```

**SSE Events**:
```json
{"type":"intent_classified","data":{"type":"KNOWLEDGE_QUERY","confidence":0.92}}
{"type":"kb_retrieval_start"}
{"type":"kb_retrieval_complete","data":{"resultCount":3}}
{"type":"token","data":{"token":"According to Beijing Environmental..."}}
{"type":"source_citation","data":{"documentId":"doc_123","page":5}}
```

#### Hybrid Query
**User**: "Show me factories in areas with strict emission policies"

**Flow**:
```
intentClassifier → HYBRID
    ↓
knowledgeRetriever → Find emission policy documents
    ↓
goalSplitter → Identify spatial task: "find factories + filter by policy area"
    ↓
taskPlanner → Plan: 1) Load factory data, 2) Get policy regions from KB, 3) Spatial join
    ↓
parallelExecutor → Execute spatial operations
    ↓
summaryGenerator → Combine spatial results + policy context
```

**Key Challenge**: Extracting spatial constraints from KB documents.

**Solution**: KB metadata should include location information:
```typescript
metadata: {
  location: {
    type: 'polygon',
    coordinates: [[...]] // Beijing administrative boundary
  },
  policy_type: 'emission_standard',
  strictness_level: 'high'
}
```

#### Pure GIS Analysis
**User**: "Calculate total area of parks within 1km of subway stations"

**Flow**:
```
intentClassifier → GIS_ANALYSIS (confidence: 0.98)
    ↓
goalSplitter → Skip KB retrieval
    ↓
taskPlanner → Standard planning
    ↓
...
```

**Optimization**: Early exit from KB node saves ~500ms latency.

---

## 4. Summary of Changes to Architecture Document

The main architecture document (`docs/architecture/AI-KNOWLEDGE-BASE-INTEGRATION.md`) has been updated with:

1. **Section 7 Completely Rewritten**: Now covers intent-based routing strategy instead of simple node insertion
2. **Section 9 Updated**: Configuration management now uses WorkspaceManager pattern
3. **Section 4.2 Updated**: Query flow diagram reflects conditional routing
4. **Section 16 Updated**: Migration guide references new article location and intent router

---

## 5. Next Steps

1. **Implement IntentClassifierNode** (Priority: P0)
   - Start with rule-based classification
   - Add LLM-based fallback for ambiguous cases
   - Test with diverse query samples

2. **Update LangGraph Workflow** (Priority: P0)
   - Add conditional edges
   - Modify SummaryGenerator to handle multiple modes
   - Ensure backward compatibility with existing GIS workflows

3. **Add SSE Event Types** (Priority: P1)
   - `intent_classified` event
   - Update frontend to display intent type (optional, for debugging)

4. **Performance Testing** (Priority: P1)
   - Measure latency savings from skipping KB node
   - Benchmark intent classification accuracy
   - Tune confidence thresholds

---

## References

- Main Architecture Document: [AI-KNOWLEDGE-BASE-INTEGRATION.md](./AI-KNOWLEDGE-BASE-INTEGRATION.md)
- Simple Reference Implementation: [AI-Knowledge-Base-Simple-Reference.md](../articles/AI-Knowledge-Base-Simple-Reference.md)
- WorkspaceManager: `server/src/storage/filesystem/WorkspaceManager.ts`
- LangGraph Workflow: `server/src/llm-interaction/workflow/GeoAIGraph.ts`
