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

# Create index.mjs - simple spawn without health check
cat > .mastra/output/index.mjs << 'EOF'
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

console.log('🚀 [Production] Starting Instagram Analyzer');
console.log('⏰ [Production] Hourly cron: 0 * * * *');

const child = spawn('npx', ['mastra', 'dev'], {
  cwd: projectRoot,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error('❌ [Production] Failed:', err);
  process.exit(1);
});

child.on('exit', (code) => process.exit(code || 0));

process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
EOF

echo "✅ Production wrapper created successfully!"
