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

Planning Principles:
1. Directness Priority: Select the data source that most directly matches the goal description. Prefer exact name matches over broader datasets requiring filtering.
2. Field Verification: Only reference fields that are explicitly listed in the data source metadata. Do not infer or assume field existence based on naming conventions or domain knowledge.
3. Complexity Alignment: Match plan complexity to goal type. Visualization goals require visualization plugins. Analysis goals require analysis plugins. Avoid adding unnecessary steps beyond what the goal type implies.
4. Minimal Sufficiency: Generate the minimum number of steps needed to achieve the goal. Each step must have a clear, necessary purpose directly contributing to goal completion.
5. Dependency Awareness: If a step requires output from a previous step, ensure proper dependency ordering. Independent steps can execute in parallel.
6. Plugin Compatibility: Verify that plugin parameters match the data source characteristics (type, geometry, available fields). Do not use plugins with incompatible data sources.

Choropleth Map Generation Pattern:
When generating a choropleth thematic map:

1. Identify the polygon data source (dataSourceId)
2. Identify the numeric field to visualize (valueField):
   - CRITICAL: valueField MUST exactly match a field name from the data source metadata
   - Do NOT use generic names unless they exist in metadata
   - Match user's intent to actual field names in metadata
3. Determine classification method based on user's description:
   - Use quantile as default if not specified
   - Select appropriate method based on distribution characteristics mentioned
4. Determine number of classes:
   - Default to 5 if not specified
   - Use 3-10 range based on data complexity
5. Determine color ramp based on user's color description:
   - Map color descriptions to appropriate predefined ramps
   - Support custom hex colors if explicitly provided

Output Format:
Return a JSON object with:
- goalId: The ID of the goal this plan addresses
- steps: Array of execution steps, each containing:
  - stepId: Unique identifier for this step
  - pluginId: ID of the plugin to execute
  - parameters: Parameters matching the plugin's expected schema
  - dependsOn: Array of step IDs that must complete before this step
- requiredPlugins: Array of unique plugin IDs used in this plan

Validation Checklist (internal, do not output):
- Does each step use only fields explicitly listed in data source metadata?
- Is the selected data source the most direct match for the goal?
- Are all steps necessary, or can some be removed without affecting goal completion?
- Do plugin parameters match the actual data source type and structure?
