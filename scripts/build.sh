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

# Create simple index.mjs that runs mastra dev with cron scheduler enabled
cat > .mastra/output/index.mjs << 'EOF'
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

console.log('🚀 [Wrapper] Starting Mastra with HOURLY CRON SCHEDULER');
console.log('📝 [Wrapper] Project root:', projectRoot);
console.log('⏰ [Wrapper] Cron job will run Instagram analysis every hour at :00 minutes');

// Run mastra dev with NODE_ENV=production to enable cron scheduler
// The cron scheduler is configured in src/mastra/index.ts
const child = spawn('npx', ['mastra', 'dev'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error('❌ [Wrapper] Failed to start Mastra:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.log(`⏹️ [Wrapper] Mastra exited with code ${code}`);
  }
  process.exit(code || 0);
});

// Graceful shutdown
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
EOF

echo "✅ Production wrapper created successfully!"
