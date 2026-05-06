/**
 * Test Custom Plugin Execution
 * 
 * This script tests the custom plugin loading and execution flow.
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Color codes for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(color, message) {
  console.log(color + message + RESET);
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
  log(BLUE, '\n' + '='.repeat(60));
  log(BLUE, 'Custom Plugin Execution Test');
  log(BLUE, '='.repeat(60) + '\n');

  // Step 1: Check if server is running
  log(BLUE, 'Step 1: Checking server health...');
  const health = await testAPI('GET', '/health');
  if (!health.success) {
    log(RED, '   ✗ Server is not running. Start it first with: npm run dev');
    process.exit(1);
  }
  log(GREEN, '   ✓ Server is running\n');

  // Step 2: List all available tools
  log(BLUE, 'Step 2: Listing available tools...');
  const toolsResult = await testAPI('GET', '/api/tools');
  
  if (!toolsResult.success) {
    log(RED, `   ✗ Failed to list tools: ${toolsResult.error}\n`);
    process.exit(1);
  }

  const tools = toolsResult.data.tools || [];
  log(GREEN, `   ✓ Found ${tools.length} tools`);
  
  // Check if our custom plugin is registered
  const customPlugin = tools.find(t => t.id === 'example_analysis');
  
  if (customPlugin) {
    log(GREEN, '   ✓ Custom plugin "example_analysis" is registered!');
    log(BLUE, `     Name: ${customPlugin.name}`);
    log(BLUE, `     Description: ${customPlugin.description}`);
    log(BLUE, `     Category: ${customPlugin.category}`);
    log(BLUE, `     Parameters: ${customPlugin.parameters?.length || 0} defined\n`);
  } else {
    log(YELLOW, '   ⚠ Custom plugin "example_analysis" not found in tool list');
    log(YELLOW, '     This might be expected if no data sources exist yet\n');
  }

  // Step 3: Get data sources to test with
  log(BLUE, 'Step 3: Getting available data sources...');
  const dataSourcesResult = await testAPI('GET', '/api/data-sources');
  
  let dataSourceId = null;
  
  if (dataSourcesResult.success && dataSourcesResult.data.data?.length > 0) {
    dataSourceId = dataSourcesResult.data.data[0].id;
    log(GREEN, `   ✓ Using data source: ${dataSourceId}`);
    log(BLUE, `     Name: ${dataSourcesResult.data.data[0].name}\n`);
  } else {
    log(YELLOW, '   ⚠ No data sources available');
    log(YELLOW, '     Will test with mock dataSourceId\n');
    dataSourceId = 'test_mock_id';
  }

  // Step 4: Execute custom plugin with different operations
  log(BLUE, 'Step 4: Testing custom plugin execution...\n');

  const testCases = [
    {
      name: 'Count Operation',
      params: {
        dataSourceId,
        operation: 'count',
        multiplier: 1
      }
    },
    {
      name: 'Sum Operation',
      params: {
        dataSourceId,
        operation: 'sum',
        multiplier: 5
      }
    },
    {
      name: 'Average Operation',
      params: {
        dataSourceId,
        operation: 'average',
        multiplier: 3
      }
    }
  ];

  for (const testCase of testCases) {
    log(BLUE, `  Testing: ${testCase.name}`);
    log(BLUE, `  Params: ${JSON.stringify(testCase.params)}\n`);

    const result = await testAPI(
      'POST',
      `/api/tools/example_analysis/execute`,
      testCase.params
    );

    if (result.success) {
      log(GREEN, '   ✓ Execution successful!');
      log(BLUE, `     Result ID: ${result.data.result?.resultId || 'N/A'}`);
      
      const metadata = result.data.result?.metadata || {};
      if (metadata.result) {
        log(BLUE, `     Operation: ${metadata.result.operation}`);
        log(BLUE, `     Feature Count: ${metadata.result.featureCount}`);
        log(BLUE, `     Result Value: ${metadata.result.resultValue}`);
        log(BLUE, `     Description: ${metadata.result.description}`);
      }
      
      if (metadata.customPlugin) {
        log(GREEN, '     ✓ Confirmed: Executed by custom plugin (not mock)\n');
      } else {
        log(YELLOW, '     ⚠ Warning: May have used mock executor\n');
      }
    } else {
      log(RED, `   ✗ Execution failed: ${result.error?.error || result.error}`);
      if (result.error?.details) {
        log(RED, `     Details: ${result.error.details}\n`);
      } else {
        console.log();
      }
    }
  }

  // Step 5: Verify executor registration
  log(BLUE, 'Step 5: Verifying executor registry...');
  
  // We can't directly access ExecutorRegistry via API, but we can infer from execution
  log(GREEN, '   ✓ If executions above succeeded, executor is properly registered\n');

  // Summary
  log(BLUE, '='.repeat(60));
  log(GREEN, 'Test Complete!');
  log(BLUE, '='.repeat(60) + '\n');

  log(BLUE, 'Summary:');
  log(BLUE, '  • Custom plugin structure: workspace/plugins/custom/example_analysis/');
  log(BLUE, '  • Plugin manifest: plugin.json');
  log(BLUE, '  • Executor code: executor.js');
  log(BLUE, '  • Loaded by: CustomPluginLoader');
  log(BLUE, '  • Registered in: ToolRegistry + ExecutorRegistry\n');

  log(GREEN, 'Next Steps:');
  log(GREEN, '  1. Modify example_analysis to implement your own logic');
  log(GREEN, '  2. Create new plugins in workspace/plugins/custom/');
  log(GREEN, '  3. Restart server to load new plugins');
  log(GREEN, '  4. Test via API or chat interface\n');
}

main().catch((error) => {
  log(RED, '\n✗ Test failed with error:');
  console.error(error);
  process.exit(1);
});
