/**
 * Test script for Chinese Shapefile encoding fix
 * Tests the specific file: 五虎林河.shp
 */

import path from 'path';
import fs from 'fs';
import { ShapefileAccessor } from '../src/data-access/accessors/ShapefileAccessor.js';

async function testWuhulinheShapefile() {
  console.log('=== Testing 五虎林河.shp Chinese Encoding ===\n');
  
  const workspaceBase = path.join(process.cwd(), '..');
  const shapefilePath = path.join(workspaceBase, 'workspace', 'data', 'local', '五虎林河.shp');
  
  if (!fs.existsSync(shapefilePath)) {
    console.error('❌ File not found:', shapefilePath);
    return;
  }
  
  console.log('📁 File path:', shapefilePath);
  console.log('📊 File size:', fs.statSync(shapefilePath).size, 'bytes\n');
  
  // Check companion files
  const baseName = shapefilePath.replace('.shp', '');
  const companionFiles = {
    '.shx': fs.existsSync(baseName + '.shx'),
    '.dbf': fs.existsSync(baseName + '.dbf'),
    '.prj': fs.existsSync(baseName + '.prj')
  };
  
  console.log('📦 Companion files:');
  Object.entries(companionFiles).forEach(([ext, exists]) => {
    console.log(`   ${ext}: ${exists ? '✓' : '✗'}`);
  });
  console.log();
  
  // Create accessor
  const accessor = new ShapefileAccessor(workspaceBase);
  
  try {
    console.log('🔍 Step 1: Reading metadata...\n');
    const nativeData = await accessor.read(shapefilePath);
    
    console.log('✅ Metadata loaded successfully:');
    console.log(`   Feature count: ${nativeData.metadata.featureCount}`);
    console.log(`   Geometry type: ${nativeData.metadata.geometryType}`);
    console.log(`   CRS: ${nativeData.metadata.crs || 'Unknown'}`);
    console.log(`   Fields: ${nativeData.metadata.fields?.length || 0}\n`);
    
    if (nativeData.metadata.fields && nativeData.metadata.fields.length > 0) {
      console.log('📋 Field definitions:');
      nativeData.metadata.fields.forEach((field, idx) => {
        console.log(`   ${idx + 1}. ${field.name} (${field.type})`);
      });
      console.log();
    }
    
    console.log('🔍 Step 2: Loading as GeoJSON with encoding auto-detection...\n');
    const geojson = await (accessor as any).loadGeoJSON(shapefilePath);
    
    console.log(`✅ Loaded ${geojson.features.length} features\n`);
    
    if (geojson.features.length > 0) {
      console.log('📝 Sample data (first 3 features):\n');
      
      for (let i = 0; i < Math.min(3, geojson.features.length); i++) {
        const feature = geojson.features[i];
        const props = feature.properties as Record<string, any>;
        
        console.log(`Feature ${i + 1}:`);
        
        // Find and display Chinese field values
        const chineseFields = Object.entries(props).filter(([key, value]) => {
          return typeof value === 'string' && /[\u4e00-\u9fff]/.test(value);
        });
        
        if (chineseFields.length > 0) {
          chineseFields.forEach(([key, value]) => {
            console.log(`   ${key}: "${value}"`);
          });
        } else {
          // Show first 5 properties if no Chinese detected
          Object.entries(props).slice(0, 5).forEach(([key, value]) => {
            const displayValue = typeof value === 'string' && value.length > 50 
              ? value.substring(0, 50) + '...' 
              : value;
            console.log(`   ${key}: ${displayValue}`);
          });
        }
        console.log();
      }
      
      // Comprehensive encoding quality check
      console.log('🔬 Encoding Quality Analysis:\n');
      
      let totalStringProps = 0;
      let garbledCount = 0;
      let chineseCharCount = 0;
      const mojibakePatterns: string[] = [];
      
      geojson.features.forEach((feature: any, featureIdx: number) => {
        const props = feature.properties as Record<string, any>;
        
        Object.entries(props).forEach(([key, value]) => {
          if (typeof value === 'string' && value.length > 0) {
            totalStringProps++;
            
            // Check for replacement character
            if (value.includes('\ufffd')) {
              garbledCount++;
            }
            
            // Count Chinese characters
            const chineseMatches = value.match(/[\u4e00-\u9fff]/g);
            if (chineseMatches) {
              chineseCharCount += chineseMatches.length;
            }
            
            // Detect mojibake in first few features
            if (featureIdx < 5 && /[\xc0-\xff][\x80-\xbf]{2}/.test(value)) {
              mojibakePatterns.push(`${key}: "${value.substring(0, 30)}..."`);
            }
          }
        });
      });
      
      console.log(`   Total string properties analyzed: ${totalStringProps}`);
      console.log(`   Properties with replacement chars: ${garbledCount}`);
      console.log(`   Total Chinese characters found: ${chineseCharCount}`);
      console.log(`   Success rate: ${((1 - garbledCount / totalStringProps) * 100).toFixed(2)}%\n`);
      
      if (mojibakePatterns.length > 0) {
        console.log('⚠️  Mojibake patterns detected in sample:');
        mojibakePatterns.slice(0, 3).forEach(pattern => {
          console.log(`   ${pattern}`);
        });
        console.log();
      }
      
      // Final verdict
      console.log('═══════════════════════════════════════');
      if (garbledCount === 0 && chineseCharCount > 0) {
        console.log('✅ SUCCESS: All Chinese characters loaded correctly!');
        console.log(`   Found ${chineseCharCount} Chinese characters across ${totalStringProps} string properties.`);
      } else if (garbledCount > 0) {
        console.log('❌ FAILURE: Encoding issues detected!');
        console.log(`   ${garbledCount} properties contain garbled text.`);
      } else if (chineseCharCount === 0) {
        console.log('⚠️  WARNING: No Chinese characters found in data.');
        console.log('   This may be expected if the dataset has no Chinese content.');
      }
      console.log('═══════════════════════════════════════\n');
    }
    
  } catch (error) {
    console.error('❌ Error during testing:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    }
  }
}

// Run test
testWuhulinheShapefile().catch(console.error);
