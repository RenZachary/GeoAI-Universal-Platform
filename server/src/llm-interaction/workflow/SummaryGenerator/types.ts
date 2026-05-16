/**
 * Type definitions for SummaryGenerator
 */

import type { GeoAIStateType, AnalysisResult, VisualizationService } from '../GeoAIGraph';
import type { LLMConfig } from '../../adapters/LLMAdapterFactory';

export interface SummaryOptions {
  language?: string;
  includeGoals?: boolean;
  includeResults?: boolean;
  includeServices?: boolean;
  includeErrors?: boolean;
  includeNextSteps?: boolean;
  onToken?: (token: string) => void; // Callback for real-time token streaming
}

export interface SummaryContext {
  state: GeoAIStateType;
  options: SummaryOptions;
  language: string;
}

export interface TemplateVariables {
  [key: string]: string;
}

export interface LLMContext {
  [key: string]: any;
}

export interface CapabilitiesSummary {
  categories: Record<string, string[]>;
  formatted: string;
}

export interface TokenStreamResult {
  content: string;
  tokens: string[];
}