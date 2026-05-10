/**
 * PostGISOverlayOperation - SQL-based overlay operations
 */

import type { Pool } from 'pg';
import { TEMP_SCHEMA } from '../constants';
import { parseTableReference, getColumnList } from '../utils/SqlUtils';

type OverlayType = 'intersect' | 'union' | 'difference' | 'symmetric_difference';

export class PostGISOverlayOperation {
  private pool: Pool;
  private schema: string;
  
  constructor(pool: Pool, schema: string = 'public') {
    this.pool = pool;
    this.schema = schema;
  }
  
  async execute(
    table1: string,
    table2: string,
    operation: OverlayType
  ): Promise<string> {
    // Parse table references
    const { schema: schema1, tableName: name1 } = parseTableReference(table1, this.schema);
    const { schema: schema2, tableName: name2 } = parseTableReference(table2, this.schema);
    
    const resultTable = `overlay_${operation}_${Date.now()}`;
    
    let sql: string;
    
    switch (operation) {
      case 'intersect': {
        // Get column lists excluding geom for both tables
        const aColumns = await getColumnList(this.pool, schema1, name1, ['geom'], 'a');
        const bColumns = await getColumnList(this.pool, schema2, name2, ['geom'], 'b');
        
        sql = `
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT 
            ST_Intersection(a.geom, b.geom) as geom,
            ${aColumns},
            ${bColumns}
          FROM ${schema1}.${name1} a, ${schema2}.${name2} b
          WHERE ST_Intersects(a.geom, b.geom)
        `;
        break;
      }
        
      case 'union':
        sql = `
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT 
            ST_Union(geom) as geom
          FROM (
            SELECT geom FROM ${schema1}.${name1}
            UNION ALL
            SELECT geom FROM ${schema2}.${name2}
          ) combined
        `;
        break;
        
      case 'difference': {
        // Get column list excluding geom
        const aColumns = await getColumnList(this.pool, schema1, name1, ['geom'], 'a');
        
        sql = `
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT 
            ST_Difference(a.geom, b.geom) as geom,
            ${aColumns}
          FROM ${schema1}.${name1} a
          LEFT JOIN ${schema2}.${name2} b ON ST_Intersects(a.geom, b.geom)
          WHERE b.geom IS NULL OR NOT ST_IsEmpty(ST_Difference(a.geom, b.geom))
        `;
        break;
      }
        
      case 'symmetric_difference': {
        // Get column lists excluding geom for both tables
        const aColumns = await getColumnList(this.pool, schema1, name1, ['geom'], 'a');
        const bColumns = await getColumnList(this.pool, schema2, name2, ['geom'], 'b');
        
        sql = `
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT * FROM (
            -- A minus B
            SELECT 
              ST_Difference(a.geom, b.geom) as geom,
              ${aColumns}
            FROM ${schema1}.${name1} a
            LEFT JOIN ${schema2}.${name2} b ON ST_Intersects(a.geom, b.geom)
            WHERE b.geom IS NULL OR NOT ST_IsEmpty(ST_Difference(a.geom, b.geom))
            
            UNION ALL
            
            -- B minus A
            SELECT 
              ST_Difference(b.geom, a.geom) as geom,
              ${bColumns}
            FROM ${schema2}.${name2} b
            LEFT JOIN ${schema1}.${name1} a ON ST_Intersects(b.geom, a.geom)
            WHERE a.geom IS NULL OR NOT ST_IsEmpty(ST_Difference(b.geom, a.geom))
          ) sym_diff
          WHERE NOT ST_IsEmpty(geom)
        `;
        break;
      }
        
      default:
        throw new Error(`Unsupported overlay operation: ${operation}`);
    }
    
    try {
      await this.pool.query(sql);
      
      // Add spatial index
      await this.pool.query(`
        CREATE INDEX idx_${resultTable}_geom ON ${TEMP_SCHEMA}.${resultTable} USING GIST (geom)
      `);
      
      console.log(`[PostGISOverlayOperation] ${operation} created: ${resultTable}`);
      return resultTable;
    } catch (error) {
      console.error(`[PostGISOverlayOperation] ${operation} failed:`, error);
      throw error;
    }
  }
}
