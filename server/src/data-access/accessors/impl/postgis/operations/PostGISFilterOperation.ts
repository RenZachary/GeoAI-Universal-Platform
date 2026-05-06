/**
 * PostGIS Filter Operation - Attribute and Spatial Filtering
 */

import type { Pool } from 'pg';
import type { NativeData } from '../../../../../core';
import { generateId } from '../../../../../core';
import type { FilterCondition, AttributeFilter, SpatialFilter } from '../../../../interfaces';

export class PostGISFilterOperation {
  constructor(private pool: Pool, private schema: string) { }

  async execute(reference: string, filter: FilterCondition): Promise<NativeData> {
    const tableName = reference.split('.').pop() || reference;
    const resultTable = `filtered_${tableName}_${Date.now()}`;

    try {
      const { whereClause, params } = this.buildWhereClause(filter, tableName);

      await this.pool.query(`
        CREATE TABLE ${this.schema}.${resultTable} AS
        SELECT *
        FROM ${this.schema}.${tableName}
        WHERE ${whereClause}
      `, params);

      // Register geometry column if source has it
      const hasGeom = await this.hasGeometryColumn(tableName);
      if (hasGeom) {
        await this.pool.query(
          `SELECT AddGeometryColumn($1, $2, 'geom', 4326, 'GEOMETRY', 2)`,
          [this.schema, resultTable]
        );
      }

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
          operation: 'filter',
          filterApplied: JSON.stringify(filter),
          // StandardizedOutput fields
          result: { table: resultTable, operation: 'filter' },
          description: `Filter operation applied`
        },
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[PostGISFilterOperation] Failed:', error);
      throw error;
    }
  }

  private buildWhereClause(filter: FilterCondition, mainTable: string): { whereClause: string; params: any[] } {
    const params: any[] = [];
    const paramIndex = 1;

    const buildCondition = (cond: FilterCondition): string => {
      if ('conditions' in cond && cond.conditions && cond.conditions.length > 0) {
        const subConditions = cond.conditions.map(buildCondition).join(` ${cond.connector || 'AND'} `);
        return `(${subConditions})`;
      }

      if ('type' in cond && cond.type === 'spatial') {
        return this.buildSpatialCondition(cond as SpatialFilter, mainTable, paramIndex, params);
      }

      return this.buildAttributeCondition(cond as AttributeFilter, paramIndex, params);
    };

    const whereClause = buildCondition(filter);
    return { whereClause, params };
  }

  private buildAttributeCondition(cond: AttributeFilter, paramIndex: number, params: any[]): string {
    switch (cond.operator) {
      case 'equals':
        params.push(cond.value);
        return `${cond.field} = $${paramIndex++}`;
      case 'contains':
        params.push(`%${cond.value}%`);
        return `${cond.field} ILIKE $${paramIndex++}`;
      case 'greater_than':
        params.push(cond.value);
        return `${cond.field} > $${paramIndex++}`;
      case 'less_than':
        params.push(cond.value);
        return `${cond.field} < $${paramIndex++}`;
      case 'in': {
        const placeholders = cond.value.map(() => `$${paramIndex++}`).join(', ');
        params.push(...cond.value);
        return `${cond.field} IN (${placeholders})`;
      }
      case 'between':
        params.push(cond.value[0], cond.value[1]);
        return `${cond.field} BETWEEN $${paramIndex - 2} AND $${paramIndex - 1}`;
      default:
        throw new Error(`Unsupported operator: ${cond.operator}`);
    }
  }

  private buildSpatialCondition(cond: SpatialFilter, mainTable: string, paramIndex: number, params: any[]): string {
    const joinTableAlias = 'j';

    switch (cond.operation) {
      case 'intersects':
        return `ST_Intersects(${mainTable}.geom, ${joinTableAlias}.geom)`;
      case 'touches':
        return `ST_Touches(${mainTable}.geom, ${joinTableAlias}.geom)`;
      case 'within':
        return `ST_Within(${mainTable}.geom, ${joinTableAlias}.geom)`;
      case 'distance_less_than':
        {
          const distanceInDegrees = this.convertDistance(cond.distance!, cond.unit);
          return `ST_Distance(${mainTable}.geom, ${joinTableAlias}.geom) < ${distanceInDegrees}`;
        }
      default:
        throw new Error(`Unsupported spatial operation: ${cond.operation}`);
    }
  }

  private convertDistance(distance: number, unit?: string): number {
    switch (unit) {
      case 'meters': return distance / 111320;
      case 'kilometers': return (distance * 1000) / 111320;
      default: return distance;
    }
  }

  private async hasGeometryColumn(tableName: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT EXISTS (SELECT FROM geometry_columns WHERE f_table_schema = $1 AND f_table_name = $2)`,
      [this.schema, tableName]
    );
    return result.rows[0].exists;
  }

  private async getFeatureCount(tableName: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM ${this.schema}.${tableName}`
    );
    return parseInt(result.rows[0].count);
  }
}
