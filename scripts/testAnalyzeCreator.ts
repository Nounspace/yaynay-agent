#!/usr/bin/env tsx
/**
 * Test the analyzeCreatorCoinByUsername function
 */

import dotenv from 'dotenv';
import path from 'path';
import { analyzeCreatorCoinByUsername } from '../lib/agent/analyzeCreator';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testAnalyzeCreator() {
  const username = process.argv[2] || 'jessepollak';

  console.log('🧪 Testing Creator Coin Analysis\n');
  console.log(`📝 Analyzing creator: ${username}\n`);
  console.log('═'.repeat(60));

  try {
    const analysis = await analyzeCreatorCoinByUsername(username);

    console.log('\n🎉 Analysis Results:');
    console.log('═'.repeat(60));
    console.log(`Creator: ${analysis.username}`);
    console.log(`Address: ${analysis.creatorAddress}`);
    console.log(`Coin ID: ${analysis.coinId}`);
    console.log(`Symbol: ${analysis.symbol || 'N/A'}`);
    console.log(`Name: ${analysis.name || 'N/A'}`);
    console.log(
      `Price: ${analysis.currentPriceUsd ? `$${analysis.currentPriceUsd}` : 'N/A'}`
    );
    console.log(
      `24h Volume: ${analysis.volume24hUsd ? `$${analysis.volume24hUsd}` : 'N/A'}`
    );
    console.log(`Already Held: ${analysis.alreadyHeld ? 'Yes' : 'No'}`);
    console.log('─'.repeat(60));
    console.log(`Confidence Score: ${(analysis.confidenceScore * 100).toFixed(1)}%`);
    console.log(
      `Suggested Allocation: ${analysis.suggestedAllocationUsd ? `$${analysis.suggestedAllocationUsd}` : 'N/A'}`
    );
    console.log('─'.repeat(60));
    console.log(`Reason: ${analysis.reason}`);
    console.log('═'.repeat(60));

    if (analysis.confidenceScore >= 0.7) {
      console.log('\n✅ RECOMMENDED: High confidence investment');
    } else if (analysis.confidenceScore >= 0.5) {
      console.log('\n⚠️  MODERATE: Consider with caution');
    } else {
      console.log('\n❌ NOT RECOMMENDED: Low confidence');
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testAnalyzeCreator()
  .then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
