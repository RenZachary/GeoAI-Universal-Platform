/**
 * PostGISFilterOperation - SQL-based attribute and spatial filtering
 */

import type { Pool } from 'pg';
import type { FilterCondition } from '../../../interfaces';
import { TEMP_SCHEMA } from '../constants';
import { parseTableReference } from '../utils/SqlUtils';

export class PostGISFilterOperation {
  private pool: Pool;
  private schema: string;
  
  constructor(pool: Pool, schema: string = 'public') {
    this.pool = pool;
    this.schema = schema;
  }
  
  async execute(
    tableName: string,
    filterCondition: FilterCondition
  ): Promise<string> {
    // Parse table reference to extract schema and table
    const { schema: sourceSchema, tableName: sourceTable } = parseTableReference(tableName, this.schema);
    
    const resultTable = `filter_${sourceTable}_${Date.now()}`;
    
    const whereClause = this.buildWhereClause(filterCondition, sourceSchema);
    
    const sql = `
      CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
      SELECT *
      FROM ${sourceSchema}.${sourceTable}
      WHERE ${whereClause}
    `;
    
    try {
      await this.pool.query(sql);
      
      // Add spatial index
      await this.pool.query(`
        CREATE INDEX idx_${resultTable}_geom ON ${TEMP_SCHEMA}.${resultTable} USING GIST (geom)
      `);
      
      console.log(`[PostGISFilterOperation] Filter created: ${resultTable}`);
      return resultTable;
    } catch (error) {
      console.error('[PostGISFilterOperation] Failed:', error);
      throw error;
    }
  }
  
  private buildWhereClause(condition: FilterCondition, sourceSchema: string): string {
    if ('field' in condition) {
      // Attribute filter
      const field = condition.field;
      const value = condition.value;
      
      switch (condition.operator) {
        case 'equals':
          return `${field} = '${value}'`;
        case 'not_equals':
          return `${field} != '${value}'`;
        case 'greater_than':
          return `${field} > ${value}`;
        case 'less_than':
          return `${field} < ${value}`;
        case 'contains':
          return `${field} LIKE '%${value}%'`;
        case 'in':
          return `${field} IN (${value.map((v: any) => `'${v}'`).join(', ')})`;
        case 'between':
          return `${field} BETWEEN ${value[0]} AND ${value[1]}`;
        case 'is_null':
          return `${field} IS NULL`;
        case 'is_not_null':
          return `${field} IS NOT NULL`;
        default:
          throw new Error(`Unsupported operator: ${condition.operator}`);
      }
    } else if (condition.type === 'spatial') {
      // Spatial filter
      if (condition.referenceDataSourceId) {
        // Reference to another table - parse it
        let refSchema: string;
        let refTable: string;
        const refTableName = condition.referenceDataSourceId;
        
        if (refTableName.includes('.')) {
          const parts = refTableName.split('.');
          refSchema = parts[0];
          refTable = parts[1];
        } else {
          refSchema = sourceSchema;
          refTable = refTableName;
        }
        
        switch (condition.operation) {
          case 'intersects':
            return `ST_Intersects(geom, (SELECT ST_Union(geom) FROM ${refSchema}.${refTable}))`;
          case 'within':
            return `ST_Within(geom, (SELECT ST_Union(geom) FROM ${refSchema}.${refTable}))`;
          case 'contains':
            return `ST_Contains(geom, (SELECT ST_Union(geom) FROM ${refSchema}.${refTable}))`;
          case 'touches':
            return `ST_Touches(geom, (SELECT ST_Union(geom) FROM ${refSchema}.${refTable}))`;
          case 'distance_less_than':
            return `ST_Distance(geom::geography, (SELECT ST_Union(geom)::geography FROM ${refSchema}.${refTable})) < ${condition.distance || 0}`;
          default:
            throw new Error(`Unsupported spatial operation: ${condition.operation}`);
        }
      } else if (condition.geometry) {
        // Geometry literal
        const geomJSON = JSON.stringify(condition.geometry);
        
        switch (condition.operation) {
          case 'intersects':
            return `ST_Intersects(geom, ST_GeomFromGeoJSON('${geomJSON.replace(/'/g, "''")}'))`;
          case 'within':
            return `ST_Within(geom, ST_GeomFromGeoJSON('${geomJSON.replace(/'/g, "''")}'))`;
          case 'contains':
            return `ST_Contains(geom, ST_GeomFromGeoJSON('${geomJSON.replace(/'/g, "''")}'))`;
          default:
            throw new Error(`Unsupported spatial operation: ${condition.operation}`);
        }
      }
    }
    
    return 'TRUE'; // Default: no filter
  }
}
