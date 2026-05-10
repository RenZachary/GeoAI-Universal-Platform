/**
 * Metadata Formatter for LLM Context
 * 
 * Centralized utility for formatting data source metadata into human-readable
 * summaries for LLM task planning and context injection.
 * 
 * Responsibilities:
 * - Format data sources with type-specific details
 * - Provide consistent metadata presentation across the system
 * - Support multiple output formats (text summary, structured JSON)
 */

import type { DataSourceRecord } from '../repositories';

export interface FormattedDataSource {
  id: string;
  name: string;
  type: string;
  description: string;
  summary: string;
  capabilities: string[];
}

export class MetadataFormatter {
  /**
   * Format all data sources for LLM task planning context
   * Returns a human-readable text summary
   */
  static formatForLLM(sources: DataSourceRecord[]): string {
    if (!sources || sources.length === 0) {
      return 'No data sources available. User must upload or register data sources first.';
    }

    const formatted = sources.map(ds => this.formatSingleDataSource(ds)).join('\n\n');
    
    return `Available Data Sources (${sources.length}):\n\n${formatted}`;
  }

  /**
   * Format data sources as structured objects for programmatic use
   */
  static formatAsStructured(sources: DataSourceRecord[]): FormattedDataSource[] {
    return sources.map(ds => ({
      id: ds.id,
      name: ds.name,
      type: ds.type,
      description: ds.metadata?.description || 'No description',
      summary: this.generateSummary(ds),
      capabilities: this.extractCapabilities(ds)
    }));
  }

  /**
   * Format a single data source with type-specific details
   */
  private static formatSingleDataSource(ds: DataSourceRecord): string {
    const lines = [
      `- ID: ${ds.id}`,
      `  Name: ${ds.name}`,
      `  Type: ${ds.type}`,
      `  Description: ${ds.metadata?.description || 'No description'}`
    ];

    // Add type-specific information
    switch (ds.type) {
      case 'postgis':
        this.appendPostGISDetails(lines, ds);
        break;
      
      case 'geojson':
      case 'shapefile':
        this.appendFileBasedDetails(lines, ds);
        break;
      
      default:
        // Generic fallback
        if (ds.metadata?.featureCount !== undefined) {
          lines.push(`  Features/Rows: ${ds.metadata.featureCount.toLocaleString()}`);
        }
    }

    return lines.join('\n');
  }

  /**
   * Append PostGIS-specific details
   */
  private static appendPostGISDetails(lines: string[], ds: DataSourceRecord): void {
    const refParts = ds.reference?.split('/') || [];
    const tableName = refParts[refParts.length - 1] || 'unknown';
    lines.push(`  Table: ${tableName}`);

    // Geometry information
    if (ds.metadata?.geometryType) {
      const srid = ds.metadata.srid ? `SRID: ${ds.metadata.srid}` : 'SRID: unknown';
      lines.push(`  Geometry: ${ds.metadata.geometryType} (${srid})`);
    }

    // Row count
    if (ds.metadata?.rowCount !== undefined) {
      lines.push(`  Rows: ${ds.metadata.rowCount.toLocaleString()}`);
    }

    // Bounding box if available
    if (ds.metadata?.bbox) {
      const [minX, minY, maxX, maxY] = ds.metadata.bbox;
      lines.push(`  Extent: [${minX.toFixed(4)}, ${minY.toFixed(4)}, ${maxX.toFixed(4)}, ${maxY.toFixed(4)}]`);
    }

    // Field information
    this.appendFieldInformation(lines, ds, 'postgis');
  }

  /**
   * Append file-based data source details (GeoJSON, Shapefile)
   */
  private static appendFileBasedDetails(lines: string[], ds: DataSourceRecord): void {
    const fileName = ds.reference?.split('/').pop() || 'unknown';
    lines.push(`  File: ${fileName}`);

    // Geometry type
    if (ds.metadata?.geometryType) {
      lines.push(`  Geometry: ${ds.metadata.geometryType}`);
    }

    // Feature count
    if (ds.metadata?.featureCount !== undefined) {
      lines.push(`  Features: ${ds.metadata.featureCount.toLocaleString()}`);
    }

    // Bounding box if available
    if (ds.metadata?.bbox) {
      const [minX, minY, maxX, maxY] = ds.metadata.bbox;
      lines.push(`  Extent: [${minX.toFixed(4)}, ${minY.toFixed(4)}, ${maxX.toFixed(4)}, ${maxY.toFixed(4)}]`);
    }

    // Field information
    this.appendFieldInformation(lines, ds, 'file');
  }

  /**
   * Append field information based on data source type
   */
  private static appendFieldInformation(
    lines: string[], 
    ds: DataSourceRecord, 
    sourceType: 'postgis' | 'file'
  ): void {
    if (!ds.metadata?.fields || !Array.isArray(ds.metadata.fields)) {
      return;
    }

    if (sourceType === 'postgis') {
      // PostGIS: Group by data type categories
      const numericFields = ds.metadata.fields.filter((f: any) =>
        ['integer', 'numeric', 'float', 'double precision', 'real'].includes(f.dataType?.toLowerCase())
      );
      const textFields = ds.metadata.fields.filter((f: any) =>
        ['character varying', 'text', 'varchar', 'char'].includes(f.dataType?.toLowerCase())
      );
      const otherFields = ds.metadata.fields.filter((f: any) =>
        !['integer', 'numeric', 'float', 'double precision', 'real', 
          'character varying', 'text', 'varchar', 'char'].includes(f.dataType?.toLowerCase())
      );

      if (numericFields.length > 0) {
        lines.push(`  Numeric Fields: ${numericFields.map((f: any) => f.columnName).join(', ')}`);
      }
      if (textFields.length > 0) {
        lines.push(`  Text Fields: ${textFields.map((f: any) => f.columnName).join(', ')}`);
      }
      if (otherFields.length > 0 && otherFields.length <= 5) {
        lines.push(`  Other Fields: ${otherFields.map((f: any) => `${f.columnName} (${f.dataType})`).join(', ')}`);
      }
    } else {
      // File-based: Show fields with types (limit to first 8 for readability)
      const sampleValues = ds.metadata.sampleValues || {};
      const displayFields = ds.metadata.fields.slice(0, 8);
      
      const fieldInfo = displayFields.map((field: any) => {
        if (typeof field === 'object' && field.name) {
          const fieldName = field.name;
          const fieldType = field.type || 'unknown';
          return `${fieldName} (${fieldType})`;
        }
        return String(field);
      });
      
      lines.push(`  Fields: ${fieldInfo.join(', ')}`);
      
      if (ds.metadata.fields.length > 8) {
        lines.push(`  ... and ${ds.metadata.fields.length - 8} more fields`);
      }
    }
  }

  /**
   * Generate a concise summary of the data source
   */
  private static generateSummary(ds: DataSourceRecord): string {
    const parts: string[] = [];

    // Basic info
    parts.push(`${ds.name} (${ds.type})`);

    // Count
    const count = ds.metadata?.featureCount || ds.metadata?.rowCount;
    if (count !== undefined) {
      parts.push(`${count.toLocaleString()} features`);
    }

    // Geometry type
    if (ds.metadata?.geometryType) {
      parts.push(ds.metadata.geometryType);
    }

    return parts.join(' • ');
  }

  /**
   * Extract capabilities from data source metadata
   */
  private static extractCapabilities(ds: DataSourceRecord): string[] {
    const capabilities: string[] = [];

    // Spatial operations capability
    if (ds.metadata?.geometryType) {
      capabilities.push('spatial_analysis');
    }

    // Statistical analysis capability
    if (ds.metadata?.fields && ds.metadata.fields.length > 0) {
      const hasNumeric = ds.metadata.fields.some((f: any) => {
        const type = f.dataType || f.type || '';
        return ['integer', 'numeric', 'float', 'double', 'number'].some(t => 
          type.toLowerCase().includes(t)
        );
      });
      
      if (hasNumeric) {
        capabilities.push('statistical_analysis');
      }
    }

    // Filtering capability
    if (ds.metadata?.fields && ds.metadata.fields.length > 0) {
      capabilities.push('attribute_filtering');
    }

    return capabilities;
  }
}
