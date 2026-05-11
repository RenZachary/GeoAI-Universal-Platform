<!-- Split user intent into independent goals based on desired outputs -->
Analyze the user's request and split it into independent goals. Each goal represents ONE distinct output that the user wants to see or obtain.

User input: 
{{userInput}}

## Core Principle: ONE GOAL = ONE DISTINCT OUTPUT

Each goal should produce exactly ONE type of output:
- **One visual result**: A map, chart, or image that user can see
- **One data result**: A dataset, table, or file that user can download or use
- **One text result**: A report, summary, or explanation

## Goal Splitting Rules

### Rule 1: Separate Different Visualizations

If user wants to see MULTIPLE different maps/images → Create SEPARATE goals

**Example**:
User: "Show me the rivers and also show me the buildings"
→ TWO goals (two different maps)
```
Goal 1: "Display rivers on the map"
Goal 2: "Display buildings on the map"
```

### Rule 2: Keep Analysis + Visualization Together

If user wants to analyze data AND then visualize the SAME result → Keep as ONE goal

**Example**:
User: "Calculate buffer around rivers and show it"
→ ONE goal (analysis + visualization of same result)
```
Goal 1: "Calculate river buffer zones and display them on the map"
```

### Rule 3: Separate Intermediate Results

If a step produces data that user might want to inspect/verify → Separate goal

**Example**:
User: "Extract buildings from imagery and then show them by area"
→ TWO goals (extraction result is intermediate, user may want to verify)
```
Goal 1: "Extract building footprints from the satellite imagery"
Goal 2: "Display the extracted buildings with colors based on their area size"
```

### Rule 4: Independence Test

Ask: "Can this goal be executed independently without waiting for other goals?"
- YES → It's a separate goal
- NO → Merge with dependent goal (rare case)

**Example**:
User: "List all available data sources"
→ ONE goal (independent query)
```
Goal 1: "List all available data sources with their names and types"
```

## What NOT to Include

❌ DO NOT mention technical terms like: MVT, WMS, GeoJSON, PostGIS, executor IDs
❌ DO NOT specify how to implement (plugins, algorithms, data formats)
❌ DO NOT include dependencies between goals (each goal is independent)

✅ DO describe WHAT the user wants to see/obtain in natural language
✅ DO make each goal self-contained and executable independently
✅ DO preserve the user's original intent and wording where possible
✅ DO explicitly mention spatial relationships and distances when present (e.g., "within 300 meters", "nearby", "around")
✅ DO use action verbs that indicate operations (e.g., "calculate buffer", "find points within", "analyze overlap")

## Output Format

Return a JSON array of goals:
```json
[
  {
    "id": "goal_1",
    "description": "Clear natural language description of what output user wants",
    "priority": 5
  }
]
```

**IMPORTANT**: Focus ONLY on describing WHAT the user wants in clear natural language. Do NOT try to classify the goal type or select specific executors - that will be handled by the Task Planner.

## Examples

### Example 1: Single Visualization
User: "Show the river network"
Output:
```json
[
  {
    "id": "goal_1",
    "description": "Display the river network on the map",
    "type": "visualization",
    "priority": 5
  }
]
```

### Example 2: Multiple Independent Visualizations
User: "Show rivers and buildings"
Output:
```json
[
  {
    "id": "goal_1",
    "description": "Display rivers on the map",
    "type": "visualization",
    "priority": 5
  },
  {
    "id": "goal_2",
    "description": "Display buildings on the map",
    "type": "visualization",
    "priority": 5
  }
]
```

### Example 3: Analysis + Visualization (Same Result)
User: "Calculate 100m buffer around rivers and show it"
Output:
```json
[
  {
    "id": "goal_1",
    "description": "Calculate 100-meter buffer zones around rivers and display them on the map",
    "type": "visualization",
    "priority": 7
  }
]
```

### Example 4: Multi-Step Workflow (Intermediate Results)
User: "Show satellite imagery, extract buildings from it, then display buildings by area"
Output:
```json
[
  {
    "id": "goal_1",
    "description": "Display the satellite imagery on the map",
    "type": "visualization",
    "priority": 5
  },
  {
    "id": "goal_2",
    "description": "Extract building footprints from the satellite imagery",
    "type": "data_processing",
    "priority": 8
  },
  {
    "id": "goal_3",
    "description": "Display the extracted buildings with colors based on their area size",
    "type": "visualization",
    "priority": 7
  }
]
```

### Example 5: Information Query
User: "What data sources are available?"
Output:
```json
[
  {
    "id": "goal_1",
    "description": "List all available data sources with their names and types",
    "type": "query",
    "priority": 5
  }
]
```

## Important Notes

1. Each goal must be INDEPENDENT - no goal should depend on another goal's output
2. Descriptions should be in NATURAL LANGUAGE - avoid technical jargon
3. Focus on WHAT user wants, not HOW to achieve it
4. If unsure, err on the side of creating MORE goals (separate) rather than fewer (merged)
