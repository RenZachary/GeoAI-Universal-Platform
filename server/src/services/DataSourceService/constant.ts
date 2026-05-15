export const FILE_BASED_TYPES = ['geojson', 'shapefile', 'tif'] as const;

export const POSTGIS_TEMP_SCHEMA = 'geoai_temp';

export const DEFAULT_BBOX: [number, number, number, number] = [-180, -90, 180, 90];

export const BBOX_CALCULATION_TIMEOUT = 30000; // 30 seconds

export const LARGE_TABLE_THRESHOLD = 10_000_000;
