/**
 * DataSourceSemanticAnalyzer - Analyzes data sources for semantic understanding
 * 
 * This analyzer scans available data sources and extracts semantic metadata
 * to help LLM agents understand what data is available and how it can be used.
 */

import type { DataSourceRecord } from '../../data-access';
import type { DataSourceRepository } from '../../data-access';

export interface DataSourceSemanticInfo {
  id: string;
  name: string;
  description: string;
  type: string;
  format: string;
  category: 'administrative' | 'demographic' | 'economic' | 'environmental' | 'infrastructure' | 'other';
  spatialExtent?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  attributes: Array<{
    name: string;
    type: string;
    description?: string;
    sampleValues?: any[];
  }>;
  suggestedUseCases: string[];
  confidence: number; // 0-1, how confident we are about the semantic classification
}

export class DataSourceSemanticAnalyzer {
  private dataSourceRepo: DataSourceRepository;

  constructor(dataSourceRepo: DataSourceRepository) {
    this.dataSourceRepo = dataSourceRepo;
  }

  /**
   * Analyze all available data sources and extract semantic information
   */
  async analyzeAllDataSources(): Promise<DataSourceSemanticInfo[]> {
    console.log('[DataSourceSemanticAnalyzer] Analyzing all data sources...');
    
    try {
      const dataSources = this.dataSourceRepo.listAll();
      const semanticInfos: DataSourceSemanticInfo[] = [];

      for (const dataSource of dataSources) {
        try {
          const semanticInfo = await this.analyzeDataSource(dataSource);
          semanticInfos.push(semanticInfo);
        } catch (error) {
          console.error(`[DataSourceSemanticAnalyzer] Failed to analyze data source ${dataSource.id}:`, error);
        }
      }

      console.log(`[DataSourceSemanticAnalyzer] Analyzed ${semanticInfos.length}/${dataSources.length} data sources`);
      return semanticInfos;
    } catch (error) {
      console.error('[DataSourceSemanticAnalyzer] Failed to analyze data sources:', error);
      throw error;
    }
  }

  /**
   * Analyze a single data source
   */
  async analyzeDataSource(dataSource: DataSourceRecord): Promise<DataSourceSemanticInfo> {
    const metadata = dataSource.metadata as any;
    
    const semanticInfo: DataSourceSemanticInfo = {
      id: dataSource.id,
      name: dataSource.name,
      description: metadata.description || '',
      type: dataSource.type,
      format: metadata.format || this.inferFormatFromType(dataSource.type),
      category: this.inferCategory(dataSource),
      attributes: await this.extractAttributes(dataSource),
      suggestedUseCases: this.generateUseCases(dataSource),
      confidence: this.calculateConfidence(dataSource)
    };

    return semanticInfo;
  }

  /**
   * Infer format from data source type
   */
  private inferFormatFromType(type: string): string {
    switch (type.toLowerCase()) {
      case 'geojson': return 'geojson';
      case 'shapefile': return 'shapefile';
      case 'postgis': return 'postgis';
      case 'geotiff': return 'geotiff';
      default: return 'unknown';
    }
  }

  /**
   * Infer data source category based on name, description, and metadata
   */
  private inferCategory(dataSource: DataSourceRecord): DataSourceSemanticInfo['category'] {
    const metadata = dataSource.metadata as any;
    const text = `${dataSource.name} ${metadata.description || ''}`.toLowerCase();
    
    // Administrative boundaries
    if (text.includes('boundary') || text.includes('行政') || text.includes('行政区划') || 
        text.includes('province') || text.includes('city') || text.includes('district')) {
      return 'administrative';
    }
    
    // Demographic data
    if (text.includes('population') || text.includes('人口') || text.includes('demographic') ||
        text.includes('census') || text.includes('age') || text.includes('gender')) {
      return 'demographic';
    }
    
    // Economic data
    if (text.includes('economic') || text.includes('经济') || text.includes('gdp') ||
        text.includes('income') || text.includes('employment') || text.includes('industry')) {
      return 'economic';
    }
    
    // Environmental data
    if (text.includes('environment') || text.includes('环境') || text.includes('land') ||
        text.includes('vegetation') || text.includes('water') || text.includes('climate') ||
        text.includes('temperature') || text.includes('precipitation')) {
      return 'environmental';
    }
    
    // Infrastructure
    if (text.includes('road') || text.includes('道路') || text.includes('building') ||
        text.includes('建筑') || text.includes('transport') || text.includes('railway') ||
        text.includes('airport') || text.includes('port')) {
      return 'infrastructure';
    }
    
    return 'other';
  }

  /**
   * Extract attribute information from data source metadata
   */
  private async extractAttributes(dataSource: DataSourceRecord): Promise<DataSourceSemanticInfo['attributes']> {
    const attributes: DataSourceSemanticInfo['attributes'] = [];
    
    try {
      // If data source has metadata with fields/schema, extract them
      if (dataSource.metadata && typeof dataSource.metadata === 'object') {
        const metadata = dataSource.metadata as any;
        
        // Check for GeoJSON features or schema information
        if (metadata.fields && Array.isArray(metadata.fields)) {
          for (const field of metadata.fields) {
            attributes.push({
              name: field.name || field.field,
              type: field.type || 'string',
              description: field.description,
              sampleValues: field.sampleValues || []
            });
          }
        }
        
        // Check for properties in GeoJSON
        if (metadata.properties && typeof metadata.properties === 'object') {
          for (const [key, value] of Object.entries(metadata.properties)) {
            attributes.push({
              name: key,
              type: typeof value,
              sampleValues: [value]
            });
          }
        }
      }
    } catch (error) {
      console.warn(`[DataSourceSemanticAnalyzer] Failed to extract attributes for ${dataSource.id}:`, error);
    }
    
    return attributes;
  }

  /**
   * Generate suggested use cases based on data source characteristics
   */
  private generateUseCases(dataSource: DataSourceRecord): string[] {
    const category = this.inferCategory(dataSource);
    const useCases: string[] = [];
    
    switch (category) {
      case 'administrative':
        useCases.push(
          'Choropleth mapping by administrative units',
          'Spatial aggregation by regions',
          'Boundary-based spatial joins'
        );
        break;
        
      case 'demographic':
        useCases.push(
          'Population density analysis',
          'Demographic distribution visualization',
          'Statistical correlation with spatial patterns'
        );
        break;
        
      case 'economic':
        useCases.push(
          'Economic indicator mapping',
          'Regional economic comparison',
          'Spatial clustering of economic activities'
        );
        break;
        
      case 'environmental':
        useCases.push(
          'Environmental impact assessment',
          'Land cover classification',
          'Spatial interpolation of environmental variables'
        );
        break;
        
      case 'infrastructure':
        useCases.push(
          'Network analysis and routing',
          'Proximity analysis to infrastructure',
          'Infrastructure coverage assessment'
        );
        break;
        
      default:
        useCases.push(
          'General spatial analysis',
          'Data visualization',
          'Spatial query and filtering'
        );
    }
    
    return useCases;
  }

  /**
   * Calculate confidence score for semantic classification
   */
  private calculateConfidence(dataSource: DataSourceRecord): number {
    const metadata = dataSource.metadata as any;
    let confidence = 0.5; // Base confidence
    
    // Increase confidence if description is available
    if (metadata.description && metadata.description.length > 20) {
      confidence += 0.2;
    }
    
    // Increase confidence if metadata is rich
    if (metadata && Object.keys(metadata).length > 3) {
      confidence += 0.2;
    }
    
    // Decrease confidence for unknown formats
    const format = metadata.format || this.inferFormatFromType(dataSource.type);
    if (!['geojson', 'shapefile', 'postgis', 'geotiff'].includes(format.toLowerCase())) {
      confidence -= 0.1;
    }
    
    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Find data sources relevant to a specific task or query
   */
  async findRelevantDataSources(query: string, limit: number = 5): Promise<DataSourceSemanticInfo[]> {
    const allSources = await this.analyzeAllDataSources();
    const queryLower = query.toLowerCase();
    
    // Simple keyword matching (can be enhanced with vector similarity in future)
    const scored = allSources.map(source => {
      let score = 0;
      
      // Match against name
      if (source.name.toLowerCase().includes(queryLower)) {
        score += 3;
      }
      
      // Match against description
      if (source.description.toLowerCase().includes(queryLower)) {
        score += 2;
      }
      
      // Match against category
      if (source.category.includes(queryLower)) {
        score += 2;
      }
      
      // Match against use cases
      for (const useCase of source.suggestedUseCases) {
        if (useCase.toLowerCase().includes(queryLower)) {
          score += 1;
        }
      }
      
      // Match against attributes
      for (const attr of source.attributes) {
        if (attr.name.toLowerCase().includes(queryLower)) {
          score += 1;
        }
      }
      
      return { source, score };
    });
    
    // Sort by score and return top results
    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.source);
  }

  /**
   * Get data source recommendations for a specific analysis type
   */
  async recommendForAnalysis(analysisType: string): Promise<DataSourceSemanticInfo[]> {
    const analysisLower = analysisType.toLowerCase();
    
    // Map analysis types to data categories
    const categoryMap: Record<string, DataSourceSemanticInfo['category'][]> = {
      'choropleth': ['administrative', 'demographic', 'economic'],
      'heatmap': ['demographic', 'economic', 'environmental'],
      'buffer': ['infrastructure', 'administrative'],
      'overlay': ['administrative', 'environmental', 'infrastructure'],
      'spatial_join': ['administrative', 'demographic', 'economic'],
      'aggregation': ['administrative', 'demographic', 'economic']
    };
    
    const relevantCategories = categoryMap[analysisLower] || ['administrative', 'demographic', 'economic'];
    const allSources = await this.analyzeAllDataSources();
    
    return allSources.filter(source => relevantCategories.includes(source.category));
  }
}
