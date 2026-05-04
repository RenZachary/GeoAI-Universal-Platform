<!-- Create execution plan for goals using available plugins and data sources -->
Create an execution plan for the given goal using available plugins and data sources.

Goal: {{goalDescription}}
Goal Type: {{goalType}}

Available Data Sources:
{{dataSourcesMetadata}}

Available Plugins:
{{availablePlugins}}

Context from Previous Steps (if any):
{{previousResults}}

CRITICAL REQUIREMENTS:
1. You MUST use the EXACT plugin IDs provided in the "Available Plugins" section
2. The pluginName field must match the 'id' field from available plugins exactly
3. Do NOT invent, modify, or guess plugin names - use only what is listed
4. If a required plugin is not available, report it as unavailable rather than using a similar name

Create a step-by-step execution plan. For each step specify:
- pluginName: Which plugin to use (MUST be exact ID from available plugins)
- parameters: Parameters for the plugin
- outputType: Expected output type

Considerations:
- Choose appropriate plugins based on data source type
- Respect NativeData principle (keep original format)
- Handle errors gracefully
- Return plan as JSON array of steps
