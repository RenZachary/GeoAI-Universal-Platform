/**
 * PostGISSpatialJoinOperation - SQL-based spatial join
 */

import type { Pool } from 'pg';
import { TEMP_SCHEMA } from '../constants';
import { parseTableReference, getColumnList } from '../utils/SqlUtils';

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
    // Parse table references
    const { schema: targetSchema, tableName: targetName } = parseTableReference(targetTable, this.schema);
    const { schema: joinSchema, tableName: joinName } = parseTableReference(joinTable, this.schema);
    
    const resultTable = `spatialjoin_${targetName}_${Date.now()}`;
    
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
      const jColumns = await getColumnList(this.pool, joinSchema, joinName, ['geom'], 'j');
      
      sql = `
        CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
        SELECT 
          t.*,
          ${jColumns}
        FROM ${targetSchema}.${targetName} t
        LEFT JOIN ${joinSchema}.${joinName} j ON ${spatialCondition}
      `;
    } else if (joinType === 'right') {
      // RIGHT JOIN - keep all join features
      const tColumns = await getColumnList(this.pool, targetSchema, targetName, ['geom'], 't');
      
      sql = `
        CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
        SELECT 
          ${tColumns},
          j.*
        FROM ${targetSchema}.${targetName} t
        RIGHT JOIN ${joinSchema}.${joinName} j ON ${spatialCondition}
      `;
    } else {
      // INNER JOIN (default) - only matching features
      const jColumns = await getColumnList(this.pool, joinSchema, joinName, ['geom'], 'j');
      
      sql = `
        CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
        SELECT 
          t.*,
          ${jColumns}
        FROM ${targetSchema}.${targetName} t
        INNER JOIN ${joinSchema}.${joinName} j ON ${spatialCondition}
      `;
    }
    
    try {
      await this.pool.query(sql);
      
      // Add spatial index
      await this.pool.query(`
        CREATE INDEX idx_${resultTable}_geom ON ${TEMP_SCHEMA}.${resultTable} USING GIST (geom)
      `);
      
      console.log(`[PostGISSpatialJoinOperation] ${operation} join created: ${resultTable}`);
      return resultTable;
    } catch (error) {
      console.error('[PostGISSpatialJoinOperation] Failed:', error);
      throw error;
    }
  }
}
