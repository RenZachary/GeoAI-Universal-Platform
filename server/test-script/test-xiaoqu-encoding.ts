/**
 * Test to compare different encodings for 小区.shp
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as shapefile from 'shapefile';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testEncodings() {
  const shpPath = path.join(__dirname, '..', '..', 'workspace', 'data', 'local', '小区.shp');
  const basePath = shpPath.replace('.shp', '');
  
  console.log('Testing 小区.shp with different encodings:\n');
  
  const encodings = ['GBK', 'GB2312', 'UTF-8', 'windows-1252'];
  
  for (const encoding of encodings) {
    console.log(`\n--- Encoding: ${encoding} ---`);
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const source = await (shapefile as any).open(basePath, undefined, { encoding });
      const features = [];
      let result;
      
      while (!(result = await source.read()).done) {
        if (result.value) {
          features.push(result.value);
        }
      }
      
      console.log(`Loaded ${features.length} features`);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      features.forEach((feature: any, idx: number) => {
        const props = feature.properties;
        if (props && props.Name) {
          const name = props.Name;
          const hasChinese = /[\u4e00-\u9fff]/.test(name);
          const hasReplacement = name.includes('\ufffd');
          
          // Check if it's mojibake (GBK interpreted as UTF-8)
          // Real Chinese chars are typically 3 bytes in UTF-8
          // Mojibake from GBK->UTF8 creates sequences like 榫, 欒, etc.
          const isLikelyMojibake = /^[\u69ab\u69be\u817e\u4e5d\u5929\u5c0f\u533a\u5e74\u54e5\u798f\u53e1\u5bb6]+$/.test(name.substring(0, 10));
          
          console.log(`  Feature ${idx + 1}: "${name}"`);
          console.log(`    - Has Chinese range: ${hasChinese}`);
          console.log(`    - Has replacement char: ${hasReplacement}`);
          console.log(`    - Likely mojibake: ${isLikelyMojibake}`);
          console.log(`    - Bytes (hex): ${Buffer.from(name, 'utf-8').toString('hex').substring(0, 60)}...`);
        }
      });
      
    } catch (error) {
      console.error(`  Error: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  // Also read the raw DBF file to see what's actually stored
  console.log('\n\n--- Raw DBF file analysis ---');
  const dbfPath = basePath + '.dbf';
  if (fs.existsSync(dbfPath)) {
    const dbfBuffer = fs.readFileSync(dbfPath);
    console.log(`DBF file size: ${dbfBuffer.length} bytes`);
    console.log(`First 100 bytes (hex): ${dbfBuffer.slice(0, 100).toString('hex')}`);
    
    // Try to find the Name field data
    // DBF header structure: first 32 bytes is header, then field descriptors
    const version = dbfBuffer[0];
    const lastUpdateYear = dbfBuffer[1];
    const lastUpdateMonth = dbfBuffer[2];
    const lastUpdateDay = dbfBuffer[3];
    const numRecords = dbfBuffer.readUInt32LE(4);
    const headerLength = dbfBuffer.readUInt16LE(8);
    const recordLength = dbfBuffer.readUInt16LE(10);
    
    console.log(`\nDBF Header:`);
    console.log(`  Version: ${version}`);
    console.log(`  Last update: ${lastUpdateYear}/${lastUpdateMonth}/${lastUpdateDay}`);
    console.log(`  Records: ${numRecords}`);
    console.log(`  Header length: ${headerLength} bytes`);
    console.log(`  Record length: ${recordLength} bytes`);
    
    // Read field descriptors (32 bytes each, starting at byte 32)
    console.log(`\nField descriptors:`);
    let offset = 32;
    let fieldNum = 0;
    while (offset < headerLength - 1) {
      const fieldName = dbfBuffer.slice(offset, offset + 11).toString('ascii').replace(/\0/g, '');
      const fieldType = String.fromCharCode(dbfBuffer[offset + 11]);
      const fieldLength = dbfBuffer[offset + 16];
      
      if (fieldName === '') break;
      
      console.log(`  Field ${fieldNum + 1}: ${fieldName} (${fieldType}, length=${fieldLength})`);
      
      if (fieldName === 'Name') {
        // Read the actual data for this field from first record
        const dataOffset = headerLength + 1; // +1 for delete flag
        const nameData = dbfBuffer.slice(dataOffset + 16, dataOffset + 16 + fieldLength);
        console.log(`    First record raw bytes: ${nameData.toString('hex')}`);
        console.log(`    As ASCII: "${nameData.toString('ascii').trim()}"`);
        console.log(`    As GBK: "${nameData.toString('latin1')}"`);
        
        // Try to decode as GBK using Buffer
        try {
          const gbkDecoded = new TextDecoder('gbk').decode(nameData);
          console.log(`    Decoded as GBK: "${gbkDecoded.trim()}"`);
        } catch (e) {
          console.log(`    GBK decode failed: ${e}`);
        }
      }
      
      offset += 32;
      fieldNum++;
    }
  }
}

testEncodings().catch(console.error);
