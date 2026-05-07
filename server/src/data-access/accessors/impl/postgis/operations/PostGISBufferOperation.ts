/**
 * PostGIS Buffer Operation
 */

import type { Pool } from 'pg';
import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';
import type { BufferOptions } from '../../../../interfaces';
import { convertDistanceUnit } from '../../../../utils/PostGISUtils';

const TEMP_SCHEMA = 'geoai_temp';

export class PostGISBufferOperation {
  constructor(private pool: Pool, private schema: string) {}

  async execute(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
    const tableName = reference.split('.').pop() || reference;
    const resultTable = `geoai_temp_buffer_${Date.now()}`;
    
    try {
      // Convert distance to degrees if needed using shared utility
      const bufferDistance = convertDistanceUnit(distance, options?.unit);

      // Create result table with buffered geometry in temp schema
      if (options?.dissolve) {
        await this.pool.query(`
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
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
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT ${nonGeomColumns}, ST_Buffer(geom, ${bufferDistance}) as geom
          FROM ${this.schema}.${tableName}
        `);
      }

      const featureCount = await this.getFeatureCount(resultTable);

      return {
        id: generateId(),
        type: 'postgis',
        reference: `${TEMP_SCHEMA}.${resultTable}`,
        metadata: {
          crs: 'EPSG:4326',
          srid: 4326,
          geometryType: 'Polygon',
          featureCount,
          database: this.pool.options.database,
          schema: TEMP_SCHEMA,
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
      `SELECT COUNT(*) as count FROM ${TEMP_SCHEMA}.${tableName}`
    );
    return parseInt(result.rows[0].count);
  }
}
