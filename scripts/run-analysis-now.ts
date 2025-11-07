#!/usr/bin/env tsx

import { mastra } from '../src/mastra/index.js';
import { executeInstagramAnalysis } from '../src/mastra/workflows/instagramAnalysisWorkflow.js';

async function runAnalysisNow() {
  console.log('🚀 Starting manual Instagram analysis...');
  console.log('⏰ Time:', new Date().toISOString());
  
  try {
    console.log('📝 Executing analysis function...');
    const result = await executeInstagramAnalysis(mastra);
    
    console.log('✅ Analysis completed!');
    console.log('📊 Results:');
    console.log(`   - Accounts processed: ${result.totalAccountsProcessed}`);
    console.log(`   - Viral reels sent: ${result.totalViralReelsSent}`);
    console.log(`   - Next start index: ${result.nextStartIndex}`);
    console.log(`   - Cycle complete: ${result.cycleComplete}`);
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running analysis:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runAnalysisNow();
