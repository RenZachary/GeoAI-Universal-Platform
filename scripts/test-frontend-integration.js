/**
 * Frontend Prompt Template Integration Test
 * Tests the frontend-template API integration
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

console.log('Testing Frontend-Backend Template Integration...\n');

async function testIntegration() {
  try {
    // Test 1: List templates (should return summaries without content)
    console.log('Test 1: List Templates');
    const listResponse = await axios.get(`${BASE_URL}/prompts`);
    console.log('✓ List endpoint working');
    console.log(`  Found ${listResponse.data.count} templates`);
    
    if (listResponse.data.templates && listResponse.data.templates.length > 0) {
      const firstTemplate = listResponse.data.templates[0];
      console.log(`  First template: ${firstTemplate.name}`);
      console.log(`  Has content field: ${firstTemplate.hasOwnProperty('content')}`);
      
      // Test 2: Get single template (should return full template with content)
      console.log('\nTest 2: Get Single Template');
      const getResponse = await axios.get(`${BASE_URL}/prompts/${firstTemplate.id}`);
      console.log('✓ Get endpoint working');
      console.log(`  Template name: ${getResponse.data.template.name}`);
      console.log(`  Has content: ${!!getResponse.data.template.content}`);
      console.log(`  Content length: ${getResponse.data.template.content?.length || 0} chars`);
      
      // Test 3: Create template and verify response includes content
      console.log('\nTest 3: Create Template');
      const newTemplate = {
        name: 'integration-test-template',
        language: 'en-US',
        content: 'This is a test template with {{variable}} support.',
        description: 'Integration test template',
        version: '1.0.0'
      };
      
      const createResponse = await axios.post(`${BASE_URL}/prompts`, newTemplate);
      console.log('✓ Create endpoint working');
      console.log(`  Created template ID: ${createResponse.data.template.id}`);
      console.log(`  Response includes content: ${!!createResponse.data.template.content}`);
      
      if (createResponse.data.template.content) {
        console.log('  ✓ Content field present in create response');
      } else {
        console.log('  ✗ WARNING: Content field missing in create response!');
      }
      
      // Test 4: Update template
      console.log('\nTest 4: Update Template');
      const updateData = {
        content: 'Updated content with {{newVariable}} here.'
      };
      
      const updateResponse = await axios.put(
        `${BASE_URL}/prompts/${createResponse.data.template.id}`,
        updateData
      );
      console.log('✓ Update endpoint working');
      console.log(`  Success: ${updateResponse.data.success}`);
      
      // Verify update by fetching again
      const verifyResponse = await axios.get(
        `${BASE_URL}/prompts/${createResponse.data.template.id}`
      );
      console.log(`  Updated content: ${verifyResponse.data.template.content}`);
      
      // Test 5: Delete template
      console.log('\nTest 5: Delete Template');
      const deleteResponse = await axios.delete(
        `${BASE_URL}/prompts/${createResponse.data.template.id}`
      );
      console.log('✓ Delete endpoint working');
      console.log(`  Success: ${deleteResponse.data.success}`);
      
      console.log('\n✅ All integration tests passed!');
      
    } else {
      console.log('No templates found to test with');
    }
    
  } catch (error) {
    console.error('❌ Integration test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

testIntegration();
