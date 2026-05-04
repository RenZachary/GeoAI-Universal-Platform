/**
 * Test script for ChatView backend API endpoints
 * Tests all API calls made by the chat view component
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log('green', `✓ ${message}`);
}

function logError(message) {
  log('red', `✗ ${message}`);
}

function logInfo(message) {
  log('blue', `ℹ ${message}`);
}

function logWarning(message) {
  log('yellow', `⚠ ${message}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log('cyan', title);
  console.log('='.repeat(60));
}

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  total: 0
};

async function testEndpoint(name, method, url, data = null, expectedStatus = 200) {
  results.total++;
  logInfo(`Testing: ${name}`);
  
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
        'X-Browser-Fingerprint': 'test-fingerprint-12345'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    
    if (response.status === expectedStatus) {
      logSuccess(`${name} - Status: ${response.status}`);
      results.passed++;
      return response.data;
    } else {
      logError(`${name} - Expected status ${expectedStatus}, got ${response.status}`);
      results.failed++;
      return null;
    }
  } catch (error) {
    if (error.response) {
      logError(`${name} - Status: ${error.response.status}`);
      logError(`  Error: ${error.response.data?.error || error.message}`);
    } else {
      logError(`${name} - ${error.message}`);
    }
    results.failed++;
    return null;
  }
}

async function runTests() {
  logSection('ChatView Backend API Tests');
  logInfo(`Base URL: ${BASE_URL}`);
  logInfo(`Starting tests...\n`);

  // ========================================
  // Test 1: List Data Sources
  // ========================================
  logSection('Test 1: Data Sources API');
  
  const dataSources = await testEndpoint(
    'List Data Sources',
    'GET',
    '/api/data-sources'
  );
  
  if (dataSources && dataSources.dataSources) {
    logSuccess(`Found ${dataSources.dataSources.length} data sources`);
    if (dataSources.dataSources.length > 0) {
      logInfo('Sample data source:');
      console.log('  ID:', dataSources.dataSources[0].id);
      console.log('  Name:', dataSources.dataSources[0].name);
      console.log('  Type:', dataSources.dataSources[0].type);
    }
  }

  // ========================================
  // Test 2: List Conversations
  // ========================================
  logSection('Test 2: Conversations API');
  
  const conversations = await testEndpoint(
    'List Conversations',
    'GET',
    '/api/chat/conversations'
  );
  
  if (conversations && conversations.conversations) {
    logSuccess(`Found ${conversations.conversations.length} conversations`);
    if (conversations.conversations.length > 0) {
      logInfo('Sample conversation:');
      console.log('  ID:', conversations.conversations[0].id);
      console.log('  Title:', conversations.conversations[0].title);
    }
  }

  // ========================================
  // Test 3: Get Specific Conversation (if exists)
  // ========================================
  if (conversations && conversations.conversations && conversations.conversations.length > 0) {
    const conversationId = conversations.conversations[0].id;
    
    logSection('Test 3: Get Conversation Details');
    
    const conversation = await testEndpoint(
      `Get Conversation ${conversationId}`,
      'GET',
      `/api/chat/conversations/${conversationId}`
    );
    
    if (conversation && conversation.messages) {
      logSuccess(`Conversation has ${conversation.messages.length} messages`);
    }
  }

  // ========================================
  // Test 4: Delete Conversation (if exists)
  // ========================================
  if (conversations && conversations.conversations && conversations.conversations.length > 0) {
    const conversationId = conversations.conversations[0].id;
    
    logSection('Test 4: Delete Conversation');
    logWarning('Note: This will delete the first conversation');
    
    await testEndpoint(
      `Delete Conversation ${conversationId}`,
      'DELETE',
      `/api/chat/conversations/${conversationId}`,
      null,
      200
    );
  }

  // ========================================
  // Test 5: Send Message (Streaming)
  // ========================================
  logSection('Test 5: Send Message (SSE Streaming)');
  logInfo('Testing SSE streaming endpoint...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Browser-Fingerprint': 'test-fingerprint-12345'
      },
      body: JSON.stringify({
        message: 'Hello, this is a test message',
        conversationId: null
      })
    });
    
    if (response.ok) {
      logSuccess('SSE streaming endpoint is accessible');
      logInfo('Reading stream events...');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventCount = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          logSuccess(`Stream completed. Received ${eventCount} events`);
          results.passed++;
          results.total++;
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              logSuccess('Received [DONE] signal');
              break;
            }
            
            try {
              const event = JSON.parse(data);
              eventCount++;
              
              if (eventCount === 1) {
                logInfo(`First event type: ${event.type}`);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
      
      reader.releaseLock();
    } else {
      logError(`SSE streaming failed with status: ${response.status}`);
      results.failed++;
      results.total++;
    }
  } catch (error) {
    logError(`SSE streaming test failed: ${error.message}`);
    results.failed++;
    results.total++;
  }

  // ========================================
  // Test 6: Get Data Source Service URL (if data sources exist)
  // ========================================
  if (dataSources && dataSources.dataSources && dataSources.dataSources.length > 0) {
    const dataSourceId = dataSources.dataSources[0].id;
    
    logSection('Test 6: Data Source Service URL');
    
    await testEndpoint(
      `Get Service URL for ${dataSourceId}`,
      'GET',
      `/api/data-sources/${dataSourceId}/service-url`
    );
  }

  // ========================================
  // Summary
  // ========================================
  logSection('Test Summary');
  console.log(`Total Tests: ${results.total}`);
  logSuccess(`Passed: ${results.passed}`);
  if (results.failed > 0) {
    logError(`Failed: ${results.failed}`);
  } else {
    logSuccess('All tests passed! ✓');
  }
  
  const successRate = ((results.passed / results.total) * 100).toFixed(1);
  console.log(`\nSuccess Rate: ${successRate}%`);
  
  if (results.failed === 0) {
    log('\n🎉 All ChatView backend APIs are working correctly!', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please check the errors above.', 'yellow');
  }
}

// Run the tests
runTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
