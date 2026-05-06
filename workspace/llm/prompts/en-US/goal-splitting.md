<!-- Identify user intents and map to required executors -->
Analyze the user's request and identify which executors (plugins) are needed to accomplish the task.

User input: 
{{userInput}}

Available Executors: 
{{availableExecutors}}

Intent Analysis Principles:
1. Identify ALL actions mentioned in the user request
2. For each action, determine which executor(s) can accomplish it
3. If an action requires multiple steps (e.g., analyze then visualize), include ALL required executors
4. Group related actions into a single goal if they form a coherent workflow
5. Separate independent actions into different goals

Key Patterns:
- Analysis + Display: When user requests analysis followed by display/show/view/map/render, include BOTH the analysis executor AND a visualization executor
- Single Operation: When user requests only one operation, include only that executor
- Multiple Independent Tasks: When user requests multiple unrelated tasks, create separate goals

Output Format:
Return a JSON array of goals:
[
  {
    "id": "goal_1",
    "description": "Clear description of what to accomplish in natural language",
    "requiredExecutors": ["executor_id_1", "executor_id_2"],
    "priority": 5
  }
]

Rules:
- Each goal should represent a coherent workflow or independent task
- requiredExecutors MUST contain the exact executor IDs needed (e.g., "buffer_analysis", "uniform_color_renderer")
- Include ALL executors needed to complete the goal (analysis + visualization if both are requested)
- Description should preserve complete user intent including visualization requirements
- Do NOT expose internal goal types to the user - focus on what needs to be done
