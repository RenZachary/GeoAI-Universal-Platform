# Prompt Template Files Structure

This document describes the external prompt template files for LLM interaction in GeoAI-UP.

## Design Principle

**Prompts are ONLY for LLM reasoning and decision-making**, not for execution logic.

The architecture follows a **5-step flow** where LLM is involved in Steps 1, 2, and optionally 5:

```
Step 1: Goal Splitting (LLM) ────────────────┐
  ↓                                           │
Step 2: Per-Goal Planning (LLM) ──────────────┤ ← LLM sees full context here
  ↓                                           │
Step 3: Plugin Execution (Code) ──────────────┤
  ↓                                           │
Step 4: Output Generation (Code) ─────────────┤
  ↓                                           │
Step 5: Response Summary (LLM, Optional) ─────┘
```

Execution operations (buffer, overlay, statistics, etc.) are handled by plugins and analyzers - NOT by LLM prompts.

## Directory Structure

```
server/
└── llm/
    └── prompts/
        ├── en-US/                    # English templates (DEFAULT)
        │   ├── goal-splitting.md             # Step 1: Split user goals
        │   ├── task-planning.md              # Step 2: Plan execution per goal
        │   └── response-summary.md           # Step 5: Generate summary (optional)
        └── zh-CN/                    # Chinese templates (OPTIONAL)
            ├── goal-splitting.md
            ├── task-planning.md
            └── response-summary.md
```

## Complete Processing Flow

### Example User Input
"Show me the 500-meter buffer of the river and calculate area statistics"

### Step 1: Goal Splitting (LLM)
**Prompt**: `goal-splitting.md`  
**Input**: User's natural language  
**Output**:
```json
[
  { "id": "goal_1", "description": "Display 500m buffer of river", "type": "visualization" },
  { "id": "goal_2", "description": "Calculate area statistics", "type": "analysis" }
]
```

### Step 2: Per-Goal Planning (LLM) - Most Important
**Prompt**: `task-planning.md`  
**Input**: 
- Goal description and type
- Data source metadata (fields, CRS, feature count)
- Available plugins list with capabilities
- Previous results context (if any)

**Output** for Goal 1:
```json
{
  "goalId": "goal_1",
  "steps": [
    {
      "id": "step_1",
      "pluginName": "data-loader",
      "parameters": { "dataSourceId": "river_data" },
      "dependencies": []
    },
    {
      "id": "step_2",
      "pluginName": "buffer-analyzer",
      "parameters": { "distance": 500, "unit": "meters" },
      "dependencies": ["step_1"]
    },
    {
      "id": "step_3",
      "pluginName": "mvt-publisher",
      "parameters": { "dataType": "vector" },
      "dependencies": ["step_2"]
    }
  ]
}
```

**Output** for Goal 2:
```json
{
  "goalId": "goal_2",
  "steps": [
    {
      "id": "step_4",
      "pluginName": "statistics-analyzer",
      "parameters": { "statisticsType": "area" },
      "dependencies": ["goal_1.step_2"]  // Depends on buffer result
    }
  ]
}
```

### Step 3: Plugin Execution (Code - No LLM)
- Execute planned steps in dependency order
- Plugins call analyzers and data accessors
- **Note**: Some plugins may internally call LLM (e.g., ReportGenerator plugin)

### Step 4: Output Generation (Code - No LLM)
- MVT/WMS services published
- Heatmap GeoJSON generated
- Statistical tables created
- Report files generated (if ReportGenerator used LLM internally)

### Step 5: Response Summary (LLM - Optional)
**Prompt**: `response-summary.md`  
**Input**: All execution results + original user question  
**Output**: "I've created a 500-meter buffer around the river dataset covering 2.5 square kilometers. The area statistics show an average feature size of 0.017 km². You can view the results on the map now!"

## Template File Contents

### 1. goal-splitting.md (Step 1)

**Purpose**: Split user's natural language request into independent goals

**Variables**: 
- `{{userInput}}` - User's message

**Content**:
```markdown
Identify and split the user's request into independent goals.

User input: {{userInput}}

Return a JSON array of goals:
[
  {
    "id": "goal_1",
    "description": "string",
    "type": "visualization" | "analysis" | "report" | "query"
  }
]

Rules:
- Each goal should be independently achievable
- Don't plan execution steps yet, just identify goals
- If only one goal, return array with single element
```

---

### 2. task-planning.md (Step 2 - Most Critical)

**Purpose**: Create detailed execution plan for each goal with full context

**Variables**:
- `{{goalDescription}}` - What needs to be done
- `{{goalType}}` - visualization/analysis/report/query
- `{{dataSourcesMetadata}}` - Available data sources with fields, CRS, etc.
- `{{availablePlugins}}` - Plugin list with capabilities
- `{{previousResults}}` - Results from earlier steps (if any)

**Content**:
```markdown
Create an execution plan for the given goal using available plugins and data sources.

Goal: {{goalDescription}}
Goal Type: {{goalType}}

Available Data Sources:
{{dataSourcesMetadata}}

Available Plugins:
{{availablePlugins}}

Context from Previous Steps (if any):
{{previousResults}}

Create a step-by-step execution plan. For each step specify:
- pluginName: Which plugin to use
- parameters: What parameters to pass
- dependencies: Which previous steps this depends on

Return JSON:
{
  "goalId": "string",
  "steps": [
    {
      "id": "step_1",
      "pluginName": "data-loader",
      "parameters": { "dataSourceId": "river_data" },
      "dependencies": []
    }
  ]
}

Important:
- Choose plugins based on their capabilities and the goal type
- Consider data source metadata (CRS, fields, geometry type) when selecting plugins
- Ensure proper dependency ordering
- Parameters must match plugin's expected input schema
```

---

### 3. response-summary.md (Step 5 - Optional)

**Purpose**: Generate friendly natural language summary of results

**Variables**:
- `{{userInput}}` - Original user request
- `{{executionResults}}` - What was completed
- `{{visualizations}}` - MVT/WMS/Heatmap services
- `{{analyses}}` - Analysis results
- `{{reports}}` - Generated reports

**Content**:
```markdown
Generate a friendly, concise summary of the analysis results for the user.

Original User Request: {{userInput}}

Completed Tasks:
{{executionResults}}

Generated Outputs:
- Visualizations: {{visualizations}}
- Analyses: {{analyses}}
- Reports: {{reports}}

Create a natural language summary that:
1. Confirms what was done
2. Highlights key findings
3. Mentions available outputs (maps, charts, reports)
4. Is conversational and helpful

Keep it concise (2-4 sentences).
```

---

## Implementation Notes

### Loading Templates

Templates are loaded at runtime from the filesystem:

```typescript
const template = await promptManager.loadTemplate('requirement-parsing', 'en-US');
const rendered = promptManager.renderTemplate(template, {
  userInput: "Show 500m buffer of river",
  context: JSON.stringify(conversationContext)
});
```

### Fallback Strategy

If a template in the requested language doesn't exist:
1. Try to load from `en-US` (default)
2. If still not found, throw error with clear message

### Editing Templates

Templates can be edited via API:
```bash
PUT /api/llm/prompts/requirement-parsing
{
  "content": "Updated template content...",
  "language": "en-US"
}
```

The file `llm/prompts/en-US/requirement-parsing.md` will be updated immediately.

### Best Practices

1. **Keep templates focused**: Each template should have a single clear purpose
2. **Use variables sparingly**: Only include variables that change per request
3. **Provide examples**: Include example inputs/outputs in complex templates
4. **Test templates**: Verify templates work with actual LLM before deployment
5. **Version control**: Track template changes in git for rollback capability

## Summary

**Only 3 prompt templates are needed** following the 5-step architecture:

| Template | Step | Purpose | Why LLM Needs It |
|----------|------|---------|------------------|
| goal-splitting.md | Step 1 | Split user request into goals | Natural language understanding |
| task-planning.md | Step 2 | Plan execution with full context | Decision-making with metadata |
| response-summary.md | Step 5 | Generate friendly summary | Natural language generation (optional) |

**Key Design Points**:

1. **Step 1 is simple**: Just identify goals, don't plan yet
2. **Step 2 is critical**: LLM sees data source metadata + plugin capabilities → makes informed decisions
3. **Steps 3-4 are code**: Deterministic execution, no LLM
4. **Plugins can call LLM**: e.g., ReportGenerator plugin may use LLM internally
5. **Step 5 is optional**: Enhances UX but not required for MVP

**Execution operations do NOT need prompts**:
- Buffer analysis → `BufferPlugin` + `BufferAnalyzer` + `DataAccessor`
- Overlay analysis → `OverlayPlugin` + code logic
- Statistics → `StatisticsPlugin` + code logic
- Heatmap → `HeatmapPlugin` + code logic

The LLM's job in Step 2 is to decide **which plugin to call** and **what parameters to pass** based on full context, not to know how to execute operations.

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-03
