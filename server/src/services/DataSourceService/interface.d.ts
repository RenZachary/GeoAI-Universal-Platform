export interface ConnectionInfo {
  host: string;
  database: string;
  schema: string;
  tableCount: number;
}

export interface RegisteredDataSource {
  id: string;
  name: string;
  tableName: string;
  geometryType: string;
  rowCount: number;
}

export interface TableInfo {
  schema: string;
  tableName: string;
  geometryColumn: string;
  srid: number;
  geometryType: string;
  rowCount: number;
  fields: UnifiedFieldInfo[];
  description: string | null;
}

export interface FieldInfo {
  columnName: string;
  dataType: string;
  isNullable: string;
  maxLength?: number;
}

export interface UnifiedFieldInfo {
  name: string;
  type: string;
}
