#!/usr/bin/env bash

set -e

echo "📦 Creating production wrapper..."

# Create output directory
mkdir -p .mastra/output

# Create production start script that explicitly sets NODE_ENV
cat > .mastra/output/start-production.sh << 'SCRIPT_EOF'
#!/bin/bash
export NODE_ENV=production
echo "🚀 Starting Mastra in PRODUCTION mode"
echo "📝 NODE_ENV=$NODE_ENV"
exec node index.mjs
SCRIPT_EOF

chmod +x .mastra/output/start-production.sh

# Create simple index.mjs that runs mastra dev with built-in cron scheduler
cat > .mastra/output/index.mjs << 'EOF'
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

console.log('🚀 [Autoscale Deployment] Starting Mastra with hourly cron scheduler');
console.log('📝 [Autoscale Deployment] Project root:', projectRoot);
console.log('⏰ [Autoscale Deployment] Web server + cron job (0 * * * *)');

// Run mastra dev with NODE_ENV=production
// This starts web server on port 5000 + activates node-cron scheduler
const child = spawn('npx', ['mastra', 'dev'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error('❌ [Autoscale Deployment] Failed to start Mastra:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.log(`⏹️ [Autoscale Deployment] Mastra exited with code ${code}`);
  }
  process.exit(code || 0);
});

// Graceful shutdown
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
EOF

echo "✅ Production wrapper created successfully!"
