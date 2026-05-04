/**
 * Test Script for LLM Configuration API
 * Tests all LLM config endpoints with Qwen (千问) as priority
 */

// Using global fetch (available in Node.js 18+)
const BASE_URL = 'http://localhost:3000/api';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, colors.green);
}

function logError(message: string) {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, colors.blue);
}

function logSection(title: string) {
  log(`\n${'='.repeat(60)}`, colors.cyan);
  log(title, colors.cyan);
  log('='.repeat(60), colors.cyan);
}

async function testGetConfig() {
  logSection('TEST 1: GET /api/llm/config - Get Current Configuration');
  
  try {
    const response = await fetch(`${BASE_URL}/llm/config`);
    const data = await response.json();
    
    if (!response.ok) {
      logError(`HTTP Error: ${response.status} ${response.statusText}`);
      logError(JSON.stringify(data, null, 2));
      return null;
    }
    
    if (data.success) {
      logSuccess('Successfully retrieved LLM configuration');
      logInfo('Current configuration:');
      console.log(JSON.stringify(data.config, null, 2));
      return data.config;
    } else {
      logError('API returned success: false');
      logError(JSON.stringify(data, null, 2));
      return null;
    }
  } catch (error) {
    logError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function testSaveQwenConfig(apiKey?: string) {
  logSection('TEST 2: POST /api/llm/config - Save Qwen Configuration');
  
  // Qwen configuration (priority provider)
  const qwenConfig = {
    provider: 'qwen',
    model: 'qwen-plus',
    apiKey: apiKey || process.env.QWEN_API_KEY || 'test-api-key-placeholder',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    temperature: 0.7,
    maxTokens: 2000,
    streaming: true
  };
  
  logInfo('Saving Qwen configuration...');
  console.log(JSON.stringify({ ...qwenConfig, apiKey: '***' }, null, 2));
  
  try {
    const response = await fetch(`${BASE_URL}/llm/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(qwenConfig)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      logError(`HTTP Error: ${response.status} ${response.statusText}`);
      logError(JSON.stringify(data, null, 2));
      return false;
    }
    
    if (data.success) {
      logSuccess('Qwen configuration saved successfully');
      logInfo('Response:');
      console.log(JSON.stringify(data, null, 2));
      return true;
    } else {
      logError('API returned success: false');
      logError(JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    logError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testTestConnection(apiKey?: string) {
  logSection('TEST 3: POST /api/llm/config/test - Test Qwen Connection');
  
  const qwenConfig = {
    provider: 'qwen',
    model: 'qwen-plus',
    apiKey: apiKey || process.env.QWEN_API_KEY || 'test-api-key-placeholder',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  };
  
  logInfo('Testing Qwen connection...');
  
  try {
    const response = await fetch(`${BASE_URL}/llm/config/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(qwenConfig)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      logError(`HTTP Error: ${response.status} ${response.statusText}`);
      logError(JSON.stringify(data, null, 2));
      return false;
    }
    
    if (data.connected) {
      logSuccess('Connection test PASSED');
    } else {
      logError('Connection test FAILED');
    }
    
    logInfo('Test result:');
    console.log(JSON.stringify(data, null, 2));
    return data.connected;
  } catch (error) {
    logError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testValidationErrors() {
  logSection('TEST 4: Validation Error Handling');
  
  // Test missing provider
  logInfo('Test 4a: Missing provider field');
  try {
    const response = await fetch(`${BASE_URL}/llm/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4', apiKey: 'test' })
    });
    const data = await response.json();
    
    if (response.status === 400 && !data.success) {
      logSuccess('Correctly rejected missing provider');
    } else {
      logError('Should have rejected missing provider');
    }
  } catch (error) {
    logError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test invalid provider
  logInfo('Test 4b: Invalid provider value');
  try {
    const response = await fetch(`${BASE_URL}/llm/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'invalid', model: 'test', apiKey: 'test' })
    });
    const data = await response.json();
    
    if (response.status === 400 && !data.success) {
      logSuccess('Correctly rejected invalid provider');
    } else {
      logError('Should have rejected invalid provider');
    }
  } catch (error) {
    logError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test missing API key for non-ollama
  logInfo('Test 4c: Missing API key for Qwen');
  try {
    const response = await fetch(`${BASE_URL}/llm/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'qwen', model: 'qwen-plus' })
    });
    const data = await response.json();
    
    if (response.status === 400 && !data.success) {
      logSuccess('Correctly rejected missing API key');
    } else {
      logError('Should have rejected missing API key');
    }
  } catch (error) {
    logError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testDeleteConfig() {
  logSection('TEST 5: DELETE /api/llm/config - Delete Configuration');
  
  logInfo('Deleting current configuration...');
  
  try {
    const response = await fetch(`${BASE_URL}/llm/config`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      logError(`HTTP Error: ${response.status} ${response.statusText}`);
      logError(JSON.stringify(data, null, 2));
      return false;
    }
    
    if (data.success) {
      logSuccess('Configuration deleted successfully');
      logInfo('Response:');
      console.log(JSON.stringify(data, null, 2));
      return true;
    } else {
      logError('API returned success: false');
      return false;
    }
  } catch (error) {
    logError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testDifferentQwenModels() {
  logSection('TEST 6: Testing Different Qwen Models');
  
  const models = ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'];
  const results: Record<string, boolean> = {};
  
  for (const model of models) {
    logInfo(`Testing model: ${model}`);
    
    const config = {
      provider: 'qwen',
      model: model,
      apiKey: process.env.QWEN_API_KEY || 'test-api-key',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      temperature: 0.7,
      maxTokens: 2000,
      streaming: true
    };
    
    try {
      const response = await fetch(`${BASE_URL}/llm/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      const data = await response.json();
      
      if (data.success) {
        logSuccess(`Model ${model} configuration saved`);
        results[model] = true;
      } else {
        logError(`Model ${model} configuration failed`);
        results[model] = false;
      }
    } catch (error) {
      logError(`Model ${model} request failed: ${error instanceof Error ? error.message : String(error)}`);
      results[model] = false;
    }
  }
  
  logInfo('Summary:');
  console.log(results);
}

async function main() {
  log('\n🚀 Starting LLM Configuration API Tests', colors.cyan);
  log('Priority Provider: Qwen (Alibaba DashScope)\n', colors.yellow);
  
  // Check if API key is provided
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    log('⚠ Warning: QWEN_API_KEY environment variable not set', colors.yellow);
    log('Tests will use placeholder API key. Connection tests may fail.\n', colors.yellow);
  } else {
    log('✓ QWEN_API_KEY found in environment\n', colors.green);
  }
  
  // Run tests
  const results = {
    getConfig: await testGetConfig(),
    saveConfig: await testSaveQwenConfig(apiKey),
    testConnection: await testTestConnection(apiKey),
    validation: await testValidationErrors(),
    deleteConfig: await testDeleteConfig(),
    differentModels: await testDifferentQwenModels()
  };
  
  // Final summary
  logSection('TEST SUMMARY');
  log('All tests completed!', colors.green);
  log('\nTo run with real API key, set environment variable:', colors.cyan);
  log('export QWEN_API_KEY=your-dashscope-api-key', colors.yellow);
  log('\nor on Windows PowerShell:', colors.cyan);
  log('$env:QWEN_API_KEY="your-dashscope-api-key"', colors.yellow);
}

main().catch(error => {
  logError(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
