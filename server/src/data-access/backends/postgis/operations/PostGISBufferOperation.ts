/**
 * PostGISBufferOperation - SQL-based buffer operation
 */

import type { Pool } from 'pg';
import type { BufferOptions } from '../../../interfaces';
import { TEMP_SCHEMA } from '../constants';
import { parseTableReference, getColumnList } from '../utils/SqlUtils';

export class PostGISBufferOperation {
  private pool: Pool;
  private schema: string;
  
  constructor(pool: Pool, schema: string = 'public') {
    this.pool = pool;
    this.schema = schema;
  }
  
  async execute(
    tableName: string,
    distance: number,
    options?: BufferOptions
  ): Promise<string> {
    const unit = options?.unit || 'meters';
    const dissolve = options?.dissolve || false;
    
    // Parse table reference to extract schema and table
    const { schema: sourceSchema, tableName: sourceTable } = parseTableReference(tableName, this.schema);
    
    // Convert distance to appropriate units for PostGIS
    let distanceSQL: string;
    if (unit === 'meters' || unit === 'kilometers') {
      // Use geography type for meter-based calculations
      distanceSQL = `${unit === 'meters' ? distance : distance * 1000}`;
    } else if (unit === 'feet') {
      distanceSQL = `${distance * 0.3048}`; // Convert to meters
    } else if (unit === 'miles') {
      distanceSQL = `${distance * 1609.34}`; // Convert to meters
    } else {
      // degrees
      distanceSQL = `${distance}`;
    }
    
    // Result table always goes to geoai_temp schema
    const resultTable = `buffer_${sourceTable}_${Date.now()}`;
    
    try {
      if (dissolve) {
        // Dissolve overlapping buffers
        await this.pool.query(`
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT 
            ST_Union(ST_Buffer(geom::geography, ${distanceSQL})::geometry) as geom,
            COUNT(*) as feature_count
          FROM ${sourceSchema}.${sourceTable}
        `);
      } else {
        // Individual buffers - get column list excluding geom
        const columnList = await getColumnList(this.pool, sourceSchema, sourceTable);
        
        await this.pool.query(`
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT 
            ST_Buffer(geom::geography, ${distanceSQL})::geometry as geom,
            ${columnList}
          FROM ${sourceSchema}.${sourceTable}
        `);
      }
      
      // Add spatial index
      await this.pool.query(`
        CREATE INDEX idx_${resultTable}_geom ON ${TEMP_SCHEMA}.${resultTable} USING GIST (geom)
      `);
      
      console.log(`[PostGISBufferOperation] Buffer created: ${resultTable}`);
      return resultTable;
    } catch (error) {
      console.error('[PostGISBufferOperation] Failed:', error);
      throw error;
    }
  }
}
