# Goal Type Removal - Complete Refactoring

## Overview

Completely removed the `type` field from `AnalysisGoal` interface and all related logic across the codebase. The Goal Splitter now focuses purely on natural language goal description, while the Task Planner intelligently infers required plugin categories from the description using keyword analysis.

## Motivation

1. **Goal Splitter was misclassifying goals**: Complex goals like "calculate buffer and display in red" were incorrectly classified as `visualization`, causing Task Planner to filter out computational plugins.

2. **Type field was not being effectively used**: Task Planner relied on simple type-to-category mapping instead of analyzing the actual goal description.

3. **Violates pure NL principle**: Goal Splitter should only output what the user wants (natural language), not how to achieve it (type classification).

## Changes Made

### 1. Type Definitions

#### `server/src/core/types/index.ts`
- Removed `type: 'visualization' | 'analysis' | 'query'` from `AnalysisGoal` interface
- Added optional `priority?: number` field
- Updated comments to reflect natural language focus

#### `server/src/llm-interaction/workflow/GeoAIGraph.ts`
- Removed `type` and `requiredExecutors` fields from `AnalysisGoal` interface
- Kept `priority` as optional field
- Simplified interface to focus on description-only approach

### 2. Goal Splitter Agent

#### `server/src/llm-interaction/agents/GoalSplitterAgent.ts`
- Removed `type` field from Zod schema
- Removed `requiredExecutors` field from Zod schema
- Updated fallback goal creation to match new schema
- Schema now only includes: `id`, `description`, `priority`

### 3. Task Planner Agent

#### `server/src/llm-interaction/agents/TaskPlannerAgent.ts`

**Removed:**
- Logic checking `goal.requiredExecutors` (lines 91-101)
- `goalType` parameter in LLM invocation (line 141)
- Old `filterPluginsByGoalType()` method that relied on type field

**Added:**
- New `filterPluginsByGoalDescription()` method with intelligent keyword analysis
- Keyword-based category inference for:
  - **Computational**: buffer, calculate, compute, intersect, overlay, clip, merge
  - **Statistical**: count, sum, average, statistics, aggregate, group by
  - **Visualization**: display, show, map, render, visualize, plot, chart, color, red, blue, green
  - **Textual**: report, summary, describe, explain
- Falls back to all categories if no keywords match
- Always allows terminal nodes (removed type-based restriction)

**Updated:**
- Stage 1 logging to show goal description instead of requiredExecutors
- Simplified plugin filtering to always use capability-based approach

### 4. Prompt Templates

#### `workspace/llm/prompts/en-US/task-planning.md`
- Removed `Goal Type: {{goalType}}` from template variables
- Updated Planning Principle #3: Changed from "Match plan complexity to goal type" to "Analyze the goal description to determine required operations"
- Removed Principle #9 (Goal Type Enforcement)
- Updated validation checklist to focus on description analysis instead of type checking
- New validation rule: "If the goal description mentions BOTH analysis AND visualization, does the plan include BOTH steps?"

#### `workspace/llm/prompts/en-US/goal-splitting.md`
- Removed `type` field from output format JSON schema
- Removed entire "Goal Type Definitions" section
- Added IMPORTANT note: "Focus ONLY on describing WHAT the user wants in clear natural language. Do NOT try to classify the goal type or select specific executors - that will be handled by the Task Planner."

## Benefits

### 1. More Accurate Plugin Selection
Task Planner now analyzes the actual goal description to infer required operations, rather than relying on potentially incorrect type classifications.

**Example:**
```
User: "Calculate 500m buffer around rivers and display in red"

OLD (with type='visualization'):
  → Task Planner filters to visualization plugins only
  → Cannot find buffer_analysis plugin ❌

NEW (description analysis):
  → Detects "calculate" + "buffer" → computational category
  → Detects "display" + "red" → visualization category
  → Includes both computational AND visualization plugins ✅
```

### 2. Better Handling of Composite Goals
Goals that involve multiple operations (analysis + visualization) are now correctly handled without requiring explicit type classification.

### 3. Simpler Goal Splitter
Goal Splitter has a single responsibility: decompose user intent into clear natural language goals. No need to understand plugin categories or execution semantics.

### 4. More Flexible and Maintainable
- Adding new plugin categories doesn't require updating Goal Splitter logic
- Keyword-based inference is easier to extend and debug
- Clear separation of concerns between Goal Splitter (WHAT) and Task Planner (HOW)

## Testing Recommendations

Test with these scenarios:

1. **Pure visualization**: "Show river data on the map"
2. **Pure analysis**: "Calculate statistics for population density"
3. **Composite goal**: "Calculate 500m buffer around @五虎林河 and display in red"
4. **Complex workflow**: "Calculate buffer for rivers, then analyze overlap with residential areas and show in blue"

Expected behavior:
- Goal Splitter outputs clean natural language descriptions
- Task Planner correctly identifies required plugin categories from keywords
- Multi-step plans are generated for composite goals
- Cross-goal dependencies work correctly with unique stepIds

## Migration Notes

### Breaking Changes
- `AnalysisGoal.type` field removed - any code accessing this field will fail
- `AnalysisGoal.requiredExecutors` field removed
- Task Planner prompt no longer receives `goalType` variable

### Non-Breaking
- Frontend code already didn't use `goal.type` (verified via grep)
- All backend changes are internal to the LLM interaction layer
- Existing workflows will continue to work with improved accuracy

## Files Modified

1. `server/src/core/types/index.ts` - AnalysisGoal interface
2. `server/src/llm-interaction/workflow/GeoAIGraph.ts` - AnalysisGoal interface
3. `server/src/llm-interaction/agents/GoalSplitterAgent.ts` - Schema and fallback logic
4. `server/src/llm-interaction/agents/TaskPlannerAgent.ts` - Plugin filtering and LLM invocation
5. `workspace/llm/prompts/en-US/task-planning.md` - Prompt template
6. `workspace/llm/prompts/en-US/goal-splitting.md` - Prompt template

## Documentation Updates Needed

The following documentation files reference `goal.type` but are non-critical (examples/diagrams):
- `docs/architecture/OVERALL-DESIGN.md`
- `docs/architecture/MODULE-LLM-LAYER-LANGCHAIN.md`
- `docs/architecture/visual-refactor/*.md`
- `docs/implementation/*.md`

These can be updated in a follow-up documentation cleanup task.
