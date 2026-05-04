/**
 * Test: Verify Backend Metadata Extraction After Fresh Start
 * 
 * This test simulates a fresh start scenario:
 * 1. Delete database
 * 2. Upload a file through the API
 * 3. Verify metadata is correctly extracted
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function makeRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

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
          resolve({ status: res.statusCode, data: JSON.parse(data) });
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

async function testMetadataExtraction() {
  console.log(`${colors.yellow}\n🧪 Testing Backend Metadata Extraction${colors.reset}\n`);
  
  // Find a test GeoJSON file
  const testDataDir = path.join(__dirname, '..', 'workspace', 'data', 'local');
  const testFiles = fs.readdirSync(testDataDir).filter(f => f.endsWith('.geojson'));
  
  if (testFiles.length === 0) {
    console.log(`${colors.red}✗ No GeoJSON files found for testing${colors.reset}`);
    return;
  }
  
  const testFile = path.join(testDataDir, testFiles[0]);
  console.log(`${colors.cyan}Test file:${colors.reset} ${testFiles[0]}`);
  
  // Step 1: Upload file
  console.log(`\n${colors.blue}Step 1: Uploading file...${colors.reset}`);
  const uploadResult = await uploadFile(testFile);
  
  if (uploadResult.status !== 201 || !uploadResult.data.success) {
    console.log(`${colors.red}✗ Upload failed${colors.reset}`);
    console.log(JSON.stringify(uploadResult.data, null, 2));
    return;
  }
  
  console.log(`${colors.green}✓ File uploaded successfully${colors.reset}`);
  const dataSourceId = uploadResult.data.data.id;
  console.log(`  ID: ${dataSourceId}`);
  
  // Step 2: Get data source details
  console.log(`\n${colors.blue}Step 2: Retrieving data source details...${colors.reset}`);
  const detailsResult = await makeRequest('GET', `/data-sources/${dataSourceId}`);
  
  if (detailsResult.status !== 200 || !detailsResult.data.success) {
    console.log(`${colors.red}✗ Failed to get data source details${colors.reset}`);
    return;
  }
  
  const ds = detailsResult.data.dataSource;
  console.log(`${colors.green}✓ Data source retrieved${colors.reset}`);
  console.log(`  Name: ${ds.name}`);
  console.log(`  Type: ${ds.type}`);
  
  // Step 3: Check metadata
  console.log(`\n${colors.blue}Step 3: Checking metadata extraction...${colors.reset}`);
  const metadata = ds.metadata;
  
  console.log('\nMetadata fields:');
  console.log(`  featureCount: ${metadata.featureCount !== undefined ? colors.green + metadata.featureCount + colors.reset : colors.red + 'MISSING' + colors.reset}`);
  console.log(`  fields: ${metadata.fields && Array.isArray(metadata.fields) ? colors.green + `${metadata.fields.length} fields` + colors.reset : colors.red + 'MISSING' + colors.reset}`);
  console.log(`  crs: ${metadata.crs ? colors.green + metadata.crs + colors.reset : colors.red + 'MISSING' + colors.reset}`);
  console.log(`  fileSize: ${metadata.fileSize ? colors.green + `${(metadata.fileSize / 1024).toFixed(2)} KB` + colors.reset : colors.red + 'MISSING' + colors.reset}`);
  
  if (metadata.fields && metadata.fields.length > 0) {
    console.log(`\n  Field names (first 5):`);
    metadata.fields.slice(0, 5).forEach(field => {
      console.log(`    - ${field}`);
    });
  }
  
  // Step 4: Check available endpoint
  console.log(`\n${colors.blue}Step 4: Checking /available endpoint...${colors.reset}`);
  const availableResult = await makeRequest('GET', '/data-sources/available');
  
  if (availableResult.status === 200 && availableResult.data.success) {
    const availableDs = availableResult.data.availableSources.find(ds => ds.id === dataSourceId);
    if (availableDs) {
      console.log(`${colors.green}✓ Found in available sources${colors.reset}`);
      console.log(`  Description: ${availableDs.description}`);
      console.log(`  Feature count: ${availableDs.metadata?.featureCount !== undefined ? colors.green + availableDs.metadata.featureCount + colors.reset : colors.red + 'N/A' + colors.reset}`);
      
      if (availableDs.metadata?.featureCount !== undefined && availableDs.metadata.featureCount > 0) {
        console.log(`\n${colors.green}✅ SUCCESS: Metadata extraction working correctly!${colors.reset}`);
        console.log(`${colors.green}   Chat page will show correct record counts.${colors.reset}`);
      } else {
        console.log(`\n${colors.red}❌ ISSUE: featureCount is missing or zero${colors.reset}`);
        console.log(`${colors.red}   Chat page will show "N/A records"${colors.reset}`);
      }
    }
  }
  
  console.log(`\n${colors.yellow}Test completed.${colors.reset}\n`);
}

testMetadataExtraction().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
