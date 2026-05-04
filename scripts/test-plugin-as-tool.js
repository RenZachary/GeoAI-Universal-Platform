/**
 * Test Plugin as Tool Integration
 * Verifies that custom plugins are registered as executable tools
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api';

// Color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
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
  log(CYAN, 'Plugin-to-Tool Integration Test');
  console.log('='.repeat(70) + '\n');

  // Step 1: Create a test plugin
  log(BLUE, 'Step 1: Creating test plugin...');
  const pluginDir = path.join(__dirname, '..', 'workspace', 'plugins', 'custom', 'tool_test_plugin');
  
  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true });
  }

  const pluginManifest = {
    id: 'tool_test_plugin',
    name: 'Tool Test Plugin',
    version: '1.0.0',
    description: 'A plugin to test tool registration and execution',
    category: 'analysis',
    inputSchema: [
      {
        name: 'input_value',
        type: 'number',
        required: true,
        description: 'Input value to process'
      },
      {
        name: 'multiplier',
        type: 'number',
        required: false,
        default: 2,
        description: 'Multiplier for the input value'
      }
    ],
    outputSchema: {
      type: 'object',
      description: 'Processed result with calculated value'
    },
    capabilities: ['calculation', 'test'],
    isBuiltin: false
  };

  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify(pluginManifest, null, 2)
  );

  const mainJs = `
module.exports = {
  execute: async (params) => {
    const inputValue = params.input_value || 0;
    const multiplier = params.multiplier || 2;
    const result = inputValue * multiplier;
    
    console.log(\`Tool Test Plugin executed: \${inputValue} * \${multiplier} = \${result}\`);
    
    return {
      success: true,
      result: {
        input: inputValue,
        multiplier: multiplier,
        output: result,
        formula: \`\${inputValue} * \${multiplier} = \${result}\`
      }
    };
  }
};
`;
  fs.writeFileSync(path.join(pluginDir, 'main.js'), mainJs);
  log(GREEN, '   ✓ Plugin created\n');

  // Step 2: Scan to load the plugin
  log(BLUE, 'Step 2: Scanning plugins...');
  const scan = await testAPI('POST', '/plugins/scan');
  if (scan.success) {
    log(GREEN, `   ✓ Scan complete - ${scan.data.total} plugins found\n`);
  }

  // Step 3: List all tools to verify plugin is registered
  log(BLUE, 'Step 3: Listing available tools...');
  const toolsList = await testAPI('GET', '/tools');
  if (toolsList.success) {
    log(GREEN, `   ✓ Found ${toolsList.data.count || 0} tools`);
    
    const toolTestPlugin = toolsList.data.tools?.find(t => t.id === 'tool_test_plugin');
    if (toolTestPlugin) {
      log(GREEN, '   ✓ Plugin registered as tool!');
      log(BLUE, `     Tool ID: ${toolTestPlugin.id}`);
      log(BLUE, `     Tool Name: ${toolTestPlugin.name}`);
      log(BLUE, `     Description: ${toolTestPlugin.description}\n`);
    } else {
      log(RED, '   ✗ Plugin NOT found in tools list\n');
    }
  }

  // Step 4: Get specific tool details
  log(BLUE, 'Step 4: Getting tool details...');
  const toolDetails = await testAPI('GET', '/tools/tool_test_plugin');
  if (toolDetails.success) {
    log(GREEN, '   ✓ Tool details retrieved');
    log(BLUE, `     Input Schema: ${JSON.stringify(toolDetails.data.tool?.inputSchema?.length || 0)} parameters`);
    log(BLUE, `     Capabilities: ${toolDetails.data.tool?.capabilities?.join(', ')}\n`);
  } else {
    log(RED, `   ✗ Failed to get tool details: ${toolDetails.error?.error}\n`);
  }

  // Step 5: Execute the tool
  log(BLUE, 'Step 5: Executing tool...');
  const executionResult = await testAPI('POST', '/tools/tool_test_plugin/execute', {
    input_value: 10,
    multiplier: 3
  });
  
  if (executionResult.success) {
    log(GREEN, '   ✓ Tool executed successfully!');
    log(BLUE, `     Result: ${JSON.stringify(executionResult.data.result, null, 2)}\n`);
  } else {
    log(RED, `   ✗ Execution failed: ${executionResult.error?.error}`);
    if (executionResult.error?.details) {
      log(RED, `     Details: ${executionResult.error.details}\n`);
    }
  }

  // Step 6: Execute with different parameters
  log(BLUE, 'Step 6: Executing with different parameters...');
  const executionResult2 = await testAPI('POST', '/tools/tool_test_plugin/execute', {
    input_value: 25,
    multiplier: 4
  });
  
  if (executionResult2.success) {
    log(GREEN, '   ✓ Second execution successful!');
    log(BLUE, `     Result: ${executionResult2.data.result?.formula}\n`);
  }

  // Step 7: Disable the plugin
  log(BLUE, 'Step 7: Disabling plugin...');
  const disable = await testAPI('POST', '/plugins/tool_test_plugin/disable');
  if (disable.success) {
    log(GREEN, '   ✓ Plugin disabled\n');
  }

  // Step 8: Verify tool is no longer available
  log(BLUE, 'Step 8: Verifying tool is unregistered...');
  const toolsAfterDisable = await testAPI('GET', '/tools');
  if (toolsAfterDisable.success) {
    const stillRegistered = toolsAfterDisable.data.tools?.find(t => t.id === 'tool_test_plugin');
    if (!stillRegistered) {
      log(GREEN, '   ✓ Tool correctly unregistered after disable\n');
    } else {
      log(RED, '   ✗ Tool still registered (unexpected)\n');
    }
  }

  // Step 9: Re-enable the plugin
  log(BLUE, 'Step 9: Re-enabling plugin...');
  const enable = await testAPI('POST', '/plugins/tool_test_plugin/enable');
  if (enable.success) {
    log(GREEN, '   ✓ Plugin re-enabled\n');
  }

  // Step 10: Verify tool is available again
  log(BLUE, 'Step 10: Verifying tool is re-registered...');
  const toolsAfterEnable = await testAPI('GET', '/tools');
  if (toolsAfterEnable.success) {
    const reRegistered = toolsAfterEnable.data.tools?.find(t => t.id === 'tool_test_plugin');
    if (reRegistered) {
      log(GREEN, '   ✓ Tool correctly re-registered after enable\n');
    } else {
      log(RED, '   ✗ Tool not re-registered (unexpected)\n');
    }
  }

  // Cleanup
  log(BLUE, 'Cleanup: Removing test plugin...');
  const del = await testAPI('DELETE', '/plugins/tool_test_plugin');
  if (del.success) {
    log(GREEN, '   ✓ Plugin deleted\n');
  }

  if (fs.existsSync(pluginDir)) {
    fs.rmSync(pluginDir, { recursive: true, force: true });
  }

  console.log('='.repeat(70));
  log(GREEN, 'Plugin-to-Tool Integration Test Complete!');
  console.log('='.repeat(70) + '\n');
}

main().catch(error => {
  log(RED, 'Test failed:');
  console.error(error);
  process.exit(1);
});
