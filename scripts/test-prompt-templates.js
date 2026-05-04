/**
 * Prompt Template API Test Script
 * Tests all prompt template management endpoints
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
  logSection('Prompt Template API Tests');
  
  // Test 1: List all templates
  logSection('Test 1: List All Templates');
  const listResult = await testEndpoint(
    'List All Templates',
    'GET',
    '/prompts'
  );
  
  if (listResult && listResult.success) {
    logSuccess(`Found ${listResult.count || 0} templates`);
    if (listResult.templates && listResult.templates.length > 0) {
      logInfo('Templates:');
      listResult.templates.forEach(template => {
        logInfo(`  - ${template.id} (${template.language})`);
      });
    }
  }
  
  // Test 2: List templates filtered by language
  logSection('Test 2: List Templates Filtered by Language (en-US)');
  const listEnResult = await testEndpoint(
    'List Templates (en-US)',
    'GET',
    '/prompts?language=en-US'
  );
  
  if (listEnResult && listEnResult.success) {
    logSuccess(`Found ${listEnResult.count || 0} en-US templates`);
    if (listEnResult.templates && listEnResult.templates.length > 0) {
      listEnResult.templates.forEach(template => {
        logInfo(`  - ${template.name}`);
      });
    }
  }
  
  // Test 3: Get a specific template
  logSection('Test 3: Get Specific Template');
  const getTemplateId = 'goal-splitting_en-us';
  const getResult = await testEndpoint(
    `Get Template: ${getTemplateId}`,
    'GET',
    `/prompts/${getTemplateId}`
  );
  
  if (getResult && getResult.success) {
    logSuccess(`Retrieved template: ${getResult.template.name}`);
    logInfo('Language:', getResult.template.language);
    logInfo('Description:', getResult.template.description || 'N/A');
    logInfo('Content Preview:', getResult.template.content.substring(0, 100) + '...');
  }
  
  // Test 4: Create a new template
  logSection('Test 4: Create New Template');
  const newTemplate = {
    name: 'test-template',
    language: 'en-US',
    content: 'You are a helpful AI assistant specialized in geographic information systems.',
    description: 'A test template for GIS queries',
    version: '1.0.0'
  };
  
  const createResult = await testEndpoint(
    'Create Template',
    'POST',
    '/prompts',
    newTemplate,
    201
  );
  
  let createdTemplateId = null;
  if (createResult && createResult.success) {
    logSuccess('Template created successfully');
    logInfo('Template ID:', createResult.template.id);
    logInfo('Name:', createResult.template.name);
    logInfo('Language:', createResult.template.language);
    createdTemplateId = createResult.template.id;
  }
  
  // Test 5: Verify created template exists
  if (createdTemplateId) {
    logSection('Test 5: Verify Created Template Exists');
    const verifyResult = await testEndpoint(
      'Verify Created Template',
      'GET',
      `/prompts/${createdTemplateId}`
    );
    
    if (verifyResult && verifyResult.success) {
      logSuccess('Created template verified');
      logInfo('Content matches:', verifyResult.template.content === newTemplate.content);
    }
  }
  
  // Test 6: Update template content
  if (createdTemplateId) {
    logSection('Test 6: Update Template Content');
    const updateData = {
      content: 'You are an expert AI assistant for geospatial analysis and mapping.',
      description: 'Updated test template for GIS queries'
    };
    
    const updateResult = await testEndpoint(
      'Update Template',
      'PUT',
      `/prompts/${createdTemplateId}`,
      updateData
    );
    
    if (updateResult && updateResult.success) {
      logSuccess('Template updated successfully');
      
      // Verify update
      const verifyUpdateResult = await testEndpoint(
        'Verify Updated Template',
        'GET',
        `/prompts/${createdTemplateId}`
      );
      
      if (verifyUpdateResult && verifyUpdateResult.success) {
        logInfo('Updated content:', verifyUpdateResult.template.content);
        logInfo('Updated description:', verifyUpdateResult.template.description);
      }
    }
  }
  
  // Test 7: Try to create duplicate template (should fail with 409)
  logSection('Test 7: Try to Create Duplicate Template');
  const duplicateResult = await testEndpoint(
    'Create Duplicate Template',
    'POST',
    '/prompts',
    {
      name: 'test-template',
      language: 'en-US',
      content: 'Duplicate content'
    },
    409
  );
  
  if (duplicateResult && !duplicateResult.success) {
    logSuccess('Correctly rejected duplicate template');
    logInfo('Error:', duplicateResult.error);
  }
  
  // Test 8: Create template with validation error (missing required field)
  logSection('Test 8: Validation Error - Missing Required Field');
  const validationErrorResult = await testEndpoint(
    'Create Template Without Name',
    'POST',
    '/prompts',
    {
      language: 'en-US',
      content: 'Some content'
    },
    400
  );
  
  if (validationErrorResult && !validationErrorResult.success) {
    logSuccess('Correctly rejected invalid input');
    logInfo('Validation errors:', JSON.stringify(validationErrorResult.details, null, 2));
  }
  
  // Test 9: Get non-existent template (should fail with 404)
  logSection('Test 9: Get Non-Existent Template');
  const notFoundResult = await testEndpoint(
    'Get Non-Existent Template',
    'GET',
    '/prompts/nonexistent_template_en-us',
    null,
    404
  );
  
  if (notFoundResult && !notFoundResult.success) {
    logSuccess('Correctly returned 404 for non-existent template');
    logInfo('Error:', notFoundResult.error);
  }
  
  // Test 10: Delete the test template
  if (createdTemplateId) {
    logSection('Test 10: Delete Test Template');
    const deleteResult = await testEndpoint(
      'Delete Template',
      'DELETE',
      `/prompts/${createdTemplateId}`
    );
    
    if (deleteResult && deleteResult.success) {
      logSuccess('Template deleted successfully');
      
      // Verify deletion
      const verifyDeleteResult = await testEndpoint(
        'Verify Deletion',
        'GET',
        `/prompts/${createdTemplateId}`,
        null,
        404
      );
      
      if (verifyDeleteResult && !verifyDeleteResult.success) {
        logSuccess('Deletion verified - template no longer exists');
      }
    }
  }
  
  // Test 11: List templates after operations
  logSection('Test 11: Final Template List');
  const finalListResult = await testEndpoint(
    'Final Template List',
    'GET',
    '/prompts'
  );
  
  if (finalListResult && finalListResult.success) {
    logSuccess(`Final template count: ${finalListResult.count || 0}`);
    if (finalListResult.templates && finalListResult.templates.length > 0) {
      logInfo('Remaining templates:');
      finalListResult.templates.forEach(template => {
        logInfo(`  - ${template.id} (${template.language})`);
      });
    }
  }
  
  // Test 12: Test Chinese language support
  logSection('Test 12: Create Chinese Language Template');
  const chineseTemplate = {
    name: 'chinese-test',
    language: 'zh-CN',
    content: '你是一个专业的地理信息系统AI助手。',
    description: '中文测试模板',
    version: '1.0.0'
  };
  
  const chineseCreateResult = await testEndpoint(
    'Create Chinese Template',
    'POST',
    '/prompts',
    chineseTemplate,
    201
  );
  
  let chineseTemplateId = null;
  if (chineseCreateResult && chineseCreateResult.success) {
    logSuccess('Chinese template created successfully');
    logInfo('Template ID:', chineseCreateResult.template.id);
    chineseTemplateId = chineseCreateResult.template.id;
    
    // Verify Chinese template
    const chineseGetResult = await testEndpoint(
      'Get Chinese Template',
      'GET',
      `/prompts/${chineseTemplateId}`
    );
    
    if (chineseGetResult && chineseGetResult.success) {
      logSuccess('Chinese template retrieved successfully');
      logInfo('Content:', chineseGetResult.template.content);
    }
    
    // Clean up Chinese template
    await testEndpoint(
      'Delete Chinese Template',
      'DELETE',
      `/prompts/${chineseTemplateId}`
    );
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
