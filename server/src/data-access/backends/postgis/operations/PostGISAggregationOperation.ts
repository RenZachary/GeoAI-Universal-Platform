/**
 * PostGISAggregationOperation - SQL-based statistical aggregation
 */

import type { Pool } from 'pg';
import { TEMP_SCHEMA } from '../constants';

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
    // Parse table reference
    let sourceSchema: string;
    let sourceTable: string;
    
    if (tableName.includes('.')) {
      const parts = tableName.split('.');
      sourceSchema = parts[0];
      sourceTable = parts[1];
    } else {
      sourceSchema = this.schema;
      sourceTable = tableName;
    }
    
    const resultTable = `agg_${sourceTable}_${Date.now()}`;
    
    let sql: string;
    let resultValue: any;
    
    switch (aggFunc.toUpperCase()) {
      case 'MAX':
        if (returnFeature) {
          // Return the feature with maximum value
          sql = `
            CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
            SELECT *
            FROM ${sourceSchema}.${sourceTable}
            WHERE ${field} = (SELECT MAX(${field}) FROM ${sourceSchema}.${sourceTable})
            LIMIT 1
          `;
          const maxResult = await this.pool.query(
            `SELECT MAX(${field}) as max_val FROM ${sourceSchema}.${sourceTable}`
          );
          resultValue = maxResult.rows[0].max_val;
        } else {
          // Just return the max value
          sql = `
            CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
            SELECT MAX(${field}) as result_value
            FROM ${sourceSchema}.${sourceTable}
          `;
          const maxResult = await this.pool.query(
            `SELECT MAX(${field}) as max_val FROM ${sourceSchema}.${sourceTable}`
          );
          resultValue = maxResult.rows[0].max_val;
        }
        break;
        
      case 'MIN':
        if (returnFeature) {
          sql = `
            CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
            SELECT *
            FROM ${sourceSchema}.${sourceTable}
            WHERE ${field} = (SELECT MIN(${field}) FROM ${sourceSchema}.${sourceTable})
            LIMIT 1
          `;
          const minResult = await this.pool.query(
            `SELECT MIN(${field}) as min_val FROM ${sourceSchema}.${sourceTable}`
          );
          resultValue = minResult.rows[0].min_val;
        } else {
          sql = `
            CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
            SELECT MIN(${field}) as result_value
            FROM ${sourceSchema}.${sourceTable}
          `;
          const minResult = await this.pool.query(
            `SELECT MIN(${field}) as min_val FROM ${sourceSchema}.${sourceTable}`
          );
          resultValue = minResult.rows[0].min_val;
        }
        break;
        
      case 'AVG':
      case 'MEAN': {
        sql = `
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT AVG(${field}) as result_value
          FROM ${sourceSchema}.${sourceTable}
        `;
        const avgResult = await this.pool.query(
          `SELECT AVG(${field}) as avg_val FROM ${sourceSchema}.${sourceTable}`
        );
        resultValue = avgResult.rows[0].avg_val;
        break;
      }
        
      case 'SUM': {
        sql = `
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT SUM(${field}) as result_value
          FROM ${sourceSchema}.${sourceTable}
        `;
        const sumResult = await this.pool.query(
          `SELECT SUM(${field}) as sum_val FROM ${sourceSchema}.${sourceTable}`
        );
        resultValue = sumResult.rows[0].sum_val;
        break;
      }
        
      case 'COUNT': {
        sql = `
          CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
          SELECT COUNT(*) as result_value
          FROM ${sourceSchema}.${sourceTable}
        `;
        const countResult = await this.pool.query(
          `SELECT COUNT(*) as count_val FROM ${sourceSchema}.${sourceTable}`
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
