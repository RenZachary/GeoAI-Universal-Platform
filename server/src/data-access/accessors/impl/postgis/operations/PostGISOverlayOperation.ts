/**
 * PostGIS Overlay Operation
 */

import type { Pool } from 'pg';
import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';
import type { OverlayOptions } from '../../../../interfaces';

const TEMP_SCHEMA = 'geoai_temp';

export class PostGISOverlayOperation {
  constructor(private pool: Pool, private schema: string) {}

  async execute(reference1: string, reference2: string, options: OverlayOptions): Promise<NativeData> {
    const table1 = reference1.split('.').pop() || reference1;
    const table2 = reference2.split('.').pop() || reference2;
    const resultTable = `geoai_temp_overlay_${Date.now()}`;

    try {
      const spatialFunc = this.mapOperationToPostGIS(options.operation);

      await this.pool.query(`
        CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
        SELECT 
          t1.id as id1,
          t2.id as id2,
          ST_${spatialFunc}(t1.geom, t2.geom) as geom,
          t1.properties as properties1,
          t2.properties as properties2
        FROM ${this.schema}.${table1} t1, ${this.schema}.${table2} t2
        WHERE ST_${spatialFunc}(t1.geom, t2.geom) IS NOT NULL
      `);

      const featureCount = await this.getFeatureCount(resultTable);

      return {
        id: generateId(),
        type: 'postgis',
        reference: `${TEMP_SCHEMA}.${resultTable}`,
        metadata: {
          crs: 'EPSG:4326',
          srid: 4326,
          geometryType: this.inferResultGeometryType(options.operation),
          featureCount,
          database: this.pool.options.database,
          schema: TEMP_SCHEMA,
          operation: options.operation,
          sourceTables: [table1, table2],
          // StandardizedOutput fields
          result: { table: resultTable, operation: options.operation },
          description: `${options.operation} overlay operation completed`
        },
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[PostGISOverlayOperation] Failed:', error);
      throw error;
    }
  }

  private mapOperationToPostGIS(operation: string): string {
    const mapping: Record<string, string> = {
      'intersect': 'Intersection',
      'union': 'Union',
      'difference': 'Difference',
      'symmetric_difference': 'SymDifference'
    };
    return mapping[operation] || 'Intersection';
  }

  private inferResultGeometryType(operation: string): string {
    return 'Mixed';
  }

  private async getFeatureCount(tableName: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM ${TEMP_SCHEMA}.${tableName}`
    );
    return parseInt(result.rows[0].count);
  }
}
