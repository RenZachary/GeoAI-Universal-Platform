# SpatialOperator 架构设计

## 📋 概述

本文档详细描述GeoAI-UP v2.0的核心抽象层**SpatialOperator**,统一替代v1.0的Plugin/Executor/Tool三层架构。

**设计目标**:
1. **单一职责**: 每个Operator只负责一种空间分析能力
2. **统一接口**: 所有Operator遵循相同的执行协议
3. **后端解耦**: Operator不关心数据存储在File/PostGIS/Web
4. **易于扩展**: 新增算子只需继承基类并注册
5. **类型安全**: 使用Zod Schema进行输入输出验证

---

## 🏗️ 核心架构

### 架构对比

#### v1.0 三层架构 (复杂)
```
Plugin Definition (plugin.json元数据)
    ↓
Plugin Executor (业务逻辑实现)
    ↓
PluginToolWrapper (LangChain Tool适配)
    ↓
ToolRegistry (注册表)
```

**问题**:
- ❌ 职责重叠,代码分散在3个文件
- ❌ 需要三重注册 (Plugin + Executor + Tool)
- ❌ 调试时需追踪3层调用栈
- ❌ 新增算子需修改多个配置文件

#### v2.0 统一架构 (简洁)
```
SpatialOperator (元数据 + 逻辑 + Tool适配)
    ↓
SpatialOperatorRegistry (统一注册表)
```

**优势**:
- ✅ 单一文件包含完整定义
- ✅ 一次注册即可使用
- ✅ 调试路径清晰
- ✅ 新增算子只需添加一个类

---

## 🎨 类图设计

```typescript
┌─────────────────────────────────────────────┐
│          SpatialOperator (Abstract)         │
├─────────────────────────────────────────────┤
│ + operatorId: string                        │
│ + operatorType: OperatorType                │
│ + inputSchema: ZodSchema                    │
│ + outputSchema: ZodSchema                   │
├─────────────────────────────────────────────┤
│ + getMetadata(): OperatorMetadata           │
│ + execute(params, context): Promise<Result> │
│ # getName(): string                         │
│ # getDescription(): string                  │
│ # getCapabilities(): string[]               │
└─────────────────────────────────────────────┘
                    ↑ implements
        ┌───────────┴───────────┐
        │                       │
┌───────────────┐      ┌───────────────┐
│BufferOperator │      │OverlayOperator│
└───────────────┘      └───────────────┘
        │                       │
        └───────────┬───────────┘
                    │
        ┌───────────┴───────────┐
        │  SpatialOperator      │
        │  Registry             │
        ├───────────────────────┤
        │ + register(operator)  │
        │ + get(operatorId)     │
        │ + listAll()           │
        │ + toLangChainTool()   │
        └───────────────────────┘
```

---

## 📝 接口定义

### 1. SpatialOperator 抽象基类

```typescript
// server/src/spatial-operators/SpatialOperator.ts
import { z } from 'zod';

export type OperatorType = 
  | 'buffer'
  | 'overlay'
  | 'filter'
  | 'aggregate'
  | 'spatial_join'
  | 'kernel_density'
  | 'reclassify'
  | 'weighted_overlay'
  | 'distance_analysis'
  | 'point_extraction'
  | 'visualization';

export interface OperatorMetadata {
  id: string;
  type: OperatorType;
  name: string;
  description: string;
  version: string;
  capabilities: string[]; // ['computational', 'statistical', 'visualization']
  author?: string;
  tags?: string[];
}

export interface OperatorContext {
  dataSourceService: DataSourceService;
  dataAccessFacade: DataAccessFacade;
  resultPersistenceService: ResultPersistenceService;
  workspaceBase: string;
  conversationId: string;
  stepId: string;
  userId?: string;
}

export interface OperatorResult {
  success: boolean;
  resultId?: string;
  type: 'native_data' | 'visualization_service' | 'report' | 'statistics';
  reference?: string; // file path, table name, service URL
  metadata?: Record<string, any>;
  error?: string;
  errorCode?: string;
}

export abstract class SpatialOperator {
  abstract readonly operatorId: string;
  abstract readonly operatorType: OperatorType;
  abstract readonly inputSchema: z.ZodSchema;
  abstract readonly outputSchema: z.ZodSchema;
  
  readonly version: string = '2.0.0';
  
  /**
   * Get operator metadata
   */
  getMetadata(): OperatorMetadata {
    return {
      id: this.operatorId,
      type: this.operatorType,
      name: this.getName(),
      description: this.getDescription(),
      version: this.version,
      capabilities: this.getCapabilities(),
      author: 'GeoAI-UP Team',
      tags: this.getTags()
    };
  }
  
  /**
   * Execute the operator with validated parameters
   */
  async execute(
    params: z.infer<typeof this.inputSchema>,
    context: OperatorContext
  ): Promise<OperatorResult> {
    try {
      // Step 1: Validate input (Zod auto-validates)
      const validatedParams = this.inputSchema.parse(params);
      
      // Step 2: Pre-execution hooks
      await this.onBeforeExecute(validatedParams, context);
      
      // Step 3: Execute core logic
      const result = await this.executeCore(validatedParams, context);
      
      // Step 4: Post-execution hooks
      await this.onAfterExecute(result, context);
      
      // Step 5: Validate output
      const validatedResult = this.outputSchema.parse(result);
      
      return validatedResult;
      
    } catch (error) {
      console.error(`[Operator ${this.operatorId}] Execution failed:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: this.mapErrorCode(error)
      };
    }
  }
  
  /**
   * Core execution logic (must be implemented by subclasses)
   */
  protected abstract executeCore(
    params: z.infer<typeof this.inputSchema>,
    context: OperatorContext
  ): Promise<OperatorResult>;
  
  /**
   * Pre-execution hook (optional override)
   */
  protected async onBeforeExecute(
    params: z.infer<typeof this.inputSchema>,
    context: OperatorContext
  ): Promise<void> {
    // Default: no-op
  }
  
  /**
   * Post-execution hook (optional override)
   */
  protected async onAfterExecute(
    result: OperatorResult,
    context: OperatorContext
  ): Promise<void> {
    // Default: no-op
  }
  
  /**
   * Stream execution for large datasets (optional override)
   */
  async *executeStream?(
    params: z.infer<typeof this.inputSchema>,
    context: OperatorContext
  ): AsyncGenerator<PartialResult> {
    // Default: fall back to regular execute
    const result = await this.execute(params, context);
    yield {
      type: 'complete',
      data: result
    };
  }
  
  // Abstract methods for metadata
  protected abstract getName(): string;
  protected abstract getDescription(): string;
  protected abstract getCapabilities(): string[];
  protected abstract getTags(): string[];
  
  // Error code mapping
  protected mapErrorCode(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('not found')) return 'DATA_NOT_FOUND';
      if (error.message.includes('permission')) return 'PERMISSION_DENIED';
      if (error.message.includes('timeout')) return 'TIMEOUT';
    }
    return 'EXECUTION_ERROR';
  }
}
```

### 2. 具体Operator实现示例

#### BufferOperator

```typescript
// server/src/spatial-operators/operators/BufferOperator.ts
import { z } from 'zod';
import { SpatialOperator, OperatorContext, OperatorResult } from '../SpatialOperator';

export class BufferOperator extends SpatialOperator {
  readonly operatorId = 'buffer_analysis';
  readonly operatorType = 'buffer' as const;
  
  inputSchema = z.object({
    dataSourceId: z.string().describe('Source data source ID'),
    distance: z.number().positive().describe('Buffer distance'),
    unit: z.enum(['meters', 'kilometers', 'degrees', 'feet', 'miles'])
      .default('meters')
      .describe('Distance unit'),
    dissolve: z.boolean()
      .optional()
      .default(false)
      .describe('Dissolve overlapping buffers'),
    segments: z.number().int().min(4).max(128)
      .optional()
      .default(32)
      .describe('Number of segments for circular arcs')
  });
  
  outputSchema = z.object({
    success: z.boolean(),
    resultId: z.string().optional(),
    type: z.literal('native_data'),
    reference: z.string().optional(),
    metadata: z.object({
      featureCount: z.number(),
      geometryType: z.string(),
      srid: z.number()
    }).optional(),
    error: z.string().optional()
  });
  
  protected async executeCore(
    params: z.infer<typeof this.inputSchema>,
    context: OperatorContext
  ): Promise<OperatorResult> {
    console.log(`[BufferOperator] Executing with params:`, params);
    
    // Step 1: Get data source
    const dataSource = await context.dataSourceService.getDataSource(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    // Step 2: Build buffer operator for DataAccessFacade
    const bufferOp = {
      operatorType: 'buffer' as const,
      params: {
        distance: params.distance,
        unit: params.unit,
        dissolve: params.dissolve,
        segments: params.segments
      }
    };
    
    // Step 3: Execute via DataAccessFacade (backend-agnostic)
    const nativeData = await context.dataAccessFacade.execute(bufferOp, dataSource);
    
    // Step 4: Persist result
    const resultId = await context.resultPersistenceService.persist(nativeData, {
      conversationId: context.conversationId,
      stepId: context.stepId,
      operation: 'buffer_analysis',
      parameters: params
    });
    
    // Step 5: Return result
    return {
      success: true,
      resultId,
      type: 'native_data',
      reference: nativeData.reference,
      metadata: {
        featureCount: nativeData.metadata?.featureCount || 0,
        geometryType: nativeData.metadata?.geometryType || 'Unknown',
        srid: nativeData.metadata?.srid || 4326
      }
    };
  }
  
  protected getName(): string {
    return 'Buffer Analysis';
  }
  
  protected getDescription(): string {
    return 'Create buffer zones around features at specified distance';
  }
  
  protected getCapabilities(): string[] {
    return ['computational', 'spatial_analysis'];
  }
  
  protected getTags(): string[] {
    return ['buffer', 'proximity', 'zone'];
  }
}
```

#### KernelDensityOperator

```typescript
// server/src/spatial-operators/operators/KernelDensityOperator.ts
import { z } from 'zod';
import { SpatialOperator, OperatorContext, OperatorResult } from '../SpatialOperator';

export class KernelDensityOperator extends SpatialOperator {
  readonly operatorId = 'kernel_density';
  readonly operatorType = 'kernel_density' as const;
  
  inputSchema = z.object({
    pointDataSourceId: z.string().describe('Point data source ID'),
    searchRadius: z.number().positive().describe('Search radius in meters'),
    cellSize: z.number().positive().optional().default(100).describe('Output raster cell size'),
    kernelFunction: z.enum(['quartic', 'gaussian', 'uniform', 'triangular'])
      .optional()
      .default('quartic')
      .describe('Kernel function type'),
    outputFormat: z.enum(['geotiff', 'png'])
      .optional()
      .default('geotiff')
      .describe('Output raster format')
  });
  
  outputSchema = z.object({
    success: z.boolean(),
    resultId: z.string().optional(),
    type: z.literal('native_data'),
    reference: z.string().optional(),
    metadata: z.object({
      rasterWidth: z.number(),
      rasterHeight: z.number(),
      cellSize: z.number(),
      minDensity: z.number(),
      maxDensity: z.number(),
      meanDensity: z.number()
    }).optional(),
    error: z.string().optional()
  });
  
  protected async executeCore(
    params: z.infer<typeof this.inputSchema>,
    context: OperatorContext
  ): Promise<OperatorResult> {
    console.log(`[KernelDensityOperator] Executing with params:`, params);
    
    // Step 1: Get point data source
    const dataSource = await context.dataSourceService.getDataSource(params.pointDataSourceId);
    
    if (!dataSource) {
      throw new Error(`Point data source not found: ${params.pointDataSourceId}`);
    }
    
    // Step 2: Validate geometry type (must be Point)
    if (dataSource.metadata?.geometryType !== 'Point') {
      throw new Error(`Kernel density requires point data, got: ${dataSource.metadata?.geometryType}`);
    }
    
    // Step 3: Build density operator
    const densityOp = {
      operatorType: 'kernel_density' as const,
      params: {
        searchRadius: params.searchRadius,
        cellSize: params.cellSize,
        kernelFunction: params.kernelFunction,
        outputFormat: params.outputFormat
      }
    };
    
    // Step 4: Execute via DataAccessFacade
    const nativeData = await context.dataAccessFacade.execute(densityOp, dataSource);
    
    // Step 5: Persist result
    const resultId = await context.resultPersistenceService.persist(nativeData, {
      conversationId: context.conversationId,
      stepId: context.stepId,
      operation: 'kernel_density',
      parameters: params
    });
    
    // Step 6: Extract raster statistics
    const stats = await this.extractRasterStats(nativeData.reference);
    
    return {
      success: true,
      resultId,
      type: 'native_data',
      reference: nativeData.reference,
      metadata: {
        rasterWidth: stats.width,
        rasterHeight: stats.height,
        cellSize: params.cellSize,
        minDensity: stats.min,
        maxDensity: stats.max,
        meanDensity: stats.mean
      }
    };
  }
  
  private async extractRasterStats(rasterPath: string): Promise<{
    width: number;
    height: number;
    min: number;
    max: number;
    mean: number;
  }> {
    // Use GDAL to extract statistics
    // Implementation depends on GDAL bindings
    return {
      width: 1000,
      height: 1000,
      min: 0,
      max: 100,
      mean: 25
    };
  }
  
  protected getName(): string {
    return 'Kernel Density Estimation';
  }
  
  protected getDescription(): string {
    return 'Calculate density surface from point features using kernel estimation';
  }
  
  protected getCapabilities(): string[] {
    return ['statistical', 'raster_analysis'];
  }
  
  protected getTags(): string[] {
    return ['density', 'heatmap', 'interpolation'];
  }
}
```

#### WeightedOverlayOperator

```typescript
// server/src/spatial-operators/operators/WeightedOverlayOperator.ts
import { z } from 'zod';
import { SpatialOperator, OperatorContext, OperatorResult } from '../SpatialOperator';

export class WeightedOverlayOperator extends SpatialOperator {
  readonly operatorId = 'weighted_overlay';
  readonly operatorType = 'weighted_overlay' as const;
  
  inputSchema = z.object({
    inputRasters: z.array(z.object({
      rasterDataSourceId: z.string(),
      weight: z.number().min(0).max(1),
      normalizationMethod: z.enum(['min_max', 'standard_score', 'percentile'])
        .optional()
        .default('min_max')
    })).min(2).describe('Input rasters with weights'),
    outputScale: z.enum(['1_10', '1_100', '0_1'])
      .optional()
      .default('1_10')
      .describe('Output suitability scale'),
    overlapRule: z.enum(['sum', 'mean', 'max', 'min'])
      .optional()
      .default('sum')
      .describe('How to combine overlapping cells')
  });
  
  outputSchema = z.object({
    success: z.boolean(),
    resultId: z.string().optional(),
    type: z.literal('native_data'),
    reference: z.string().optional(),
    metadata: z.object({
      numInputRasters: z.number(),
      outputScale: z.string(),
      minScore: z.number(),
      maxScore: z.number(),
      meanScore: z.number()
    }).optional(),
    error: z.string().optional()
  });
  
  protected async executeCore(
    params: z.infer<typeof this.inputSchema>,
    context: OperatorContext
  ): Promise<OperatorResult> {
    console.log(`[WeightedOverlayOperator] Executing with ${params.inputRasters.length} rasters`);
    
    // Step 1: Validate weights sum to ~1.0
    const totalWeight = params.inputRasters.reduce((sum, r) => sum + r.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new Error(`Weights must sum to 1.0, got: ${totalWeight}`);
    }
    
    // Step 2: Load all input rasters
    const rasters = await Promise.all(
      params.inputRasters.map(async (input) => {
        const dataSource = await context.dataSourceService.getDataSource(input.rasterDataSourceId);
        if (!dataSource) {
          throw new Error(`Raster not found: ${input.rasterDataSourceId}`);
        }
        return {
          dataSource,
          weight: input.weight,
          normalizationMethod: input.normalizationMethod
        };
      })
    );
    
    // Step 3: Normalize rasters to common scale
    const normalizedRasters = await Promise.all(
      rasters.map(async (raster) => {
        return await this.normalizeRaster(raster, params.outputScale);
      })
    );
    
    // Step 4: Build weighted overlay operator
    const overlayOp = {
      operatorType: 'weighted_overlay' as const,
      params: {
        inputRasters: normalizedRasters.map((r, i) => ({
          reference: r.reference,
          weight: params.inputRasters[i].weight
        })),
        outputScale: params.outputScale,
        overlapRule: params.overlapRule
      }
    };
    
    // Step 5: Execute via DataAccessFacade
    const firstRaster = rasters[0].dataSource;
    const nativeData = await context.dataAccessFacade.execute(overlayOp, firstRaster);
    
    // Step 6: Persist result
    const resultId = await context.resultPersistenceService.persist(nativeData, {
      conversationId: context.conversationId,
      stepId: context.stepId,
      operation: 'weighted_overlay',
      parameters: params
    });
    
    return {
      success: true,
      resultId,
      type: 'native_data',
      reference: nativeData.reference,
      metadata: {
        numInputRasters: params.inputRasters.length,
        outputScale: params.outputScale,
        minScore: 1,
        maxScore: 10,
        meanScore: 5.5
      }
    };
  }
  
  private async normalizeRaster(
    raster: any,
    outputScale: string
  ): Promise<{ reference: string; min: number; max: number }> {
    // Implement normalization logic
    return {
      reference: raster.dataSource.reference,
      min: 0,
      max: 1
    };
  }
  
  protected getName(): string {
    return 'Weighted Overlay Analysis';
  }
  
  protected getDescription(): string {
    return 'Combine multiple raster layers with weights for suitability analysis';
  }
  
  protected getCapabilities(): string[] {
    return ['computational', 'multi_criteria_evaluation'];
  }
  
  protected getTags(): string[] {
    return ['overlay', 'suitability', 'weighted', 'mcda'];
  }
}
```

---

## 🔧 注册表实现

```typescript
// server/src/spatial-operators/SpatialOperatorRegistry.ts
import { SpatialOperator } from './SpatialOperator';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export class SpatialOperatorRegistry {
  private static instance: SpatialOperatorRegistry;
  private operators: Map<string, SpatialOperator> = new Map();
  
  private constructor() {}
  
  static getInstance(): SpatialOperatorRegistry {
    if (!SpatialOperatorRegistry.instance) {
      SpatialOperatorRegistry.instance = new SpatialOperatorRegistry();
    }
    return SpatialOperatorRegistry.instance;
  }
  
  /**
   * Register an operator
   */
  register(operator: SpatialOperator): void {
    if (this.operators.has(operator.operatorId)) {
      console.warn(`[Operator Registry] Operator ${operator.operatorId} already registered. Overwriting.`);
    }
    
    this.operators.set(operator.operatorId, operator);
    console.log(`[Operator Registry] Registered: ${operator.operatorId} (${operator.operatorType})`);
  }
  
  /**
   * Unregister an operator
   */
  unregister(operatorId: string): void {
    if (this.operators.delete(operatorId)) {
      console.log(`[Operator Registry] Unregistered: ${operatorId}`);
    } else {
      console.warn(`[Operator Registry] Operator not found: ${operatorId}`);
    }
  }
  
  /**
   * Get operator by ID
   */
  get(operatorId: string): SpatialOperator | undefined {
    return this.operators.get(operatorId);
  }
  
  /**
   * List all registered operators
   */
  listAll(): SpatialOperator[] {
    return Array.from(this.operators.values());
  }
  
  /**
   * List operator IDs
   */
  listIds(): string[] {
    return Array.from(this.operators.keys());
  }
  
  /**
   * Filter operators by type
   */
  filterByType(type: string): SpatialOperator[] {
    return this.listAll().filter(op => op.operatorType === type);
  }
  
  /**
   * Filter operators by capability
   */
  filterByCapability(capability: string): SpatialOperator[] {
    return this.listAll().filter(op => 
      op.getMetadata().capabilities.includes(capability)
    );
  }
  
  /**
   * Convert operator to LangChain Tool (lazy initialization)
   */
  toLangChainTool(operatorId: string): StructuredTool | null {
    const operator = this.get(operatorId);
    if (!operator) {
      console.warn(`[Operator Registry] Cannot create tool: operator ${operatorId} not found`);
      return null;
    }
    
    return new OperatorAsTool(operator);
  }
  
  /**
   * Convert all operators to LangChain Tools
   */
  toLangChainTools(): StructuredTool[] {
    return this.listAll().map(op => new OperatorAsTool(op));
  }
  
  /**
   * Get operator count
   */
  getCount(): number {
    return this.operators.size;
  }
  
  /**
   * Clear all operators
   */
  clear(): void {
    this.operators.clear();
    console.log('[Operator Registry] Cleared all operators');
  }
}

/**
 * LangChain Tool adapter for SpatialOperator
 */
class OperatorAsTool extends StructuredTool {
  name: string;
  description: string;
  schema: z.ZodSchema;
  
  constructor(private operator: SpatialOperator) {
    super();
    
    this.name = operator.operatorId;
    this.description = operator.getDescription();
    this.schema = operator.inputSchema;
  }
  
  async _call(input: Record<string, any>): Promise<string> {
    console.log(`[Tool Adapter] Executing operator: ${this.operator.operatorId}`);
    
    // Build operator context
    const context = {
      dataSourceService: DataSourceServiceInstance,
      dataAccessFacade: DataAccessFacadeInstance,
      resultPersistenceService: ResultPersistenceServiceInstance,
      workspaceBase: process.env.WORKSPACE_BASE!,
      conversationId: input.conversationId || 'temp',
      stepId: input.stepId || 'temp_step'
    };
    
    // Remove internal fields from input
    const { conversationId, stepId, ...operatorParams } = input;
    
    // Execute operator
    const result = await this.operator.execute(operatorParams, context);
    
    // Return JSON string (LangChain expects string)
    return JSON.stringify(result);
  }
}
```

---

## 📦 注册函数

```typescript
// server/src/spatial-operators/registerOperators.ts
import { SpatialOperatorRegistry } from './SpatialOperatorRegistry';
import { BufferOperator } from './operators/BufferOperator';
import { OverlayOperator } from './operators/OverlayOperator';
import { FilterOperator } from './operators/FilterOperator';
import { AggregateOperator } from './operators/AggregateOperator';
import { KernelDensityOperator } from './operators/KernelDensityOperator';
import { WeightedOverlayOperator } from './operators/WeightedOverlayOperator';
import { ReclassifyOperator } from './operators/ReclassifyOperator';
import { DistanceAnalysisOperator } from './operators/DistanceAnalysisOperator';
import { HeatmapOperator } from './operators/HeatmapOperator';
import { ChoroplethOperator } from './operators/ChoroplethOperator';

/**
 * Register all built-in spatial operators
 * Call this function during application initialization
 */
export function registerAllOperators(): void {
  console.log('[Operator Registration] Registering all built-in operators...');
  
  const registry = SpatialOperatorRegistry.getInstance();
  
  // Analysis Operators
  registry.register(new BufferOperator());
  registry.register(new OverlayOperator());
  registry.register(new FilterOperator());
  registry.register(new AggregateOperator());
  registry.register(new SpatialJoinOperator());
  
  // Raster Analysis Operators
  registry.register(new KernelDensityOperator());
  registry.register(new ReclassifyOperator());
  registry.register(new WeightedOverlayOperator());
  registry.register(new DistanceAnalysisOperator());
  
  // Visualization Operators
  registry.register(new HeatmapOperator());
  registry.register(new ChoroplethOperator());
  registry.register(new UniformColorOperator());
  registry.register(new GraduatedColorOperator());
  
  console.log(`[Operator Registration] Successfully registered ${registry.getCount()} operators`);
  console.log('[Operator Registration] Operator IDs:', registry.listIds());
  
  // Log by type
  const byType = registry.listAll().reduce((acc, op) => {
    acc[op.operatorType] = (acc[op.operatorType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('[Operator Registration] Operators by type:', byType);
}
```

---

## 🔄 迁移指南: v1.0 → v2.0

### 1. Plugin定义迁移

**v1.0** (`server/src/plugin-orchestration/plugins/BufferAnalysisPlugin.ts`):
```typescript
export const BufferAnalysisPlugin: Plugin = {
  id: 'buffer_analysis',
  name: 'Buffer Analysis',
  description: 'Create buffer zones around features',
  category: 'analysis',
  version: '1.0.0',
  inputSchema: [
    { name: 'dataSourceId', type: 'string', required: true },
    { name: 'distance', type: 'number', required: true },
    { name: 'unit', type: 'string', required: false }
  ],
  outputSchema: { type: 'object', description: 'Buffer result' },
  capabilities: ['buffer', 'proximity'],
  isBuiltin: true
};
```

**v2.0** (`server/src/spatial-operators/operators/BufferOperator.ts`):
```typescript
export class BufferOperator extends SpatialOperator {
  readonly operatorId = 'buffer_analysis';
  readonly operatorType = 'buffer';
  
  inputSchema = z.object({
    dataSourceId: z.string(),
    distance: z.number().positive(),
    unit: z.enum(['meters', 'kilometers', 'degrees']).default('meters')
  });
  
  outputSchema = z.object({
    success: z.boolean(),
    resultId: z.string(),
    type: z.literal('native_data'),
    reference: z.string()
  });
  
  // ... implementation
}
```

**迁移要点**:
- ✅ Plugin元数据合并到Operator类中
- ✅ inputSchema从数组改为Zod Schema (类型更安全)
- ✅ outputSchema明确定义返回结构

### 2. Executor迁移

**v1.0** (`server/src/plugin-orchestration/executor/BufferAnalysisExecutor.ts`):
```typescript
export class BufferAnalysisExecutor implements IPluginExecutor {
  constructor(private db: Database, private workspaceBase: string) {}
  
  async execute(params: BufferAnalysisParams): Promise<any> {
    // Direct GDAL/PostGIS calls
    const ds = gdal.open(params.dataSourceId);
    // ... 100+ lines
  }
}
```

**v2.0** (集成到BufferOperator):
```typescript
export class BufferOperator extends SpatialOperator {
  protected async executeCore(params, context): Promise<OperatorResult> {
    // Use DataAccessFacade (backend-agnostic)
    const dataSource = await context.dataSourceService.getDataSource(params.dataSourceId);
    const bufferOp = { operatorType: 'buffer', params: { /* ... */ } };
    const nativeData = await context.dataAccessFacade.execute(bufferOp, dataSource);
    // ... much simpler
  }
}
```

**迁移要点**:
- ✅ Executor逻辑移入Operator的`executeCore`方法
- ✅ 不再直接调用GDAL/PostGIS,通过DataAccessFacade抽象
- ✅ 构造函数简化,依赖通过context注入

### 3. ToolWrapper废弃

**v1.0** (`server/src/plugin-orchestration/tools/PluginToolWrapper.ts`):
```typescript
export class PluginToolWrapper extends StructuredTool {
  constructor(private pluginId: string) {
    super();
    this.name = pluginId;
    // ... fetch metadata from Plugin definition
  }
  
  async _call(input: Record<string, any>): Promise<string> {
    const executor = ExecutorRegistryInstance.getExecutor(this.pluginId);
    const result = await executor.execute(input);
    return JSON.stringify(result);
  }
}
```

**v2.0** (自动适配器):
```typescript
// No need for separate wrapper!
// OperatorAsTool is automatically created by SpatialOperatorRegistry.toLangChainTool()
```

**迁移要点**:
- ✅ 完全废弃PluginToolWrapper
- ✅ Operator自带Tool适配功能

### 4. 注册流程简化

**v1.0** (三重注册):
```typescript
// 1. Register Plugin
PluginCapabilityRegistry.register(pluginId, plugin, capability);

// 2. Register Executor
ExecutorRegistryInstance.register(pluginId, factory);

// 3. Register Tool
const tool = new PluginToolWrapper(pluginId);
ToolRegistryInstance.registerTool(tool);
```

**v2.0** (单次注册):
```typescript
// Just register the operator once
const registry = SpatialOperatorRegistry.getInstance();
registry.register(new BufferOperator());

// Tool is created lazily when needed
const tool = registry.toLangChainTool('buffer_analysis');
```

---

## 📊 性能对比

| 指标 | v1.0 (Plugin/Executor/Tool) | v2.0 (SpatialOperator) | 改进 |
|------|----------------------------|------------------------|------|
| **代码行数** | ~500 (3 files) | ~200 (1 file) | -60% |
| **注册步骤** | 3步 | 1步 | -67% |
| **调用链深度** | 4层 | 2层 | -50% |
| **内存占用** | 3 objects/operator | 1 object/operator | -67% |
| **调试难度** | 高 (跨3文件) | 低 (单文件) | ⭐⭐⭐ |
| **扩展成本** | 需改3处 | 添加1个类 | ⭐⭐⭐ |

---

## 🎯 最佳实践

### 1. Operator命名规范

```typescript
// ✅ Good: Clear and descriptive
export class BufferOperator extends SpatialOperator {
  readonly operatorId = 'buffer_analysis';
}

// ❌ Bad: Too generic or ambiguous
export class AnalysisOperator extends SpatialOperator {
  readonly operatorId = 'analysis';
}
```

### 2. Schema定义规范

```typescript
// ✅ Good: Detailed validation and descriptions
inputSchema = z.object({
  distance: z.number()
    .positive()
    .min(1)
    .max(100000)
    .describe('Buffer distance in specified unit')
});

// ❌ Bad: No validation or descriptions
inputSchema = z.object({
  distance: z.number()
});
```

### 3. 错误处理规范

```typescript
// ✅ Good: Specific error messages
protected async executeCore(params, context): Promise<OperatorResult> {
  const dataSource = await context.dataSourceService.getDataSource(params.dataSourceId);
  if (!dataSource) {
    throw new Error(`Data source not found: ${params.dataSourceId}`);
  }
  
  if (dataSource.metadata?.geometryType !== 'Point') {
    throw new Error(`Expected Point geometry, got: ${dataSource.metadata?.geometryType}`);
  }
  
  // ...
}

// ❌ Bad: Generic errors
protected async executeCore(params, context): Promise<OperatorResult> {
  try {
    // ...
  } catch (error) {
    return { success: false, error: 'Failed' };
  }
}
```

### 4. 日志记录规范

```typescript
// ✅ Good: Structured logging with context
protected async executeCore(params, context): Promise<OperatorResult> {
  console.log(`[BufferOperator] Starting execution`);
  console.log(`[BufferOperator] Parameters:`, params);
  console.log(`[BufferOperator] Data source:`, params.dataSourceId);
  
  // ... execution
  
  console.log(`[BufferOperator] Execution complete. Result ID:`, resultId);
  
  return result;
}

// ❌ Bad: No logging or excessive logging
protected async executeCore(params, context): Promise<OperatorResult> {
  console.log('Executing...'); // Too vague
  console.log('Step 1...'); // Too verbose
  console.log('Step 2...');
  // ...
}
```

---

## 🔗 相关文档

- [02-REFACTORING-PLAN-v2.0.md](./02-REFACTORING-PLAN-v2.0.md) - 总体重构规划
- [04-GIS-TASK-SPLITTING-STRATEGY.md](./04-GIS-TASK-SPLITTING-STRATEGY.md) - 任务拆分策略
- [05-DATA-ACCESS-FACADE.md](./05-DATA-ACCESS-FACADE.md) - 数据访问门面设计

---

**文档版本**: 1.0  
**最后更新**: 2026-05-09  
**作者**: GeoAI-UP Architecture Team
