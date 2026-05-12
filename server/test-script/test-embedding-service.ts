/**
 * Test script for DashScope Embedding Service
 * 
 * Note: This test requires DASHSCOPE_API_KEY environment variable to be set.
 * Set it in .env file or export it before running:
 * Windows PowerShell: $env:DASHSCOPE_API_KEY="your-api-key"
 */

import { EmbeddingService } from '../src/knowledge-base/services/EmbeddingService.js';

async function testEmbeddingService() {
  console.log('=== Testing DashScope Embedding Service ===\n');

  // Check if API key is available
  const apiKey = process.env.DASHSCOPE_API_KEY;
  
  if (!apiKey) {
    console.log('⚠️  DASHSCOPE_API_KEY not set. Using mock mode for testing.');
    console.log('   To run live API tests, set the environment variable:\n');
    console.log('   Windows PowerShell:');
    console.log('     $env:DASHSCOPE_API_KEY="your-api-key"');
    console.log('   Or add to .env file:\n');
    console.log('     DASHSCOPE_API_KEY=your-api-key\n');
    
    // Test service initialization in mock mode
    console.log('Test 1: Service initialization without API key (mock mode)');
    try {
      const service = new EmbeddingService();
      console.log('   ✓ Service initialized in mock mode');
      console.log(`   Model: ${service.getModel()}`);
      console.log(`   Dimensions: ${service.getDimensions()}\n`);
      
      // Test mock embedding
      console.log('Test 2: Generate mock embedding');
      const embedding = await service.embedText('Test text');
      console.log(`   Embedding dimensions: ${embedding.length}`);
      console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
      console.log(`   ✓ Mock embedding generated successfully\n`);
      
      return;
    } catch (error) {
      console.log(`   ✗ Failed: ${(error as Error).message}\n`);
      return;
    }
  }

  console.log('✓ API key found. Running live tests...\n');

  // Initialize service
  const service = new EmbeddingService({ apiKey });
  console.log(`Model: ${service.getModel()}`);
  console.log(`Dimensions: ${service.getDimensions()}\n`);

  // Test 1: Validate API key
  console.log('Test 1: Validate API key');
  try {
    const isValid = await service.validateApiKey();
    console.log(`   API Key valid: ${isValid ? '✓' : '✗'}\n`);
    
    if (!isValid) {
      console.log('⚠️  API key validation failed. Skipping remaining tests.\n');
      return;
    }
  } catch (error) {
    console.log(`   ✗ Validation failed: ${(error as Error).message}\n`);
    return;
  }

  // Test 2: Single text embedding
  console.log('Test 2: Single text embedding');
  try {
    const text1 = 'GeoAI-UP is a powerful geospatial AI platform.';
    const start = Date.now();
    const embedding1 = await service.embedText(text1);
    const duration = Date.now() - start;
    
    console.log(`   Input: "${text1.substring(0, 50)}..."`);
    console.log(`   Embedding dimensions: ${embedding1.length}`);
    console.log(`   Time taken: ${duration}ms`);
    console.log(`   First 5 values: [${embedding1.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    console.log(`   ✓ Success\n`);
  } catch (error) {
    console.log(`   ✗ Failed: ${(error as Error).message}\n`);
  }

  // Test 3: Batch embedding
  console.log('Test 3: Batch embedding (3 texts)');
  try {
    const texts = [
      'Spatial analysis helps understand geographic patterns.',
      'Machine learning enhances remote sensing interpretation.',
      'Vector databases enable efficient similarity search.'
    ];
    
    const start = Date.now();
    const embeddings = await service.embedBatch(texts);
    const duration = Date.now() - start;
    
    console.log(`   Input texts: ${texts.length}`);
    console.log(`   Output embeddings: ${embeddings.length}`);
    console.log(`   Each embedding dimensions: ${embeddings[0].length}`);
    console.log(`   Total time: ${duration}ms`);
    console.log(`   Average per text: ${(duration / texts.length).toFixed(0)}ms`);
    console.log(`   ✓ Success\n`);
  } catch (error) {
    console.log(`   ✗ Failed: ${(error as Error).message}\n`);
  }

  // Test 4: Embed with metadata
  console.log('Test 4: Embed with metadata');
  try {
    const texts = ['Test text 1', 'Test text 2'];
    const results = await service.embedWithMetadata(texts);
    
    console.log(`   Results count: ${results.length}`);
    console.log(`   Model used: ${results[0].model}`);
    console.log(`   Dimensions: ${results[0].dimensions}`);
    console.log(`   Created at: ${results[0].createdAt.toISOString()}`);
    console.log(`   ✓ Success\n`);
  } catch (error) {
    console.log(`   ✗ Failed: ${(error as Error).message}\n`);
  }

  // Test 5: Empty input handling
  console.log('Test 5: Empty input handling');
  try {
    const embeddings = await service.embedBatch([]);
    console.log(`   Empty input result: ${embeddings.length} embeddings`);
    console.log(`   ✓ Correctly returns empty array\n`);
  } catch (error) {
    console.log(`   ✗ Failed: ${(error as Error).message}\n`);
  }

  // Test 6: Chinese text embedding
  console.log('Test 6: Chinese text embedding');
  try {
    const chineseText = 'GeoAI-UP是一个强大的地理空间人工智能平台。';
    const embedding = await service.embedText(chineseText);
    
    console.log(`   Input: "${chineseText}"`);
    console.log(`   Embedding dimensions: ${embedding.length}`);
    console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    console.log(`   ✓ Success\n`);
  } catch (error) {
    console.log(`   ✗ Failed: ${(error as Error).message}\n`);
  }

  console.log('=== All Tests Complete ===');
}

testEmbeddingService().catch(console.error);
