# Visualization Renderer Refactoring - Implementation Plan

## Overview

This plan implements the visualization renderer refactoring as documented in `docs/architecture/visual-refactor/`. The goal is to solve plugin selection difficulties, 职责混乱, and scalability issues by introducing three new renderers (Uniform Color, Categorical, Choropleth) with a clean architecture.

**Current State:**
- Existing: `ChoroplethMVTExecutor`, `HeatmapExecutor`, `MVTPublisherExecutor` 
- Missing: All Phase 1 infrastructure (ColorResolutionEngine, GeometryAdapter, BaseRendererExecutor)
- Missing: New plugins (uniform_color_renderer, categorical_renderer, choropleth_renderer)

**Target State:**
- Three new renderers with unified architecture
- Centralized style generation via StyleFactory
- Capability-based plugin selection
- Geometry type agnostic rendering

---

## Phase 1: Infrastructure Foundation (Week 1)

### Task 1.1: Create ColorResolutionEngine

**File:** `server/src/utils/ColorResolutionEngine.ts`

**Purpose:** Centralize all color parsing logic, supporting Chinese color names, hex colors, and predefined ramps.

**Implementation:**
```typescript
export class ColorResolutionEngine {
  private colorConfig: ColorConfig;
  
  async resolveColor(color: string): Promise<string>;
  async resolveColorRamp(rampName: string, numColors: number): Promise<string[]>;
  async resolveColorScheme(schemeName: string, count: number): Promise<string[]>;
}
```

**Key Features:**
- Chinese color word mapping (红色 → reds)
- 8 predefined color ramps (reds, greens, blues, etc.)
- CSS color name support
- Hex color validation

**Configuration:** Store color mappings in a JSON config file or TypeScript constant.

---

### Task 1.2: Create GeometryAdapter

**File:** `server/src/utils/GeometryAdapter.ts`

**Purpose:** Map geometry types from DataSource metadata to Mapbox layer types. Does NOT read actual data files.

**Implementation:**
```typescript
export class GeometryAdapter {
  /**
   * Get geometry type from DataSource metadata (stored in SQLite during data ingestion)
   */
  static getGeometryTypeFromMetadata(dataSource: DataSource): GeometryType | undefined;
  
  /**
   * Map geometry type to appropriate Mapbox GL JS layer type
   */
  static getMapboxLayerType(geometryType: GeometryType): 'circle' | 'line' | 'fill';
  
  /**
   * Normalize Multi* geometry types to base types
   */
  static normalizeGeometryType(type: string): GeometryType;
}
```

**Key Design Decisions:**
- Geometry type is stored in SQLite database when data source is registered (during metadata extraction)
- Executor retrieves geometry type from `dataSource.metadata.geometryType` - NO file reading
- This approach works for ALL data source types (GeoJSON, Shapefile, PostGIS, etc.)
- No performance overhead during rendering (metadata already available)

**Usage in BaseRendererExecutor:**
```typescript
protected async loadDataSource(dataSourceId: string) {
  const dataSource = this.dataSourceRepo.getById(dataSourceId);
  
  // Get geometry type from metadata (already stored in SQLite)
  const geometryType = GeometryAdapter.getGeometryTypeFromMetadata(dataSource);
  
  if (!geometryType) {
    throw new Error(`Geometry type not found in metadata for data source ${dataSourceId}`);
  }
  
  const accessor = this.accessorFactory.createAccessor(dataSource.type);
  const nativeData = await accessor.read(dataSource.reference);
  
  // Store in nativeData metadata for StyleFactory to use
  nativeData.metadata = {
    ...nativeData.metadata,
    geometryType
  };
  
  return { dataSource, nativeData, accessor };
}
```

---

### Task 1.3: Create BaseRendererExecutor

**File:** `server/src/plugin-orchestration/executor/BaseRendererExecutor.ts`

**Purpose:** Provide unified workflow for all visualization executors, reducing code duplication from 80% to 10%.

**Implementation:**
```typescript
export abstract class BaseRendererExecutor {
  protected db: Database;
  protected workspaceBase: string;
  protected styleFactory: StyleFactory;
  
  constructor(db: Database, workspaceBase: string);
  
  protected async executeBaseWorkflow<T>(
    params: T,
    styleGenerator: (params: T, nativeData: NativeData) => Promise<string>
  ): Promise<NativeData>;
  
  protected async loadDataSource(dataSourceId: string): Promise<{dataSource, nativeData, accessor}>;
  
  protected abstract validateParams(params: any, dataSource: DataSource): void;
  protected abstract getRendererSpecificMetadata(params: any): any;
}
```

**Workflow Steps:**
1. Load data source via Accessor
2. Get geometry type from metadata via GeometryAdapter
3. Validate parameters
4. Generate MVT tiles via MVTStrategyPublisher
5. Generate Style JSON via callback (delegated to subclass)
6. Return standardized NativeData result

---

### Task 1.4: Extend DataAccessor with getUniqueValues

**Files to Modify:**
- `server/src/data-access/interfaces/DataAccessor.ts` - Add interface method
- `server/src/data-access/implementations/GeoJsonAccessor.ts` - Implement
- `server/src/data-access/implementations/ShapefileAccessor.ts` - Implement
- `server/src/data-access/implementations/PostgisAccessor.ts` - Implement

**Method Signature:**
```typescript
async getUniqueValues(filePath: string, fieldName: string): Promise<string[]>;
```

**Purpose:** Support categorical renderer by extracting unique category values from data sources.

---

## Phase 2: New Plugin Development (Week 2)

### Task 2.1: Create UniformColorRendererPlugin

**Files:**
- `server/src/plugin-orchestration/plugins/visualization/UniformColorRendererPlugin.ts`
- `server/src/plugin-orchestration/executor/visualization/UniformColorExecutor.ts`

**Plugin Definition:**
```typescript
export const UniformColorRendererPlugin: Plugin = {
  id: 'uniform_color_renderer',
  name: 'Uniform Color Renderer',
  executionCategory: 'visualization',
  capability: {
    executionCategory: 'visualization',
    inputRequirements: {
      supportedDataFormats: ['vector'],
      supportedGeometryTypes: ['Point', 'LineString', 'Polygon', ...],
      requiredFields: []
    },
    outputCapabilities: {
      outputType: 'mvt',
      isTerminalNode: true
    },
    scenarios: ['simple_display', 'single_color_visualization'],
    priority: 8
  }
};
```

**Executor Implementation:**
```typescript
export class UniformColorExecutor extends BaseRendererExecutor {
  async execute(params: UniformColorParams): Promise<NativeData> {
    return this.executeBaseWorkflow(params, async (p, nativeData) => {
      return await this.styleFactory.generateUniformStyle({
        tilesetId: p._tilesetId,
        color: p.color || '#409eff',
        strokeWidth: p.strokeWidth,
        pointSize: p.pointSize,
        opacity: p.opacity,
        geometryType: nativeData.metadata?.geometryType
      });
    });
  }
}
```

---

### Task 2.2: Create CategoricalRendererPlugin

**Files:**
- `server/src/plugin-orchestration/plugins/visualization/CategoricalRendererPlugin.ts`
- `server/src/plugin-orchestration/executor/visualization/CategoricalExecutor.ts`

**Key Features:**
- Requires `categoryField` parameter (string type field)
- Extracts unique categories via Accessor.getUniqueValues()
- Assigns colors using predefined schemes (set1, set2, etc.)
- Supports custom color mapping
- Generates legend metadata

**Executor Logic:**
```typescript
async execute(params: CategoricalParams): Promise<NativeData> {
  return this.executeBaseWorkflow(params, async (p, nativeData) => {
    // Get unique categories
    const accessor = this.createAccessor(nativeData.type);
    const categories = await accessor.getUniqueValues(nativeData.reference, p.categoryField);
    
    // Assign colors
    const colorMapping = this.assignColorsToCategories(categories, p.colorScheme, p.customColors);
    
    // Generate style
    return await this.styleFactory.generateCategoricalStyle({
      tilesetId: p._tilesetId,
      categoryField: p.categoryField,
      categories,
      colorMapping,
      geometryType: nativeData.metadata?.geometryType
    });
  });
}
```

---

### Task 2.3: Create ChoroplethRendererPlugin

**Files:**
- `server/src/plugin-orchestration/plugins/visualization/ChoroplethRendererPlugin.ts`
- `server/src/plugin-orchestration/executor/visualization/ChoroplethExecutor.ts`

**Note:** COMPLETE REFACTOR - No backward compatibility. Old ChoroplethMapPlugin will be DELETED, not deprecated.

**Key Features:**
- Requires `valueField` parameter (numeric type field)
- Calculates statistics via Accessor.statisticalOp
- Performs classification (quantile, equal_interval, std_dev, jenks)
- Generates continuous color gradient via interpolate expression

**Executor Logic:**
```typescript
async execute(params: ChoroplethParams): Promise<NativeData> {
  return this.executeBaseWorkflow(params, async (p, nativeData) => {
    // Calculate statistics
    const accessor = this.createAccessor(nativeData.type);
    const stats = await accessor.statisticalOp.calculateStatistics(nativeData.reference, p.valueField);
    
    // Classify
    const breaks = await accessor.statisticalOp.classify(stats.values, p.classification, p.numClasses);
    
    // Generate style (pass colorRamp name, not resolved colors)
    return await this.styleFactory.generateChoroplethStyle({
      tilesetId: p._tilesetId,
      valueField: p.valueField,
      breaks,
      colorRamp: p.colorRamp || 'greens',
      numClasses: breaks.length - 1,
      geometryType: nativeData.metadata?.geometryType
    });
  });
}
```

---

### Task 2.4: Refactor StyleFactory

**File to Modify:** `server/src/services/StyleFactory.ts` (create if doesn't exist)

**New Methods:**
```typescript
export class StyleFactory {
  private colorEngine: ColorResolutionEngine;
  
  async generateUniformStyle(config: UniformStyleConfig): Promise<string>;
  async generateCategoricalStyle(config: CategoricalStyleConfig): Promise<string>;
  async generateChoroplethStyle(config: ChoroplethStyleConfig): Promise<string>;
  
  private buildUniformStyleJson(config: ...): MapboxStyle;
  private buildCategoricalStyleJson(config: ...): MapboxStyle;
  private buildChoroplethStyleJson(config: ...): MapboxStyle;
  
  private saveStyleJson(tilesetId: string, styleJson: any): string;
}
```

**Key Changes:**
- Remove color resolution logic from executors
- Delegate to ColorResolutionEngine
- Save styles to `workspace/results/styles/{tilesetId}.json`
- Return URL path to executor

**Style JSON Structure:**
- Mapbox GL JS v8 spec compliant
- Vector source pointing to MVT service
- Appropriate layer type based on geometry (circle/line/fill)
- Metadata section with renderer info and legend

---

## Phase 3: Plugin Registration & Capability System (Week 3)

### Task 3.1: Create PluginCapabilityRegistry

**File:** `server/src/plugin-orchestration/registry/PluginCapabilityRegistry.ts`

**Purpose:** In-memory registry for plugin capabilities, enabling rule-based filtering.

**Implementation:**
```typescript
export class PluginCapabilityRegistry {
  private registry: Map<string, PluginCapability> = new Map();
  
  register(pluginId: string, capability: PluginCapability): void;
  unregister(pluginId: string): void;
  filterByCapability(criteria: CapabilityCriteria): string[];
  getCapability(pluginId: string): PluginCapability | undefined;
}
```

**Filtering Logic:**
```typescript
interface CapabilityCriteria {
  expectedCategory?: 'statistical' | 'computational' | 'visualization' | 'textual';
  dataFormat?: 'vector' | 'raster';
  geometryType?: GeometryType;
  hasNumericField?: boolean;
  hasCategoricalField?: boolean;
}
```

---

### Task 3.2: Register New Plugins

**Files to Modify:**
- `server/src/plugin-orchestration/plugins/index.ts` - Export new plugins
- `server/src/plugin-orchestration/executor/index.ts` - Export new executors
- `server/src/index.ts` - Register plugins on startup

**Registration Code:**
```typescript
// In server/src/index.ts initialization
import { UniformColorRendererPlugin, CategoricalRendererPlugin, ChoroplethRendererPlugin } from './plugin-orchestration/plugins';
import { PluginCapabilityRegistry } from './plugin-orchestration/registry/PluginCapabilityRegistry';

await ToolRegistryInstance.registerPlugins([
  UniformColorRendererPlugin,
  CategoricalRendererPlugin,
  ChoroplethRendererPlugin
]);

PluginCapabilityRegistry.register(UniformColorRendererPlugin.id, UniformColorRendererPlugin.capability);
PluginCapabilityRegistry.register(CategoricalRendererPlugin.id, CategoricalRendererPlugin.capability);
PluginCapabilityRegistry.register(ChoroplethRendererPlugin.id, ChoroplethRendererPlugin.capability);
```

---

### Task 3.3: Update TaskPlanner for Two-Stage Decision

**File to Modify:** `server/src/llm-interaction/agents/TaskPlannerAgent.ts`

**Changes:**
1. Add Stage 1: Rule-based filtering using PluginCapabilityRegistry
2. Keep Stage 2: LLM selection from filtered candidates
3. Add terminal node constraint validation (by LLM, per design decision)

**Updated Flow:**
```typescript
async execute(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
  for (const goal of state.goals) {
    // Stage 1: Filter by capability
    const compatiblePlugins = this.filterCompatiblePlugins(goal, state.dataSourcesMetadata);
    
    // Stage 2: LLM selects from filtered list
    const plan = await this.llmSelectPlugin(goal, compatiblePlugins);
    
    executionPlans.set(goal.id, plan);
  }
}

private filterCompatiblePlugins(goal: AnalysisGoal, dataSourcesMetadata: DataSourceMetadata[]): PluginMetadata[] {
  const expectedCategory = this.inferExecutionCategory(goal);
  const dataSource = dataSourcesMetadata.find(ds => ds.id === goal.dataSourceId);
  
  const criteria: CapabilityCriteria = {
    expectedCategory,
    dataFormat: dataSource ? this.detectDataFormat(dataSource.type) : undefined,
    geometryType: dataSource?.metadata?.geometryType
  };
  
  return PluginCapabilityRegistry.filterByCapability(criteria)
    .map(pluginId => this.registry.getPlugin(pluginId));
}
```

---

## Phase 4: Prompt Updates & LLM Training (Week 4)

### Task 4.1: Update Goal Splitter Prompt

**File:** `workspace/llm/prompts/goal-splitting.md`

**CRITICAL RULE: NO CONCRETE EXAMPLES ALLOWED**

**Additions (Abstract Patterns Only):**
- Describe visualization goal patterns WITHOUT specific examples
- Explain parameter extraction principles generically
- Focus on intent recognition, not example matching

**Pattern Description (NO Examples):**
```markdown
Visualization Goal Recognition Patterns:

1. Simple Display Intent:
   - User wants to display geographic features with a single color
   - May specify color preference (color name, hex code, or color ramp)
   - No classification or statistical analysis required
   - Extract: color hint (if mentioned)

2. Categorical Display Intent:
   - User wants to differentiate features by category/type
   - Mentions field names related to classification/types
   - Implies discrete color mapping
   - Extract: category field name (if mentioned), color scheme preference

3. Statistical Classification Intent:
   - User wants to show data distribution using graduated colors
   - Mentions numeric fields, statistics, or grading/classification
   - Implies continuous color gradient based on values
   - Extract: value field name, classification method preference, color ramp preference

Parameter Extraction Guidelines:
- Color specifications may appear as: color names, hex codes, or descriptive terms
- Field names should be extracted from context or matched against available metadata
- Classification preferences should be noted but defaults applied if unspecified
```

**FORBIDDEN:** Do NOT include examples like "红色显示五虎林河" or specific dataset names. This causes LLM to become biased toward those examples.

---

### Task 4.2: Update Task Planner Prompt

**File:** `workspace/llm/prompts/task-planning.md`

**CRITICAL RULE: NO CONCRETE EXAMPLES ALLOWED**

**Additions (Abstract Principles Only):**
- Execution category system explanation (conceptual)
- Terminal node constraints (rule-based, no examples)
- Two-stage decision process description
- Plugin capability matching logic (generic)

**Key Section (Abstract):**
```markdown
Execution Category System:

Plugins are categorized by their data flow characteristics:
- Statistical: Input NativeData → Output JSON (non-terminal)
- Computational: Input NativeData → Output NativeData (non-terminal)
- Visualization: Input NativeData → Output MVT/WMS/GeoJSON (TERMINAL - must be last step)
- Textual: Input execution results → Output HTML/PDF (TERMINAL - must be last step)

Terminal Node Constraints:
- Visualization and Textual plugins MUST be the final step in any execution plan
- A goal can have AT MOST ONE terminal node
- If a terminal node is selected, no subsequent steps can be added
- Violation of this constraint will cause execution failure

Two-Stage Decision Process:

Stage 1 - Automatic Filtering (System):
- Filter plugins by expected execution category based on goal type
- Filter by data format compatibility (vector/raster)
- Filter by geometry type compatibility (if applicable)
- Filter by required field availability
- Result: Reduced candidate set (typically 3-5 plugins)

Stage 2 - Intelligent Selection (LLM):
- Review filtered candidates provided by system
- Select most appropriate plugin based on user intent
- Extract and validate required parameters
- Ensure terminal node constraints are satisfied
- Generate complete execution plan

Parameter Extraction Principles:
- Match user mentions to available data source fields
- Apply sensible defaults when parameters are unspecified
- Validate parameter types against plugin requirements
- Report missing required fields clearly
```

**FORBIDDEN:** Do NOT include concrete query examples or specific plugin selection scenarios. Keep all descriptions abstract and principle-based.

---

### Task 4.3: Document Plugin Capabilities (Abstract Description)

**File:** `workspace/llm/prompts/plugin-capabilities.md` (create if needed)

**CRITICAL: Abstract Capability Descriptions Only - NO Examples**

**Content Structure:**

For each renderer type, describe:
1. **When to Use** (abstract conditions, not examples)
2. **Required Parameters** (field types, not specific field names)
3. **Output Characteristics** (service type, metadata structure)
4. **Compatibility Requirements** (data formats, geometry types)

**Uniform Color Renderer Capability Description:**
```markdown
Uniform Color Renderer:
- Purpose: Display all features with a single uniform color
- Use When: User wants simple visualization without classification or analysis
- Required Parameters: dataSourceId (any vector data source)
- Optional Parameters: color specification, stroke width, point size, opacity
- Supported Geometry Types: Point, LineString, Polygon (all types)
- Output: MVT service with uniform styling
- Priority: High (simplest option, good fallback)
```

**Categorical Renderer Capability Description:**
```markdown
Categorical Renderer:
- Purpose: Color features based on categorical/string field values
- Use When: User wants to differentiate features by type/category/classification
- Required Parameters: dataSourceId, categoryField (must be string type field)
- Optional Parameters: color scheme, custom color mapping, opacity
- Supported Geometry Types: Point, LineString, Polygon (all types)
- Output: MVT service with categorical coloring and legend
- Data Requirement: Data source must contain the specified categorical field
```

**Choropleth Renderer Capability Description:**
```markdown
Choropleth Renderer:
- Purpose: Create graduated color maps based on numeric field values
- Use When: User wants to visualize data distribution, statistics, or magnitude
- Required Parameters: dataSourceId, valueField (must be numeric type field)
- Optional Parameters: classification method, number of classes, color ramp, opacity
- Supported Geometry Types: Point, LineString, Polygon (all types)
- Output: MVT service with statistical classification and gradient coloring
- Data Requirement: Data source must contain the specified numeric field
- Processing: Performs statistical analysis and classification automatically
```

**FORBIDDEN:** Do NOT include example queries like "红色显示..." or specific dataset references. Keep all descriptions generic and principle-based.

---

### Task 4.4: Test LLM Selection Accuracy (Abstract Scenarios)

**Test Approach:** Use abstract scenario patterns, NOT specific examples

**Test Scenario Patterns:**
1. Simple Display Pattern: User requests single-color visualization → Should select uniform_color_renderer
2. Categorical Pattern: User mentions categories/types/classes → Should select categorical_renderer (if string field exists)
3. Statistical Pattern: User mentions statistics/grading/distribution → Should select choropleth_renderer (if numeric field exists)
4. Ambiguous Pattern: User request unclear → Should default to uniform_color_renderer or ask for clarification

**Testing Methodology:**
- Create test queries following each pattern but with DIFFERENT vocabulary each time
- Vary color terms, field references, and phrasing
- Measure selection accuracy across multiple variations
- Ensure LLM doesn't memorize specific examples

**Success Criteria:**
- >90% correct plugin selection across varied phrasings
- Correct parameter extraction (field names, color preferences)
- No terminal node violations
- Consistent behavior regardless of specific wording

---

## Phase 5: Complete Refactor - Remove Old Code (Week 5)

### Task 5.1: Delete Old Visualization Files

**Files to DELETE (complete removal, no backward compatibility):**
- `server/src/plugin-orchestration/plugins/visualization/ChoroplethMapPlugin.ts` - Deleted, replaced by ChoroplethRendererPlugin
- `server/src/plugin-orchestration/executor/visualization/ChoroplethMVTExecutor.ts` - Deleted, replaced by ChoroplethExecutor
- `server/src/plugin-orchestration/plugins/visualization/MVTPublisherPlugin.ts` - Deleted
- `server/src/plugin-orchestration/executor/visualization/MVTPublisherExecutor.ts` - Deleted per architecture decision

**Files to KEEP and REFACTOR:**
- `server/src/plugin-orchestration/plugins/visualization/HeatmapPlugin.ts` - Keep, heatmap functionality still needed
- `server/src/plugin-orchestration/executor/visualization/HeatmapExecutor.ts` - Refactor to extend BaseRendererExecutor

**Rationale:**
- Heatmap requires different rendering approach (density-based, not feature-based)
- Cannot use standard MVT + Style JSON pattern
- Must remain as separate specialized renderer

---

### Task 5.2: Refactor HeatmapExecutor

**File:** `server/src/plugin-orchestration/executor/visualization/HeatmapExecutor.ts`

**Refactoring Actions:**
1. Extend BaseRendererExecutor instead of standalone implementation
2. Use direct MVTStrategyPublisher call (remove any MVTPublisherExecutor dependency)
3. Maintain heatmap-specific logic (density calculation, kernel smoothing)
4. Update to work with new StyleFactory if applicable

**Note:** Heatmap cannot use standard choropleth/categorical/uniform pattern because:
- Generates raster-like density visualization, not feature-based styling
- May use GeoJSON output instead of MVT + Style JSON
- Requires specialized rendering approach

---

### Task 5.3: Update All References

**Files to Update:**
- `server/src/plugin-orchestration/plugins/index.ts` - Remove old exports, add new ones
- `server/src/plugin-orchestration/executor/index.ts` - Remove old exports, add new ones
- `server/src/plugin-orchestration/tools/PluginToolWrapper.ts` - Update executor instantiation
- `server/src/index.ts` - Update plugin registration
- Any other files importing deleted modules

**Search Pattern:** Find all imports of:
- `ChoroplethMapPlugin`
- `ChoroplethMVTExecutor`
- `MVTPublisherPlugin`
- `MVTPublisherExecutor`

Replace with new equivalents or remove if obsolete.

---

### Task 5.4: Frontend Integration Updates

**Files to Check and Update:**
- `web/src/components/map/MapViewer.vue` (or similar map component)
- Any service loading MVT tiles and style JSON

**Required Changes:**
1. Ensure frontend reads `styleUrl` from NativeData.metadata
2. Load style JSON BEFORE adding vector source to map
3. Display legend if present in metadata.legend array
4. Handle all three renderer types uniformly (uniform, categorical, choropleth)

**No Backward Compatibility:** Old style URL formats are NOT supported. Frontend must use new format.

---

## Phase 6: Testing & Optimization (Week 6)

### Task 6.1: Unit Tests

**Test Files to Create:**
- `server/tests/unit/utils/ColorResolutionEngine.test.ts`
- `server/tests/unit/utils/GeometryAdapter.test.ts`
- `server/tests/unit/executor/UniformColorExecutor.test.ts`
- `server/tests/unit/executor/CategoricalExecutor.test.ts`
- `server/tests/unit/executor/ChoroplethExecutor.test.ts`
- `server/tests/unit/registry/PluginCapabilityRegistry.test.ts`

**Coverage Target:** >80%

---

### Task 6.2: Integration Tests

**Test Scenarios:**
1. Complete workflow: User query → Goal splitting → Task planning → Execution → Result
2. Plugin capability filtering accuracy
3. Terminal node constraint enforcement
4. Style JSON generation correctness
5. MVT service accessibility

**Test Script:** `scripts/test-visualization-refactor.js`

---

### Task 6.3: Performance Benchmarking

**Metrics to Measure:**
- Average response time (<2 seconds target)
- Memory usage increase (<10% target)
- Concurrent request handling (>10 QPS target)

**Tools:**
- Use existing test scripts with timing instrumentation
- Monitor server resource usage during tests

---

### Task 6.4: Error Handling Enhancement

**Areas to Improve:**
- Invalid color format → helpful error message
- Missing required fields → suggest available fields
- Geometry type mismatch → auto-adapt or warn
- MVT generation failure → rollback and report

---

## Deliverables Summary

### Week 1: Infrastructure
- [ ] `server/src/utils/ColorResolutionEngine.ts`
- [ ] `server/src/utils/GeometryAdapter.ts`
- [ ] `server/src/plugin-orchestration/executor/BaseRendererExecutor.ts`
- [ ] Extended DataAccessor interfaces

### Week 2: New Plugins
- [ ] `server/src/plugin-orchestration/plugins/visualization/UniformColorRendererPlugin.ts`
- [ ] `server/src/plugin-orchestration/executor/visualization/UniformColorExecutor.ts`
- [ ] `server/src/plugin-orchestration/plugins/visualization/CategoricalRendererPlugin.ts`
- [ ] `server/src/plugin-orchestration/executor/visualization/CategoricalExecutor.ts`
- [ ] `server/src/plugin-orchestration/plugins/visualization/ChoroplethRendererPlugin.ts`
- [ ] `server/src/plugin-orchestration/executor/visualization/ChoroplethExecutor.ts`
- [ ] Refactored `server/src/services/StyleFactory.ts`

### Week 3: Registration & Capability
- [ ] `server/src/plugin-orchestration/registry/PluginCapabilityRegistry.ts`
- [ ] Updated plugin exports and registrations
- [ ] Modified `TaskPlannerAgent.ts` with two-stage decision

### Week 4: Prompts
- [ ] Updated `workspace/llm/prompts/goal-splitting.md`
- [ ] Updated `workspace/llm/prompts/task-planning.md`
- [ ] Created plugin capabilities documentation
- [ ] LLM selection accuracy test results

### Week 5: Migration
- [ ] Deleted old ChoroplethMapPlugin and MVTPublisherExecutor
- [ ] Refactored HeatmapExecutor
- [ ] Updated all references
- [ ] Updated frontend integration

### Week 6: Testing
- [ ] Unit tests (6+ test files)
- [ ] Integration test script
- [ ] Performance benchmark report
- [ ] Error handling improvements

---

## Success Criteria

### Functional
- ✅ All three renderers work correctly
- ✅ Support for Point, LineString, Polygon geometry types
- ✅ Generic pattern recognition works (not example-dependent)
- ✅ Terminal node constraints enforced
- ✅ Capability-based filtering reduces LLM cognitive load

### Performance
- ✅ Average response time < 2 seconds
- ✅ Memory usage increase < 10%
- ✅ Concurrent request support > 10 QPS

### Quality
- ✅ Unit test coverage > 80%
- ✅ All integration tests pass
- ✅ Zero critical bugs
- ✅ Complete documentation

### User Experience
- ✅ LLM plugin selection accuracy > 90%
- ✅ User query success rate > 95%
- ✅ Clear error messages for invalid inputs

---

## Risk Mitigation

### High Risk: LLM Becomes Example-Biased
**Mitigation:** Strictly enforce abstract prompt design, test with varied vocabulary
**Fallback:** Retrain prompts with diverse patterns if bias detected

### High Risk: LLM Selection Inaccuracy
**Mitigation:** Extensive prompt engineering and testing in Week 4
**Fallback:** Keep old plugins available, manual override option

### Medium Risk: Performance Degradation
**Mitigation:** Performance benchmarks in Week 6, optimize hot paths
**Fallback:** Simplify color resolution caching, reduce metadata computation

### Medium Risk: Frontend Compatibility
**Mitigation:** Maintain API compatibility, gradual rollout
**Fallback:** Dual-style URL support during transition

---

## Next Steps After Plan Approval

1. Start with Phase 1, Task 1.1 (ColorResolutionEngine)
2. Implement tasks sequentially within each phase
3. Run tests after each task completion
4. Review architecture decisions if blockers encountered
5. Adjust timeline based on actual progress

---

**Plan Version:** v1.0  
**Created:** 2026-05-06  
**Based On:** docs/architecture/visual-refactor/ README.md and related documents  
**Estimated Duration:** 6 weeks  
**Complexity:** High (architectural refactoring)
