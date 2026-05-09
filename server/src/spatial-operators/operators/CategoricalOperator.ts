/**
 * CategoricalOperator - Renders categorical data with distinct colors
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../SpatialOperator';
import { DataAccessorFactory } from '../../data-access';
import { DataSourceRepository } from '../../data-access/repositories';
import { ResultPersistenceService } from '../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const CategoricalInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source'),
  categoryField: z.string().describe('Categorical field name'),
  colorPalette: z.string().default('set1').describe('Color palette name'),
  opacity: z.number().min(0).max(1).default(0.8),
  layerName: z.string().optional()
});

const CategoricalOutputSchema = z.object({
  result: z.string().describe('MVT service URL or GeoJSON path'),
  styleUrl: z.string().describe('Style configuration URL'),
  categories: z.array(z.string()).describe('Category list')
});

export class CategoricalOperator extends SpatialOperator {
  readonly operatorId = 'categorical_renderer';
  readonly name = 'Categorical Renderer';
  readonly description = 'Render categorical data with distinct colors for each category';
  readonly category = 'visualization' as const;
  
  readonly inputSchema = CategoricalInputSchema;
  readonly outputSchema = CategoricalOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof CategoricalInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof CategoricalOutputSchema>> {
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
    
    const result = await accessor.categorical(dataSource.reference, {
      categoryField: params.categoryField,
      colorPalette: params.colorPalette,
      opacity: params.opacity
    });
    
    const persisted = await resultPersistence.persistResult(
      result,
      'categorical',
      dataSource,
      { categoryField: params.categoryField }
    );
    
    return {
      result: persisted.reference,
      styleUrl: persisted.metadata?.styleUrl || '',
      categories: persisted.metadata?.categories || []
    };
  }
}
