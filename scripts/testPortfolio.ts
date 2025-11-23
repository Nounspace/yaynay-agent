#!/usr/bin/env tsx
/**
 * Test script for DAO portfolio functionality
 */

import dotenv from 'dotenv';
import path from 'path';
import { getDaoCoinHoldings, getDaoPortfolioValue } from '../lib/dao/portfolio';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testPortfolio() {
  console.log('🧪 Testing DAO Portfolio Functions\n');
  console.log('═'.repeat(60));

  // Use DAO treasury address for testing
  const testAddress = process.env.DAO_TREASURY_ADDRESS;

  if (!testAddress) {
    console.error('❌ DAO_TREASURY_ADDRESS not configured');
    console.error('   Please set DAO_TREASURY_ADDRESS in your .env.local file');
    process.exit(1);
  }

  console.log(`Testing with DAO Treasury: ${testAddress}`);
  console.log(`Network: Base Sepolia (testnet)\n`);

  try {
    // Test 1: Get all holdings
    console.log('📊 Test 1: Fetching coin holdings...');
    const holdings = await getDaoCoinHoldings(testAddress);
    
    if (holdings.length === 0) {
      console.log('   No holdings found (this is expected for a new wallet)');
    } else {
      console.log(`   Found ${holdings.length} holdings:`);
      holdings.forEach((h, i) => {
        console.log(`   ${i + 1}. ${h.name || h.symbol || 'Unknown'}`);
        console.log(`      Coin ID: ${h.coinId}`);
        console.log(`      Balance: ${h.balanceRaw}`);
        if (h.balanceUsd) {
          console.log(`      USD Value: $${h.balanceUsd.toLocaleString()}`);
        }
      });
    }

    // Test 2: Get portfolio value
    console.log('\n💰 Test 2: Calculating portfolio value...');
    const value = await getDaoPortfolioValue(testAddress);
    if (value !== null) {
      console.log(`   Total Portfolio Value: $${value.toLocaleString()}`);
    } else {
      console.log('   Portfolio value: $0 (no holdings)');
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ All tests completed successfully!');
    
  } catch (error: unknown) {
    const err = error as Error;
    console.error('\n❌ Test failed:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

testPortfolio();
