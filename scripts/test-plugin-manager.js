/**
 * Plugin Manager API Test Script
 * Tests all plugin management endpoints
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(colors.green, `✓ ${message}`);
}

function logError(message) {
  log(colors.red, `✗ ${message}`);
}

function logInfo(message) {
  log(colors.blue, `ℹ ${message}`);
}

function logWarning(message) {
  log(colors.yellow, `⚠ ${message}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(colors.cyan, title);
  console.log('='.repeat(60));
}

async function testEndpoint(name, method, url, data = null, expectedStatus = 200) {
  try {
    logInfo(`Testing: ${name}`);
    logInfo(`URL: ${method.toUpperCase()} ${url}`);
    
    const config = {
      method: method.toLowerCase(),
      url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    
    if (response.status === expectedStatus) {
      logSuccess(`${name} - Status: ${response.status}`);
      logInfo('Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } else {
      logError(`${name} - Expected status ${expectedStatus}, got ${response.status}`);
      logInfo('Response:', JSON.stringify(response.data, null, 2));
      return null;
    }
  } catch (error) {
    if (error.response) {
      logError(`${name} - Status: ${error.response.status}`);
      logInfo('Error Response:', JSON.stringify(error.response.data, null, 2));
      return error.response.data;
    } else {
      logError(`${name} - ${error.message}`);
      return null;
    }
  }
}

async function runTests() {
  logSection('Plugin Manager API Tests');
  
  // Test 1: List all plugins
  logSection('Test 1: List All Plugins');
  const listResult = await testEndpoint(
    'List Plugins',
    'GET',
    '/plugins'
  );
  
  if (listResult && listResult.success) {
    logSuccess(`Found ${listResult.total || 0} plugins`);
    if (listResult.data && listResult.data.length > 0) {
      logInfo('Plugins:', listResult.data.map(p => `${p.id} (${p.status})`).join(', '));
    }
  }
  
  // Test 2: Scan plugins directory
  logSection('Test 2: Scan Plugins Directory');
  const scanResult = await testEndpoint(
    'Scan Plugins',
    'POST',
    '/plugins/scan'
  );
  
  if (scanResult && scanResult.success) {
    logSuccess(`Scan completed - Found ${scanResult.total || 0} plugins`);
  }
  
  // Test 3: Create a test plugin
  logSection('Test 3: Create Test Plugin');
  const fs = require('fs');
  const path = require('path');
  
  const pluginDir = path.join(__dirname, '..', 'workspace', 'plugins', 'custom', 'test_buffer_plugin');
  const manifestPath = path.join(pluginDir, 'plugin.json');
  const mainPath = path.join(pluginDir, 'main.js');
  
  // Create plugin directory
  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true });
    logSuccess(`Created plugin directory: ${pluginDir}`);
  }
  
  // Create manifest.json
  const manifest = {
    id: 'test_buffer_plugin',
    name: 'Test Buffer Plugin',
    version: '1.0.0',
    description: 'A test plugin for buffer analysis',
    category: 'analysis',
    inputSchema: [
      {
        name: 'distance',
        type: 'number',
        required: true,
        description: 'Buffer distance in meters'
      }
    ],
    outputSchema: {
      type: 'geojson',
      description: 'Buffered geometry'
    },
    capabilities: ['buffer'],
    isBuiltin: false
  };
  
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  logSuccess('Created manifest.json');
  
  // Create main.js
  const mainJs = `
module.exports = {
  execute: async (params) => {
    console.log('Test buffer plugin executed with params:', params);
    return {
      success: true,
      result: {
        type: 'FeatureCollection',
        features: []
      }
    };
  }
};
`;
  
  fs.writeFileSync(mainPath, mainJs);
  logSuccess('Created main.js');
  
  // Test 4: Rescan after adding plugin
  logSection('Test 4: Rescan After Adding Plugin');
  const rescanResult = await testEndpoint(
    'Rescan Plugins',
    'POST',
    '/plugins/scan'
  );
  
  if (rescanResult && rescanResult.success) {
    logSuccess(`Rescan completed - Found ${rescanResult.total || 0} plugins`);
    if (rescanResult.data) {
      const testPlugin = rescanResult.data.find(p => p.id === 'test_buffer_plugin');
      if (testPlugin) {
        logSuccess('Test plugin found!');
        logInfo('Plugin status:', testPlugin.status);
      } else {
        logWarning('Test plugin not found in scan results');
      }
    }
  }
  
  // Test 5: List plugins again to see the new plugin
  logSection('Test 5: List Plugins After Addition');
  const listAfterAdd = await testEndpoint(
    'List Plugins After Add',
    'GET',
    '/plugins'
  );
  
  if (listAfterAdd && listAfterAdd.success) {
    logSuccess(`Total plugins: ${listAfterAdd.total || 0}`);
    if (listAfterAdd.data) {
      listAfterAdd.data.forEach(plugin => {
        logInfo(`  - ${plugin.id}: ${plugin.status}`);
      });
    }
  }
  
  // Test 6: Disable the test plugin
  logSection('Test 6: Disable Test Plugin');
  const disableResult = await testEndpoint(
    'Disable Plugin',
    'POST',
    '/plugins/test_buffer_plugin/disable'
  );
  
  if (disableResult && disableResult.success) {
    logSuccess('Plugin disabled successfully');
  }
  
  // Test 7: List plugins to verify disabled status
  logSection('Test 7: Verify Disabled Status');
  const listAfterDisable = await testEndpoint(
    'List Plugins After Disable',
    'GET',
    '/plugins'
  );
  
  if (listAfterDisable && listAfterDisable.success) {
    const testPlugin = listAfterDisable.data?.find(p => p.id === 'test_buffer_plugin');
    if (testPlugin) {
      logInfo(`Plugin status: ${testPlugin.status}`);
      if (testPlugin.status === 'disabled') {
        logSuccess('Plugin correctly shows as disabled');
      } else {
        logWarning(`Expected 'disabled' status, got '${testPlugin.status}'`);
      }
    }
  }
  
  // Test 8: Enable the test plugin
  logSection('Test 8: Enable Test Plugin');
  const enableResult = await testEndpoint(
    'Enable Plugin',
    'POST',
    '/plugins/test_buffer_plugin/enable'
  );
  
  if (enableResult && enableResult.success) {
    logSuccess('Plugin enabled successfully');
  }
  
  // Test 9: List plugins to verify enabled status
  logSection('Test 9: Verify Enabled Status');
  const listAfterEnable = await testEndpoint(
    'List Plugins After Enable',
    'GET',
    '/plugins'
  );
  
  if (listAfterEnable && listAfterEnable.success) {
    const testPlugin = listAfterEnable.data?.find(p => p.id === 'test_buffer_plugin');
    if (testPlugin) {
      logInfo(`Plugin status: ${testPlugin.status}`);
      if (testPlugin.status === 'enabled') {
        logSuccess('Plugin correctly shows as enabled');
      } else {
        logWarning(`Expected 'enabled' status, got '${testPlugin.status}'`);
      }
    }
  }
  
  // Test 10: Upload plugin endpoint (should return 501 - not implemented)
  logSection('Test 10: Upload Plugin Endpoint');
  const uploadResult = await testEndpoint(
    'Upload Plugin',
    'POST',
    '/plugins/upload',
    {},
    501
  );
  
  if (uploadResult) {
    logInfo('Upload endpoint response:', uploadResult.message || uploadResult.error);
  }
  
  // Test 11: Delete the test plugin
  logSection('Test 11: Delete Test Plugin');
  const deleteResult = await testEndpoint(
    'Delete Plugin',
    'DELETE',
    '/plugins/test_buffer_plugin'
  );
  
  if (deleteResult && deleteResult.success) {
    logSuccess('Plugin deleted successfully');
  }
  
  // Clean up files
  if (fs.existsSync(pluginDir)) {
    fs.rmSync(pluginDir, { recursive: true, force: true });
    logSuccess('Cleaned up test plugin directory');
  }
  
  // Test 12: Final plugin list
  logSection('Test 12: Final Plugin List');
  const finalList = await testEndpoint(
    'Final Plugin List',
    'GET',
    '/plugins'
  );
  
  if (finalList && finalList.success) {
    logSuccess(`Final plugin count: ${finalList.total || 0}`);
  }
  
  logSection('All Tests Completed');
  logInfo('Check the output above for test results');
}

// Run tests
runTests().catch(error => {
  logError('Test suite failed:');
  console.error(error);
  process.exit(1);
});
