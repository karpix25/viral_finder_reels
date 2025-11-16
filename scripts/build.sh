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

# Create simple index.mjs that runs scheduled script (NOT dev server)
cat > .mastra/output/index.mjs << 'EOF'
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

console.log('🚀 [Wrapper] Starting SCHEDULED Instagram Analysis');
console.log('📝 [Wrapper] Project root:', projectRoot);
console.log('⏰ [Wrapper] This will run src/run-scheduled.ts');

// Run the scheduled script directly (NOT mastra dev)
// This script executes the Instagram analysis workflow and exits
const child = spawn('npx', ['tsx', 'src/run-scheduled.ts'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error('❌ [Wrapper] Failed to start scheduled script:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`✅ [Wrapper] Scheduled script completed with code ${code}`);
  process.exit(code || 0);
});

// Graceful shutdown
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
EOF

echo "✅ Production wrapper created successfully!"
