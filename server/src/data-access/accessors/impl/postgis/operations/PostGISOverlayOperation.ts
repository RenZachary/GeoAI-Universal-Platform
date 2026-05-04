/**
 * PostGIS Overlay Operation
 */

import type { Pool } from 'pg';
import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';
import type { OverlayOptions } from '../../../../interfaces';

export class PostGISOverlayOperation {
  constructor(private pool: Pool, private schema: string) {}

  async execute(reference1: string, reference2: string, options: OverlayOptions): Promise<NativeData> {
    const table1 = reference1.split('.').pop() || reference1;
    const table2 = reference2.split('.').pop() || reference2;
    const resultTable = `overlay_${table1}_${table2}_${Date.now()}`;

    try {
      const spatialFunc = this.mapOperationToPostGIS(options.operation);

      await this.pool.query(`
        CREATE TABLE ${this.schema}.${resultTable} AS
        SELECT 
          t1.id as id1,
          t2.id as id2,
          ST_${spatialFunc}(t1.geom, t2.geom) as geom,
          t1.properties as properties1,
          t2.properties as properties2
        FROM ${this.schema}.${table1} t1, ${this.schema}.${table2} t2
        WHERE ST_${spatialFunc}(t1.geom, t2.geom) IS NOT NULL
      `);

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
          geometryType: this.inferResultGeometryType(options.operation),
          featureCount,
          database: this.pool.options.database,
          schema: this.schema,
          operation: options.operation,
          sourceTables: [table1, table2]
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
      `SELECT COUNT(*) as count FROM ${this.schema}.${tableName}`
    );
    return parseInt(result.rows[0].count);
  }
}
