/**
 * PostGIS Buffer Operation
 */

import type { Pool } from 'pg';
import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';
import type { BufferOptions } from '../../../../interfaces';
import { convertDistanceUnit } from '../../../../utils/PostGISUtils';

export class PostGISBufferOperation {
  constructor(private pool: Pool, private schema: string) {}

  async execute(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
    const tableName = reference.split('.').pop() || reference;
    const resultTable = `buffer_${tableName}_${Date.now()}`;
    
    try {
      // Convert distance to degrees if needed using shared utility
      const bufferDistance = convertDistanceUnit(distance, options?.unit);

      // Create result table with buffered geometry
      if (options?.dissolve) {
        await this.pool.query(`
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT ST_Union(ST_Buffer(geom, ${bufferDistance})) as geom
          FROM ${this.schema}.${tableName}
        `);
      } else {
        // Get all columns except geometry column
        const columnsResult = await this.pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = $1 AND table_name = $2 AND column_name != 'geom'
          ORDER BY ordinal_position
        `, [this.schema, tableName]);
        
        const nonGeomColumns = columnsResult.rows.map(row => row.column_name).join(', ');
        
        await this.pool.query(`
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT ${nonGeomColumns}, ST_Buffer(geom, ${bufferDistance}) as geom
          FROM ${this.schema}.${tableName}
        `);
      }

      // Note: CTAS automatically preserves geometry column type and SRID,
      // so we don't need to call AddGeometryColumn

      const featureCount = await this.getFeatureCount(resultTable);

      return {
        id: generateId(),
        type: 'postgis',
        reference: `${this.schema}.${resultTable}`,
        metadata: {
          crs: 'EPSG:4326',
          srid: 4326,
          geometryType: 'Polygon',
          featureCount,
          database: this.pool.options.database,
          schema: this.schema,
          operation: 'buffer',
          distance,
          unit: options?.unit || 'degrees',
          // StandardizedOutput fields
          result: { table: resultTable, operation: 'buffer' },
          description: `Buffer operation completed with distance ${distance}`
        },
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[PostGISBufferOperation] Failed:', error);
      throw error;
    }
  }

  private async getFeatureCount(tableName: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM ${this.schema}.${tableName}`
    );
    return parseInt(result.rows[0].count);
  }
}
