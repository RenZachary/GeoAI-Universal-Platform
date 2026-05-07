/**
 * PostGIS Spatial Operations - Buffer, overlay, and spatial analysis
 */

import type { Pool } from 'pg';
import type { NativeData, DataMetadata } from '../../../../core';
import { generateId } from '../../../../core';
import type { BufferOptions, OverlayOptions } from '../../../interfaces';
import { convertDistanceUnit } from '../../../utils/PostGISUtils';

const TEMP_SCHEMA = 'geoai_temp';

export class PostGISSpatialOperations {
  constructor(private pool: Pool, private schema: string) {}

  /**
   * Perform buffer operation on data source
   */
  async buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
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
        await this.pool.query(`
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT id, ST_Buffer(geom, ${bufferDistance}) as geom, properties
          FROM ${this.schema}.${tableName}
        `);
      }

      return {
        id: generateId(),
        type: 'postgis',
        reference: `${TEMP_SCHEMA}.${resultTable}`,
        metadata: {
          crs: 'EPSG:4326',
          srid: 4326,
          geometryType: 'Polygon',
          featureCount: await this.getFeatureCount(resultTable),
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
      console.error('[PostGISSpatialOperations] Buffer operation failed:', error);
      throw error;
    }
  }

  /**
   * Perform overlay operation between two data sources
   */
  async overlay(
    reference1: string,
    reference2: string,
    options: OverlayOptions
  ): Promise<NativeData> {
    const table1 = reference1.split('.').pop() || reference1;
    const table2 = reference2.split('.').pop() || reference2;
    const resultTable = `geoai_temp_overlay_${Date.now()}`;

    try {
      // Map operation to PostGIS function
      const spatialFunc = this.mapOperationToPostGIS(options.operation);

      // Execute overlay operation
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

      return {
        id: generateId(),
        type: 'postgis',
        reference: `${TEMP_SCHEMA}.${resultTable}`,
        metadata: {
          crs: 'EPSG:4326',
          srid: 4326,
          geometryType: this.inferResultGeometryType(options.operation),
          featureCount: await this.getFeatureCount(resultTable),
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
      console.error('[PostGISSpatialOperations] Overlay operation failed:', error);
      throw error;
    }
  }

  /**
   * Filter data based on attribute conditions
   */
  async filter(reference: string, filter: any): Promise<NativeData> {
    const tableName = reference.split('.').pop() || reference;
    const resultTable = `geoai_temp_filtered_${Date.now()}`;

    try {
      // Build WHERE clause from filter condition
      const { whereClause, params } = this.buildWhereClause(filter);

      // Execute filtered query
      const query = `
        CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
        SELECT *
        FROM ${this.schema}.${tableName}
        WHERE ${whereClause}
      `;

      await this.pool.query(query, params);

      return {
        id: generateId(),
        type: 'postgis',
        reference: `${TEMP_SCHEMA}.${resultTable}`,
        metadata: {
          crs: 'EPSG:4326',
          srid: 4326,
          featureCount: await this.getFeatureCount(resultTable),
          database: this.pool.options.database,
          schema: TEMP_SCHEMA,
          operation: 'filter',
          filterApplied: this.serializeFilter(filter),
          // StandardizedOutput fields
          result: { table: resultTable, operation: 'filter' },
          description: `Filter operation applied`
        },
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[PostGISSpatialOperations] Filter operation failed:', error);
      throw error;
    }
  }

  /**
   * Execute aggregation query
   */
  async aggregate(reference: string, aggFunc: string, field: string, returnFeature: boolean = false): Promise<NativeData> {
    const tableName = reference.split('.').pop() || reference;

    try {
      if (returnFeature && (aggFunc === 'MAX' || aggFunc === 'MIN')) {
        // Return the feature with max/min value
        const order = aggFunc === 'MAX' ? 'DESC' : 'ASC';
        const resultTable = `geoai_temp_agg_${Date.now()}`;

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
      } else {
        // Just return aggregate value
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
    } catch (error) {
      console.error('[PostGISSpatialOperations] Aggregation failed:', error);
      throw error;
    }
  }

  /**
   * Perform spatial join between two datasets
   */
  async spatialJoin(
    targetReference: string,
    joinReference: string,
    operation: string,
    joinType: string = 'inner'
  ): Promise<NativeData> {
    const targetTable = targetReference.split('.').pop() || targetReference;
    const joinTable = joinReference.split('.').pop() || joinReference;
    const resultTable = `geoai_temp_join_${Date.now()}`;

    try {
      // Map operation to PostGIS function
      const spatialFunc = this.mapOperationToPostGIS(operation);

      // Build JOIN clause
      const joinClause = joinType === 'left' ? 'LEFT JOIN' : 
                        joinType === 'right' ? 'RIGHT JOIN' : 
                        'INNER JOIN';

      await this.pool.query(`
        CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
        SELECT t.*, ST_AsGeoJSON(t.geom) as geometry
        FROM ${this.schema}.${targetTable} t
        ${joinClause} ${this.schema}.${joinTable} j
        ON ST_${spatialFunc}(t.geom, j.geom)
      `);

      return {
        id: generateId(),
        type: 'postgis',
        reference: `${TEMP_SCHEMA}.${resultTable}`,
        metadata: {
          crs: 'EPSG:4326',
          srid: 4326,
          featureCount: await this.getFeatureCount(resultTable),
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
      console.error('[PostGISSpatialOperations] Spatial join failed:', error);
      throw error;
    }
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  private mapOperationToPostGIS(operation: string): string {
    const mapping: Record<string, string> = {
      'intersect': 'Intersection',
      'union': 'Union',
      'difference': 'Difference',
      'symmetric_difference': 'SymDifference',
      'intersects': 'Intersects',
      'contains': 'Contains',
      'within': 'Within',
      'touches': 'Touches',
      'crosses': 'Crosses',
      'overlaps': 'Overlaps'
    };
    return mapping[operation] || 'Intersects';
  }

  private inferResultGeometryType(operation: string): string {
    if (operation === 'intersect' || operation === 'intersection') {
      return 'Mixed';
    } else if (operation === 'union') {
      return 'Mixed';
    } else if (operation === 'difference') {
      return 'Mixed';
    }
    return 'Unknown';
  }

  private async getFeatureCount(tableName: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM ${this.schema}.${tableName}`
    );
    return parseInt(result.rows[0].count);
  }

  private async hasGeometryColumn(tableName: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT EXISTS (
        SELECT FROM geometry_columns 
        WHERE f_table_schema = $1 AND f_table_name = $2
      )`,
      [this.schema, tableName]
    );
    return result.rows[0].exists;
  }

  private buildWhereClause(filter: any): { whereClause: string; params: any[] } {
    const params: any[] = [];
    let paramIndex = 1;

    const buildCondition = (cond: any): string => {
      if (cond.conditions && cond.conditions.length > 0) {
        // Handle nested conditions
        const subConditions = cond.conditions.map(buildCondition).join(` ${cond.connector || 'AND'} `);
        return `(${subConditions})`;
      }

      switch (cond.operator) {
        case 'equals':
          params.push(cond.value);
          return `${cond.field} = $${paramIndex++}`;

        case 'not_equals':
          params.push(cond.value);
          return `${cond.field} != $${paramIndex++}`;

        case 'contains':
          params.push(`%${cond.value}%`);
          return `${cond.field} ILIKE $${paramIndex++}`;

        case 'starts_with':
          params.push(`${cond.value}%`);
          return `${cond.field} ILIKE $${paramIndex++}`;

        case 'ends_with':
          params.push(`%${cond.value}`);
          return `${cond.field} ILIKE $${paramIndex++}`;

        case 'greater_than':
          params.push(cond.value);
          return `${cond.field} > $${paramIndex++}`;

        case 'less_than':
          params.push(cond.value);
          return `${cond.field} < $${paramIndex++}`;

        case 'greater_equal':
          params.push(cond.value);
          return `${cond.field} >= $${paramIndex++}`;

        case 'less_equal':
          params.push(cond.value);
          return `${cond.field} <= $${paramIndex++}`;

        case 'in': {
          const placeholders = cond.value.map(() => `$${paramIndex++}`).join(', ');
          params.push(...cond.value);
          return `${cond.field} IN (${placeholders})`;
        }

        case 'between':
          params.push(cond.value[0], cond.value[1]);
          return `${cond.field} BETWEEN $${paramIndex - 2} AND $${paramIndex - 1}`;

        case 'is_null':
          return `${cond.field} IS NULL`;

        case 'is_not_null':
          return `${cond.field} IS NOT NULL`;

        default:
          throw new Error(`Unsupported operator: ${cond.operator}`);
      }
    };

    const whereClause = buildCondition(filter);
    return { whereClause, params };
  }

  private serializeFilter(filter: any): string {
    return JSON.stringify(filter);
  }
}
