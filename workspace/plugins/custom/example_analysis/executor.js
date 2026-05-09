/**
 * Example Custom Plugin Executor
 * 
 * This is a simple demonstration of how to write a custom plugin executor.
 * The execute function receives parameters and context (db, workspaceBase).
 * 
 * IMPORTANT: Must export as named function 'execute', not default export!
 * 
 * @param {Object} params - Input parameters from the plugin call
 * @param {Object} context - Execution context
 * @param {Database} context.db - SQLite database instance
 * @param {string} context.workspaceBase - Workspace base directory
 * @returns {Object} Result object with id, type, reference, metadata, createdAt
 */

export async function execute(params, context) {
  const { db, workspaceBase } = context;
  const { dataSourceId, multiplier = 2, operation = 'count' } = params;

  console.log('[Example Analysis Plugin] Executing with params:', params);
  console.log('[Example Analysis Plugin] Context available:', {
    hasDb: !!db,
    workspaceBase
  });

  try {
    // Step 1: Query the data source from database
    let featureCount = 0;
    let dataSourceName = 'Unknown';

    if (db && dataSourceId) {
      try {
        // Query data source metadata from SQLite
        const stmt = db.prepare('SELECT id, name, metadata FROM data_sources WHERE id = ?');
        const dataSource = stmt.get(dataSourceId);

        if (dataSource) {
          dataSourceName = dataSource.name;
          
          // Parse metadata to get feature count
          if (dataSource.metadata) {
            const metadata = typeof dataSource.metadata === 'string' 
              ? JSON.parse(dataSource.metadata) 
              : dataSource.metadata;
            
            featureCount = metadata.featureCount || metadata.rowCount || 0;
          }
        }
      } catch (error) {
        console.warn('[Example Analysis Plugin] Failed to query data source:', error.message);
      }
    }

    // Step 2: Perform the requested operation
    let resultValue = 0;
    let operationDescription = '';

    switch (operation) {
      case 'count':
        resultValue = featureCount;
        operationDescription = `Counted ${featureCount} features`;
        break;

      case 'sum':
        resultValue = featureCount * multiplier;
        operationDescription = `Calculated sum: ${featureCount} × ${multiplier} = ${resultValue}`;
        break;

      case 'average':
        resultValue = featureCount > 0 ? (featureCount * multiplier) / featureCount : 0;
        operationDescription = `Calculated average: ${resultValue}`;
        break;

      default:
        resultValue = featureCount;
        operationDescription = `Default operation: counted ${featureCount} features`;
    }

    // Step 3: Create result metadata
    const resultMetadata = {
      operation,
      multiplier,
      featureCount,
      resultValue,
      description: operationDescription,
      dataSourceName,
      customPlugin: true,
      executedAt: new Date().toISOString()
    };

    console.log('[Example Analysis Plugin] Result:', resultMetadata);

    // Step 4: Return NativeData-compatible result
    return {
      id: `example_${dataSourceId}_${Date.now()}`,
      type: 'geojson',
      reference: '', // No actual file generated in this example
      metadata: {
        ...resultMetadata,
        result: resultMetadata,
        description: `Example analysis completed: ${operationDescription}`
      },
      createdAt: new Date()
    };

  } catch (error) {
    console.error('[Example Analysis Plugin] Execution failed:', error);
    throw error;
  }
}
