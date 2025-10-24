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

# Create simple index.mjs that runs mastra dev with NODE_ENV=production
cat > .mastra/output/index.mjs << 'EOF'
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

console.log('🚀 [Wrapper] Starting Mastra in PRODUCTION mode');
console.log('📝 [Wrapper] Project root:', projectRoot);

// Run mastra dev with NODE_ENV=production
// This will:
// 1. Bundle the code
// 2. Start the web server on port 5000
// 3. Enable cron scheduler (because NODE_ENV=production)
const child = spawn('npx', ['mastra', 'dev'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error('❌ [Wrapper] Failed to start:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.log(`⏹️ [Wrapper] Process exited with code ${code}`);
  }
  process.exit(code || 0);
});

// Graceful shutdown
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
EOF

echo "✅ Production wrapper created successfully!"
