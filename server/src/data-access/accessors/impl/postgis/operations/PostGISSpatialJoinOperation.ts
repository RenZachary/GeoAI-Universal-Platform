/**
 * PostGIS Spatial Join Operation
 */

import type { Pool } from 'pg';
import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';

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
    const resultTable = `join_${targetTable}_${Date.now()}`;

    try {
      const spatialFunc = this.mapOperationToPostGIS(operation);
      const joinClause = this.getJoinClause(joinType);

      await this.pool.query(`
        CREATE TABLE ${this.schema}.${resultTable} AS
        SELECT t.*, ST_AsGeoJSON(t.geom) as geometry
        FROM ${this.schema}.${targetTable} t
        ${joinClause} ${this.schema}.${joinTable} j
        ON ST_${spatialFunc}(t.geom, j.geom)
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
          featureCount,
          database: this.pool.options.database,
          schema: this.schema,
          operation: 'spatial_join',
          spatialRelationship: operation,
          joinType,
          targetTable,
          joinTable
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
      `SELECT COUNT(*) as count FROM ${this.schema}.${tableName}`
    );
    return parseInt(result.rows[0].count);
  }
}
