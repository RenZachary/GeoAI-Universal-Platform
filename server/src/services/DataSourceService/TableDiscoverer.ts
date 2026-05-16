import type { PostGISConnectionConfig } from '../../core';
import type { TableInfo, UnifiedFieldInfo } from './types';
import { POSTGIS_TEMP_SCHEMA } from './constant';
import { PostGISConnector } from './PostGISConnector';

export class TableDiscoverer {
  private connector: PostGISConnector;

  constructor(workspaceBase?: string) {
    this.connector = new PostGISConnector(workspaceBase);
  }

  async discoverAllSchemas(): Promise<TableInfo[]> {
    try {
      const postGISBackend = this.connector.getPostGISBackend();
      if (!postGISBackend) {
        throw new Error('PostGIS backend not configured');
      }

      const query = `
        SELECT 
          f_table_schema AS "schema",
          f_table_name AS "tableName",
          f_geometry_column AS "geometryColumn",
          srid,
          type AS "geometryType"
        FROM geometry_columns
        WHERE f_table_schema != '${POSTGIS_TEMP_SCHEMA}'
        ORDER BY f_table_schema, f_table_name
      `;

      const result = await (postGISBackend as any).executeRaw(query);
      const tables = result.rows || [];

      console.log(`[TableDiscoverer] Found ${tables.length} spatial tables`);

      const enrichedTables = await Promise.all(
        tables.map(async (table: any) => await this.enrichTable(table, postGISBackend))
      );

      console.log(`[TableDiscoverer] Successfully enriched ${enrichedTables.length} tables`);
      return enrichedTables;
    } catch (error) {
      console.error('[TableDiscoverer] Error discovering tables:', error);
      throw error;
    }
  }

  private async enrichTable(table: any, postGISBackend: any): Promise<TableInfo> {
    try {
      const schema = table.schema;
      const tableName = table.tableName;

      const rowCount = await this.getRowCount(schema, tableName, postGISBackend);
      const fields = await this.getFieldSchema(schema, tableName, postGISBackend);

      return {
        ...table,
        rowCount,
        fields,
        description: null
      };
    } catch (err) {
      console.warn(`[TableDiscoverer] Failed to enrich table ${table.schema}.${table.tableName}:`, err);
      return {
        ...table,
        rowCount: 0,
        fields: [],
        description: null
      };
    }
  }

  private async getRowCount(schema: string, tableName: string, postGISBackend: any): Promise<number> {
    const countQuery = `SELECT COUNT(*) as count FROM "${schema}"."${tableName}"`;
    const countResult = await (postGISBackend as any).executeRaw(countQuery);
    return parseInt(countResult.rows[0].count, 10);
  }

  private async getFieldSchema(schema: string, tableName: string, postGISBackend: any): Promise<UnifiedFieldInfo[]> {
    const schemaQuery = `
      SELECT 
        column_name AS "columnName",
        data_type AS "dataType",
        is_nullable AS "isNullable",
        character_maximum_length AS "maxLength"
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `;
    
    const schemaResult = await (postGISBackend as any).executeRaw(schemaQuery, [schema, tableName]);
    const fieldSchemas = schemaResult.rows || [];
    
    return fieldSchemas.map((f: any) => ({
      name: f.columnName,
      type: this.mapPostGISDataType(f.dataType)
    }));
  }

  private mapPostGISDataType(postgisType: string): string {
    const typeMap: Record<string, string> = {
      'integer': 'number',
      'bigint': 'number',
      'smallint': 'number',
      'numeric': 'number',
      'decimal': 'number',
      'real': 'number',
      'double precision': 'number',
      'float': 'number',
      'text': 'string',
      'character varying': 'string',
      'varchar': 'string',
      'char': 'string',
      'character': 'string',
      'boolean': 'boolean',
      'bool': 'boolean',
      'date': 'date',
      'timestamp': 'date',
      'timestamptz': 'date',
      'time': 'date',
      'json': 'object',
      'jsonb': 'object',
      'bytea': 'binary',
      'uuid': 'string',
      'USER-DEFINED': 'geometry'
    };

    return typeMap[postgisType.toLowerCase()] || 'string';
  }
}
