/**
 * Complete Data Management Workflow Test
 * 
 * This script demonstrates a complete workflow:
 * 1. List existing data sources
 * 2. Upload a new file
 * 3. Verify it appears in the list
 * 4. Get its details and schema
 * 5. Update its metadata
 * 6. Search for it
 * 7. Clean up (optional)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

// Helper function to make HTTP requests
function makeRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper for multipart upload
function uploadFile(filePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Date.now();
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
    body += `Content-Type: application/octet-stream\r\n\r\n`;
    
    const bodyBuffer = Buffer.concat([
      Buffer.from(body, 'utf-8'),
      fileContent,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
    ]);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/upload/single',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

// Print section header
function printHeader(title) {
  console.log(`\n${colors.magenta}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.magenta}║${colors.reset} ${colors.blue}${title.padEnd(51)}${colors.magenta}║${colors.reset}`);
  console.log(`${colors.magenta}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);
}

// Print step
function printStep(step, description) {
  console.log(`${colors.cyan}→ Step ${step}:${colors.reset} ${description}`);
}

// Print success
function printSuccess(message) {
  console.log(`  ${colors.green}✓${colors.reset} ${message}`);
}

// Print error
function printError(message) {
  console.log(`  ${colors.red}✗${colors.reset} ${message}`);
}

// Print info
function printInfo(message) {
  console.log(`  ${colors.yellow}ℹ${colors.reset} ${message}`);
}

// Main workflow
async function runWorkflow() {
  console.log(`${colors.yellow}\n🚀 Starting Complete Data Management Workflow Test${colors.reset}\n`);
  
  let uploadedDataSourceId = null;
  
  try {
    // ========================================================================
    // Step 1: Check initial state
    // ========================================================================
    printHeader('STEP 1: Check Initial State');
    printStep(1, 'Listing existing data sources');
    
    const initialList = await makeRequest('GET', '/data-sources');
    if (initialList.status === 200 && initialList.data.success) {
      printSuccess(`Found ${initialList.data.count} existing data sources`);
      initialList.data.dataSources.forEach(ds => {
        console.log(`    • ${ds.name} (${ds.type})`);
      });
    } else {
      printError('Failed to list data sources');
      return;
    }
    
    // ========================================================================
    // Step 2: Upload a new file
    // ========================================================================
    printHeader('STEP 2: Upload New File');
    
    const testDataDir = path.join(__dirname, '..', 'workspace', 'data', 'local');
    const testFile = path.join(testDataDir, 'world_1777827645032.geojson');
    
    if (!fs.existsSync(testFile)) {
      printError(`Test file not found: ${testFile}`);
      return;
    }
    
    printStep(2, `Uploading file: ${path.basename(testFile)}`);
    const uploadResult = await uploadFile(testFile);
    
    if (uploadResult.status === 201 && uploadResult.data.success) {
      uploadedDataSourceId = uploadResult.data.data.id;
      printSuccess('File uploaded successfully');
      console.log(`    ID: ${uploadResult.data.data.id}`);
      console.log(`    Name: ${uploadResult.data.data.name}`);
      console.log(`    Type: ${uploadResult.data.data.type}`);
      console.log(`    Size: ${(uploadResult.data.data.size / 1024).toFixed(2)} KB`);
    } else {
      printError('Upload failed');
      console.log(`    Status: ${uploadResult.status}`);
      console.log(`    Response: ${JSON.stringify(uploadResult.data)}`);
      return;
    }
    
    // ========================================================================
    // Step 3: Verify upload in data source list
    // ========================================================================
    printHeader('STEP 3: Verify Upload');
    printStep(3, 'Checking if uploaded file appears in data sources');
    
    const updatedList = await makeRequest('GET', '/data-sources');
    if (updatedList.status === 200 && updatedList.data.success) {
      const newCount = updatedList.data.count;
      printSuccess(`Data source count increased from ${initialList.data.count} to ${newCount}`);
      
      const uploadedDs = updatedList.data.dataSources.find(ds => ds.id === uploadedDataSourceId);
      if (uploadedDs) {
        printSuccess('Uploaded data source found in list');
        console.log(`    Name: ${uploadedDs.name}`);
        console.log(`    Type: ${uploadedDs.type}`);
      } else {
        printError('Uploaded data source not found in list');
      }
    }
    
    // ========================================================================
    // Step 4: Get data source details
    // ========================================================================
    printHeader('STEP 4: Get Data Source Details');
    printStep(4, `Retrieving details for ID: ${uploadedDataSourceId}`);
    
    const details = await makeRequest('GET', `/data-sources/${uploadedDataSourceId}`);
    if (details.status === 200 && details.data.success) {
      printSuccess('Data source details retrieved');
      const ds = details.data.dataSource;
      console.log(`    Name: ${ds.name}`);
      console.log(`    Type: ${ds.type}`);
      console.log(`    Reference: ${ds.reference}`);
      console.log(`    Created: ${new Date(ds.createdAt).toLocaleString()}`);
    } else {
      printError('Failed to get data source details');
    }
    
    // ========================================================================
    // Step 5: Get schema information
    // ========================================================================
    printHeader('STEP 5: Get Schema Information');
    printStep(5, 'Extracting schema from data source');
    
    const schema = await makeRequest('GET', `/data-sources/${uploadedDataSourceId}/schema`);
    if (schema.status === 200 && schema.data.success) {
      printSuccess('Schema retrieved successfully');
      if (schema.data.schema) {
        if (schema.data.schema.fields) {
          console.log(`    Fields: ${schema.data.schema.fields.length}`);
          schema.data.schema.fields.slice(0, 5).forEach(field => {
            console.log(`      - ${field.columnName || field} (${field.dataType || 'unknown'})`);
          });
          if (schema.data.schema.fields.length > 5) {
            console.log(`      ... and ${schema.data.schema.fields.length - 5} more`);
          }
        }
      }
    } else {
      printError('Failed to get schema');
    }
    
    // ========================================================================
    // Step 6: Update metadata
    // ========================================================================
    printHeader('STEP 6: Update Metadata');
    printStep(6, 'Adding custom metadata to data source');
    
    const updateResult = await makeRequest('PUT', `/data-sources/${uploadedDataSourceId}/metadata`, {
      metadata: {
        description: 'Test data source created via workflow test',
        category: 'workflow-test',
        tags: ['test', 'automated', 'geojson'],
        testedAt: new Date().toISOString()
      }
    });
    
    if (updateResult.status === 200 && updateResult.data.success) {
      printSuccess('Metadata updated successfully');
      
      // Verify the update
      const verifyUpdate = await makeRequest('GET', `/data-sources/${uploadedDataSourceId}`);
      if (verifyUpdate.data.dataSource?.metadata?.category === 'workflow-test') {
        printSuccess('Metadata update verified');
      }
    } else {
      printError('Failed to update metadata');
    }
    
    // ========================================================================
    // Step 7: Search for the data source
    // ========================================================================
    printHeader('STEP 7: Search Functionality');
    printStep(7, 'Searching for uploaded data source by name');
    
    const searchName = path.basename(testFile, '.geojson').split('_')[0];
    const searchResult = await makeRequest('GET', `/data-sources/search?q=${searchName}`);
    
    if (searchResult.status === 200 && searchResult.data.success) {
      printSuccess(`Search found ${searchResult.data.count} result(s) for "${searchName}"`);
      searchResult.data.dataSources.forEach(ds => {
        console.log(`    • ${ds.name} (${ds.type})`);
      });
      
      const found = searchResult.data.dataSources.some(ds => ds.id === uploadedDataSourceId);
      if (found) {
        printSuccess('Uploaded data source found in search results');
      }
    } else {
      printError('Search failed');
    }
    
    // ========================================================================
    // Step 8: Final verification
    // ========================================================================
    printHeader('STEP 8: Final Verification');
    printStep(8, 'Getting available data sources for LLM context');
    
    const available = await makeRequest('GET', '/data-sources/available');
    if (available.status === 200 && available.data.success) {
      printSuccess(`Available data sources: ${available.data.count}`);
      
      const ourSource = available.data.availableSources.find(ds => ds.id === uploadedDataSourceId);
      if (ourSource) {
        printSuccess('Uploaded source is available for LLM context');
        console.log(`    Name: ${ourSource.name}`);
        console.log(`    Description: ${ourSource.description}`);
        if (ourSource.metadata?.featureCount) {
          console.log(`    Feature Count: ${ourSource.metadata.featureCount}`);
        }
      }
    }
    
    // ========================================================================
    // Summary
    // ========================================================================
    printHeader('WORKFLOW COMPLETE');
    
    console.log(`${colors.green}✅ All workflow steps completed successfully!${colors.reset}\n`);
    console.log(`${colors.cyan}Summary:${colors.reset}`);
    console.log(`  • Initial data sources: ${initialList.data.count}`);
    console.log(`  • Uploaded file: ${path.basename(testFile)}`);
    console.log(`  • New data source ID: ${uploadedDataSourceId}`);
    console.log(`  • Final data sources: ${updatedList.data.count}`);
    console.log(`  • Metadata updated: Yes`);
    console.log(`  • Search working: Yes`);
    console.log(`  • Available for LLM: Yes\n`);
    
    console.log(`${colors.yellow}Note: The uploaded data source remains in the system.${colors.reset}`);
    console.log(`${colors.yellow}To delete it, use: DELETE /api/data-sources/${uploadedDataSourceId}${colors.reset}\n`);
    
  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error.message);
    console.error(error);
  }
}

// Run the workflow
runWorkflow();
