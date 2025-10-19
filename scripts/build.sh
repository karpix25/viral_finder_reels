#!/usr/bin/env bash

set -e

echo "Creating lightweight production wrapper..."

# Create output directory if it doesn't exist
mkdir -p .mastra/output

# Create a simple index.mjs that starts Mastra dev server
# This allows us to use runtime bundling instead of heavy pre-build
cat > .mastra/output/index.mjs << 'EOF'
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

console.log('🚀 Starting Mastra production server with runtime bundling...');

// Start mastra dev in production mode
const mastra = spawn('npx', ['mastra', 'dev'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production'
  }
});

mastra.on('error', (err) => {
  console.error('Failed to start Mastra:', err);
  process.exit(1);
});

mastra.on('exit', (code) => {
  console.log(`Mastra exited with code ${code}`);
  process.exit(code || 0);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, stopping Mastra...');
  mastra.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, stopping Mastra...');
  mastra.kill('SIGINT');
});
EOF

echo "✅ Production wrapper created successfully!"
