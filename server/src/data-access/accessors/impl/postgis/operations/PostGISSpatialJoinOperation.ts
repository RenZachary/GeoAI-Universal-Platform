/**
 * PostGIS Spatial Join Operation
 */

import type { Pool } from 'pg';
import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';

const TEMP_SCHEMA = 'geoai_temp';

export class PostGISSpatialJoinOperation {
  constructor(private pool: Pool, private schema: string) {}

  async execute(
    targetReference: string,
    joinReference: string,
    operation: string,
    joinType: string = 'inner'
  ): Promise<NativeData> {
    const targetTable = targetReference.split('.').pop() || targetReference;
    const joinTable = joinReference.split('.').pop() || joinReference;
    const resultTable = `geoai_temp_join_${Date.now()}`;

    try {
      const spatialFunc = this.mapOperationToPostGIS(operation);
      const joinClause = this.getJoinClause(joinType);

      await this.pool.query(`
        CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
        SELECT t.*, ST_AsGeoJSON(t.geom) as geometry
        FROM ${this.schema}.${targetTable} t
        ${joinClause} ${this.schema}.${joinTable} j
        ON ST_${spatialFunc}(t.geom, j.geom)
      `);

      const featureCount = await this.getFeatureCount(resultTable);

      return {
        id: generateId(),
        type: 'postgis',
        reference: `${TEMP_SCHEMA}.${resultTable}`,
        metadata: {
          crs: 'EPSG:4326',
          srid: 4326,
          featureCount,
          database: this.pool.options.database,
          schema: TEMP_SCHEMA,
          operation: 'spatial_join',
          spatialRelationship: operation,
          joinType,
          targetTable,
          joinTable,
          // StandardizedOutput fields
          result: { table: resultTable, operation: 'spatial_join' },
          description: `Spatial join (${operation}) between ${targetTable} and ${joinTable}`
        },
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[PostGISSpatialJoinOperation] Failed:', error);
      throw error;
    }
  }

  private mapOperationToPostGIS(operation: string): string {
    const mapping: Record<string, string> = {
      'intersects': 'Intersects',
      'contains': 'Contains',
      'within': 'Within',
      'touches': 'Touches',
      'crosses': 'Crosses',
      'overlaps': 'Overlaps'
    };
    return mapping[operation] || 'Intersects';
  }

  private getJoinClause(joinType: string): string {
    switch (joinType) {
      case 'left': return 'LEFT JOIN';
      case 'right': return 'RIGHT JOIN';
      default: return 'INNER JOIN';
    }
  }

  private async getFeatureCount(tableName: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM ${TEMP_SCHEMA}.${tableName}`
    );
    return parseInt(result.rows[0].count);
  }
}
