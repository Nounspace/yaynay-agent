#!/usr/bin/env tsx
/**
 * Test submitting a governor proposal on-chain
 * This will create a real proposal on Base Sepolia testnet
 */

import dotenv from 'dotenv';
import path from 'path';
import { createBuyCoinProposal, submitBuyCoinProposal } from '../lib/dao/proposals';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testSubmitProposal() {
  console.log('🧪 Testing Governor Proposal Submission\n');
  console.log('⚠️  WARNING: This will submit a REAL proposal on Base Sepolia testnet!');
  console.log('   Make sure your Smart Account has enough ETH for gas.\n');

  try {
    // Step 1: Create a test proposal
    console.log('📝 Step 1: Creating proposal data...');
    
    const proposal = await createBuyCoinProposal({
      coinAddress: '0x50f88fe97f72cd3e75b9eb4f747f59bceba80d59' as `0x${string}`, // jessepollak coin
      coinSymbol: 'jessepollak',
      coinName: 'jessepollak',
      ethAmount: '0.001', // Very small amount for testing
      slippagePercent: 5,
      suggestedReason: 'Test proposal created by AI Treasurer agent - verifying on-chain submission works',
      triggerSource: 'manual',
    });

    console.log(`✅ Proposal created: ${proposal.proposalId}\n`);
    console.log(`   Coin: ${proposal.coinAddress}`);
    console.log(`   ETH Amount: ${proposal.ethAmount}`);
    console.log(`   Targets: ${proposal.governorProposal.targets.length}`);
    console.log(`   Values: ${proposal.governorProposal.values.length}`);
    console.log(`   Calldatas: ${proposal.governorProposal.calldatas.length}\n`);

    // Step 2: Submit to governor
    console.log('📤 Step 2: Submitting proposal to Governor on-chain...\n');
    
    const result = await submitBuyCoinProposal(proposal);

    console.log('\n🎉 SUCCESS! Proposal submitted on-chain!');
    console.log('═'.repeat(60));
    console.log(`   Transaction Hash: ${result.txHash}`);
    console.log(`   Proposal ID: ${result.proposalId || 'Not parsed yet (see TODO)'}`);
    console.log(`   View on BaseScan: https://sepolia.basescan.org/tx/${result.txHash}`);
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testSubmitProposal()
  .then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
