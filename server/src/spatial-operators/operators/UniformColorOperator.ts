/**
 * UniformColorOperator - Renders all features with uniform color
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../SpatialOperator';
import { DataAccessorFactory } from '../../data-access';
import { DataSourceRepository } from '../../data-access/repositories';
import { ResultPersistenceService } from '../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const UniformColorInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source'),
  color: z.string().default('#3388ff').describe('Hex color code'),
  opacity: z.number().min(0).max(1).default(0.8),
  strokeWidth: z.number().min(0).max(10).default(2),
  layerName: z.string().optional()
});

const UniformColorOutputSchema = z.object({
  result: z.string().describe('MVT service URL or GeoJSON path'),
  styleUrl: z.string().describe('Style configuration URL')
});

export class UniformColorOperator extends SpatialOperator {
  readonly operatorId = 'uniform_color_renderer';
  readonly name = 'Uniform Color Renderer';
  readonly description = 'Render all features with a single uniform color';
  readonly category = 'visualization' as const;
  
  readonly inputSchema = UniformColorInputSchema;
  readonly outputSchema = UniformColorOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof UniformColorInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof UniformColorOutputSchema>> {
    if (!this.db || !this.workspaceBase) {
      throw new Error('Database and workspace not available');
    }
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const accessorFactory = new DataAccessorFactory(this.workspaceBase);
    const resultPersistence = new ResultPersistenceService(this.db);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    const accessor = accessorFactory.createAccessor(dataSource.type);
    
    const result = await accessor.uniformColor(dataSource.reference, {
      color: params.color,
      opacity: params.opacity,
      strokeWidth: params.strokeWidth
    });
    
    const persisted = await resultPersistence.persistResult(
      result,
      'uniform_color',
      dataSource,
      { color: params.color }
    );
    
    return {
      result: persisted.reference,
      styleUrl: persisted.metadata?.styleUrl || ''
    };
  }
}
