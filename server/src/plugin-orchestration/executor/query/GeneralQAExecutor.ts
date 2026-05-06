/**
 * General Q&A Executor
 * Generates conversational responses for general questions
 */

import type { NativeData } from '../../../core/index';
import type Database from 'better-sqlite3';

export interface GeneralQAParams {
  question: string;
  context?: string;
  responseStyle?: 'conversational' | 'formal' | 'brief' | 'detailed';
}

export class GeneralQAExecutor {
  private db: Database.Database;
  private workspaceBase: string;

  constructor(db: Database.Database, workspaceBase?: string) {
    this.db = db;
    this.workspaceBase = workspaceBase || process.cwd();
  }

  async execute(params: GeneralQAParams): Promise<NativeData> {
    console.log('[GeneralQAExecutor] Processing question:', params.question);

    try {
      const answer = this.getFallbackResponse(params.question);

      return {
        id: `qa_${Date.now()}`,
        type: 'geojson',
        reference: '',
        metadata: {
          result: {
            answer,
            type: this.classifyQuestion(params.question),
            suggestions: this.generateSuggestions(params.question),
            timestamp: new Date().toISOString()
          },
          operation: 'general_qa',
          description: 'Generated conversational response'
        },
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[GeneralQAExecutor] Q&A failed:', error);
      throw error;
    }
  }

  private classifyQuestion(question: string): string {
    const q = question.toLowerCase();
    if (q.match(/^(hi|hello|hey|greetings)/)) return 'greeting';
    if (q.includes('can you') || q.includes('what can')) return 'capability_inquiry';
    if (q.includes('how')) return 'how_to';
    if (q.includes('thank')) return 'gratitude';
    return 'general';
  }

  private generateSuggestions(question: string): string[] {
    const q = question.toLowerCase();
    if (q.includes('can you') || q.includes('what can')) {
      return [
        'Try: "Show me a heatmap of population density"',
        'Try: "Create a 500m buffer around rivers"',
        'Try: "Generate a report from my analysis results"'
      ];
    }
    if (q.match(/^(hi|hello|hey)/)) {
      return [
        'Ask me to visualize your spatial data',
        'Request a spatial analysis operation',
        'Upload a dataset for processing'
      ];
    }
    return ['Explore available data sources', 'Request map visualization', 'Perform spatial analysis'];
  }

  private getFallbackResponse(question: string): string {
    const q = question.toLowerCase();
    
    if (q.match(/^(hi|hello|hey|greetings)/)) {
      return 'Hello! I\'m GeoAI-UP, your geospatial analysis assistant. I can help you visualize data, perform spatial analysis, and generate reports. What would you like to do?';
    }
    
    if (q.includes('can you') || q.includes('what can')) {
      return 'I can help you with:\n\n1. **Data Visualization**: Create maps, heatmaps, and choropleth visualizations\n2. **Spatial Analysis**: Buffer analysis, overlay operations, proximity queries\n3. **Data Processing**: Filter, aggregate, and transform spatial data\n4. **Statistics**: Calculate statistical measures from your datasets\n5. **Reports**: Generate comprehensive HTML reports with charts and maps\n\nWhat task would you like to accomplish?';
    }
    
    if (q.includes('how')) {
      return 'To get started, you can:\n\n- Upload a spatial dataset (GeoJSON, Shapefile, etc.)\n- Ask me to visualize data on a map\n- Request spatial analysis operations\n- Generate reports from analysis results\n\nWhat specific task do you need help with?';
    }
    
    if (q.includes('thank')) {
      return 'You\'re welcome! Feel free to ask if you need help with any geospatial analysis tasks.';
    }
    
    const defaultResponse = [
      'I\'m here to help with geospatial analysis tasks.',
      'You can ask me to:',
      '',
      '- Visualize your data on interactive maps',
      '- Perform spatial analysis (buffers, overlays, etc.)',
      '- Calculate statistics from your datasets',
      '- Generate comprehensive reports',
      '',
      'What would you like to explore?'
    ].join('\n');
    
    return defaultResponse;
  }
}
