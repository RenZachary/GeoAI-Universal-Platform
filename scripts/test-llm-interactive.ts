/**
 * Interactive LLM Configuration Test with Qwen
 * This script allows you to test with a real API key interactively
 */

// Using global fetch (available in Node.js 18+)
const BASE_URL = 'http://localhost:3000/api';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function getConfig() {
  console.log('\n📋 Getting current LLM configuration...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/llm/config`);
    const data = await response.json();
    
    if (data.success) {
      console.log('Current Configuration:');
      console.log('─'.repeat(50));
      console.log(`Provider:     ${data.config.provider}`);
      console.log(`Model:        ${data.config.model}`);
      console.log(`API Key:      ${data.config.apiKey}`);
      console.log(`Base URL:     ${data.config.baseUrl || '(default)'}`);
      console.log(`Temperature:  ${data.config.temperature}`);
      console.log(`Max Tokens:   ${data.config.maxTokens}`);
      console.log(`Streaming:    ${data.config.streaming}`);
      console.log(`Updated At:   ${data.config.updatedAt}`);
      console.log('─'.repeat(50));
      return data.config;
    } else {
      console.error('Failed to get configuration:', data.error);
      return null;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function saveQwenConfig(apiKey: string) {
  console.log('\n💾 Saving Qwen configuration...\n');
  
  const config = {
    provider: 'qwen',
    model: 'qwen-plus',
    apiKey: apiKey,
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
      console.log('✓ Configuration saved successfully!');
      console.log(`  Provider: ${data.config.provider}`);
      console.log(`  Model: ${data.config.model}`);
      console.log(`  API Key: ${data.config.apiKey}`);
      return true;
    } else {
      console.error('Failed to save configuration:', data.error);
      return false;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function testConnection(apiKey: string) {
  console.log('\n🔌 Testing Qwen connection...\n');
  
  const config = {
    provider: 'qwen',
    model: 'qwen-plus',
    apiKey: apiKey,
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  };
  
  try {
    const response = await fetch(`${BASE_URL}/llm/config/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    
    const data = await response.json();
    
    if (data.connected) {
      console.log('✅ Connection successful!');
      console.log('   Your Qwen API key is valid and working.');
    } else {
      console.log('❌ Connection failed!');
      console.log(`   Message: ${data.message}`);
      console.log('   Please check your API key and network connection.');
    }
    
    return data.connected;
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function deleteConfig() {
  console.log('\n🗑️  Deleting LLM configuration...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/llm/config`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✓ Configuration deleted successfully');
      return true;
    } else {
      console.error('Failed to delete configuration:', data.error);
      return false;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║       GeoAI-UP LLM Configuration Test (Qwen Priority)    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  let exit = false;
  
  while (!exit) {
    console.log('\nSelect an option:');
    console.log('  1. View current configuration');
    console.log('  2. Configure Qwen (Alibaba DashScope)');
    console.log('  3. Test Qwen connection');
    console.log('  4. Delete configuration');
    console.log('  5. Exit\n');
    
    const choice = await question('Enter choice (1-5): ');
    
    switch (choice.trim()) {
      case '1':
        await getConfig();
        break;
        
      case '2':
        console.log('\nTo configure Qwen, you need a DashScope API key.');
        console.log('Get one at: https://dashscope.console.aliyun.com/\n');
        const apiKey = await question('Enter your Qwen API key: ');
        
        if (apiKey.trim()) {
          await saveQwenConfig(apiKey.trim());
        } else {
          console.log('No API key provided. Configuration cancelled.');
        }
        break;
        
      case '3':
        const currentConfig = await getConfig();
        if (currentConfig && currentConfig.provider === 'qwen') {
          const testKey = await question('\nEnter API key for testing (or press Enter to use configured key): ');
          const keyToTest = testKey.trim() || undefined;
          
          // Note: We can't retrieve the actual API key from the server for security
          if (!keyToTest) {
            console.log('\n⚠ For security reasons, the API key is not returned by the server.');
            console.log('  Please enter your API key to test the connection.\n');
            const manualKey = await question('Enter your Qwen API key: ');
            if (manualKey.trim()) {
              await testConnection(manualKey.trim());
            }
          } else {
            await testConnection(keyToTest);
          }
        } else {
          console.log('\n⚠ Current configuration is not set to Qwen.');
          console.log('  Please configure Qwen first (option 2).\n');
        }
        break;
        
      case '4':
        const confirm = await question('Are you sure you want to delete the configuration? (yes/no): ');
        if (confirm.toLowerCase() === 'yes') {
          await deleteConfig();
        } else {
          console.log('Deletion cancelled.');
        }
        break;
        
      case '5':
        exit = true;
        console.log('\nGoodbye! 👋\n');
        break;
        
      default:
        console.log('\nInvalid choice. Please try again.\n');
    }
  }
  
  rl.close();
}

main().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});
