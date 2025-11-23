#!/usr/bin/env tsx
/**
 * Test the analyzeAndPropose function
 */

import dotenv from 'dotenv';
import path from 'path';
import { analyzeAndPropose } from '../lib/agent/analyzeCreator';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testAnalyzeAndPropose() {
  const username = process.argv[2] || 'jessepollak';

  console.log('🧪 Testing Analyze & Propose\n');
  console.log(`📝 Analyzing creator: ${username}`);
  console.log(`   If confidence >= 30%, will submit proposal\n`);
  console.log('═'.repeat(60));

  try {
    const result = await analyzeAndPropose(username, {
      confidenceThreshold: 0.3, // 30%
      ethAmount: '0.001', // Small amount for testing
      slippagePercent: 5,
    });

    console.log('\n🎉 Results:');
    console.log('═'.repeat(60));
    console.log(`Creator: ${result.username}`);
    console.log(`Coin: ${result.symbol || result.name || result.coinId}`);
    console.log(`Price: ${result.currentPriceUsd ? `$${result.currentPriceUsd}` : 'N/A'}`);
    console.log(`24h Volume: ${result.volume24hUsd ? `$${result.volume24hUsd}` : 'N/A'}`);
    console.log(`Already Held: ${result.alreadyHeld ? 'Yes' : 'No'}`);
    console.log('─'.repeat(60));
    console.log(`Confidence: ${(result.confidenceScore * 100).toFixed(1)}%`);
    console.log(`Suggested Allocation: ${result.suggestedAllocationUsd ? `$${result.suggestedAllocationUsd}` : 'N/A'}`);
    console.log('─'.repeat(60));
    console.log(`Reason: ${result.reason}`);
    console.log('─'.repeat(60));
    console.log(`\n🗳️  PROPOSAL STATUS:`);
    console.log(`Submitted: ${result.proposalSubmitted ? '✅ YES' : '❌ NO'}`);
    
    if (result.proposalSubmitted && result.proposal) {
      console.log(`\n📋 Proposal Details:`);
      console.log(`   Local ID: ${result.proposal.proposalId}`);
      console.log(`   ETH Amount: ${result.proposal.ethAmount}`);
      console.log(`   Status: ${result.proposal.status}`);
      
      if (result.proposal.onChainTxHash) {
        console.log(`   Transaction: ${result.proposal.onChainTxHash}`);
        console.log(`   View: https://sepolia.basescan.org/tx/${result.proposal.onChainTxHash}`);
      }
      
      if (result.proposal.onChainProposalId) {
        console.log(`   On-chain Proposal ID: ${result.proposal.onChainProposalId}`);
      }
    }
    
    console.log('═'.repeat(60));

    // Output as JSON for UI consumption
    console.log('\n📄 JSON Output for UI:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testAnalyzeAndPropose()
  .then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
