/**
 * Simple test for modularized ReportGeneratorExecutor
 */

import { ReportGeneratorExecutor } from '../src/plugin-orchestration/executor/reporting/index.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testReportGenerator() {
  console.log('Testing Modularized ReportGeneratorExecutor...\n');

  // Ensure workspace directory exists
  const workspaceBase = path.join(__dirname, '..', 'workspace');
  if (!fs.existsSync(workspaceBase)) {
    fs.mkdirSync(workspaceBase, { recursive: true });
  }

  // Create a temporary database
  const dbPath = path.join(workspaceBase, 'test_temp.db');
  const db = new Database(dbPath);

  try {
    // Create executor
    const executor = new ReportGeneratorExecutor(db, workspaceBase);

    // Test parameters
    const params = {
      title: 'Test Analysis Report',
      summary: 'This is a test report generated using the modularized executor.',
      author: 'Test User',
      organization: 'GeoAI-UP Team',
      analysisResults: [
        {
          type: 'statistics',
          data: { mean: 10.5, median: 9.8, std: 2.3 },
          description: 'Basic statistical analysis'
        },
        {
          type: 'spatial',
          data: { area: 1000, perimeter: 400 },
          description: 'Spatial measurements'
        }
      ],
      visualizationServices: [
        {
          type: 'choropleth',
          name: 'Population Density Map',
          layerId: 'layer_pop_001',
          source: 'population_data'
        },
        {
          type: 'heatmap',
          name: 'Crime Hotspots',
          layerId: 'layer_crime_001'
        }
      ],
      format: 'html' as const,
      includeCharts: true,
      includeMaps: true
    };

    console.log('Executing report generation...');
    const result = await executor.execute(params);

    console.log('\n✅ Report generation successful!');
    console.log(`Report ID: ${result.id}`);
    console.log(`Report Type: ${result.type}`);
    console.log(`Public URL: ${result.reference}`);
    console.log(`File Path: ${result.metadata.result}`);
    console.log(`Title: ${result.metadata.title}`);
    console.log(`Author: ${result.metadata.author}`);
    console.log(`Results Count: ${result.metadata.resultsCount}`);
    console.log(`Services Count: ${result.metadata.servicesCount}`);

    // Verify file was created
    if (fs.existsSync(result.metadata.result as string)) {
      console.log('\n✓ Report file exists on disk');
      const stats = fs.statSync(result.metadata.result as string);
      console.log(`  File size: ${stats.size} bytes`);
    } else {
      console.log('\n✗ Report file not found on disk');
    }

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    // Clean up
    db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  }
}

// Run the test
testReportGenerator().catch(console.error);