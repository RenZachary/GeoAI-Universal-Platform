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

Create a step-by-step execution plan. For each step specify:
- pluginName: Which plugin to use
- parameters: Parameters for the plugin
- outputType: Expected output type

Considerations:
- Choose appropriate plugins based on data source type
- Respect NativeData principle (keep original format)
- Handle errors gracefully
- Return plan as JSON array of steps
