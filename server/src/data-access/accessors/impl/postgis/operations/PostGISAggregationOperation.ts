/**
 * PostGIS Aggregation Operation
 */

import type { Pool } from 'pg';
import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';

const TEMP_SCHEMA = 'geoai_temp';

export class PostGISAggregationOperation {
  constructor(private pool: Pool, private schema: string) {}

  async execute(reference: string, aggFunc: string, field: string, returnFeature: boolean = false): Promise<NativeData> {
    const tableName = reference.split('.').pop() || reference;

    try {
      if (returnFeature && (aggFunc === 'MAX' || aggFunc === 'MIN')) {
        return await this.executeWithFeature(tableName, aggFunc, field);
      } else {
        return await this.executeScalarOnly(tableName, aggFunc, field);
      }
    } catch (error) {
      console.error('[PostGISAggregationOperation] Failed:', error);
      throw error;
    }
  }

  private async executeWithFeature(tableName: string, aggFunc: string, field: string): Promise<NativeData> {
    const resultTable = `geoai_temp_agg_${Date.now()}`;
    const order = aggFunc === 'MAX' ? 'DESC' : 'ASC';

    await this.pool.query(`
      CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
      SELECT *
      FROM ${this.schema}.${tableName}
      ORDER BY ${field} ${order}
      LIMIT 1
    `);

    // Get the aggregated value
    const valueResult = await this.pool.query(
      `SELECT ${aggFunc}(${field}) as result FROM ${this.schema}.${tableName}`
    );

    return {
      id: generateId(),
      type: 'postgis',
      reference: `${TEMP_SCHEMA}.${resultTable}`,
      metadata: {
        crs: 'EPSG:4326',
        srid: 4326,
        featureCount: 1,
        database: this.pool.options.database,
        schema: TEMP_SCHEMA,
        operation: 'aggregate',
        aggregatedField: field,
        aggregatedFunction: aggFunc,
        aggregatedValue: valueResult.rows[0].result,
        // StandardizedOutput fields
        result: valueResult.rows[0].result,
        description: `Aggregation ${aggFunc} on field ${field}`
      },
      createdAt: new Date()
    };
  }

  private async executeScalarOnly(tableName: string, aggFunc: string, field: string): Promise<NativeData> {
    const query = `SELECT ${aggFunc}(${field}) as result FROM ${this.schema}.${tableName}`;
    const result = await this.pool.query(query);

    return {
      id: generateId(),
      type: 'geojson' as any,
      reference: '',
      metadata: {
        operation: 'aggregate',
        aggregatedField: field,
        aggregatedFunction: aggFunc,
        aggregatedValue: result.rows[0].result,
        // StandardizedOutput fields
        result: result.rows[0].result,
        description: `Aggregation ${aggFunc} on field ${field}`
      },
      createdAt: new Date()
    };
  }
}
