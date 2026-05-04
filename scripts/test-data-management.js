/**
 * Data Management API Test Script
 * 
 * Tests all Data Source Management endpoints:
 * - List data sources
 * - Get data source by ID
 * - Get available data sources
 * - Search data sources
 * - Register PostGIS connection
 * - Get schema
 * - Update metadata
 * - Delete data source
 */

const http = require('http');

// Configuration
const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Helper function to make HTTP requests
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path.startsWith('/api') ? path : `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test result tracking
let passedTests = 0;
let failedTests = 0;
let totalTests = 0;

// Helper to print test results
function printTestResult(testName, success, details = '') {
  totalTests++;
  if (success) {
    passedTests++;
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    if (details) console.log(`  ${colors.cyan}${details}${colors.reset}`);
  } else {
    failedTests++;
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    if (details) console.log(`  ${colors.red}${details}${colors.reset}`);
  }
}

// Helper to print section headers
function printSection(title) {
  console.log(`\n${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}  ${title}${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════════════${colors.reset}\n`);
}

// Main test suite
async function runTests() {
  console.log(`${colors.yellow}Starting Data Management API Tests...${colors.reset}\n`);
  
  // ==========================================================================
  // Test 1: Health Check
  // ==========================================================================
  printSection('Test 1: Health Check');
  
  try {
    const healthResponse = await makeRequest('GET', '/health');
    printTestResult(
      'Health endpoint accessible',
      healthResponse.status === 200 && healthResponse.data.status === 'ok',
      `Status: ${healthResponse.status}`
    );
  } catch (error) {
    printTestResult('Health endpoint accessible', false, error.message);
  }
  
  // Fix: Health is not under /api, so test separately
  const healthReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/health',
    method: 'GET'
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        if (res.statusCode === 200 && jsonData.status === 'ok') {
          console.log(`${colors.green}✓${colors.reset} Health endpoint (direct)`);
        }
      } catch (e) {}
    });
  });
  healthReq.end();

  // ==========================================================================
  // Test 2: List All Data Sources (Initial State)
  // ==========================================================================
  printSection('Test 2: List Data Sources');
  
  try {
    const listResponse = await makeRequest('GET', '/data-sources');
    printTestResult(
      'List data sources endpoint',
      listResponse.status === 200 && listResponse.data.success === true,
      `Count: ${listResponse.data.count || 0}, Status: ${listResponse.status}`
    );
    
    if (listResponse.data.dataSources) {
      console.log(`  Found ${listResponse.data.dataSources.length} data sources:`);
      listResponse.data.dataSources.forEach(ds => {
        console.log(`    - ${ds.name} (${ds.type})`);
      });
    }
  } catch (error) {
    printTestResult('List data sources endpoint', false, error.message);
  }

  // ==========================================================================
  // Test 3: Get Available Data Sources
  // ==========================================================================
  printSection('Test 3: Get Available Data Sources');
  
  try {
    const availableResponse = await makeRequest('GET', '/data-sources/available');
    printTestResult(
      'Get available data sources endpoint',
      availableResponse.status === 200 && availableResponse.data.success === true,
      `Available count: ${availableResponse.data.count || 0}`
    );
    
    if (availableResponse.data.availableSources) {
      console.log(`  Available sources: ${availableResponse.data.availableSources.length}`);
      availableResponse.data.availableSources.forEach(source => {
        console.log(`    - ${source.name} (${source.type})`);
      });
    }
  } catch (error) {
    printTestResult('Get available data sources endpoint', false, error.message);
  }

  // ==========================================================================
  // Test 4: Search Data Sources
  // ==========================================================================
  printSection('Test 4: Search Data Sources');
  
  try {
    // Test with missing query parameter (no ?q= at all)
    const searchNoParamResponse = await makeRequest('GET', '/data-sources/search');
    printTestResult(
      'Search without query parameter returns error',
      searchNoParamResponse.status === 400 || searchNoParamResponse.status === 404,
      `Status: ${searchNoParamResponse.status}`
    );
    
    // Test with valid query
    const searchResponse = await makeRequest('GET', '/data-sources/search?q=world');
    printTestResult(
      'Search with valid query',
      searchResponse.status === 200 && searchResponse.data.success === true,
      `Found: ${searchResponse.data.count || 0} results`
    );
    
    if (searchResponse.data.dataSources && searchResponse.data.dataSources.length > 0) {
      console.log('  Search results:');
      searchResponse.data.dataSources.forEach(ds => {
        console.log(`    - ${ds.name} (${ds.type})`);
      });
    }
  } catch (error) {
    printTestResult('Search data sources', false, error.message);
  }

  // ==========================================================================
  // Test 5: Register PostGIS Connection (if PostGIS is available)
  // ==========================================================================
  printSection('Test 5: Register PostGIS Connection');
  
  // Note: This test requires a running PostGIS instance
  // We'll test with mock credentials to see error handling
  
  const postgisConfig = {
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'postgres',
    password: 'test_password',
    schema: 'public',
    name: 'Test_PostGIS_Connection'
  };
  
  try {
    const postgisResponse = await makeRequest('POST', '/data-sources/postgis', postgisConfig);
    
    if (postgisResponse.status === 201 && postgisResponse.data.success === true) {
      printTestResult(
        'PostGIS connection registration',
        true,
        `Registered ${postgisResponse.data.dataSources?.length || 0} tables`
      );
      
      if (postgisResponse.data.dataSources) {
        console.log('  Registered tables:');
        postgisResponse.data.dataSources.forEach(table => {
          console.log(`    - ${table.name}: ${table.geometryType} (${table.rowCount} rows)`);
        });
      }
    } else if (postgisResponse.status === 400) {
      printTestResult(
        'PostGIS connection error handling',
        true,
        `Expected error: ${postgisResponse.data.error || 'Connection failed'}`
      );
    } else {
      printTestResult(
        'PostGIS connection registration',
        false,
        `Unexpected status: ${postgisResponse.status}`
      );
    }
  } catch (error) {
    printTestResult('PostGIS connection registration', false, error.message);
  }

  // ==========================================================================
  // Test 6: Get Data Source by ID (if any exist)
  // ==========================================================================
  printSection('Test 6: Get Data Source by ID');
  
  try {
    // First get the list to find an ID
    const listResponse = await makeRequest('GET', '/data-sources');
    
    if (listResponse.data.dataSources && listResponse.data.dataSources.length > 0) {
      const firstId = listResponse.data.dataSources[0].id;
      const getResponse = await makeRequest('GET', `/data-sources/${firstId}`);
      
      printTestResult(
        'Get data source by ID',
        getResponse.status === 200 && getResponse.data.success === true,
        `Retrieved: ${getResponse.data.dataSource?.name || 'N/A'}`
      );
    } else {
      printTestResult(
        'Get data source by ID',
        false,
        'No data sources available to test'
      );
    }
    
    // Test with non-existent ID
    const notFoundResponse = await makeRequest('GET', '/data-sources/non-existent-id');
    printTestResult(
      'Get non-existent data source returns 404',
      notFoundResponse.status === 404,
      `Status: ${notFoundResponse.status}`
    );
  } catch (error) {
    printTestResult('Get data source by ID', false, error.message);
  }

  // ==========================================================================
  // Test 7: Get Data Source Schema
  // ==========================================================================
  printSection('Test 7: Get Data Source Schema');
  
  try {
    const listResponse = await makeRequest('GET', '/data-sources');
    
    if (listResponse.data.dataSources && listResponse.data.dataSources.length > 0) {
      const firstId = listResponse.data.dataSources[0].id;
      const schemaResponse = await makeRequest('GET', `/data-sources/${firstId}/schema`);
      
      printTestResult(
        'Get data source schema',
        schemaResponse.status === 200 && schemaResponse.data.success === true,
        `Schema retrieved for: ${schemaResponse.data.dataSourceId}`
      );
      
      if (schemaResponse.data.schema) {
        console.log('  Schema preview:');
        console.log(`    Table: ${schemaResponse.data.schema.tableName || 'N/A'}`);
        console.log(`    Geometry Type: ${schemaResponse.data.schema.geometryType || 'N/A'}`);
        if (schemaResponse.data.schema.fields) {
          console.log(`    Fields: ${schemaResponse.data.schema.fields.length}`);
        }
      }
    } else {
      printTestResult(
        'Get data source schema',
        false,
        'No data sources available to test'
      );
    }
  } catch (error) {
    printTestResult('Get data source schema', false, error.message);
  }

  // ==========================================================================
  // Test 8: Update Metadata
  // ==========================================================================
  printSection('Test 8: Update Metadata');
  
  try {
    const listResponse = await makeRequest('GET', '/data-sources');
    
    if (listResponse.data.dataSources && listResponse.data.dataSources.length > 0) {
      const firstId = listResponse.data.dataSources[0].id;
      const updateResponse = await makeRequest('PUT', `/data-sources/${firstId}/metadata`, {
        metadata: {
          description: 'Updated via API test',
          customField: 'test_value',
          tags: ['test', 'api']
        }
      });
      
      printTestResult(
        'Update metadata',
        updateResponse.status === 200 && updateResponse.data.success === true,
        `Status: ${updateResponse.status}`
      );
      
      // Verify the update
      const verifyResponse = await makeRequest('GET', `/data-sources/${firstId}`);
      if (verifyResponse.data.dataSource?.metadata?.customField === 'test_value') {
        printTestResult(
          'Metadata update persisted',
          true,
          'Custom field verified'
        );
      } else {
        printTestResult(
          'Metadata update persisted',
          false,
          'Custom field not found in updated data source'
        );
      }
    } else {
      printTestResult(
        'Update metadata',
        false,
        'No data sources available to test'
      );
    }
  } catch (error) {
    printTestResult('Update metadata', false, error.message);
  }

  // ==========================================================================
  // Test 9: Validation Errors
  // ==========================================================================
  printSection('Test 9: Validation and Error Handling');
  
  try {
    // Test invalid PostGIS config (missing required fields)
    const invalidConfig = {
      host: 'localhost'
      // Missing: database, user, password
    };
    
    const validationResponse = await makeRequest('POST', '/data-sources/postgis', invalidConfig);
    printTestResult(
      'Validation rejects incomplete PostGIS config',
      validationResponse.status === 400,
      `Status: ${validationResponse.status}`
    );
    
    // Test invalid metadata update
    const listResponse = await makeRequest('GET', '/data-sources');
    if (listResponse.data.dataSources && listResponse.data.dataSources.length > 0) {
      const firstId = listResponse.data.dataSources[0].id;
      const badMetadataResponse = await makeRequest('PUT', `/data-sources/${firstId}/metadata`, {
        // Missing metadata field
        otherField: 'value'
      });
      
      printTestResult(
        'Validation rejects invalid metadata format',
        badMetadataResponse.status === 400,
        `Status: ${badMetadataResponse.status}`
      );
    }
  } catch (error) {
    printTestResult('Validation tests', false, error.message);
  }

  // ==========================================================================
  // Test Summary
  // ==========================================================================
  printSection('Test Summary');
  
  console.log(`\nTotal Tests: ${totalTests}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (failedTests === 0) {
    console.log(`\n${colors.green}🎉 All tests passed!${colors.reset}\n`);
  } else {
    console.log(`\n${colors.yellow}⚠️  Some tests failed. Review the output above.${colors.reset}\n`);
  }
}

// Run the tests
runTests().catch(error => {
  console.error(`${colors.red}Fatal error running tests:${colors.reset}`, error);
  process.exit(1);
});
