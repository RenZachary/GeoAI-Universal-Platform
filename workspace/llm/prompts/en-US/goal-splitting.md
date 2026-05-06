<!-- Identify user intents and map to required executors -->
Analyze the user's request and identify which executors (plugins) are needed to accomplish the task.

User input: 
{{userInput}}

Available Executors: 
{{availableExecutors}}

Intent Analysis Principles:
1. Identify ALL actions mentioned in the user request
2. Distinguish between "Information Retrieval" (querying metadata, listing sources) and "Data Visualization/Display" (rendering maps, showing charts)
3. For each action, determine which executor(s) can accomplish it
4. If an action requires multiple steps (e.g., analyze then visualize), include ALL required executors
5. Group related actions into a single goal if they form a coherent workflow
6. Separate independent actions into different goals

Key Patterns:
- Explicit Display Request: When user uses verbs like "show", "display", "render", "map", or "visualize", prioritize executors capable of producing visual outputs (e.g., map renderers, chart generators) over simple query tools.
- Analysis + Display: When user requests analysis followed by display/show/view/map/render, include BOTH the analysis executor AND a visualization executor
- Information Query: When user asks for "list", "metadata", "info", or "details" without mentioning display, use information retrieval executors.
- Single Operation: When user requests only one operation, include only that executor
- Multiple Independent Tasks: When user requests multiple unrelated tasks, create separate goals

Output Format:
Return a JSON array of goals:
[
  {
    "id": "goal_1",
    "description": "Clear description of what to accomplish in natural language",
    "type": "visualization" | "analysis" | "query" | "report",
    "requiredExecutors": ["executor_id_1", "executor_id_2"],
    "priority": 5
  }
]

Goal Type Definitions:
- visualization: User wants to see data on a map, chart, or other visual representation (keywords: show, display, render, map, plot).
- analysis: User wants to perform spatial operations, calculations, or statistical processing (keywords: analyze, calculate, buffer, intersect).
- query: User wants to retrieve information, metadata, or list available resources (keywords: list, info, details, what is).
- report: User wants a textual summary or explanation of findings.

Rules:
- Each goal should represent a coherent workflow or independent task
- requiredExecutors MUST contain the exact executor IDs needed (e.g., "buffer_analysis", "uniform_color_renderer")
- Include ALL executors needed to complete the goal (analysis + visualization if both are requested)
- Description should preserve complete user intent including visualization requirements
- Do NOT expose internal goal types to the user - focus on what needs to be done
