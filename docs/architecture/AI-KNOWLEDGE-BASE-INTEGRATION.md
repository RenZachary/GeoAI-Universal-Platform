# AI Knowledge Base Integration Architecture

## Document Information

- **Version**: 1.0.0
- **Status**: Design Phase
- **Last Updated**: 2026-05-12
- **Author**: GeoAI-UP Team
- **Related Documents**: 
  - [LLM Interaction Layer Architecture](./LLM-INTERACTION-LAYER-ARCHITECTURE.md)
  - [Plugin System Design](./PLUGIN-SYSTEM-DESIGN.md)
  - [LangGraph Workflow Engine](../architecture/LANGCHAIN-INTEGRATION-SUMMARY.md)

---

## 1. Overview

### 1.1 Purpose

This document defines the architecture for integrating an AI-powered knowledge base system into GeoAI-UP, enabling users to query both spatial data and unstructured documents (PDF, Word, Markdown) through natural language.

### 1.2 Problem Statement

**Current Limitation**: GeoAI-UP can only analyze structured spatial data (Shapefile, GeoJSON, PostGIS). Users cannot ask questions about:
- Policy documents ("What are the environmental regulations in Chaoyang District?")
- Technical specifications ("How to perform buffer analysis?")
- Historical reports ("Show me last year's urban planning summary")

**Solution**: Implement a Retrieval-Augmented Generation (RAG) system that:
1. Ingests unstructured documents
2. Converts text to vector embeddings
3. Performs semantic search
4. Combines retrieved context with LLM responses

### 1.3 Strategic Value

| Dimension | Before | After |
|-----------|--------|-------|
| **Data Types** | Structured spatial data only | + Unstructured documents |
| **Use Cases** | GIS analysis tasks | + Policy queries, document Q&A, compliance checks |
| **Market** | Professional GIS users | + Government, enterprise document management |
| **Competitive Edge** | Spatial analysis tool | Spatial AI + Knowledge platform |

---

## 2. Technology Stack Selection

### 2.1 Core Technologies

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Vector Database** | ChromaDB | Pure JavaScript implementation, no native compilation issues, easy deployment |
| **Embedding Model** | Alibaba DashScope `text-embedding-v2` | Superior Chinese language support, 1536 dimensions, cost-effective |
| **Re-ranking** | BGE Reranker (via API or local) | Improves retrieval accuracy by re-scoring top-K results |
| **Document Parsing** | pdf-parse, mammoth, marked | Lightweight, pure Node.js, no external dependencies |
| **Text Splitting** | LangChain `RecursiveCharacterTextSplitter` | Proven strategy for maintaining semantic coherence |
| **Storage Backend** | SQLite (existing) + ChromaDB (new) | Leverage existing infrastructure, minimal operational overhead |

### 2.2 Why Not FAISS?

**FAISS Drawbacks**:
- Requires Python environment for compilation on Windows
- Native module compatibility issues across Node.js versions
- Complex deployment for non-technical users

**ChromaDB Advantages**:
- ✅ Pure JavaScript/TypeScript implementation
- ✅ No compilation step (`npm install` works out-of-the-box)
- ✅ Built-in persistence (SQLite backend)
- ✅ Active community and frequent updates
- ✅ Similar performance for <100K documents (our target scale)

### 2.3 Embedding Model Comparison

| Model | Language Support | Dimensions | Cost (per 1K tokens) | Latency |
|-------|-----------------|------------|---------------------|---------|
| OpenAI `text-embedding-3-small` | Good (English optimal) | 1536 | $0.02 | ~200ms |
| **Alibaba `text-embedding-v2`** | **Excellent (Chinese optimized)** | **1536** | **¥0.0007** | **~150ms** |
| Baidu ERNIE-Bot | Good | 1024 | ¥0.002 | ~300ms |

**Decision**: Use Alibaba DashScope for superior Chinese performance and lower cost.

---

## 3. Architecture Design

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Vue 3)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ KB Management│  │ Chat View    │  │ Document Upload  │  │
│  │ Panel        │  │ (Enhanced)   │  │ Interface        │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────┘  │
└───────────────────────────┼─────────────────────────────────┘
                            │ RESTful API + SSE
┌───────────────────────────▼─────────────────────────────────┐
│                Backend (Express + TypeScript)                │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Knowledge Base Service Layer                  │  │
│  │  ┌─────────────┐ ┌──────────┐ ┌──────────────────┐  │  │
│  │  │Doc Parser   │ │Text      │ │Vector Store      │  │  │
│  │  │(PDF/Word/MD)│ │Splitter  │ │(ChromaDB)        │  │  │
│  │  └─────────────┘ └──────────┘ └──────────────────┘  │  │
│  │  ┌─────────────┐ ┌──────────┐ ┌──────────────────┐  │  │
│  │  │Retriever    │ │Reranker  │ │RAG Query Engine  │  │  │
│  │  │(Semantic)   │ │(BGE)     │ │(Context Assembly)│  │  │
│  │  └─────────────┘ └──────────┘ └──────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │         LangGraph Workflow Integration                 │  │
│  │                                                       │  │
│  │  goalSplitter → knowledgeRetriever → taskPlanner      │  │
│  │       ↓                                               │  │
│  │  parallelExecutor → summaryGenerator                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │         Existing LLM Interaction Layer                 │  │
│  │  PromptManager + LLMAdapter + StreamingHandler        │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    Storage Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ SQLite       │  │ ChromaDB     │  │ File System      │  │
│  │ (Metadata)   │  │ (Vectors)    │  │ (Raw Documents)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Module Structure

```
server/src/
├── knowledge-base/              # New module
│   ├── index.ts                 # Module exports
│   ├── types.ts                 # Type definitions
│   ├── parsers/                 # Document parsing
│   │   ├── DocumentParser.ts    # Interface
│   │   ├── PdfParser.ts
│   │   ├── WordParser.ts
│   │   └── MarkdownParser.ts
│   ├── chunking/                # Text splitting
│   │   ├── ChunkingStrategy.ts
│   │   └── RecursiveSplitter.ts
│   ├── embedding/               # Vector generation
│   │   ├── EmbeddingService.ts
│   │   └── DashScopeAdapter.ts
│   ├── vector-store/            # Vector database
│   │   ├── ChromaDBAdapter.ts
│   │   └── CollectionManager.ts
│   ├── retrieval/               # Semantic search
│   │   ├── Retriever.ts
│   │   ├── Reranker.ts
│   │   └── HybridSearch.ts
│   ├── rag-engine/              # RAG orchestration
│   │   ├── RagQueryEngine.ts
│   │   └── ContextAssembler.ts
│   └── services/                # Business logic
│       ├── KnowledgeBaseService.ts
│       └── DocumentIngestionService.ts
│
├── llm-interaction/
│   └── workflow/
│       └── nodes/
│           └── KnowledgeRetrieverNode.ts  # New LangGraph node
│
└── api/
    └── controllers/
        └── KnowledgeBaseController.ts     # New API endpoints
```

---

## 4. Data Flow Design

### 4.1 Document Ingestion Pipeline

```
User uploads PDF/Word/Markdown
          ↓
FileUploadController receives file
          ↓
DocumentIngestionService.ingest()
          ↓
┌─────────────────────────┐
│ 1. Validate & Save File  │ ← File system storage
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ 2. Parse to Plain Text   │ ← pdf-parse / mammoth / marked
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ 3. Split into Chunks     │ ← RecursiveCharacterTextSplitter
│    (chunkSize: 1000,     │    chunkOverlap: 100
│     overlap: 100)        │
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ 4. Generate Embeddings   │ ← DashScope API (batch)
│    (1536-dim vectors)    │
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ 5. Store in ChromaDB     │ ← Collection: "geoai_kb"
│    + Metadata in SQLite  │    Metadata: doc_id, filename, 
└───────────┬─────────────┘             upload_date, page_num
            ↓
Return: { documentId, chunkCount, status }
```

### 4.2 Query Processing Flow (Intent-Based Routing)

```
User asks: "What are the environmental policies in Beijing?"
          ↓
┌─────────────────────────┐
│ Intent Classifier Node   │ ← NEW FIRST NODE
│ Classifies as:           │
│ KNOWLEDGE_QUERY (0.92)   │
└───────────┬─────────────┘
            ↓
    ┌───────────────────┐
    │ Conditional Route  │ → Skip goalSplitter, taskPlanner
    └────────┬──────────┘
             ↓
┌─────────────────────────┐
│ Knowledge Retriever Node │
│                          │
│ 1. Generate query vector │    (DashScope Embedding)
│ 2. Search ChromaDB       │    (Top-K=10, similarity threshold)
│ 3. Re-rank results       │    (BGE Reranker, Top-3)
│ 4. Assemble context      │    (Chunk text + metadata)
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ Summary Generator Node   │ ← Adapted for KB-only mode
│ Generates answer from    │
│ knowledgeContext         │
└───────────┬─────────────┘
            ↓
SSE Stream to Frontend:
  - intent_classified event
  - kb_retrieval_start/completed events
  - token events (answer text)
  - source citations (document references)
```

### 4.3 Spatial-Aware RAG (Advanced)

For queries with location context:

```
User: "Show environmental policies applicable to Chaoyang District"
          ↓
┌─────────────────────────┐
│ 1. Extract Location      │ ← NER (Named Entity Recognition)
│    "Chaoyang District"   │    or geocoding API
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ 2. Geocode to Polygon    │ ← Convert to WGS84 coordinates
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ 3. Hybrid Retrieval      │
│                          │
│ ChromaDB Semantic Search │ ← Vector similarity
│          +               │
│ Spatial Filter           │ ← Check if doc.metadata.location
│                          │    intersects with query polygon
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│ 4. Return Results        │ ← Text answer + Map layer showing
│                          │    policy coverage area (MVT)
└─────────────────────────┘
```

---

## 5. Database Schema Design

### 5.1 SQLite Tables (Metadata)

```sql
-- Document registry
CREATE TABLE kb_documents (
  id TEXT PRIMARY KEY,              -- UUID v4
  name TEXT NOT NULL,               -- Original filename
  type TEXT NOT NULL,               -- 'pdf' | 'word' | 'markdown'
  file_path TEXT NOT NULL,          -- Absolute path to file
  file_size INTEGER NOT NULL,       -- Size in bytes
  chunk_count INTEGER DEFAULT 0,    -- Number of text chunks
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing' | 'ready' | 'error'
  error_message TEXT,               -- Error details if failed
  created_at TEXT NOT NULL,         -- ISO 8601 timestamp
  updated_at TEXT NOT NULL          -- ISO 8601 timestamp
);

-- Document metadata (optional location, tags, etc.)
CREATE TABLE kb_document_metadata (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                -- e.g., 'location', 'category', 'author'
  value TEXT,                       -- JSON-encoded value
  UNIQUE(document_id, key)
);

-- Chunk tracking (for debugging/rebuilding)
CREATE TABLE kb_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,     -- Order within document
  content_preview TEXT,             -- First 200 chars (for UI display)
  chroma_id TEXT NOT NULL,          -- ChromaDB document ID
  created_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_kb_docs_status ON kb_documents(status);
CREATE INDEX idx_kb_chunks_doc ON kb_chunks(document_id);
```

### 5.2 ChromaDB Collection Schema

**Collection Name**: `geoai_kb`

**Document Structure**:
```typescript
interface ChromaDocument {
  id: string;              // UUID: `${docId}_chunk_${index}`
  embedding: number[];     // 1536-dimensional vector
  metadata: {
    document_id: string;   // Reference to kb_documents.id
    document_name: string; // Original filename
    chunk_index: number;   // Position in document
    page_number?: number;  // For PDFs
    content_preview: string; // First 200 chars
    created_at: string;    // ISO timestamp
    location?: {           // Optional spatial metadata
      type: 'point' | 'polygon';
      coordinates: number[];
    };
  };
}
```

---

## 6. API Design

### 6.1 REST Endpoints

#### Document Management

```
POST   /api/kb/documents/upload      # Upload document(s)
GET    /api/kb/documents             # List all documents
GET    /api/kb/documents/:id         # Get document details
DELETE /api/kb/documents/:id         # Delete document (cascades to ChromaDB)
PATCH  /api/kb/documents/:id/metadata # Update metadata (e.g., add location)
```

#### Query Interface

```
POST   /api/kb/query                 # Simple query (non-streaming)
POST   /api/kb/query/stream          # Streaming query (SSE)
GET    /api/kb/collections/stats     # Collection statistics
```

### 6.2 Request/Response Examples

#### Upload Document

**Request**:
```
POST /api/kb/documents/upload
Content-Type: multipart/form-data

file: <binary PDF/Word/Markdown file>
metadata: {
  "location": {
    "type": "polygon",
    "coordinates": [[...]]
  },
  "category": "policy"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "doc_abc123",
    "name": "beijing_env_policy.pdf",
    "type": "pdf",
    "chunkCount": 45,
    "status": "ready",
    "createdAt": "2026-05-12T10:30:00Z"
  }
}
```

#### Streaming Query

**Request**:
```
POST /api/kb/query/stream
Content-Type: application/json

{
  "question": "What are the air quality standards in Beijing?",
  "topK": 5,
  "useReranker": true,
  "location": {
    "type": "point",
    "coordinates": [116.4074, 39.9042]
  }
}
```

**SSE Events**:
```
data: {"type":"kb_retrieval_start","data":{"query":"air quality standards"}}
data: {"type":"token","data":{"token":"According to"}}
data: {"type":"token","data":{"token":" the Beijing Environmental"}}
data: {"type":"token","data":{"token":" Protection Regulations..."}}
data: {"type":"source_citation","data":{"documentId":"doc_abc123","page":12,"preview":"Air quality must meet..."}}
data: {"type":"message_complete","data":{"summary":"Full answer text...","sources":[...]}}
```

---

## 7. LangGraph Integration Strategy

### 7.1 Query Classification Problem

Not all user queries require the full LangGraph workflow. We need intelligent routing:

| Query Type | Example | Requires Task Planning? | Requires KB? | Handling Strategy |
|------------|---------|------------------------|--------------|-------------------|
| **Pure GIS Analysis** | "Create 500m buffer around rivers" | ✅ Yes | ❌ No | Standard workflow (skip KB node) |
| **Pure Knowledge Query** | "What is Beijing's air quality standard?" | ❌ No | ✅ Yes | Direct RAG response (skip task planner) |
| **Hybrid Query** | "Show pollution sources in areas with strict emission policies" | ✅ Yes | ✅ Yes | Full workflow (KB + spatial analysis) |
| **General Chat** | "Hello, how are you?" | ❌ No | ❌ No | Direct LLM response (bypass workflow) |

### 7.2 Solution: Intent-Based Routing

**Architecture**:
```
User Input
    ↓
Intent Classifier Node (NEW)
    ↓
┌─────────────────────────────────────────┐
│ Classify into one of 4 intent types:    │
│ 1. GIS_ANALYSIS                         │
│ 2. KNOWLEDGE_QUERY                      │
│ 3. HYBRID                               │
│ 4. GENERAL_CHAT                         │
└────────────┬────────────────────────────┘
             ↓
    ┌────────┴────────┐
    │                 │
GIS_ANALYSIS    KNOWLEDGE_QUERY
    │                 │
    ↓                 ↓
taskPlanner      knowledgeRetriever → Direct Answer
    │                                 (skip executor)
    ↓
parallelExecutor
    ↓
summaryGenerator
    
HYBRID: goalSplitter → knowledgeRetriever → taskPlanner → ...
GENERAL_CHAT: Direct LLM → Response
```

### 7.3 Implementation: IntentClassifierNode

**Position**: First node after `memoryLoader`

```typescript
// server/src/llm-interaction/workflow/nodes/IntentClassifierNode.ts

interface IntentClassification {
  type: 'GIS_ANALYSIS' | 'KNOWLEDGE_QUERY' | 'HYBRID' | 'GENERAL_CHAT';
  confidence: number; // 0-1
  reasoning: string;  // For debugging
  extractedEntities?: {
    locations?: string[];
    operations?: string[];
    topics?: string[];
  };
}

class IntentClassifierNode {
  async classify(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
    const userInput = state.userInput.toLowerCase();
    
    // Rule-based pre-filtering (fast path)
    if (this.isGeneralChat(userInput)) {
      return {
        intent: { type: 'GENERAL_CHAT', confidence: 0.95 },
        currentStep: 'intent_classification'
      };
    }
    
    // LLM-based classification for complex cases
    const classification = await this.llmClassify(userInput);
    
    return {
      intent: classification,
      currentStep: 'intent_classification'
    };
  }
  
  private isGeneralChat(input: string): boolean {
    const chatPatterns = [
      /^(hi|hello|hey|greetings)/i,
      /(how are you|what's up)/i,
      /^(thank|thanks|bye|goodbye)/i
    ];
    return chatPatterns.some(pattern => pattern.test(input));
  }
  
  private async llmClassify(input: string): Promise<IntentClassification> {
    // Use lightweight LLM call for classification
    const prompt = `
Classify the user query into one of these categories:

1. GIS_ANALYSIS: Requires spatial operations (buffer, overlay, statistics, mapping)
   Keywords: "buffer", "intersect", "calculate area", "show on map", "filter by location"
   
2. KNOWLEDGE_QUERY: Asks about policies, regulations, definitions, documentation
   Keywords: "policy", "regulation", "standard", "what is", "explain", "document"
   
3. HYBRID: Combines spatial analysis with policy/regulation context
   Example: "Show factories in areas with strict emission policies"
   
4. GENERAL_CHAT: Greetings, small talk, non-task questions

Query: "${input}"

Respond with JSON:
{
  "type": "GIS_ANALYSIS" | "KNOWLEDGE_QUERY" | "HYBRID" | "GENERAL_CHAT",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}
`;
    
    const response = await this.llm.invoke(prompt);
    return JSON.parse(response.content as string);
  }
}
```

### 7.4 Conditional Workflow Execution

**Modified GeoAIGraph**:

```typescript
// server/src/llm-interaction/workflow/GeoAIGraph.ts

export function createGeoAIGraph(...) {
  const workflow = new StateGraph(GeoAIStateAnnotation)
    
    // Step 1: Memory Loader (always runs)
    .addNode('memoryLoader', async (state) => {
      return { messages: [] };
    })
    
    // Step 2: Intent Classification (NEW)
    .addNode('intentClassifier', async (state) => {
      return await intentClassifier.classify(state);
    })
    
    // Step 3a: Knowledge Retriever (conditional)
    .addNode('knowledgeRetriever', async (state) => {
      if (state.intent?.type === 'KNOWLEDGE_QUERY' || state.intent?.type === 'HYBRID') {
        const context = await ragEngine.retrieve(state.userInput);
        return { knowledgeContext: context };
      }
      return {}; // Skip for other intents
    })
    
    // Step 3b: Goal Splitter (conditional - skip for pure KB queries)
    .addNode('goalSplitter', async (state) => {
      if (state.intent?.type === 'KNOWLEDGE_QUERY' || state.intent?.type === 'GENERAL_CHAT') {
        return {}; // Skip goal splitting
      }
      const goals = await goalSplitter.splitGoals(state.userInput);
      return { goals };
    })
    
    // Step 4: Task Planner (conditional)
    .addNode('taskPlanner', async (state) => {
      if (!state.goals || state.goals.length === 0) {
        return {}; // Skip if no goals (pure KB query)
      }
      const plans = await taskPlanner.createPlans(state.goals);
      return { executionPlans: plans };
    })
    
    // Step 5: Parallel Executor (conditional)
    .addNode('parallelExecutor', async (state) => {
      if (!state.executionPlans || state.executionPlans.size === 0) {
        return {}; // Skip if no plans
      }
      const results = await executeAllPlans(state.executionPlans);
      return { executionResults: results };
    })
    
    // Step 6: Summary Generator (always runs, but adapts to context)
    .addNode('summaryGenerator', async (state) => {
      // Adapt summary based on intent type
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
    })
    
    // Define conditional edges
    .addEdge(START, 'memoryLoader')
    .addEdge('memoryLoader', 'intentClassifier')
    
    // After intent classification, route conditionally
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
    
    .addEdge('knowledgeRetriever', 'goalSplitter')
    .addEdge('goalSplitter', 'taskPlanner')
    .addEdge('taskPlanner', 'parallelExecutor')
    .addEdge('parallelExecutor', 'summaryGenerator')
    .addEdge('summaryGenerator', END);
  
  return workflow.compile();
}
```

### 7.5 State Schema Extension

```typescript
// server/src/llm-interaction/workflow/types.ts

export interface GeoAIStateType {
  // ... existing fields
  
  // NEW: Intent classification
  intent?: {
    type: 'GIS_ANALYSIS' | 'KNOWLEDGE_QUERY' | 'HYBRID' | 'GENERAL_CHAT';
    confidence: number;
    reasoning?: string;
  };
  
  // NEW: Knowledge context
  knowledgeContext?: {
    query: string;
    retrievedChunks: Array<{
      content: string;
      documentId: string;
      score: number;
      metadata: any;
    }>;
    contextString: string;
  };
}
```

### 7.6 Handling Each Scenario

#### Scenario 1: Pure Knowledge Query

**User**: "What are Beijing's air quality standards?"

**Flow**:
```
intentClassifier → KNOWLEDGE_QUERY
    ↓
knowledgeRetriever → Fetch relevant policy documents
    ↓
summaryGenerator → Generate answer from KB context
    ↓
END (skip taskPlanner, executor)
```

**SSE Events**:
```
data: {"type":"intent_classified","data":{"type":"KNOWLEDGE_QUERY","confidence":0.92}}
data: {"type":"kb_retrieval_start"}
data: {"type":"kb_retrieval_complete","data":{"resultCount":3}}
data: {"type":"token","data":{"token":"According to Beijing Environmental..."}}
data: {"type":"source_citation","data":{"documentId":"doc_123","page":5}}
```

#### Scenario 2: Hybrid Query

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
// When ingesting policy documents
metadata: {
  location: {
    type: 'polygon',
    coordinates: [[...]] // Beijing administrative boundary
  },
  policy_type: 'emission_standard',
  strictness_level: 'high'
}
```

#### Scenario 3: Pure GIS Analysis

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

### 7.7 Benefits of This Approach

✅ **Efficiency**: Skip unnecessary nodes (no KB lookup for pure GIS tasks)  
✅ **Flexibility**: Handle diverse query types without forcing all through same pipeline  
✅ **User Experience**: Faster responses for simple queries  
✅ **Maintainability**: Clear separation of concerns (KB vs GIS vs Chat)  
✅ **Extensibility**: Easy to add new intent types (e.g., DATA_UPLOAD, VISUALIZATION_ONLY)

### 7.2 Modified Prompt Templates

Update `task-planning.md` to include knowledge context:

```markdown
# Task Planning Template

You are a GIS task planner. Plan execution steps based on:

**User Goal**: {{goal}}

**Available Data Sources**:
{{dataSources}}

**Knowledge Base Context** (if available):
{{knowledgeContext}}

**Available Plugins**:
{{plugins}}

Instructions:
- If knowledgeContext is provided, incorporate it into your reasoning
- Cite sources when using information from knowledge base
- ...
```

---

## 8. Frontend Integration

### 8.1 New Components

#### KnowledgeBaseManagementView.vue

**Features**:
- Document list with status indicators
- Upload button (drag & drop)
- Delete/retry failed uploads
- Metadata editing panel (add location, tags)
- Collection statistics (total docs, chunks, storage size)

**UI Layout**:
```
┌────────────────────────────────────────┐
│ Knowledge Base Management              │
├────────────────────────────────────────┤
│ [Upload Documents]  [Refresh]          │
├────────────────────────────────────────┤
│ 📄 beijing_policy.pdf  ✅ Ready        │
│    45 chunks | 2.3 MB | 2026-05-12     │
│    [Edit Metadata] [Delete]            │
│                                        │
│ 📄 tech_spec.docx     ⚠️ Processing    │
│    Progress: 60%                       │
│                                        │
│ 📄 report.md          ❌ Failed        │
│    Error: Unsupported format           │
│    [Retry] [Delete]                    │
└────────────────────────────────────────┘
```

#### Enhanced Chat View

**Changes to existing ChatView.vue**:
1. Display knowledge source citations in assistant messages
2. Show "Searching knowledge base..." status during retrieval
3. Clickable source links (open document preview)

**Message Bubble Enhancement**:
```vue
<div v-if="message.knowledgeSources" class="knowledge-sources">
  <div class="sources-header">
    <el-icon><Document /></el-icon>
    <span>Sources ({{ message.knowledgeSources.length }})</span>
  </div>
  <div 
    v-for="source in message.knowledgeSources" 
    :key="source.documentId"
    class="source-item"
    @click="openDocumentPreview(source.documentId)"
  >
    <span class="source-name">{{ source.documentName }}</span>
    <span v-if="source.pageNumber" class="source-page">
      Page {{ source.pageNumber }}
    </span>
  </div>
</div>
```

### 8.2 State Management (Pinia)

**New Store: `knowledgeBase.ts`**

```typescript
export const useKnowledgeBaseStore = defineStore('knowledgeBase', () => {
  const documents = ref<KbDocument[]>([])
  const uploadTasks = ref<UploadTask[]>([])
  const collectionStats = ref<CollectionStats | null>(null)
  
  async function loadDocuments() { /* ... */ }
  async function uploadDocument(file: File, metadata?: any) { /* ... */ }
  async function deleteDocument(id: string) { /* ... */ }
  async function updateMetadata(id: string, metadata: any) { /* ... */ }
  async function loadStats() { /* ... */ }
  
  return {
    documents,
    uploadTasks,
    collectionStats,
    loadDocuments,
    uploadDocument,
    deleteDocument,
    updateMetadata,
    loadStats
  }
})
```

### 8.3 SSE Event Handling

Extend existing `handleSSEEvent()` in `chat.ts` store:

```typescript
case 'kb_retrieval_start':
  workflowStatus.value = '🔍 Searching knowledge base...'
  break

case 'kb_retrieval_complete':
  const resultCount = data?.resultCount || 0
  workflowStatus.value = `✅ Found ${resultCount} relevant documents`
  setTimeout(() => { workflowStatus.value = '' }, 2000)
  break

case 'source_citation':
  // Add to current assistant message's knowledgeSources array
  const lastMsg = getCurrentAssistantMessage()
  if (lastMsg) {
    lastMsg.knowledgeSources.push(data)
  }
  break
```

---

## 9. Configuration & Workspace Management

### 9.1 Workspace Directory Structure

**Managed by**: `WorkspaceManager` (server/src/storage/filesystem/WorkspaceManager.ts)

All knowledge base files are stored under the workspace directory, following the existing pattern:

```
workspace/
└── knowledge-base/              # New directory (added to WORKSPACE_DIRS)
    ├── chromadb/                # ChromaDB persistent storage
    │   └── geoai_kb/            # Collection data
    ├── documents/               # Uploaded raw files
    │   ├── pdf/
    │   ├── word/
    │   └── markdown/
    └── temp/                    # Temporary processing files
```

**Implementation**:
```typescript
// server/src/core/constants/index.ts
export const WORKSPACE_DIRS = {
  // ... existing directories
  KB_CHROMADB: 'knowledge-base/chromadb',
  KB_DOCUMENTS: 'knowledge-base/documents',
  KB_TEMP: 'knowledge-base/temp',
} as const;

// Usage in services
const chromaPath = WorkspaceManagerInstance.getDirectoryPath('KB_CHROMADB');
const docPath = WorkspaceManagerInstance.getFilePath('KB_DOCUMENTS', filename);
```

### 9.2 Runtime Configuration

Configuration is managed through **code constants** and **service initialization**, NOT environment variables:

```typescript
// server/src/knowledge-base/config.ts
export const KB_CONFIG = {
  // Collection settings
  COLLECTION_NAME: 'geoai_kb',
  
  // Chunking strategy
  CHUNK_SIZE: 1000,
  CHUNK_OVERLAP: 100,
  
  // Retrieval settings
  DEFAULT_TOP_K: 10,
  RERANKER_TOP_K: 3,
  SIMILARITY_THRESHOLD: 0.7,
  
  // Embedding service
  EMBEDDING_PROVIDER: 'dashscope', // 'dashscope' | 'openai' | 'baidu'
  EMBEDDING_MODEL: 'text-embedding-v2',
  EMBEDDING_DIMENSIONS: 1536,
  
  // Reranker
  RERANKER_ENABLED: true,
  RERANKER_MODEL: 'bge-reranker-v2-m3',
  
  // File upload limits
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_TYPES: ['.pdf', '.docx', '.md'],
} as const;
```

**API Key Management** (if needed for external services):
```typescript
// server/src/services/LLMConfigService.ts (existing)
// Reuse existing LLM config management pattern
const dashScopeKey = llmConfigService.getApiKey('dashscope');
```

---

## 10. Performance Optimization

### 10.1 Batch Processing

**Problem**: Uploading large documents (100+ pages) causes timeout.

**Solution**: Process chunks in batches of 20:

```typescript
async function ingestDocument(filePath: string) {
  const chunks = await splitText(text)
  
  // Process in batches of 20
  for (let i = 0; i < chunks.length; i += 20) {
    const batch = chunks.slice(i, i + 20)
    const embeddings = await generateEmbeddings(batch)
    await chromaDB.addDocuments(batch, embeddings)
    
    // Report progress via SSE
    emitProgress({ completed: i + batch.length, total: chunks.length })
  }
}
```

### 10.2 Caching Strategy

**Embedding Cache**: Avoid regenerating embeddings for identical text.

```typescript
// SQLite cache table
CREATE TABLE embedding_cache (
  text_hash TEXT PRIMARY KEY,  -- MD5 hash of text
  embedding BLOB NOT NULL,     -- Serialized vector
  created_at TEXT NOT NULL
);

// Check cache before API call
const hash = md5(chunkText)
const cached = db.prepare('SELECT embedding FROM embedding_cache WHERE text_hash = ?').get(hash)
if (cached) {
  return deserialize(cached.embedding)
}
```

**Expected Hit Rate**: 30-50% for similar documents (e.g., policy templates).

### 10.3 Async Queue for Ingestion

Use BullMQ or simple in-memory queue for background processing:

```typescript
// Prevent blocking HTTP requests
const ingestionQueue = new Queue('document-ingestion')

app.post('/api/kb/documents/upload', async (req, res) => {
  const jobId = await ingestionQueue.add('process', {
    filePath: savedPath,
    metadata: req.body.metadata
  })
  
  res.json({ success: true, jobId, status: 'queued' })
})

// Worker processes in background
ingestionQueue.process(async (job) => {
  await ingestDocument(job.data.filePath)
})
```

---

## 11. Error Handling & Resilience

### 11.1 Common Failure Scenarios

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| **DashScope API timeout** | HTTP 504 or timeout exception | Retry with exponential backoff (max 3 attempts) |
| **ChromaDB connection lost** | Connection error on query | Auto-reconnect + fallback to empty context |
| **PDF parsing failure** | Corrupted file or encrypted PDF | Return error to user, suggest manual text extraction |
| **Out of memory** | Large document (>50MB) | Reject upload with clear error message |
| **Embedding dimension mismatch** | ChromaDB rejects vector | Validate dimensions before insertion |

### 11.2 Graceful Degradation

If knowledge base is unavailable:
1. Log warning (don't crash server)
2. Proceed with standard LangGraph workflow (no KB context)
3. Inform user: "Knowledge base temporarily unavailable, answering from general knowledge"

---

## 12. Security Considerations

### 12.1 File Upload Security

- **File Type Validation**: Whitelist only `.pdf`, `.docx`, `.md`
- **Size Limit**: Max 50MB per file (configurable)
- **Virus Scanning**: Integrate ClamAV or cloud-based scanner (future enhancement)
- **Path Traversal Prevention**: Sanitize filenames, store in controlled directory

### 12.2 Access Control

**Current State**: No authentication (by design for standalone mode).

**Future Enhancement** (if multi-user mode added):
- Document-level permissions (owner-only, team-shared, public)
- Query logging for audit trail
- Rate limiting per user/IP

### 12.3 Data Privacy

- **Local-First**: All data stored locally (ChromaDB + SQLite), no external transmission except Embedding API calls
- **Encryption at Rest**: Optional disk encryption for sensitive documents
- **GDPR Compliance**: Provide document deletion endpoint (already implemented)

---

## 13. Testing Strategy

### 13.1 Unit Tests

**Test Coverage Targets**:
- Document parsers (PDF, Word, Markdown) → 90% coverage
- Text splitting logic → 85% coverage
- ChromaDB adapter (mocked) → 80% coverage
- Retrieval scoring → 85% coverage

**Example Test Case**:
```typescript
describe('PdfParser', () => {
  it('should extract text from simple PDF', async () => {
    const parser = new PdfParser()
    const text = await parser.parse('test/fixtures/simple.pdf')
    expect(text).toContain('Expected content')
    expect(text.length).toBeGreaterThan(100)
  })
  
  it('should handle encrypted PDF gracefully', async () => {
    const parser = new PdfParser()
    await expect(parser.parse('test/fixtures/encrypted.pdf'))
      .rejects.toThrow('Encrypted PDF not supported')
  })
})
```

### 13.2 Integration Tests

**Test Scenarios**:
1. End-to-end ingestion: Upload → Parse → Embed → Store
2. Query flow: Question → Retrieve → Rerank → Generate answer
3. Deletion cascade: Delete doc → Verify ChromaDB cleanup

### 13.3 Performance Benchmarks

**Metrics to Track**:
- Ingestion speed: Documents/minute (target: 10 doc/min for avg 10-page PDF)
- Query latency: P50 < 2s, P95 < 5s (including LLM generation)
- Retrieval accuracy: Manual evaluation on test set (target: >80% relevance)

---

## 14. Deployment & Operations

### 14.1 Installation Steps

```bash
# 1. Install dependencies
cd server
npm install chromadb @alicloud/openapi-client dashscope bullmq

# 2. Configure environment
cp .env.example .env
# Edit DASHSCOPE_API_KEY and other settings

# 3. Initialize ChromaDB directory
mkdir -p workspace/knowledge-base/chromadb

# 4. Start server
npm run dev
```

### 14.2 Monitoring

**Key Metrics** (expose via `/api/kb/metrics`):
- Total documents ingested
- Total chunks in ChromaDB
- Average query latency
- Error rate (failed ingestions, API timeouts)
- ChromaDB storage size

**Logging**:
- Log all ingestion events (success/failure)
- Log query patterns (anonymized) for usage analytics
- Alert on repeated failures (>5 errors/hour)

### 14.3 Backup & Recovery

**Backup Script** (cron job):
```bash
#!/bin/bash
# Backup ChromaDB and SQLite
tar czf backup_$(date +%Y%m%d).tar.gz \
  workspace/knowledge-base/chromadb \
  workspace/database/kb.db

# Upload to cloud storage (optional)
aws s3 cp backup_*.tar.gz s3://my-backup-bucket/
```

**Recovery**:
1. Stop server
2. Restore backup to workspace directory
3. Restart server
4. Verify integrity: `GET /api/kb/collections/stats`

---

## 15. Future Enhancements

### 15.1 Short-Term (v2.1.0)

- [ ] Support for Excel/CSV files (tabular data Q&A)
- [ ] Multi-language support (auto-detect language, use appropriate embedding model)
- [ ] Document versioning (track updates to same document)
- [ ] Advanced metadata extraction (author, date, keywords via LLM)

### 15.2 Medium-Term (v2.2.0)

- [ ] Hybrid search: Combine keyword search (BM25) + vector search
- [ ] Query expansion: Use LLM to rewrite queries for better retrieval
- [ ] Conversational memory: Remember previous KB queries in same session
- [ ] Citation highlighting: Show exact text snippets in UI

### 15.3 Long-Term (v3.0.0)

- [ ] Multi-modal RAG: Support images in PDFs (OCR + image embedding)
- [ ] Federated search: Query multiple KB collections simultaneously
- [ ] Active learning: User feedback loop to improve retrieval ranking
- [ ] Knowledge graph: Extract entities/relationships from documents for graph-based queries

---

## 16. Migration Guide (From Simple Reference Implementation)

The file `docs/articles/AI-Knowledge-Base-Simple-Reference.md` provides a minimal standalone implementation.

### 16.1 Key Differences

| Aspect | Simple Reference | GeoAI-UP (Enhanced) |
|--------|---------------|---------------------|
| Vector DB | FAISS (local file) | ChromaDB (managed, persistent) |
| Embedding | OpenAI | Alibaba DashScope |
| Re-ranking | None | BGE Reranker |
| Integration | Standalone Express app | LangGraph workflow with intent routing |
| UI | None | Full Vue3 interface |
| Spatial Awareness | No | Yes (location-aware retrieval) |
| Query Types | All queries go through KB | Intent-based routing (KB/GIS/Hybrid/Chat) |

### 16.2 Code Adaptation Steps

1. **Replace FAISS with ChromaDB**:
   ```typescript
   // Old (FAISS)
   const store = await FaissStore.load('./faiss.index')
   
   // New (ChromaDB)
   const client = new ChromaClient({ path: chromaPath })
   const collection = await client.getOrCreateCollection({ name: 'geoai_kb' })
   ```

2. **Switch Embedding Provider**:
   ```typescript
   // Old (OpenAI)
   const response = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
   
   // New (DashScope)
   const response = await dashscope.embed({ model: 'text-embedding-v2', texts: [text] })
   ```

3. **Add Reranker**:
   ```typescript
   // New step after retrieval
   const reranked = await reranker.rerank(query, retrievedDocs, topK=3)
   ```

4. **Integrate with LangGraph Intent Router**:
   - Create `IntentClassifierNode` as first node
   - Create `KnowledgeRetrieverNode` for conditional execution
   - Add conditional edges based on intent type

---

## 17. Conclusion

This architecture integrates a production-ready AI knowledge base into GeoAI-UP while maintaining:
- ✅ **Simplicity**: Minimal new dependencies, leverages existing infrastructure
- ✅ **Performance**: ChromaDB + batching + caching for sub-second queries
- ✅ **Extensibility**: Modular design allows swapping components (e.g., different embedding providers)
- ✅ **User Experience**: Seamless integration with existing chat interface, real-time feedback via SSE

**Next Steps**:
1. Review this design with stakeholders
2. Implement Phase 1 (MVP): Basic ingestion + query (1 week)
3. Implement Phase 2: LangGraph integration (1 week)
4. Implement Phase 3: Spatial-aware RAG (1-2 weeks)
5. Testing, documentation, and release

---

## Appendix A: Glossary

- **RAG (Retrieval-Augmented Generation)**: Technique combining information retrieval with LLM generation
- **Embedding**: Numerical vector representation of text semantics
- **ChromaDB**: Open-source vector database for AI applications
- **DashScope**: Alibaba Cloud's LLM API platform
- **BGE Reranker**: Cross-encoder model for improving retrieval relevance
- **LangGraph**: Framework for building stateful, multi-actor LLM applications

## Appendix B: References

- ChromaDB Documentation: https://docs.trychroma.com/
- LangChain RAG Guide: https://python.langchain.com/docs/use_cases/question_answering/
- Alibaba DashScope API: https://help.aliyun.com/zh/dashscope/
- BGE Reranker: https://github.com/FlagOpen/FlagEmbedding

---

**Document History**:
- v1.0.0 (2026-05-12): Initial architecture design
- v1.1.0 (2026-05-12): 
  - Corrected configuration management to use WorkspaceManager instead of .env
  - Added intent-based routing strategy for LangGraph integration
  - Moved simple reference implementation to docs/articles/
  - Clarified handling of different query types (GIS/KB/Hybrid/Chat)
