/**
 * GDAL Setup Helper Script
 * 
 * This script helps users download and set up GDAL for GeoAI-UP.
 * 
 * Usage: node scripts/setup-gdal.js
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const VENDOR_DIR = path.join(ROOT_DIR, 'vendor');
const GDAL_DIR = path.join(VENDOR_DIR, 'GDAL');

// GDAL download URLs (GISInternals builds)
const GDAL_VERSIONS = {
  '3.8.5': {
    url: 'https://download.gisinternals.com/sdk/downloads/release-1900-x64-gdal-3-8-5-mapserver-7-6-4.zip',
    description: 'GDAL 3.8.5 (Recommended - Stable)'
  },
  '3.9.0': {
    url: 'https://download.gisinternals.com/sdk/downloads/release-1900-x64-gdal-3-9-0-mapserver-7-6-4.zip',
    description: 'GDAL 3.9.0 (Latest)'
  }
};

/**
 * Create readline interface for user input
 */
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Download a file from URL with progress tracking
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      response.pipe(file);

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r   Downloading: ${percent}% (${formatBytes(downloadedSize)} / ${formatBytes(totalSize)})`);
        }
      });

      file.on('finish', () => {
        file.close();
        process.stdout.write('\r   Downloading: 100%   \n');
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    }).on('error', reject);
  });
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Extract zip file using PowerShell
 */
function extractZip(zipPath, extractDir) {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    const command = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`;
    
    console.log('   Extracting GDAL...');
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * Main setup function
 */
async function setupGDAL() {
  console.log('========================================');
  console.log('  GeoAI-UP GDAL Setup Helper');
  console.log('========================================\n');

  const rl = createReadline();

  try {
    // Check if GDAL already exists
    if (await fs.pathExists(GDAL_DIR)) {
      console.log('✓ GDAL is already installed at:', GDAL_DIR);
      
      const answer = await question(rl, 'Do you want to reinstall? (y/N): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('\n✓ GDAL setup complete!');
        rl.close();
        return;
      }
      
      console.log('\nRemoving existing GDAL installation...');
      await fs.remove(GDAL_DIR);
    }

    // Select GDAL version
    console.log('\nAvailable GDAL versions:\n');
    const versions = Object.keys(GDAL_VERSIONS);
    versions.forEach((version, index) => {
      const info = GDAL_VERSIONS[version];
      console.log(`  ${index + 1}. ${info.description}`);
    });
    
    const versionChoice = await question(rl, `\nSelect version (1-${versions.length}, default: 1): `);
    const selectedIndex = parseInt(versionChoice) - 1 || 0;
    const selectedVersion = versions[selectedIndex];
    
    if (!selectedVersion) {
      throw new Error('Invalid version selection');
    }

    const gdalInfo = GDAL_VERSIONS[selectedVersion];
    console.log(`\nSelected: ${gdalInfo.description}`);

    // Ensure vendor directory exists
    await fs.ensureDir(VENDOR_DIR);

    // Download GDAL
    const tempZipPath = path.join(VENDOR_DIR, `gdal-${selectedVersion}.zip`);
    console.log(`\nDownloading GDAL ${selectedVersion}...`);
    console.log('This may take a few minutes depending on your internet connection...\n');
    
    await downloadFile(gdalInfo.url, tempZipPath);
    console.log('✓ Download complete');

    // Extract GDAL
    console.log('\nExtracting GDAL...');
    await extractZip(tempZipPath, VENDOR_DIR);
    
    // The extracted folder name might vary, we need to find it
    const extractedItems = await fs.readdir(VENDOR_DIR);
    const extractedGdalFolder = extractedItems.find(item => 
      item.includes('gdal') && item.includes(selectedVersion.replace(/\./g, '-'))
    );

    if (extractedGdalFolder) {
      const extractedPath = path.join(VENDOR_DIR, extractedGdalFolder);
      await fs.move(extractedPath, GDAL_DIR, { overwrite: true });
      console.log('✓ Extraction complete');
    } else {
      console.warn('⚠ Could not auto-detect extracted folder');
      console.warn('Please manually extract the zip file to vendor/GDAL');
    }

    // Clean up zip file
    if (await fs.pathExists(tempZipPath)) {
      await fs.remove(tempZipPath);
    }

    // Verify installation
    const gdalInfoExe = path.join(GDAL_DIR, 'bin', 'gdalinfo.exe');
    if (await fs.pathExists(gdalInfoExe)) {
      console.log('\n✓ GDAL installation verified!');
      console.log(`   Location: ${GDAL_DIR}`);
      console.log(`   Executable: ${gdalInfoExe}`);
    } else {
      console.warn('\n⚠ GDAL executable not found at expected location');
      console.warn('Please verify the installation manually');
    }

    console.log('\n========================================');
    console.log('  Setup Complete!');
    console.log('========================================\n');
    console.log('Next steps:');
    console.log('1. Set GDAL_DIR environment variable:');
    console.log(`   $env:GDAL_DIR = "${GDAL_DIR}"`);
    console.log('\n2. Or add to server/.env file:');
    console.log(`   GDAL_DIR=./vendor/GDAL`);
    console.log('\n3. Test GDAL integration:');
    console.log('   npm run dev:server\n');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nManual installation instructions:');
    console.error('1. Download GDAL from: https://www.gisinternals.com/release.php');
    console.error(`2. Extract to: ${GDAL_DIR}`);
    console.error('3. Ensure bin/gdalinfo.exe exists\n');
  } finally {
    rl.close();
  }
}

/**
 * Ask user a question
 */
function question(rl, query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

// Run the setup
setupGDAL().catch(console.error);
