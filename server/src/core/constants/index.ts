/**
 * System constants and configuration values
 */

// ============================================================================
// Workspace Directory Structure
// ============================================================================

export const WORKSPACE_DIRS = {
  DATA_LOCAL: 'data/local',
  DATA_POSTGIS: 'data/postgis',
  LLM_CONFIG: 'llm/config',
  LLM_PROMPTS_EN_US: 'llm/prompts/en-US',
  LLM_PROMPTS_ZH_CN: 'llm/prompts/zh-CN',
  PLUGINS_BUILTIN: 'plugins/builtin',
  PLUGINS_CUSTOM: 'plugins/custom',
  DATABASE: 'database',
  DATABASE_BACKUPS: 'database/backups',
  TEMP: 'temp',
  RESULTS_GEOJSON: 'results/geojson',
  RESULTS_SHAPEFILE: 'results/shapefile',
  RESULTS_MVT: 'results/mvt',
  RESULTS_WMS: 'results/wms',
  RESULTS_REPORTS: 'results/reports',
  RESULTS_STYLE: 'results/styles',
} as const;

// ============================================================================
// Default Prompt Templates
// ============================================================================

export const DEFAULT_PROMPT_TEMPLATES = [
  'goal-splitting.md',
  'task-planning.md',
  'response-summary.md',
] as const;

// ============================================================================
// Database Configuration
// ============================================================================

export const DB_CONFIG = {
  DATABASE_FILE: 'geoai-up.db',
  BACKUP_PREFIX: 'backup_',
} as const;

// ============================================================================
// Service Limits & Constraints
// ============================================================================

export const SERVICE_LIMITS = {
  MVT_MAX_TILES: 10000,
  WMS_MAX_WIDTH: 4096,
  WMS_MAX_HEIGHT: 4096,
  DEFAULT_SERVICE_TTL: 3600000, // 1 hour in milliseconds
  CLEANUP_INTERVAL: 3600000,    // Check every hour
} as const;

// ============================================================================
// Storage Warning Thresholds
// ============================================================================

export const STORAGE_THRESHOLDS = {
  WARNING_PERCENT: 80,   // Warn at 80% usage
  CRITICAL_PERCENT: 90,  // Critical at 90% usage
} as const;

// ============================================================================
// File Upload Limits
// ============================================================================

export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  ALLOWED_EXTENSIONS: ['.shp', '.shx', '.dbf', '.prj', '.geojson', '.json', '.tif', '.tiff'],
} as const;

// ============================================================================
// Plugin Categories
// ============================================================================

export const PLUGIN_CATEGORIES = [
  'analysis',
  'visualization',
  'data_import',
  'report',
  'utility',
] as const;

// ============================================================================
// Distance Units
// ============================================================================

export const DISTANCE_UNITS = [
  'meters',
  'kilometers',
  'feet',
  'miles',
] as const;

// ============================================================================
// API Response Status Codes
// ============================================================================

export const API_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  PARTIAL: 'partial',
} as const;
