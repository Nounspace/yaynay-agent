#!/usr/bin/env tsx
/**
 * One-time script to create multiple proposals in a row
 * This bypasses the cooldown to quickly generate proposals for testing
 */

import { execSync } from 'child_process';
import { unlinkSync, existsSync } from 'fs';
import path from 'path';

const COOLDOWN_FILE = path.join(process.cwd(), 'data/last-agent-run.json');
const NUM_PROPOSALS = 5;

console.log('🚀 Creating Multiple Proposals Script');
console.log('════════════════════════════════════════════════════════════\n');
console.log(`Will create ${NUM_PROPOSALS} proposals in a row\n`);

for (let i = 1; i <= NUM_PROPOSALS; i++) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📝 CREATING PROPOSAL ${i}/${NUM_PROPOSALS}`);
  console.log('═'.repeat(60));
  
  // Remove cooldown file before each run
  if (existsSync(COOLDOWN_FILE)) {
    unlinkSync(COOLDOWN_FILE);
    console.log('✅ Removed cooldown file\n');
  }
  
  try {
    // Run the agent
    execSync('node --import tsx --env-file=.env.local scripts/agent.ts', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    
    console.log(`\n✅ Proposal ${i}/${NUM_PROPOSALS} completed\n`);
    
    // Add a small delay between runs to avoid overwhelming the system
    if (i < NUM_PROPOSALS) {
      console.log('⏳ Waiting 5 seconds before next proposal...\n');
      execSync('sleep 5');
    }
  } catch (error) {
    console.error(`\n❌ Error creating proposal ${i}:`, error);
    console.log('Continuing to next proposal...\n');
  }
}

console.log('\n' + '═'.repeat(60));
console.log('✅ COMPLETED ALL PROPOSALS');
console.log('═'.repeat(60));
console.log(`Created ${NUM_PROPOSALS} proposals\n`);
