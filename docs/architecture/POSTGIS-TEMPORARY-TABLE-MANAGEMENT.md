# PostGIS Temporary Table Management Architecture

## 1. Overview
This document outlines the architectural strategy for managing temporary tables generated during spatial analysis within the GeoAI-UP system. The goal is to maintain a clean, performant, and manageable PostGIS environment by isolating intermediate data from permanent business assets.

## 2. Core Principles
- **Isolation:** All temporary tables must reside in a dedicated schema (`geoai_temp`) to prevent cluttering business schemas (e.g., `public`).
- **Non-Persistence:** Temporary tables are considered "consumables." They are not registered as formal data sources and are excluded from user-facing discovery lists.
- **Standardized Naming:** All temporary tables must follow the pattern `geoai_temp_<operation>_<timestamp>` to facilitate identification and automated cleanup.
- **Automated Lifecycle:** A background scheduler is responsible for purging expired temporary tables to prevent database bloat.

## 3. Schema Design
### 3.1 The `geoai_temp` Schema
- **Purpose:** Exclusive workspace for spatial analysis intermediates (e.g., buffer results, overlay outputs, filtered subsets).
- **Initialization:** Automatically created upon server startup if it does not already exist.
- **Permissions:** Inherited from the primary database user; no special ACLs are required unless multi-tenant isolation is introduced later.

### 3.2 Naming Convention
| Component | Description | Example |
| :--- | :--- | :--- |
| Prefix | Fixed identifier for temp tables | `geoai_temp_` |
| Operation | Type of analysis performed | `buffer`, `overlay`, `filter` |
| Timestamp | Unix timestamp or ISO date | `1715091234` |
| **Full Name** | **Combined format** | **`geoai_temp_buffer_1715091234`** |

## 4. Implementation Strategy

### 4.1 Data Source Discovery Filtering
The `DataSourceService` performs table discovery by querying `geometry_columns`. To enforce the non-persistence principle:
- **SQL Filter:** `WHERE f_table_schema != 'geoai_temp'`
- **Result:** Tables in the temp schema are invisible to the LLM context and the UI's data source manager.

### 4.2 Spatial Operations Refactoring
All operation modules (Buffer, Overlay, Join, etc.) must be updated to:
1.  Target the `geoai_temp` schema when executing `CREATE TABLE AS SELECT`.
2.  Use the standardized naming convention.
3.  Remove redundant `AddGeometryColumn` calls if the CTAS operation already preserves geometry metadata (common in PostGIS 2.x+).

### 4.3 Automated Cleanup Scheduler
Inspired by the filesystem `CleanupScheduler`, a dedicated `PostGISCleanupScheduler` will:
- **Frequency:** Run every hour (configurable).
- **Logic:** Identify tables in `geoai_temp` with a `created_at` or `relfilenode` age exceeding the threshold (default: 24 hours).
- **Action:** Execute `DROP TABLE IF EXISTS geoai_temp.<table_name> CASCADE`.

## 5. Benefits
1.  **Performance:** Reduces bloat in business schemas, improving query planning and vacuum efficiency.
2.  **Clarity:** Users only see relevant, permanent data sources in the application interface.
3.  **Maintainability:** Centralized cleanup logic prevents "orphan" tables from accumulating over time.
4.  **Robustness:** Server restarts no longer trigger the accidental registration of stale analysis results.
