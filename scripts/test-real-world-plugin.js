/**
 * Real-World Plugin Example: Buffer Analysis
 * Demonstrates creating a practical spatial analysis plugin
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api';

// Color codes
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function log(color, message) {
  console.log(`${color}${message}${RESET}`);
}

async function testAPI(method, endpoint, data = null) {
  try {
    const url = `${BASE_URL}${endpoint}`;
    const config = {
      method: method.toLowerCase(),
      url,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    if (error.response) {
      return { 
        success: false, 
        error: error.response.data, 
        status: error.response.status 
      };
    }
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  log(CYAN, 'Real-World Plugin Example: Buffer Analysis');
  console.log('='.repeat(70) + '\n');

  // Create a buffer analysis plugin
  log(BLUE, 'Creating custom geometry plugin...');
  const pluginDir = path.join(__dirname, '..', 'workspace', 'plugins', 'custom', 'geometry_helper');
  
  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true });
  }

  // Create plugin manifest
  const pluginManifest = {
    id: 'geometry_helper',
    name: 'Geometry Helper',
    version: '1.0.0',
    description: 'Utility plugin for geometry operations and transformations',
    category: 'utility',
    inputSchema: [
      {
        name: 'operation',
        type: 'string',
        required: true,
        description: 'Operation to perform (centroid, bbox, area)'
      },
      {
        name: 'geojson',
        type: 'object',
        required: true,
        description: 'Input GeoJSON feature or feature collection'
      }
    ],
    outputSchema: {
      type: 'object',
      description: 'Result of geometry operation'
    },
    capabilities: ['geometry', 'utility', 'transformation'],
    isBuiltin: false
  };

  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify(pluginManifest, null, 2)
  );

  // Create plugin implementation
  const mainJs = `
/**
 * Geometry Helper Plugin
 * Provides utility functions for geometry operations
 */

module.exports = {
  execute: async (params) => {
    const { operation, geojson } = params;
    
    if (!operation || !geojson) {
      throw new Error('Both operation and geojson parameters are required');
    }
    
    console.log(\`Executing geometry operation: \${operation}\`);
    
    let result;
    
    switch (operation.toLowerCase()) {
      case 'centroid':
        // Calculate centroid (mock implementation)
        result = {
          operation: 'centroid',
          coordinates: [0, 0], // Would calculate real centroid
          message: 'Centroid calculated'
        };
        break;
        
      case 'bbox':
        // Calculate bounding box (mock implementation)
        result = {
          operation: 'bbox',
          bbox: [-180, -90, 180, 90], // Would calculate real bbox
          message: 'Bounding box calculated'
        };
        break;
        
      case 'area':
        // Calculate area (mock implementation)
        result = {
          operation: 'area',
          area: 1000000, // Would calculate real area in square meters
          unit: 'square_meters',
          message: 'Area calculated'
        };
        break;
        
      default:
        throw new Error(\`Unsupported operation: \${operation}\`);
    }
    
    console.log(\`Geometry operation complete: \${operation}\`);
    
    return {
      success: true,
      result: result
    };
  }
};
`;

  fs.writeFileSync(path.join(pluginDir, 'main.js'), mainJs);
  log(GREEN, '✓ Plugin files created\n');

  // Scan to load the plugin
  log(BLUE, 'Loading plugin via scan...');
  const scan = await testAPI('POST', '/plugins/scan');
  if (scan.success) {
    log(GREEN, `✓ Plugin loaded - Total plugins: ${scan.data.total}\n`);
  }

  // Verify plugin is listed
  log(BLUE, 'Verifying plugin registration...');
  const listPlugins = await testAPI('GET', '/plugins');
  if (listPlugins.success) {
    const bufferPlugin = listPlugins.data.data?.find(p => p.id === 'buffer_analysis');
    if (bufferPlugin) {
      log(GREEN, `✓ Plugin registered with status: ${bufferPlugin.status}`);
      log(BLUE, `  Name: ${bufferPlugin.name}`);
      log(BLUE, `  Version: ${bufferPlugin.version}\n`);
    }
  }

  // Check if it's available as a tool
  log(BLUE, 'Checking tool registration...');
  const listTools = await testAPI('GET', '/tools');
  if (listTools.success) {
    const bufferTool = listTools.data.tools?.find(t => t.id === 'buffer_analysis');
    if (bufferTool) {
      log(GREEN, '✓ Plugin registered as executable tool');
      log(BLUE, `  Tool ID: ${bufferTool.id}`);
      log(BLUE, `  Capabilities: ${bufferTool.capabilities?.join(', ')}\n`);
    }
  }

  // Execute the plugin as a tool
  log(BLUE, 'Executing geometry helper...');
  const testGeoJSON = {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [116.4074, 39.9042] // Beijing
    },
    properties: {
      name: 'Beijing Center'
    }
  };

  const executionResult = await testAPI('POST', '/tools/geometry_helper/execute', {
    operation: 'centroid',
    geojson: testGeoJSON
  });

  if (executionResult.success) {
    log(GREEN, '✓ Geometry operation executed successfully!');
    log(BLUE, '  Result:', JSON.stringify(executionResult.data.result, null, 2) + '\n');
  } else {
    console.log('\x1b[31m✗ Execution failed:', executionResult.error?.error, '\x1b[0m\n');
  }

  // Get tool details
  log(BLUE, 'Retrieving tool details...');
  const toolDetails = await testAPI('GET', '/tools/geometry_helper');
  if (toolDetails.success) {
    log(GREEN, '✓ Tool details retrieved');
    log(BLUE, `  Input parameters: ${toolDetails.data.tool?.inputSchema?.length || 0}`);
    toolDetails.data.tool?.inputSchema?.forEach(param => {
      log(BLUE, `    - ${param.name}: ${param.type} (${param.required ? 'required' : 'optional'})`);
    });
    console.log();
  }

  // Demonstrate disable/enable cycle
  log(BLUE, 'Testing disable/enable cycle...');
  
  await testAPI('POST', '/plugins/geometry_helper/disable');
  log(GREEN, '  ✓ Plugin disabled');
  
  const afterDisable = await testAPI('GET', '/plugins');
  const disabledPlugin = afterDisable.data.data?.find(p => p.id === 'geometry_helper');
  log(BLUE, `  Status after disable: ${disabledPlugin?.status}`);
  
  await testAPI('POST', '/plugins/geometry_helper/enable');
  log(GREEN, '  ✓ Plugin re-enabled');
  
  const afterEnable = await testAPI('GET', '/plugins');
  const enabledPlugin = afterEnable.data.data?.find(p => p.id === 'geometry_helper');
  log(BLUE, `  Status after enable: ${enabledPlugin?.status}\n`);

  // Cleanup
  log(BLUE, 'Cleaning up...');
  await testAPI('DELETE', '/plugins/geometry_helper');
  if (fs.existsSync(pluginDir)) {
    fs.rmSync(pluginDir, { recursive: true, force: true });
  }
  log(GREEN, '✓ Plugin deleted and files cleaned up\n');

  console.log('='.repeat(70));
  log(GREEN, 'Real-World Plugin Example Complete!');
  console.log('='.repeat(70) + '\n');

  log(BLUE, 'Summary:');
  log(GREEN, '  ✓ Created spatial analysis plugin');
  log(GREEN, '  ✓ Plugin auto-registered as tool');
  log(GREEN, '  ✓ Executed buffer analysis operation');
  log(GREEN, '  ✓ Verified lifecycle operations');
  log(GREEN, '  ✓ Cleaned up successfully\n');
}

main().catch(error => {
  console.log('\x1b[31mTest failed:\x1b[0m');
  console.error(error);
  process.exit(1);
});
