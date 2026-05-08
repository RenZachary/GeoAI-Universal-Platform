/**
 * Test the detectMojibake function directly
 */

// Simulate the detectMojibake function
function detectMojibake(value: string): boolean {
  // Strategy 1: Check for sequences of rare CJK characters
  const rareCjkCount = (value.match(/[\u6900-\u9fff]/g) || []).length;
  const totalCjkCount = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  
  console.log(`  String: "${value}"`);
  console.log(`  Total CJK chars: ${totalCjkCount}`);
  console.log(`  Rare CJK chars: ${rareCjkCount}`);
  console.log(`  Rare ratio: ${totalCjkCount > 0 ? (rareCjkCount / totalCjkCount * 100).toFixed(1) : 0}%`);
  
  if (totalCjkCount > 0 && rareCjkCount / totalCjkCount > 0.7) {
    console.log(`  → Detected as mojibake (Strategy 1: high rare CJK ratio)`);
    return true;
  }
  
  // Strategy 2: Analyze UTF-8 byte patterns
  const utf8Bytes = Buffer.from(value, 'utf-8');
  let twoByteCount = 0;
  let threeByteCount = 0;
  
  for (let i = 0; i < utf8Bytes.length; i++) {
    const byte = utf8Bytes[i];
    
    if ((byte & 0xE0) === 0xC0) {
      twoByteCount++;
      i++;
    } else if ((byte & 0xF0) === 0xE0) {
      threeByteCount++;
      i += 2;
    }
  }
  
  console.log(`  2-byte sequences: ${twoByteCount}`);
  console.log(`  3-byte sequences: ${threeByteCount}`);
  
  const totalMultiByte = twoByteCount + threeByteCount;
  if (totalMultiByte > 0) {
    const twoByteRatio = twoByteCount / totalMultiByte;
    console.log(`  2-byte ratio: ${(twoByteRatio * 100).toFixed(1)}%`);
    
    if (twoByteRatio > 0.4) {
      console.log(`  → Detected as mojibake (Strategy 2: high 2-byte ratio)`);
      return true;
    }
  }
  
  console.log(`  → Not detected as mojibake`);
  return false;
}

console.log('=== Testing detectMojibake function ===\n');

// Test cases
const testCases = [
  { text: '龙腾九天小区', expected: false, desc: 'Real Chinese (UTF-8)' },
  { text: '幸福小区', expected: false, desc: 'Real Chinese (UTF-8)' },
  { text: '榫欒吘涔濆ぉ灏忓尯', expected: true, desc: 'Mojibake from GBK' },
  { text: '骞哥灏忓尯', expected: true, desc: 'Mojibake from GBK' },
  { text: '鍙戝灏忓尯', expected: true, desc: 'Mojibake from GBK' },
];

testCases.forEach(({ text, expected, desc }) => {
  console.log(`\nTest: ${desc}`);
  const result = detectMojibake(text);
  const status = result === expected ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - Expected: ${expected}, Got: ${result}\n`);
});
