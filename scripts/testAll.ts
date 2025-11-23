#!/usr/bin/env tsx
/**
 * Test all critical backend functionality before deployment
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runTests() {
  console.log('\n🧪 RUNNING BACKEND TESTS\n');
  console.log('═'.repeat(60));
  
  let passedTests = 0;
  let failedTests = 0;
  
  // Test 1: Import queue functions
  try {
    console.log('\n✓ Test 1: Import queue functions...');
    const { getQueueStats } = await import('../lib/dao/suggestionsQueue');
    const stats = getQueueStats();
    console.log(`  Queue stats: ${stats.total} total, ${stats.pending} pending`);
    passedTests++;
  } catch (error) {
    console.error('  ✗ FAILED:', (error as Error).message);
    failedTests++;
  }
  
  // Test 2: Import portfolio functions
  try {
    console.log('\n✓ Test 2: Import portfolio functions...');
    await import('../lib/dao/portfolio');
    console.log('  Portfolio functions loaded');
    passedTests++;
  } catch (error) {
    console.error('  ✗ FAILED:', (error as Error).message);
    failedTests++;
  }
  
  // Test 3: Import proposal functions
  try {
    console.log('\n✓ Test 3: Import proposal functions...');
    await import('../lib/dao/proposals');
    console.log('  Proposal functions loaded');
    passedTests++;
  } catch (error) {
    console.error('  ✗ FAILED:', (error as Error).message);
    failedTests++;
  }
  
  // Test 4: Import analyzer functions
  try {
    console.log('\n✓ Test 4: Import analyzer functions...');
    await import('../lib/agent/analyzeCreator');
    console.log('  Analyzer functions loaded');
    passedTests++;
  } catch (error) {
    console.error('  ✗ FAILED:', (error as Error).message);
    failedTests++;
  }
  
  // Test 5: Import agent functions
  try {
    console.log('\n✓ Test 5: Import agent functions...');
    await import('../lib/agent/suggestBuys');
    console.log('  Agent functions loaded');
    passedTests++;
  } catch (error) {
    console.error('  ✗ FAILED:', (error as Error).message);
    failedTests++;
  }
  
  // Test 6: Check environment variables
  try {
    console.log('\n✓ Test 6: Check environment variables...');
    const requiredEnvVars = [
      'CDP_API_KEY_ID',
      'CDP_API_KEY_SECRET',
      'CDP_WALLET_SECRET',
      'DAO_TREASURY_ADDRESS',
      'DAO_GOVERNOR_ADDRESS',
      'OPENAI_API_KEY',
      'ZORA_API_KEY',
      'AGENT_EOA_ADDRESS',
      'AGENT_SMART_ACCOUNT_ADDRESS',
    ];
    
    const missing = requiredEnvVars.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    
    console.log(`  All ${requiredEnvVars.length} required env vars present`);
    passedTests++;
  } catch (error) {
    console.error('  ✗ FAILED:', (error as Error).message);
    failedTests++;
  }
  
  // Test 7: Test Zora SDK initialization
  try {
    console.log('\n✓ Test 7: Test Zora SDK initialization...');
    await import('../lib/zora');
    console.log('  Zora SDK module loaded');
    passedTests++;
  } catch (error) {
    console.error('  ✗ FAILED:', (error as Error).message);
    failedTests++;
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total Tests: ${passedTests + failedTests}`);
  console.log(`✓ Passed: ${passedTests}`);
  console.log(`✗ Failed: ${failedTests}`);
  console.log('═'.repeat(60));
  
  if (failedTests > 0) {
    console.log('\n❌ Some tests failed. Please fix issues before deploying.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Backend is ready for deployment.\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
