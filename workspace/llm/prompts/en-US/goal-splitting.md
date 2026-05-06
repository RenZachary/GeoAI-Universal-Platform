<!-- Identify and split user requests into independent goals -->
Identify and split the user's request into independent goals.

User input: {{userInput}}

Goal Type Classification:
- spatial_analysis: Spatial operations like buffer, overlay, intersection, proximity analysis
- data_processing: Statistical calculations, aggregation, filtering, data transformation
- visualization: Display, show, view, map, render spatial data on a map interface, thematic mapping, choropleth, heatmap
- report: Generate document, summary, export, create formatted output with results
- query: Search, find, filter, select specific features or records based on criteria
- general: General questions, explanations, text-based responses

Visualization Scenarios:
When user requests thematic mapping or visualization, classify as "visualization" type.

Key indicators: terms related to map rendering, thematic visualization, color gradients, distribution maps, heatmaps, contour lines, etc.

Important Note for Task Planner:
When planning visualization tasks, ensure all parameters (especially field names) exactly match the data source metadata. Do not infer or guess field names.

Classification Principles:
1. Literal Interpretation: Classify based on explicit action verbs in the user request.
2. Multi-Intent Splitting: CRITICAL - If the request contains multiple distinct actions connected by conjunctions (and, then, followed by, as well as) or equivalent connectors in any language, split into separate goals. Each distinct action verb indicates a separate goal.
   - Pattern: "[action1] [object1] and [action2] [object2]" produces 2 goals
   - Pattern: "[action1] [object1] then [action2]" produces 2 goals
   - Pattern: "[action1] [object1] followed by [action2]" produces 2 goals
3. Report Detection: When user mentions report-related terms (report, document, summary, export, generate output, or equivalent terms in any language), ALWAYS create a separate `report` type goal.
4. Single Intent Priority: ONLY if the request contains one clear intent with no connecting words, classify as single type.
5. Simplicity Default: When truly ambiguous (no clear multiple actions), prefer simplest interpretation.
6. No Implicit Analysis: Do not add analysis goals unless explicitly requested.

Output Format:
Return a JSON array of goals:
[
  {
    "id": "goal_1",
    "description": "Clear description of what to accomplish",
    "type": "spatial_analysis" | "data_processing" | "visualization" | "report" | "query" | "general",
    "priority": 5
  }
]

Rules:
- Each goal should be independently achievable
- Don't plan execution steps yet, just identify goals
- If only one goal, return array with single element
- Description should reflect the user's actual request without adding implied tasks
