/**
 * PostGISOverlayOperation - SQL-based overlay operations
 */

import type { Pool } from 'pg';

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
    const resultTable = `overlay_${operation}_${Date.now()}`;
    
    let sql: string;
    
    switch (operation) {
      case 'intersect':
        sql = `
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT 
            ST_Intersection(a.geom, b.geom) as geom,
            a.*,
            b.*
          FROM ${this.schema}.${table1} a, ${this.schema}.${table2} b
          WHERE ST_Intersects(a.geom, b.geom)
        `;
        break;
        
      case 'union':
        sql = `
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT 
            ST_Union(geom) as geom
          FROM (
            SELECT geom FROM ${this.schema}.${table1}
            UNION ALL
            SELECT geom FROM ${this.schema}.${table2}
          ) combined
        `;
        break;
        
      case 'difference':
        sql = `
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT 
            ST_Difference(a.geom, b.geom) as geom,
            a.*
          FROM ${this.schema}.${table1} a
          LEFT JOIN ${this.schema}.${table2} b ON ST_Intersects(a.geom, b.geom)
          WHERE b.geom IS NULL OR NOT ST_IsEmpty(ST_Difference(a.geom, b.geom))
        `;
        break;
        
      case 'symmetric_difference':
        sql = `
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT * FROM (
            -- A minus B
            SELECT 
              ST_Difference(a.geom, b.geom) as geom,
              a.*
            FROM ${this.schema}.${table1} a
            LEFT JOIN ${this.schema}.${table2} b ON ST_Intersects(a.geom, b.geom)
            WHERE b.geom IS NULL OR NOT ST_IsEmpty(ST_Difference(a.geom, b.geom))
            
            UNION ALL
            
            -- B minus A
            SELECT 
              ST_Difference(b.geom, a.geom) as geom,
              b.*
            FROM ${this.schema}.${table2} b
            LEFT JOIN ${this.schema}.${table1} a ON ST_Intersects(b.geom, a.geom)
            WHERE a.geom IS NULL OR NOT ST_IsEmpty(ST_Difference(b.geom, a.geom))
          ) sym_diff
          WHERE NOT ST_IsEmpty(geom)
        `;
        break;
        
      default:
        throw new Error(`Unsupported overlay operation: ${operation}`);
    }
    
    try {
      await this.pool.query(sql);
      
      // Add spatial index
      await this.pool.query(`
        CREATE INDEX idx_${resultTable}_geom ON ${this.schema}.${resultTable} USING GIST (geom)
      `);
      
      console.log(`[PostGISOverlayOperation] ${operation} created: ${resultTable}`);
      return resultTable;
    } catch (error) {
      console.error(`[PostGISOverlayOperation] ${operation} failed:`, error);
      throw error;
    }
  }
}
