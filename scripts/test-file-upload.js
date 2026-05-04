/**
 * File Upload API Test Script
 * 
 * Tests file upload endpoints for Data Management:
 * - Single file upload
 * - Multiple file upload
 * - File validation
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

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

// Helper to make multipart form data requests
function makeMultipartRequest(filePath, endpoint) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Date.now();
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    // Build multipart body
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
      path: endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`,
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
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: jsonData
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
    req.write(bodyBuffer);
    req.end();
  });
}

// Main test suite
async function runTests() {
  console.log(`${colors.yellow}Starting File Upload API Tests...${colors.reset}\n`);
  
  // ==========================================================================
  // Test 1: Check if test files exist
  // ==========================================================================
  printSection('Test 1: Test File Preparation');
  
  const testDataDir = path.join(__dirname, '..', 'workspace', 'data', 'local');
  const testFiles = [
    'world_1777827645032.geojson',
    'test.geojson'
  ];
  
  let availableFile = null;
  for (const file of testFiles) {
    const filePath = path.join(testDataDir, file);
    if (fs.existsSync(filePath)) {
      availableFile = filePath;
      printTestResult(
        `Test file found: ${file}`,
        true,
        `Size: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`
      );
      break;
    }
  }
  
  if (!availableFile) {
    printTestResult('Test files available', false, 'No test GeoJSON files found');
    console.log('\nSkipping upload tests - no test files available\n');
    printSummary();
    return;
  }
  
  // ==========================================================================
  // Test 2: Single File Upload
  // ==========================================================================
  printSection('Test 2: Single File Upload');
  
  try {
    const uploadResponse = await makeMultipartRequest(
      availableFile,
      '/upload/single'
    );
    
    if (uploadResponse.status === 201 && uploadResponse.data.success === true) {
      printTestResult(
        'Single file upload',
        true,
        `Uploaded: ${uploadResponse.data.data?.name || 'N/A'}`
      );
      
      if (uploadResponse.data.data) {
        console.log('  Upload result:');
        console.log(`    ID: ${uploadResponse.data.data.id}`);
        console.log(`    Name: ${uploadResponse.data.data.name}`);
        console.log(`    Type: ${uploadResponse.data.data.type}`);
        console.log(`    Size: ${(uploadResponse.data.data.size / 1024).toFixed(2)} KB`);
      }
    } else {
      printTestResult(
        'Single file upload',
        false,
        `Status: ${uploadResponse.status}, Error: ${uploadResponse.data.error || JSON.stringify(uploadResponse.data)}`
      );
    }
  } catch (error) {
    printTestResult('Single file upload', false, error.message);
  }
  
  // ==========================================================================
  // Test 3: Upload Invalid File Type
  // ==========================================================================
  printSection('Test 3: File Validation');
  
  try {
    // Create a temporary invalid file
    const tempFile = path.join(__dirname, 'test-invalid.txt');
    fs.writeFileSync(tempFile, 'This is not a valid spatial file');
    
    const invalidUploadResponse = await makeMultipartRequest(
      tempFile,
      '/upload/single'
    );
    
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    
    if (invalidUploadResponse.status === 400) {
      printTestResult(
        'Rejects invalid file type',
        true,
        `Correctly rejected with status 400`
      );
    } else {
      printTestResult(
        'Rejects invalid file type',
        false,
        `Expected 400, got ${invalidUploadResponse.status}`
      );
    }
  } catch (error) {
    printTestResult('File validation', false, error.message);
  }
  
  // ==========================================================================
  // Test Summary
  // ==========================================================================
  printSummary();
}

function printSummary() {
  printSection('Test Summary');
  
  console.log(`\nTotal Tests: ${totalTests}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
  console.log(`Success Rate: ${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0}%`);
  
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
