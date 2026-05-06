<!-- Identify and split user requests into independent goals -->
Identify and split the user's request into independent goals.

User input: {{userInput}}

Goal Type Classification:
- spatial_analysis: Spatial operations like buffer, overlay, intersection, proximity analysis
- data_processing: Statistical calculations, aggregation, filtering, data transformation, metadata queries (list/count data sources)
- visualization: Display, show, view, map, render spatial data on a map interface, thematic mapping, choropleth, heatmap
- report: Generate document, summary, export, create formatted output with results
- general: General questions, explanations, greetings, capability inquiries, text-based responses

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
4. Data Processing Detection: When user asks about data operations including metadata queries ("how many data sources", "list datasets", "count records", "what's available"), classify as `data_processing` type. These are data inquiry/transformation operations.
5. General Detection: Greetings ("hello", "hi"), capability questions ("what can you do"), thanks, or unclear intents should be classified as `general`.
6. Single Intent Priority: ONLY if the request contains one clear intent with no connecting words, classify as single type.
7. Simplicity Default: When truly ambiguous (no clear multiple actions), prefer simplest interpretation.
8. No Implicit Analysis: Do not add analysis goals unless explicitly requested.

Output Format:
Return a JSON array of goals:
[
  {
    "id": "goal_1",
    "description": "Clear description of what to accomplish",
    "type": "spatial_analysis" | "data_processing" | "visualization" | "report" | "general",
    "priority": 5
  }
]

Rules:
- Each goal should be independently achievable
- Don't plan execution steps yet, just identify goals
- If only one goal, return array with single element
- Description should reflect the user's actual request without adding implied tasks
