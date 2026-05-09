/**
 * PostGISBackend - Handles PostGIS database operations using pg library
 */

import type { NativeData } from '../../../../core';
import { generateId } from '../../../../core';
import type { DataBackend } from '../DataBackend';
import type { Pool } from 'pg';
import { PostGISPoolManager } from '../../../../../data-access';
import type { PostGISConnectionConfig } from '../../../../core';

export class PostGISBackend implements DataBackend {
  readonly backendType = 'postgis' as const;
  
  private config: PostGISConnectionConfig;
  private pool: Pool | null = null;
  private schema: string;
  
  constructor(config: PostGISConnectionConfig) {
    this.config = config;
    this.schema = config.schema || 'public';
  }
  
  canHandle(dataSourceType: string, _reference: string): boolean {
    return dataSourceType === 'postgis';
  }
  
  private async getPool(): Promise<Pool> {
    if (!this.pool) {
      this.pool = await PostGISPoolManager.getInstance().getPool(this.config);
    }
    return this.pool!;
  }
  
  async buffer(reference: string, distance: number, options?: any): Promise<NativeData> {
    const pool = await this.getPool();
    const tableName = reference;
    const unit = options?.unit || 'meters';
    const distanceInDegrees = unit === 'meters' ? distance / 111320 : distance;
    const resultTable = `buffer_${tableName}_${Date.now()}`;
    
    await pool.query(`
      CREATE TABLE ${this.schema}.${resultTable} AS
      SELECT ST_Buffer(geom, ${distanceInDegrees}) as geom, *
      FROM ${this.schema}.${tableName}
    `);
    
    return {
      id: generateId(),
      type: 'postgis',
      reference: resultTable,
      metadata: { result: resultTable, description: `Buffer on ${tableName}`, featureCount: 0 },
      createdAt: new Date()
    };
  }
  
  async overlay(): Promise<NativeData> { throw new Error('PostGIS overlay not implemented'); }
  async filter(): Promise<NativeData> { throw new Error('PostGIS filter not implemented'); }
  async aggregate(): Promise<NativeData> { throw new Error('PostGIS aggregate not implemented'); }
  async spatialJoin(): Promise<NativeData> { throw new Error('PostGIS spatial join not implemented'); }
  async choropleth(): Promise<NativeData> { throw new Error('Choropleth is visualization concern'); }
  async heatmap(): Promise<NativeData> { throw new Error('Heatmap is visualization concern'); }
  async categorical(): Promise<NativeData> { throw new Error('Categorical is visualization concern'); }
  async uniformColor(): Promise<NativeData> { throw new Error('Uniform color is rendering concern'); }
  
  async read(reference: string): Promise<NativeData> {
    const pool = await this.getPool();
    const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${this.schema}.${reference}`);
    const featureCount = parseInt(countResult.rows[0].count);
    
    return {
      id: generateId(),
      type: 'postgis',
      reference,
      metadata: { result: null, description: `PostGIS table ${reference}`, featureCount },
      createdAt: new Date()
    };
  }
  
  async write(): Promise<string> { throw new Error('PostGIS write not implemented'); }
  
  async delete(reference: string): Promise<void> {
    const pool = await this.getPool();
    await pool.query(`DROP TABLE IF EXISTS ${this.schema}.${reference}`);
  }
  
  async getMetadata(reference: string): Promise<any> {
    const pool = await this.getPool();
    const columnsResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
    `, [this.schema, reference]);
    
    return {
      tableName: reference,
      schema: this.schema,
      columns: columnsResult.rows,
      featureCount: 0
    };
  }
  
  async validate(reference: string): Promise<boolean> {
    try {
      const pool = await this.getPool();
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = $1 AND table_name = $2
        )
      `, [this.schema, reference]);
      return result.rows[0].exists;
    } catch {
      return false;
    }
  }
}
