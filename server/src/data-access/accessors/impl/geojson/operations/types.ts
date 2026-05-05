/**
 * Statistical Operations - Type Definitions
 */

export interface FieldStatistics {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  count: number;
  values: number[];
}

export type ClassificationMethod = 
  | 'quantile'
  | 'equal_interval'
  | 'standard_deviation'
  | 'jenks';
