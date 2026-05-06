/**
 * Data Source Query Executor
 * Executes queries against the data source repository to list, count, and summarize data sources
 */

import type { NativeData } from '../../../core/index';
import type Database from 'better-sqlite3';
import { DataSourceRepository } from '../../../data-access/repositories';

export interface DataSourceQueryParams {
  operation: 'list' | 'count' | 'summary';
  filterType?: string; // geojson, shapefile, postgis, geotiff
  searchTerm?: string;
  includeDetails?: boolean;
}

export class DataSourceQueryExecutor {
  private db: Database.Database;
  private dataSourceRepo: DataSourceRepository;

  constructor(db: Database.Database) {
    this.db = db;
    this.dataSourceRepo = new DataSourceRepository(db);
  }

  /**
   * Execute data source query
   */
  async execute(params: DataSourceQueryParams): Promise<NativeData> {
    console.log('[DataSourceQueryExecutor] Executing query...', params);

    try {
      let result: any;

      switch (params.operation) {
        case 'count':
          result = await this.executeCount(params);
          break;
        case 'summary':
          result = await this.executeSummary(params);
          break;
        case 'list':
        default:
          result = await this.executeList(params);
          break;
      }

      console.log('[DataSourceQueryExecutor] Query completed successfully');

      return {
        id: `ds_query_${Date.now()}`,
        type: 'geojson', // Keep geojson for compatibility
        reference: '',
        metadata: {
          result: result,  // ← 返回结构化数据，让 LLM 生成自然语言
          operation: params.operation,
          timestamp: new Date().toISOString(),
          isMetadataOnly: true
        },
        createdAt: new Date()
      };

    } catch (error) {
      console.error('[DataSourceQueryExecutor] Query failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const wrappedError = new Error(`Data source query failed: ${errorMessage}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }

  /**
   * Execute count operation
   */
  private async executeCount(params: DataSourceQueryParams): Promise<any> {
    const allSources = this.dataSourceRepo.listAll();
    console.log('[DataSourceQueryExecutor] Total sources before filter:', allSources.length);
    
    // Apply filters
    const filtered = this.applyFilters(allSources, params);
    console.log('[DataSourceQueryExecutor] Sources after filter:', filtered.length);
    
    const result = {
      totalCount: filtered.length,
      breakdown: this.getTypeBreakdown(filtered)
    };
    
    console.log('[DataSourceQueryExecutor] Count result:', result);
    return result;
  }

  /**
   * Execute summary operation
   */
  private async executeSummary(params: DataSourceQueryParams): Promise<any> {
    const allSources = this.dataSourceRepo.listAll();
    const filtered = this.applyFilters(allSources, params);
    
    const summary = {
      totalCount: filtered.length,
      byType: this.getTypeBreakdown(filtered),
      totalFeatures: filtered.reduce((sum, ds) => {
        return sum + (ds.metadata?.featureCount || ds.metadata?.rowCount || 0);
      }, 0),
      types: Array.from(new Set(filtered.map(ds => ds.type)))
    };

    return summary;
  }

  /**
   * Execute list operation
   */
  private async executeList(params: DataSourceQueryParams): Promise<any> {
    const allSources = this.dataSourceRepo.listAll();
    const filtered = this.applyFilters(allSources, params);
    
    const includeDetails = params.includeDetails !== false;
    
    const dataSources = filtered.map(ds => {
      const basic = {
        id: ds.id,
        name: ds.name,
        type: ds.type,
        description: ds.metadata?.description || 'No description'
      };

      if (includeDetails) {
        return {
          ...basic,
          geometryType: ds.metadata?.geometryType,
          featureCount: ds.metadata?.featureCount || ds.metadata?.rowCount,
          fields: ds.metadata?.fields,
          reference: ds.reference
        };
      }

      return basic;
    });

    return {
      totalCount: dataSources.length,
      dataSources
    };
  }

  /**
   * Apply filters to data sources
   */
  private applyFilters(sources: any[], params: DataSourceQueryParams): any[] {
    let filtered = [...sources];

    // Filter by type (support category mapping)
    if (params.filterType) {
      const filterTypeLower = params.filterType.toLowerCase();
      
      // Map category names to actual types
      const typeMapping: Record<string, string[]> = {
        'vector': ['geojson', 'shapefile', 'postgis', 'kml', 'gpx'],
        'raster': ['tif', 'geotiff', 'img', 'png'],
        'database': ['postgis']
      };
      
      const targetTypes = typeMapping[filterTypeLower] || [filterTypeLower];
      
      filtered = filtered.filter(ds => 
        targetTypes.includes(ds.type.toLowerCase())
      );
    }

    // Filter by search term
    if (params.searchTerm) {
      const term = params.searchTerm.toLowerCase();
      filtered = filtered.filter(ds =>
        ds.name.toLowerCase().includes(term) ||
        (ds.metadata?.description && ds.metadata.description.toLowerCase().includes(term))
      );
    }

    return filtered;
  }

  /**
   * Get breakdown by type
   */
  private getTypeBreakdown(sources: any[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    for (const ds of sources) {
      breakdown[ds.type] = (breakdown[ds.type] || 0) + 1;
    }
    
    return breakdown;
  }
}
