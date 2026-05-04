/**
 * Test PromptManager HTML Comment Removal
 */

const path = require('path');
const fs = require('fs');

// Import PromptManager (need to compile first or use dynamic import)
async function testPromptManager() {
  console.log('Testing PromptManager HTML Comment Removal...\n');
  
  try {
    // Dynamic import the compiled module
    const { PromptManager } = await import('../server/dist/llm-interaction/managers/PromptManager.js');
    
    const workspaceBase = path.join(__dirname, '..', 'workspace');
    const promptManager = new PromptManager(workspaceBase);
    
    // Test 1: Load a template with HTML comment
    console.log('Test 1: Load template with HTML comment');
    const template = await promptManager.loadTemplate('goal-splitting', 'en-US');
    
    console.log('Template loaded successfully');
    console.log('Template format:', template.constructor.name);
    
    // Format the template to see the actual content
    const formatted = await template.format({ userInput: 'test input' });
    console.log('\nFormatted template preview (first 200 chars):');
    console.log(formatted.substring(0, 200));
    
    // Check if HTML comment is present
    if (formatted.includes('<!--')) {
      console.log('\n❌ FAIL: HTML comment still present in template!');
      console.log('First line:', formatted.split('\n')[0]);
    } else {
      console.log('\n✅ PASS: HTML comment removed correctly');
    }
    
    // Test 2: Verify variables are still extracted correctly
    console.log('\n\nTest 2: Verify variable extraction');
    const variables = template.inputVariables;
    console.log('Extracted variables:', variables);
    
    if (variables.includes('userInput')) {
      console.log('✅ PASS: Variables extracted correctly');
    } else {
      console.log('❌ FAIL: Variables not extracted correctly');
    }
    
    // Test 3: List templates
    console.log('\n\nTest 3: List available templates');
    const templates = await promptManager.listTemplates('en-US');
    console.log(`Found ${templates.length} templates`);
    templates.forEach(t => {
      console.log(`  - ${t.id}: [${t.variables.join(', ')}]`);
    });
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      console.log('\nNote: Need to compile TypeScript first:');
      console.log('  cd server && npm run build');
    }
    process.exit(1);
  }
}

testPromptManager();
