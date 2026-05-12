/**
 * Test script for Text Chunking Service
 */

import { TextChunkingService } from '../src/knowledge-base/services/TextChunkingService.js';

function testChunking() {
  console.log('=== Testing Text Chunking Service ===\n');

  const service = new TextChunkingService({
    chunkSize: 200,
    chunkOverlap: 30
  });

  // Test 1: Simple paragraph splitting
  console.log('Test 1: Simple paragraph splitting');
  const text1 = `This is the first paragraph. It contains some text that should be split.

This is the second paragraph. It has different content and should be in a separate chunk.

This is the third paragraph. More content here for testing purposes.`;

  const chunks1 = service.chunkText(text1);
  console.log(`   Input length: ${text1.length} characters`);
  console.log(`   Output chunks: ${chunks1.length}`);
  for (let i = 0; i < chunks1.length; i++) {
    console.log(`   Chunk ${i}: ${chunks1[i].content.substring(0, 50)}... (${chunks1[i].content.length} chars)`);
  }
  console.log();

  // Test 2: Long single paragraph
  console.log('Test 2: Long single paragraph (should split by character count)');
  const text2 = 'This is a very long paragraph without any line breaks. '.repeat(20);
  
  const chunks2 = service.chunkText(text2);
  console.log(`   Input length: ${text2.length} characters`);
  console.log(`   Output chunks: ${chunks2.length}`);
  for (let i = 0; i < chunks2.length; i++) {
    console.log(`   Chunk ${i}: ${chunks2[i].content.substring(0, 50)}... (${chunks2[i].content.length} chars)`);
  }
  console.log();

  // Test 3: Estimate chunk count
  console.log('Test 3: Estimate chunk count');
  const estimated = service.estimateChunkCount(1000);
  console.log(`   For 1000 characters: ~${estimated} chunks`);
  console.log(`   Actual chunks from Test 2: ${chunks2.length}`);
  console.log();

  // Test 4: Overlap verification
  console.log('Test 4: Verify overlap between chunks');
  if (chunks2.length > 1) {
    const chunk1End = chunks2[0].content.substring(chunks2[0].content.length - 30);
    const chunk2Start = chunks2[1].content.substring(0, 30);
    console.log(`   Chunk 1 end: "...${chunk1End}"`);
    console.log(`   Chunk 2 start: "${chunk2Start}..."`);
    
    // Check if there's overlap
    const hasOverlap = chunk2Start.includes(chunk1End.trim().substring(0, 15));
    console.log(`   Has overlap: ${hasOverlap ? '✓' : '✗'}`);
  }
  console.log();

  // Test 5: Empty text
  console.log('Test 5: Empty text handling');
  const chunks3 = service.chunkText('');
  console.log(`   Empty input chunks: ${chunks3.length} (expected: 0)`);
  console.log();

  console.log('=== All Tests Complete ===');
}

testChunking();
