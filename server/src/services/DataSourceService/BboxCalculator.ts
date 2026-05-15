import type { DataAccessFacade } from '../../data-access';
import type { DataSourceRepository } from '../../data-access/repositories';
import { DEFAULT_BBOX, BBOX_CALCULATION_TIMEOUT } from './constant';

export class BboxCalculator {
  constructor(
    private dataAccess: DataAccessFacade,
    private dataSourceRepo: DataSourceRepository
  ) {}

  async calculateAndPersistBboxAsync(
    schema: string,
    tableName: string,
    geometryColumn: string,
    dataSourceId: string
  ): Promise<void> {
    console.log(`[BboxCalculator] Calculating bbox for ${schema}.${tableName}...`);
    
    const bbox = await this.calculateSpatialExtentWithTimeout(
      schema,
      tableName,
      geometryColumn,
      BBOX_CALCULATION_TIMEOUT
    );
    
    this.dataSourceRepo.updateMetadata(dataSourceId, { bbox });
  }

  private async calculateSpatialExtentWithTimeout(
    schema: string,
    tableName: string,
    geometryColumn: string,
    timeoutMs: number
  ): Promise<[number, number, number, number]> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Bbox calculation timeout (${timeoutMs}ms)`)),
        timeoutMs
      );
    });
    
    const calculationPromise = this.calculateSpatialExtent(schema, tableName, geometryColumn);
    
    try {
      return await Promise.race([calculationPromise, timeoutPromise]);
    } catch (error) {
      console.warn(`[BboxCalculator] Calculation failed for ${schema}.${tableName}:`, error instanceof Error ? error.message : 'Unknown error');
      return DEFAULT_BBOX;
    }
  }

  private async calculateSpatialExtent(
    schema: string,
    tableName: string,
    geometryColumn: string
  ): Promise<[number, number, number, number]> {
    const postGISBackend = this.dataAccess.getPostGISBackend();
    if (!postGISBackend) {
      throw new Error('PostGIS backend not configured');
    }
    
    try {
      console.log(`[BboxCalculator] Using ST_EstimatedExtent for ${schema}.${tableName}`);
      
      const estimatedQuery = `
        SELECT ST_EstimatedExtent($1, $2, $3) as extent
      `;
      const result = await (postGISBackend as any).executeRaw(estimatedQuery, [
        schema,
        tableName,
        geometryColumn
      ]);
      
      const extent = result.rows[0]?.extent;
      
      if (extent) {
        console.log(`[BboxCalculator] ST_EstimatedExtent successful for ${schema}.${tableName}`);
        return this.parseBoxExtent(extent);
      }
      
      console.error(`[BboxCalculator] ST_EstimatedExtent returned NULL for ${schema}.${tableName}`);
      return DEFAULT_BBOX;
    } catch (error) {
      console.error(`[BboxCalculator] ST_EstimatedExtent failed for ${schema}.${tableName}:`, error instanceof Error ? error.message : 'Unknown error');
      return DEFAULT_BBOX;
    }
  }

  private parseBoxExtent(extent: string): [number, number, number, number] {
    const match = extent.match(/BOX\(([\d.eE+-]+)\s+([\d.eE+-]+),([\d.eE+-]+)\s+([\d.eE+-]+)\)/);
    
    if (!match) {
      throw new Error(`Invalid extent format: ${extent}`);
    }
    
    return [
      parseFloat(match[1]),
      parseFloat(match[2]),
      parseFloat(match[3]),
      parseFloat(match[4])
    ];
  }
}
