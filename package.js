/**
 * GeoAI-UP - Standalone Package Builder for Windows
 * 
 * This script creates a standalone deployment package that bundles
 * Node.js runtime with the application, so users don't need to install
 * Node.js separately.
 * 
 * Usage: node package.js
 */

import fs from 'fs-extra';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from server/package.json
const serverPackageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'server', 'package.json'), 'utf-8')
);
const VERSION = serverPackageJson.version;
const PACKAGE_DIR = path.join(__dirname, `GeoAI-UP-v${VERSION}`);
const SERVER_DIR = path.join(__dirname, 'server');
const WEB_DIR = path.join(__dirname, 'web');

/**
 * Main packaging function
 */
async function createPackage() {
  console.log('========================================');
  console.log('  GeoAI-UP Platform Packager');
  console.log(`  Version: v${VERSION}`);
  console.log('========================================\n');

  try {
    // Step 1: Clean and create directory structure
    await prepareDirectories();

    // Step 2: Build backend
    await buildBackend();

    // Step 3: Download and bundle Node.js runtime
    await bundleNodeRuntime();

    // Step 4: Build frontend
    await buildFrontend();

    // Step 5: Copy resources
    await copyResources();

    // Step 6: Create launch scripts
    await createLaunchScripts();

    console.log('\n✅ Package created successfully!');
    console.log(`📦 Location: ${PACKAGE_DIR}`);
    console.log(`📊 Size: ${(await getDirectorySize(PACKAGE_DIR) / (1024 * 1024)).toFixed(2)} MB`);
    console.log('\nNext steps:');
    console.log('  1. Test the package by running start.bat');
    console.log('  2. Distribute the entire package/ directory to users');
    console.log('  3. Users can run it without installing Node.js!\n');

  } catch (error) {
    console.error('\n❌ Packaging failed:', error.message);
    if (error.stdout) console.error('stdout:', error.stdout.toString());
    if (error.stderr) console.error('stderr:', error.stderr.toString());
    process.exit(1);
  }
}

/**
 * Prepare package directory structure
 */
async function prepareDirectories() {
  console.log('📁 Preparing directory structure...');

  // Clean existing package directory
  if (await fs.pathExists(PACKAGE_DIR)) {
    await fs.remove(PACKAGE_DIR);
    console.log('   Cleaned existing package directory');
  }

  // Create root package directory
  await fs.ensureDir(PACKAGE_DIR);

  console.log('   ✓ Directory structure created\n');
}

/**
 * Build backend TypeScript to JavaScript (bundled as CommonJS)
 */
async function buildBackend() {
  console.log('🔨 Building backend...');

  try {
    // Use rollup to bundle all modules into a single CommonJS file
    execSync('npm run build:bundled', {
      stdio: 'inherit',
      cwd: SERVER_DIR
    });
    console.log('   ✓ Backend built successfully (bundled)\n');
  } catch (error) {
    throw new Error('Backend build failed. Make sure all dependencies are installed.');
  }
}

/**
 * Download and bundle Node.js runtime
 */
async function bundleNodeRuntime() {
  console.log('📥 Bundling Node.js runtime...');

  const platform = process.platform;
  const arch = process.arch;
  const nodeVersion = '24.14.1'; // Match your development version

  let downloadUrl;
  let nodeDirName;

  if (platform === 'win32') {
    downloadUrl = `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-${arch}.zip`;
    nodeDirName = `node-v${nodeVersion}-win-${arch}`;
  } else {
    // For non-Windows systems, we'll skip this part as per requirements
    console.log('   ⚠️  Non-Windows system detected, skipping Node.js bundling');
    return;
  }

  console.log(`   Platform: ${platform}-${arch}`);
  console.log(`   Node.js version: ${nodeVersion}`);
  console.log(`   Download URL: ${downloadUrl}`);

  const nodejsDir = path.join(PACKAGE_DIR, 'nodejs');
  await fs.ensureDir(nodejsDir);

  // Check if already downloaded
  const nodeExe = platform === 'win32'
    ? path.join(nodejsDir, 'node.exe')
    : path.join(nodejsDir, 'bin', 'node');

  if (await fs.pathExists(nodeExe)) {
    console.log('   ✓ Node.js runtime already exists, skipping download\n');
    return;
  }

  // Download Node.js
  console.log('   Downloading Node.js runtime...');
  const tmpDir = path.join(__dirname, 'vendor');
  await fs.ensureDir(tmpDir);
  const tempFile = path.join(tmpDir, `node-v${nodeVersion}.zip`);

  try {
    if (!await fs.pathExists(tempFile)) {
      await downloadFile(downloadUrl, tempFile);
    } else {
      console.log('   ✓ Using cached file');
    }
    console.log('   ✓ Download complete');

    // Extract
    console.log('   Extracting Node.js...');
    if (platform === 'win32') {
      // Use PowerShell to extract zip on Windows
      execSync(`powershell -Command "Expand-Archive -Path '${tempFile}' -DestinationPath '${path.dirname(tempFile)}' -Force"`, {
        stdio: 'pipe'
      });

      // Move extracted content to nodejs directory
      const extractedDir = path.join(path.dirname(tempFile), nodeDirName);
      await fs.move(extractedDir, nodejsDir, { overwrite: true });
    }

    console.log('   ✓ Node.js runtime bundled successfully\n');
  } catch (error) {
    console.error('   ⚠ Failed to download Node.js runtime');
    console.error('   Please manually download from:', downloadUrl);
    console.error('   And extract to:', nodejsDir);
    throw error;
  }
}

/**
 * Download a file from URL
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
          process.stdout.write(`\r   Downloading: ${percent}%`);
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
 * Build frontend Vue application
 */
async function buildFrontend() {
  console.log('🎨 Building frontend...');

  // Check if frontend directory exists
  if (!await fs.pathExists(WEB_DIR)) {
    throw new Error(`Frontend directory not found: ${WEB_DIR}`);
  }

  // Check if node_modules exists in frontend
  const frontendNodeModules = path.join(WEB_DIR, 'node_modules');
  if (!await fs.pathExists(frontendNodeModules)) {
    console.log('   Installing frontend dependencies...');
    execSync('npm install', {
      stdio: 'inherit',
      cwd: WEB_DIR
    });
  }

  // Build frontend
  try {
    execSync('npm run build', {
      stdio: 'inherit',
      cwd: WEB_DIR
    });
    console.log('   ✓ Frontend built successfully\n');
  } catch (error) {
    throw new Error('Frontend build failed');
  }
}

/**
 * Copy all necessary resources to package directory
 */
async function copyResources() {
  console.log('📋 Copying resources...');

  // Copy backend build output (bundled CommonJS)
  const serverDistSrc = path.join(SERVER_DIR, 'dist-bundled');
  const serverDistDest = path.join(PACKAGE_DIR, 'server');
  if (await fs.pathExists(serverDistSrc)) {
    await fs.copy(serverDistSrc, serverDistDest);
    console.log('   ✓ Backend files copied (bundled)');
  } else {
    throw new Error('Backend dist-bundled directory not found after build');
  }

  // Copy frontend build output
  const webDistSrc = path.join(WEB_DIR, 'dist');
  const webDistDest = path.join(PACKAGE_DIR, 'client');
  if (await fs.pathExists(webDistSrc)) {
    await fs.copy(webDistSrc, webDistDest);
    console.log('   ✓ Frontend files copied');
  } else {
    throw new Error('Frontend dist directory not found after build');
  }

  // Copy .env configuration (prefer actual .env over .env.example)
  const envFile = path.join(SERVER_DIR, '.env.production');
  
  if (await fs.pathExists(envFile)) {
    // Copy actual .env file
    await fs.copy(envFile, path.join(PACKAGE_DIR, '.env'));
    console.log('   ✓ Environment config copied (.env)');
  } else {
    console.warn('   ⚠️  No .env or .env.example found');
  }

  // Copy workspace directory structure (empty, without data)
  // Create empty workspace directories for user to populate
  console.log('   Creating workspace directory structure...');
  const workspaceDest = path.join(PACKAGE_DIR, 'workspace');
  await fs.ensureDir(workspaceDest);
  await fs.ensureDir(path.join(workspaceDest, 'data'));
  await fs.ensureDir(path.join(workspaceDest, 'database'));
  await fs.ensureDir(path.join(workspaceDest, 'plugins', 'custom'));
  await fs.ensureDir(path.join(workspaceDest, 'results'));
  await fs.ensureDir(path.join(workspaceDest, 'temp'));
  await fs.ensureDir(path.join(workspaceDest, 'llm', 'config'));
  console.log('   ✓ Workspace directory structure created (empty)');
  console.log('   ℹ️  Users should populate workspace with their own data');

  // Copy server's node_modules
  console.log('   Rebuilding native modules with bundled Node.js...');
  const nodeModulesSrc = path.join(SERVER_DIR, 'node_modules');
  const nodeModulesDest = path.join(PACKAGE_DIR, 'node_modules');

  if (await fs.pathExists(nodeModulesSrc)) {
    // First copy node_modules
    await fs.copy(nodeModulesSrc, nodeModulesDest);
    console.log('   ✓ Server node_modules copied');
    
    // Then rebuild native modules using system npm but with bundled node
    console.log('   Rebuilding better-sqlite3 for bundled Node.js...');
    try {
      // Use npm rebuild which will use the current node version
      execSync('npm rebuild better-sqlite3 canvas', {
        stdio: 'inherit',
        cwd: PACKAGE_DIR
      });
      console.log('   ✓ Native modules rebuilt successfully');
    } catch (error) {
      console.warn('   ⚠️  Failed to rebuild native modules');
      console.warn('   This may cause runtime errors if Node.js versions differ');
      console.warn('   You can manually run "npm rebuild" in the package directory');
    }
  } else {
    throw new Error('Server node_modules not found. Run npm install first.');
  }

  console.log('   ✓ All resources copied\n');
}

/**
 * Create platform-specific launch scripts
 */
async function createLaunchScripts() {
  console.log(' Creating launch scripts...');

  // Windows batch file
  const windowsScript = `@echo off
chcp 65001 >nul
title GeoAI-UP Platform

echo ========================================
echo   GeoAI-UP Geographic AI Assistant
echo ========================================
echo.

:: Check if Node.js exists
if not exist "nodejs\\node.exe" (
    echo Error: Node.js runtime not found!
    echo Please ensure the package was built correctly.
    pause
    exit /b 1
)

:: Check if server code exists
if not exist "server\\index.cjs" (
    echo Error: Server code not found!
    pause
    exit /b 1
)

echo Starting GeoAI-UP server...
echo.

:: Set environment variables
set NODE_ENV=production
:: CLIENT_PATH will be resolved relative to server directory automatically

:: Start server using bundled Node.js
nodejs\\node.exe server\\index.cjs

if errorlevel 1 (
    echo.
    echo ========================================
    echo   Server failed to start!
    echo   Check error messages above.
    echo ========================================
    pause
    exit /b 1
)
`;

  await fs.writeFile(path.join(PACKAGE_DIR, 'start.bat'), windowsScript, 'utf-8');
  console.log('   ✓ Windows launcher created (start.bat)');

  console.log('   ✓ Launch scripts created\n');
}

/**
 * Calculate directory size recursively
 */
async function getDirectorySize(dirPath) {
  let size = 0;
  const files = await fs.readdir(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      size += await getDirectorySize(filePath);
    } else {
      size += stats.size;
    }
  }

  return size;
}

// Run the packaging process
createPackage();