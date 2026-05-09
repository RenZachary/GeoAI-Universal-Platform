/**
 * PostGISSpatialJoinOperation - SQL-based spatial join
 */

import type { Pool } from 'pg';

export class PostGISSpatialJoinOperation {
  private pool: Pool;
  private schema: string;
  
  constructor(pool: Pool, schema: string = 'public') {
    this.pool = pool;
    this.schema = schema;
  }
  
  async execute(
    targetTable: string,
    joinTable: string,
    operation: string,
    joinType: string = 'inner'
  ): Promise<string> {
    const resultTable = `spatialjoin_${targetTable}_${Date.now()}`;
    
    let spatialCondition: string;
    
    switch (operation.toLowerCase()) {
      case 'intersects':
        spatialCondition = 'ST_Intersects(t.geom, j.geom)';
        break;
      case 'within':
        spatialCondition = 'ST_Within(t.geom, j.geom)';
        break;
      case 'contains':
        spatialCondition = 'ST_Contains(t.geom, j.geom)';
        break;
      case 'touches':
        spatialCondition = 'ST_Touches(t.geom, j.geom)';
        break;
      case 'crosses':
        spatialCondition = 'ST_Crosses(t.geom, j.geom)';
        break;
      case 'overlaps':
        spatialCondition = 'ST_Overlaps(t.geom, j.geom)';
        break;
      default:
        throw new Error(`Unsupported spatial join operation: ${operation}`);
    }
    
    let sql: string;
    
    if (joinType === 'left') {
      // LEFT JOIN - keep all target features
      sql = `
        CREATE TABLE ${this.schema}.${resultTable} AS
        SELECT 
          t.*,
          j.*
        FROM ${this.schema}.${targetTable} t
        LEFT JOIN ${this.schema}.${joinTable} j ON ${spatialCondition}
      `;
    } else if (joinType === 'right') {
      // RIGHT JOIN - keep all join features
      sql = `
        CREATE TABLE ${this.schema}.${resultTable} AS
        SELECT 
          t.*,
          j.*
        FROM ${this.schema}.${targetTable} t
        RIGHT JOIN ${this.schema}.${joinTable} j ON ${spatialCondition}
      `;
    } else {
      // INNER JOIN (default) - only matching features
      sql = `
        CREATE TABLE ${this.schema}.${resultTable} AS
        SELECT 
          t.*,
          j.*
        FROM ${this.schema}.${targetTable} t
        INNER JOIN ${this.schema}.${joinTable} j ON ${spatialCondition}
      `;
    }
    
    try {
      await this.pool.query(sql);
      
      // Add spatial index
      await this.pool.query(`
        CREATE INDEX idx_${resultTable}_geom ON ${this.schema}.${resultTable} USING GIST (geom)
      `);
      
      console.log(`[PostGISSpatialJoinOperation] ${operation} join created: ${resultTable}`);
      return resultTable;
    } catch (error) {
      console.error('[PostGISSpatialJoinOperation] Failed:', error);
      throw error;
    }
  }
}
