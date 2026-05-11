/**
 * DataSourceQueryOperator - Query and list available data sources
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, AnalyticalOutputSchema } from '../../SpatialOperator';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';

const DataSourceQueryInputSchema = z.object({
  operation: z.enum(['list', 'count', 'summary']).default('list').describe('Operation to perform'),
  filterType: z.string().optional().describe('Filter by data source type'),
  searchTerm: z.string().optional().describe('Search term'),
  includeDetails: z.boolean().default(true).describe('Include detailed metadata')
});

// Output schema uses AnalyticalOutputSchema - Query returns analytical results
const DataSourceQueryOutputSchema = AnalyticalOutputSchema.extend({
  data: z.object({
    operation: z.string().describe('Operation performed (list, count, summary)'),
    dataSources: z.array(z.any()).describe('List of data sources'),
    totalCount: z.number().describe('Total number of data sources'),
    filteredCount: z.number().describe('Number of data sources after filtering')
  })
});

export class DataSourceQueryOperator extends SpatialOperator {
  readonly operatorId = 'data_source_query';
  readonly name = 'Data Source Query';
  readonly description = 'Query and list available data sources with their metadata';
  readonly category = 'query' as const;
  readonly returnType = 'analytical' as const; // Returns query results, not spatial data
  
  readonly inputSchema = DataSourceQueryInputSchema;
  readonly outputSchema = DataSourceQueryOutputSchema;
  
  private db?: Database.Database;
  
  constructor(db?: Database.Database) {
    super();
    this.db = db;
  }
  
  protected async executeCore(
    params: z.infer<typeof DataSourceQueryInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof DataSourceQueryOutputSchema>> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    
    let dataSources: any[] = [];
    
    if (params.operation === 'list') {
      dataSources = dataSourceRepo.listAll();
      
      // Apply filters
      if (params.filterType) {
        dataSources = dataSources.filter(ds => ds.type === params.filterType);
      }
      
      if (params.searchTerm) {
        const term = params.searchTerm.toLowerCase();
        dataSources = dataSources.filter((ds: any) => 
          ds.name.toLowerCase().includes(term) || 
          ds.description?.toLowerCase().includes(term)
        );
      }
    } else if (params.operation === 'count') {
      const all = dataSourceRepo.listAll();
      dataSources = all;
    } else if (params.operation === 'summary') {
      const all = dataSourceRepo.listAll();
      dataSources = all.map((ds: any) => ({
        id: ds.id,
        name: ds.name,
        type: ds.type
      }));
    }
    
    console.log('[DataSourceQueryOperator] Query completed:', {
      operation: params.operation,
      totalCount: dataSourceRepo.listAll().length,
      filteredCount: dataSources.length
    });
    
    // Return analytical result structure
    return {
      success: true,
      data: {
        operation: params.operation,
        dataSources,
        totalCount: dataSourceRepo.listAll().length,
        filteredCount: dataSources.length
      },
      metadata: {
        operatorId: this.operatorId,
        executedAt: new Date().toISOString(),
        summary: `Queried ${dataSources.length} data sources (total: ${dataSourceRepo.listAll().length})`
      }
    };
  }
}
