/**
 * Test StyleFactory
 */

import { StyleFactory } from '../src/plugin-orchestration/utils/StyleFactory';
import path from 'path';

const workspaceBase = path.join(__dirname, '..', 'workspace');
StyleFactory.initialize(workspaceBase);

console.log('Testing StyleFactory...\n');

// Test 1: Generate choropleth style
console.log('Test 1: Generate choropleth style');
const styleUrl = StyleFactory.createAndSaveChoroplethStyle({
  tilesetId: 'test_tileset_123',
  layerName: 'test_layer',
  valueField: 'Shape_Area',
  breaks: [0, 1000, 2000, 3000, 4000, 5000],
  colors: ['#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00'],
  minZoom: 0,
  maxZoom: 14,
  opacity: 0.8
});

console.log('Style URL:', styleUrl);
console.log('✅ Test passed!\n');

console.log('Style file should be saved at:', path.join(workspaceBase, 'results', 'styles', 'choropleth_test_tileset_123.json'));
