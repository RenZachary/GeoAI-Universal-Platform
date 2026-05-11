/**
 * PostGISProximityOperation - SQL-based distance calculations using PostGIS
 * 
 * Leverages PostGIS spatial functions for efficient distance operations:
 * - ST_Distance() for pairwise distances
 * - <-> KNN operator for nearest neighbor search
 * - ST_DWithin() for distance filtering
 */

import type { Pool } from 'pg';
import { TEMP_SCHEMA } from '../constants';
import { parseTableReference } from '../utils/SqlUtils';
import type { DistanceResult, NearestNeighborResult } from '../../DataBackend';

export class PostGISProximityOperation {
  private pool: Pool;
  private schema: string;
  
  constructor(pool: Pool, schema: string = 'public') {
    this.pool = pool;
    this.schema = schema;
  }
  
  /**
   * Calculate pairwise distances between two tables
   * Uses ST_Distance with geography type for accurate meter-based calculations
   */
  async calculateDistance(
    table1: string,
    table2: string,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
      maxPairs?: number;
    }
  ): Promise<DistanceResult[]> {
    const unit = options?.unit || 'meters';
    const maxPairs = options?.maxPairs || 100000; // Higher limit for PostGIS
    
    const { schema: schema1, tableName: name1 } = parseTableReference(table1, this.schema);
    const { schema: schema2, tableName: name2 } = parseTableReference(table2, this.schema);
    
    // Create temporary result table
    const resultTable = `distance_${name1}_${name2}_${Date.now()}`;
    
    try {
      // Calculate distances using ST_Distance with geography type
      // Geography type ensures accurate distance calculations in meters
      let sql = `
        CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
        SELECT 
          a.ctid as source_row_id,
          b.ctid as target_row_id,
          COALESCE(a.id, a.ctid::text) as source_id,
          COALESCE(b.id, b.ctid::text) as target_id,
          ST_Distance(a.geom::geography, b.geom::geography) as distance_meters
        FROM ${schema1}.${name1} a
        CROSS JOIN ${schema2}.${name2} b
        LIMIT ${maxPairs}
      `;
      
      await this.pool.query(sql);
      
      // Add index for faster retrieval
      await this.pool.query(`
        CREATE INDEX idx_${resultTable}_ids ON ${TEMP_SCHEMA}.${resultTable} (source_id, target_id)
      `);
      
      // Retrieve results
      const result = await this.pool.query(`
        SELECT source_id, target_id, distance_meters
        FROM ${TEMP_SCHEMA}.${resultTable}
        ORDER BY source_id, distance_meters
      `);
      
      // Convert to requested unit
      const results: DistanceResult[] = result.rows.map(row => ({
        sourceId: row.source_id,
        targetId: row.target_id,
        distance: this.convertFromMeters(Number(row.distance_meters), unit),
        unit
      }));
      
      console.log(`[PostGISProximityOperation] Calculated ${results.length} distance pairs`);
      
      // Clean up temp table
      await this.pool.query(`DROP TABLE IF EXISTS ${TEMP_SCHEMA}.${resultTable}`);
      
      return results;
    } catch (error) {
      console.error('[PostGISProximityOperation] Distance calculation failed:', error);
      // Try to clean up
      await this.pool.query(`DROP TABLE IF EXISTS ${TEMP_SCHEMA}.${resultTable}`).catch(() => {});
      throw error;
    }
  }
  
  /**
   * Find k-nearest neighbors using PostGIS KNN operator (<->)
   * This is highly efficient due to GiST index support
   */
  async findNearestNeighbors(
    sourceTable: string,
    targetTable: string,
    limit: number,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
    }
  ): Promise<NearestNeighborResult[]> {
    const unit = options?.unit || 'meters';
    
    const { schema: sourceSchema, tableName: sourceName } = parseTableReference(sourceTable, this.schema);
    const { schema: targetSchema, tableName: targetName } = parseTableReference(targetTable, this.schema);
    
    const resultTable = `knn_${sourceName}_${targetName}_${Date.now()}`;
    
    try {
      // Use LATERAL join with KNN operator for efficient nearest neighbor search
      // The <-> operator uses GiST index for fast KNN queries
      const sql = `
        CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
        SELECT 
          s.ctid as source_row_id,
          COALESCE(s.id, s.ctid::text) as source_id,
          COALESCE(t.id, t.ctid::text) as nearest_target_id,
          ST_Distance(s.geom::geography, t.geom::geography) as distance_meters,
          ROW_NUMBER() OVER (PARTITION BY s.ctid ORDER BY s.geom::geography <-> t.geom::geography) as rank
        FROM ${sourceSchema}.${sourceName} s
        CROSS JOIN LATERAL (
          SELECT id, geom
          FROM ${targetSchema}.${targetName}
          ORDER BY s.geom::geography <-> geom
          LIMIT ${limit}
        ) t
      `;
      
      await this.pool.query(sql);
      
      // Retrieve results
      const result = await this.pool.query(`
        SELECT source_id, nearest_target_id, distance_meters, rank
        FROM ${TEMP_SCHEMA}.${resultTable}
        ORDER BY source_id, rank
      `);
      
      // Convert to requested unit
      const results: NearestNeighborResult[] = result.rows.map(row => ({
        sourceId: row.source_id,
        nearestTargetId: row.nearest_target_id,
        distance: this.convertFromMeters(Number(row.distance_meters), unit),
        unit,
        rank: Number(row.rank)
      }));
      
      console.log(`[PostGISProximityOperation] Found ${results.length} nearest neighbor relationships`);
      
      // Clean up
      await this.pool.query(`DROP TABLE IF EXISTS ${TEMP_SCHEMA}.${resultTable}`);
      
      return results;
    } catch (error) {
      console.error('[PostGISProximityOperation] KNN search failed:', error);
      await this.pool.query(`DROP TABLE IF EXISTS ${TEMP_SCHEMA}.${resultTable}`).catch(() => {});
      throw error;
    }
  }
  
  /**
   * Filter features within a distance threshold using ST_DWithin
   * Creates a new table with filtered features
   */
  async filterByDistance(
    referenceTable: string,
    centerTable: string,
    distance: number,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
    }
  ): Promise<string> {
    const unit = options?.unit || 'meters';
    
    const { schema: refSchema, tableName: refName } = parseTableReference(referenceTable, this.schema);
    const { schema: centerSchema, tableName: centerName } = parseTableReference(centerTable, this.schema);
    
    const resultTable = `within_${refName}_${Date.now()}`;
    
    // Convert distance to meters for geography type
    const distanceInMeters = this.convertToMeters(distance, unit);
    
    try {
      // Use ST_DWithin with geography type for accurate distance filtering
      const sql = `
        CREATE TABLE ${TEMP_SCHEMA}.${resultTable} AS
        SELECT DISTINCT r.*
        FROM ${refSchema}.${refName} r
        INNER JOIN ${centerSchema}.${centerName} c
        ON ST_DWithin(r.geom::geography, c.geom::geography, ${distanceInMeters})
      `;
      
      await this.pool.query(sql);
      
      // Add spatial index
      await this.pool.query(`
        CREATE INDEX idx_${resultTable}_geom ON ${TEMP_SCHEMA}.${resultTable} USING GIST (geom)
      `);
      
      console.log(`[PostGISProximityOperation] Filtered features within ${distance} ${unit}: ${resultTable}`);
      
      return resultTable;
    } catch (error) {
      console.error('[PostGISProximityOperation] Distance filter failed:', error);
      throw error;
    }
  }
  
  /**
   * Convert distance from meters to specified unit
   */
  private convertFromMeters(meters: number, unit: string): number {
    switch (unit) {
      case 'meters':
        return Number(meters.toFixed(6));
      case 'kilometers':
        return Number((meters / 1000).toFixed(6));
      case 'feet':
        return Number((meters / 0.3048).toFixed(6));
      case 'miles':
        return Number((meters / 1609.34).toFixed(6));
      case 'degrees':
        // Approximate: 1 degree ≈ 111,320 meters at equator
        return Number((meters / 111320).toFixed(6));
      default:
        return Number(meters.toFixed(6));
    }
  }
  
  /**
   * Convert distance to meters for internal calculations
   */
  private convertToMeters(distance: number, unit: string): number {
    switch (unit) {
      case 'meters':
        return distance;
      case 'kilometers':
        return distance * 1000;
      case 'feet':
        return distance * 0.3048;
      case 'miles':
        return distance * 1609.34;
      case 'degrees':
        return distance * 111320;
      default:
        return distance;
    }
  }
}
