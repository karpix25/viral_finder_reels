#!/usr/bin/env bash

set -e

echo "Creating lightweight production wrapper..."

# Create output directory if it doesn't exist
mkdir -p .mastra/output

# Create a minimal wrapper that uses exec to replace the process
# This ensures all stdout/stderr flows directly without buffering
cat > .mastra/output/index.mjs << 'EOF'
import { exec } from 'child_process';

console.log('🚀 Starting Mastra production server with runtime bundling...');

// Use exec with direct stdio to ensure logs flow properly
const mastraProcess = exec('NODE_ENV=production npx mastra dev', {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    FORCE_COLOR: '1'  // Ensure colors work in logs
  }
});

// Pipe stdout and stderr directly to console
mastraProcess.stdout.pipe(process.stdout);
mastraProcess.stderr.pipe(process.stderr);

mastraProcess.on('error', (err) => {
  console.error('Failed to start Mastra:', err);
  process.exit(1);
});

mastraProcess.on('exit', (code) => {
  if (code !== 0) {
    console.log(`Mastra exited with code ${code}`);
  }
  process.exit(code || 0);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, stopping Mastra...');
  mastraProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, stopping Mastra...');
  mastraProcess.kill('SIGINT');
});
EOF

echo "✅ Production wrapper created successfully!"
