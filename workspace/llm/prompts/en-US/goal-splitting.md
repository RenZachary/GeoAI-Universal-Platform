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
