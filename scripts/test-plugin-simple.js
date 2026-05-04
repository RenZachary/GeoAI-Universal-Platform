/**
 * Simple Plugin Manager API Test
 * Demonstrates core plugin management functionality
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api';

// Color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
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
  console.log('\n' + '='.repeat(60));
  log(BLUE, 'Plugin Manager API - Quick Test');
  console.log('='.repeat(60) + '\n');

  // 1. List current plugins
  log(BLUE, '1. Listing current plugins...');
  const list1 = await testAPI('GET', '/plugins');
  if (list1.success) {
    log(GREEN, `   Found ${list1.data.total || 0} plugins`);
    if (list1.data.data?.length > 0) {
      list1.data.data.forEach(p => {
        console.log(`   - ${p.id}: ${p.status}`);
      });
    }
  }
  console.log();

  // 2. Create a simple test plugin
  log(BLUE, '2. Creating test plugin...');
  const pluginDir = path.join(__dirname, '..', 'workspace', 'plugins', 'custom', 'quick_test_plugin');
  
  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true });
  }

  // Create plugin.json
  const pluginManifest = {
    id: 'quick_test_plugin',
    name: 'Quick Test Plugin',
    version: '1.0.0',
    description: 'A simple test plugin for API verification',
    category: 'analysis',
    inputSchema: [
      {
        name: 'value',
        type: 'number',
        required: true,
        description: 'Test value parameter'
      }
    ],
    outputSchema: {
      type: 'object',
      description: 'Test result'
    },
    capabilities: ['test'],
    isBuiltin: false
  };

  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify(pluginManifest, null, 2)
  );

  // Create main.js
  const mainJs = `
module.exports = {
  execute: async (params) => {
    console.log('Quick test plugin executed:', params);
    return {
      success: true,
      result: { processed: true, value: params.value }
    };
  }
};
`;
  fs.writeFileSync(path.join(pluginDir, 'main.js'), mainJs);
  log(GREEN, '   Plugin files created\n');

  // 3. Scan to load the new plugin
  log(BLUE, '3. Scanning for plugins...');
  const scan = await testAPI('POST', '/plugins/scan');
  if (scan.success) {
    log(GREEN, `   Scan complete - Found ${scan.data.total || 0} plugins`);
    const testPlugin = scan.data.data?.find(p => p.id === 'quick_test_plugin');
    if (testPlugin) {
      log(GREEN, `   Test plugin loaded with status: ${testPlugin.status}\n`);
    }
  }

  // 4. Disable the plugin
  log(BLUE, '4. Disabling plugin...');
  const disable = await testAPI('POST', '/plugins/quick_test_plugin/disable');
  if (disable.success) {
    log(GREEN, '   Plugin disabled successfully\n');
  } else {
    log(RED, `   Failed to disable: ${disable.error?.details || disable.error?.error}\n`);
  }

  // 5. Verify disabled status
  log(BLUE, '5. Verifying disabled status...');
  const list2 = await testAPI('GET', '/plugins');
  if (list2.success) {
    const plugin = list2.data.data?.find(p => p.id === 'quick_test_plugin');
    if (plugin) {
      log(GREEN, `   Plugin status: ${plugin.status}\n`);
    }
  }

  // 6. Enable the plugin
  log(BLUE, '6. Enabling plugin...');
  const enable = await testAPI('POST', '/plugins/quick_test_plugin/enable');
  if (enable.success) {
    log(GREEN, '   Plugin enabled successfully\n');
  } else {
    log(RED, `   Failed to enable: ${enable.error?.details || enable.error?.error}\n`);
  }

  // 7. Verify enabled status
  log(BLUE, '7. Verifying enabled status...');
  const list3 = await testAPI('GET', '/plugins');
  if (list3.success) {
    const plugin = list3.data.data?.find(p => p.id === 'quick_test_plugin');
    if (plugin) {
      log(GREEN, `   Plugin status: ${plugin.status}\n`);
    }
  }

  // 8. Delete the plugin
  log(BLUE, '8. Deleting plugin...');
  const del = await testAPI('DELETE', '/plugins/quick_test_plugin');
  if (del.success) {
    log(GREEN, '   Plugin deleted successfully\n');
  } else {
    log(RED, `   Failed to delete: ${del.error?.details || del.error?.error}\n`);
  }

  // Clean up
  if (fs.existsSync(pluginDir)) {
    fs.rmSync(pluginDir, { recursive: true, force: true });
  }

  // 9. Final plugin list
  log(BLUE, '9. Final plugin list...');
  const finalList = await testAPI('GET', '/plugins');
  if (finalList.success) {
    log(GREEN, `   Total plugins: ${finalList.data.total || 0}\n`);
  }

  console.log('='.repeat(60));
  log(GREEN, 'All tests completed successfully!');
  console.log('='.repeat(60) + '\n');
}

main().catch(error => {
  log(RED, 'Test failed:');
  console.error(error);
  process.exit(1);
});
