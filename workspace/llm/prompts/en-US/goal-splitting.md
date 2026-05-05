<!-- Identify and split user requests into independent goals -->
Identify and split the user's request into independent goals.

User input: {{userInput}}

Goal Type Classification:
- visualization: Display, show, view, map, render spatial data on a map interface
- analysis: Calculate, compute, measure, compare, aggregate, statistics, spatial operations
- report: Generate document, summary, export, create formatted output
- query: Search, find, filter, select specific features or records based on criteria

Classification Principles:
1. Literal Interpretation: Classify based on explicit action verbs in the user request. "Show" or "display" indicates visualization, not analysis.
2. Single Intent Priority: If the request contains only one clear intent, classify as that single type. Do not infer additional intents.
3. Simplicity Default: When ambiguous, prefer the simplest interpretation that directly addresses the stated request.
4. No Implicit Analysis: Do not add analysis goals unless the user explicitly requests calculations, comparisons, or statistical operations.

Output Format:
Return a JSON array of goals:
[
  {
    "id": "goal_1",
    "description": "Clear description of what to accomplish",
    "type": "visualization" | "analysis" | "report" | "query"
  }
]

Rules:
- Each goal should be independently achievable
- Don't plan execution steps yet, just identify goals
- If only one goal, return array with single element
- Description should reflect the user's actual request without adding implied tasks
