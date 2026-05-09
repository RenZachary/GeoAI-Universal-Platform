/**
 * PostGISAggregationOperation - SQL-based statistical aggregation
 */

import type { Pool } from 'pg';

export class PostGISAggregationOperation {
  private pool: Pool;
  private schema: string;
  
  constructor(pool: Pool, schema: string = 'public') {
    this.pool = pool;
    this.schema = schema;
  }
  
  async execute(
    tableName: string,
    aggFunc: string,
    field: string,
    returnFeature?: boolean
  ): Promise<{ resultTable: string; value: any }> {
    const resultTable = `agg_${tableName}_${Date.now()}`;
    
    let sql: string;
    let resultValue: any;
    
    switch (aggFunc.toUpperCase()) {
      case 'MAX':
        if (returnFeature) {
          // Return the feature with maximum value
          sql = `
            CREATE TABLE ${this.schema}.${resultTable} AS
            SELECT *
            FROM ${this.schema}.${tableName}
            WHERE ${field} = (SELECT MAX(${field}) FROM ${this.schema}.${tableName})
            LIMIT 1
          `;
          const maxResult = await this.pool.query(
            `SELECT MAX(${field}) as max_val FROM ${this.schema}.${tableName}`
          );
          resultValue = maxResult.rows[0].max_val;
        } else {
          // Just return the max value
          sql = `
            CREATE TABLE ${this.schema}.${resultTable} AS
            SELECT MAX(${field}) as result_value
            FROM ${this.schema}.${tableName}
          `;
          const maxResult = await this.pool.query(
            `SELECT MAX(${field}) as max_val FROM ${this.schema}.${tableName}`
          );
          resultValue = maxResult.rows[0].max_val;
        }
        break;
        
      case 'MIN':
        if (returnFeature) {
          sql = `
            CREATE TABLE ${this.schema}.${resultTable} AS
            SELECT *
            FROM ${this.schema}.${tableName}
            WHERE ${field} = (SELECT MIN(${field}) FROM ${this.schema}.${tableName})
            LIMIT 1
          `;
          const minResult = await this.pool.query(
            `SELECT MIN(${field}) as min_val FROM ${this.schema}.${tableName}`
          );
          resultValue = minResult.rows[0].min_val;
        } else {
          sql = `
            CREATE TABLE ${this.schema}.${resultTable} AS
            SELECT MIN(${field}) as result_value
            FROM ${this.schema}.${tableName}
          `;
          const minResult = await this.pool.query(
            `SELECT MIN(${field}) as min_val FROM ${this.schema}.${tableName}`
          );
          resultValue = minResult.rows[0].min_val;
        }
        break;
        
      case 'AVG':
      case 'MEAN': {
        sql = `
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT AVG(${field}) as result_value
          FROM ${this.schema}.${tableName}
        `;
        const avgResult = await this.pool.query(
          `SELECT AVG(${field}) as avg_val FROM ${this.schema}.${tableName}`
        );
        resultValue = avgResult.rows[0].avg_val;
        break;
      }
        
      case 'SUM': {
        sql = `
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT SUM(${field}) as result_value
          FROM ${this.schema}.${tableName}
        `;
        const sumResult = await this.pool.query(
          `SELECT SUM(${field}) as sum_val FROM ${this.schema}.${tableName}`
        );
        resultValue = sumResult.rows[0].sum_val;
        break;
      }
        
      case 'COUNT': {
        sql = `
          CREATE TABLE ${this.schema}.${resultTable} AS
          SELECT COUNT(*) as result_value
          FROM ${this.schema}.${tableName}
        `;
        const countResult = await this.pool.query(
          `SELECT COUNT(*) as count_val FROM ${this.schema}.${tableName}`
        );
        resultValue = parseInt(countResult.rows[0].count_val);
        break;
      }
        
      default:
        throw new Error(`Unsupported aggregation function: ${aggFunc}`);
    }
    
    try {
      await this.pool.query(sql);
      
      console.log(`[PostGISAggregationOperation] ${aggFunc} on ${field}: ${resultValue}`);
      return { resultTable, value: resultValue };
    } catch (error) {
      console.error('[PostGISAggregationOperation] Failed:', error);
      throw error;
    }
  }
}
