<!-- Create execution plan for goals using available plugins and data sources -->
Create an execution plan for the given goal using available plugins and data sources.

Goal ID: {{goalId}}
Goal Description: {{goalDescription}}

Available Data Sources:
{{dataSourcesMetadata}}

Available Operators:
{{availablePlugins}}

Context from Previous Steps (if any):
{{previousResults}}

Planning Principles:
1. Directness Priority: Select the data source that most directly matches the goal description. Prefer exact name matches over broader datasets requiring filtering.
2. Field Verification: Only reference fields that are explicitly listed in the data source metadata. Do not infer or assume field existence based on naming conventions or domain knowledge.
3. **Analysis + Visualization Separation**: When the goal description implies both spatial analysis (buffer, filter, overlay, aggregation, etc.) AND visual presentation (displaying results, applying colors/styles, showing on map), create separate steps:
   - First step: Execute the spatial analysis operation to produce processed geometry
   - Second step: Apply a visualization operator to render the analysis result with appropriate styling
   - The visualization step's dataSourceId MUST reference the analysis step's output using placeholder syntax: `{analysis_step_id.result.id}`
4. Minimal Sufficiency: Generate the minimum number of steps needed to achieve the goal. Each step must have a clear, necessary purpose directly contributing to goal completion.
5. Dependency Awareness: If a step requires output from a previous step, ensure proper dependency ordering. Independent steps can execute in parallel.
6. Plugin Compatibility: Verify that plugin parameters match the data source characteristics (type, geometry, available fields). Do not use plugins with incompatible data sources.
7. **CRITICAL: Operator ID Accuracy**: You MUST use the EXACT `id` field from the Available Plugins list. DO NOT invent, modify, or guess operator IDs. The `operatorId` field in your execution plan must exactly match an operator's `id` from the available list.
8. **CRITICAL: No Duplicate Steps**: Each step in the plan MUST use a unique operator. NEVER repeat the same operator multiple times within a single goal's execution plan. If you find yourself wanting to use the same operator twice, reconsider whether both steps are truly necessary - typically one properly configured step is sufficient.
9. **Operator Return Type Awareness**: Each operator has a returnType property that determines how its output can be used:
   - **spatial**: Returns NativeData structure (id, type, reference, metadata). Can be used as dataSourceId in subsequent steps.
   - **analytical**: Returns statistical/query results. Cannot be used as spatial input, only for reporting or display.
   - **textual**: Returns text responses. Terminal operations that cannot chain further.
   - Check the operator's returnType in Available Operators metadata before planning dependencies.

Referencing Previous Step Results:
When a step needs to use results from a previous step, you MUST use this EXACT syntax:
  {step_id.result}

Rules:
- ALWAYS use curly braces {} around the reference
- ALWAYS use .result to access the primary output value
- The step_id must exactly match the stepId from a previous step
- For nested fields, use dot notation: {step_id.result.fieldName}

**CRITICAL: Placeholder Resolution Rules Based on Return Type:**
1. **For spatial operators** (returnType = 'spatial'):
   - Use {step_id.result.id} to get the NativeData.id for dataSourceId parameter
   - This is the MOST COMMON use case for chaining spatial operations
   - Example: Buffer → Choropleth uses {buffer_step.result.id} as dataSourceId

2. **For analytical operators** (returnType = 'analytical'):
   - CANNOT be used as dataSourceId (they don't produce spatial data)
   - Can reference specific fields: {step_id.result.data.fieldName}
   - Typically used in report generation or summary contexts
   - Example: Statistics result used in report, not as map input

3. **For textual operators** (returnType = 'textual'):
   - Terminal operations - no subsequent steps should reference them
   - Their output is for direct display to user

4. **Validation Rule**: BEFORE using a placeholder, verify the target step's operator has appropriate returnType:
   - If passing as dataSourceId → target MUST have returnType='spatial'
   - If extracting statistics → target SHOULD have returnType='analytical'
   - IF returnType mismatch detected → revise plan to use correct operator

CRITICAL RULES FOR DATA DEPENDENCIES:
1. When a visualization plugin follows an analysis step, you MUST pass the analysis result's ID as dataSourceId using placeholder syntax.
2. Use placeholder syntax to reference the NativeData.id from the previous step's output.
3. NEVER pass the original data source ID to visualization plugins when there's a preceding analysis step that produces new geometry.
4. The .result.id field contains the unique identifier of the previous step's NativeData output, which is required for loading that specific processed result.

Each plugin's outputSchema defines what fields are available in .result. Check the plugin documentation for details.

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
  - stepId: **Globally unique identifier** for this step. MUST follow format: `{goalId}_{descriptive_name}` (e.g., "goal_1_display_rivers", "goal_2_buffer_analysis"). This ensures uniqueness across all goals.
  - operatorId: ID of the spatial operator to execute (MUST exactly match an operator's `id` from the Available Plugins list)
  - parameters: Parameters matching the operator's expected inputSchema
  - dependsOn: Array of step IDs that must complete before this step. Use full stepId with goal prefix (e.g., ["goal_1_step_a"])
- requiredOperators: Array of unique operator IDs used in this plan

**CRITICAL StepId Rules:**
1. ALWAYS prefix stepId with the goalId: `{goalId}_{name}`
2. Use descriptive names: "buffer_analysis", "overlay_intersect", "choropleth_viz"
3. When referencing previous steps in parameters or dependsOn, use the FULL stepId including goal prefix

Examples:
✅ Correct: "goal_2_buffer_step", "goal_3_overlay_analysis"
❌ Wrong: "step_1", "buffer_step" (missing goal prefix)

Validation Checklist (internal, do not output):
- Does each step use only fields explicitly listed in data source metadata?
- Is the selected data source the most direct match for the goal?
- Are all steps necessary, or can some be removed without affecting goal completion?
- Do operator parameters match the actual data source type and structure?
- **CRITICAL**: Does every `operatorId` EXACTLY match an `id` from the Available Operators list?
- **CRITICAL**: Are there any duplicate operators in the steps array? Each operator should appear at most once per goal.
- **CRITICAL**: If the goal implies both spatial processing AND visual presentation, does the plan include BOTH an analysis step AND a visualization step? If the user wants to see results on a map with specific styling, a visualization step is required.
- **CRITICAL**: When a visualization step follows an analysis step, does it correctly reference the analysis result using `{analysis_step_id.result.id}` as dataSourceId?
- **NEW CRITICAL**: For ALL placeholder references, does the target step's returnType match the usage context?
  - dataSourceId placeholders → target MUST have returnType='spatial'
  - Statistical data placeholders → target SHOULD have returnType='analytical'
  - Text response placeholders → target SHOULD have returnType='textual'
