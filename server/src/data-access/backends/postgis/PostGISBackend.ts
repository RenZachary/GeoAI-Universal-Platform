/**
 * PostGISBackend - Handles PostGIS database operations using pg library
 */

import type { NativeData, PostGISConnectionConfig } from '../../../core';
import { generateId } from '../../../core';
import type { DataBackend } from '../DataBackend';
import type { Pool } from 'pg';
import { PostGISPoolManager } from '../../utils/PostGISPoolManager';
import type { FilterCondition, BufferOptions } from '../../interfaces';
import { PostGISBufferOperation } from './operations/PostGISBufferOperation';
import { PostGISOverlayOperation } from './operations/PostGISOverlayOperation';
import { PostGISFilterOperation } from './operations/PostGISFilterOperation';
import { PostGISAggregationOperation } from './operations/PostGISAggregationOperation';
import { PostGISSpatialJoinOperation } from './operations/PostGISSpatialJoinOperation';
import { PostGISStatisticalOperation } from './operations/PostGISStatisticalOperation';

export class PostGISBackend implements DataBackend {
  readonly backendType = 'postgis' as const;
  
  private config: PostGISConnectionConfig;
  private pool: Pool | null = null;
  private schema: string;
  private bufferOp: PostGISBufferOperation | null = null;
  private overlayOp: PostGISOverlayOperation | null = null;
  private filterOp: PostGISFilterOperation | null = null;
  private aggOp: PostGISAggregationOperation | null = null;
  private joinOp: PostGISSpatialJoinOperation | null = null;
  private statOp: PostGISStatisticalOperation | null = null;
  
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
      // Initialize operations
      this.bufferOp = new PostGISBufferOperation(this.pool!, this.schema);
      this.overlayOp = new PostGISOverlayOperation(this.pool!, this.schema);
      this.filterOp = new PostGISFilterOperation(this.pool!, this.schema);
      this.aggOp = new PostGISAggregationOperation(this.pool!, this.schema);
      this.joinOp = new PostGISSpatialJoinOperation(this.pool!, this.schema);
      this.statOp = new PostGISStatisticalOperation(this.pool!, this.schema);
    }
    return this.pool!;
  }
  
  async buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
    await this.getPool();
    const resultTable = await this.bufferOp!.execute(reference, distance, options);
    
    return {
      id: generateId(),
      type: 'postgis',
      reference: resultTable,
      metadata: { result: resultTable, description: `Buffer on ${reference}`, featureCount: 0 },
      createdAt: new Date()
    };
  }
  
  async overlay(
    reference1: string,
    reference2: string,
    operation: 'intersect' | 'union' | 'difference' | 'symmetric_difference'
  ): Promise<NativeData> {
    await this.getPool();
    const resultTable = await this.overlayOp!.execute(reference1, reference2, operation);
    
    return {
      id: generateId(),
      type: 'postgis',
      reference: resultTable,
      metadata: { result: resultTable, description: `Overlay ${operation}` },
      createdAt: new Date()
    };
  }
  async filter(reference: string, filterCondition: FilterCondition): Promise<NativeData> {
    await this.getPool();
    const resultTable = await this.filterOp!.execute(reference, filterCondition);
    
    return {
      id: generateId(),
      type: 'postgis',
      reference: resultTable,
      metadata: { result: resultTable, description: `Filter applied` },
      createdAt: new Date()
    };
  }
  async aggregate(
    reference: string,
    aggFunc: string,
    field: string,
    returnFeature?: boolean
  ): Promise<NativeData> {
    await this.getPool();
    const { resultTable, value } = await this.aggOp!.execute(reference, aggFunc, field, returnFeature);
    
    return {
      id: generateId(),
      type: 'postgis',
      reference: resultTable,
      metadata: { result: resultTable, description: `Aggregation ${aggFunc} on ${field}: ${value}` },
      createdAt: new Date()
    };
  }
  async spatialJoin(
    targetReference: string,
    joinReference: string,
    operation: string,
    joinType?: string
  ): Promise<NativeData> {
    await this.getPool();
    const resultTable = await this.joinOp!.execute(targetReference, joinReference, operation, joinType);
    
    return {
      id: generateId(),
      type: 'postgis',
      reference: resultTable,
      metadata: { result: resultTable, description: `Spatial join (${operation})` },
      createdAt: new Date()
    };
  }
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
