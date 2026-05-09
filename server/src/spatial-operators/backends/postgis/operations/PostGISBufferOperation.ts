/**
 * PostGISBufferOperation - SQL-based buffer operation
 */

import type { Pool } from 'pg';
import type { BufferOptions } from '../../../../../../data-access';

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
    
    const resultTable = `buffer_${tableName}_${Date.now()}`;
    
    try {
      if (dissolve) {
        // Dissolve overlapping buffers
        await this.pool.query(`
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT 
            ST_Union(ST_Buffer(geom::geography, ${distanceSQL})::geometry) as geom,
            COUNT(*) as feature_count
          FROM ${this.schema}.${tableName}
        `);
      } else {
        // Individual buffers
        await this.pool.query(`
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT 
            ST_Buffer(geom::geography, ${distanceSQL})::geometry as geom,
            *
          FROM ${this.schema}.${tableName}
        `);
      }
      
      // Add spatial index
      await this.pool.query(`
        CREATE INDEX idx_${resultTable}_geom ON ${this.schema}.${resultTable} USING GIST (geom)
      `);
      
      console.log(`[PostGISBufferOperation] Buffer created: ${resultTable}`);
      return resultTable;
    } catch (error) {
      console.error('[PostGISBufferOperation] Failed:', error);
      throw error;
    }
  }
}
