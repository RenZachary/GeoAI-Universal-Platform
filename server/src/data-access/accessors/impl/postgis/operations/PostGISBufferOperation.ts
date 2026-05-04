/**
 * PostGIS Buffer Operation
 */

import type { Pool } from 'pg';
import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';
import type { BufferOptions } from '../../../../interfaces';

export class PostGISBufferOperation {
  constructor(private pool: Pool, private schema: string) {}

  async execute(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
    const tableName = reference.split('.').pop() || reference;
    const resultTable = `buffer_${tableName}_${Date.now()}`;
    
    try {
      // Convert distance to degrees if needed
      const bufferDistance = this.convertDistance(distance, options?.unit);

      // Create result table with buffered geometry
      if (options?.dissolve) {
        await this.pool.query(`
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT ST_Union(ST_Buffer(geom, ${bufferDistance})) as geom
          FROM ${this.schema}.${tableName}
        `);
      } else {
        await this.pool.query(`
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT id, ST_Buffer(geom, ${bufferDistance}) as geom, properties
          FROM ${this.schema}.${tableName}
        `);
      }

      // Register geometry column
      await this.pool.query(
        `SELECT AddGeometryColumn($1, $2, 'geom', 4326, 'GEOMETRY', 2)`,
        [this.schema, resultTable]
      );

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
          unit: options?.unit || 'degrees'
        },
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[PostGISBufferOperation] Failed:', error);
      throw error;
    }
  }

  private convertDistance(distance: number, unit?: string): number {
    switch (unit) {
      case 'meters': return distance / 111320;
      case 'kilometers': return (distance * 1000) / 111320;
      case 'feet': return distance / 364567;
      case 'miles': return distance / 69.172;
      default: return distance; // degrees
    }
  }

  private async getFeatureCount(tableName: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM ${this.schema}.${tableName}`
    );
    return parseInt(result.rows[0].count);
  }
}
