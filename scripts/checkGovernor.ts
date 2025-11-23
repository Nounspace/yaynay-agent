#!/usr/bin/env tsx
/**
 * Check Governor contract requirements and Smart Account status
 */

import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const GOVERNOR = process.env.DAO_GOVERNOR_ADDRESS as `0x${string}`;
const SMART_ACCOUNT = process.env.AGENT_SMART_ACCOUNT_ADDRESS as `0x${string}`;

if (!GOVERNOR || !SMART_ACCOUNT) {
  console.error('❌ Missing environment variables!');
  console.error('   Required: DAO_GOVERNOR_ADDRESS, AGENT_SMART_ACCOUNT_ADDRESS');
  process.exit(1);
}

// Governor ABI - key functions
const GOVERNOR_ABI = [
  {
    name: 'proposalThreshold',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'token',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'getVotes',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

async function checkGovernor() {
  console.log('🔍 Checking Governor contract requirements...\n');
  
  const client = createPublicClient({
    chain: base,
    transport: http(),
  });

  try {
    // Get proposal threshold
    const threshold = await client.readContract({
      address: GOVERNOR,
      abi: GOVERNOR_ABI,
      functionName: 'proposalThreshold',
    });
    
    console.log(`✅ Proposal Threshold: ${threshold.toString()} votes`);

    // Get governance token address
    const tokenAddress = await client.readContract({
      address: GOVERNOR,
      abi: GOVERNOR_ABI,
      functionName: 'token',
    });
    
    console.log(`✅ Governance Token: ${tokenAddress}`);

    // Check Smart Account voting power
    const votes = await client.readContract({
      address: GOVERNOR,
      abi: GOVERNOR_ABI,
      functionName: 'getVotes',
      args: [SMART_ACCOUNT],
    });
    
    console.log(`\n📊 Smart Account Voting Power:`);
    console.log(`   Address: ${SMART_ACCOUNT}`);
    console.log(`   Votes: ${votes.toString()}`);
    console.log(`   Required: ${threshold.toString()}`);
    
    if (votes < threshold) {
      console.log('\n❌ PROBLEM: Smart Account does not have enough voting power!');
      console.log(`   You need ${threshold.toString()} votes but only have ${votes.toString()}`);
      console.log('\n💡 Solution: The Smart Account needs to own governance tokens (NFTs)');
      console.log(`   Check if this is a token-voting governor on: https://sepolia.basescan.org/address/${tokenAddress}`);
    } else {
      console.log('\n✅ Smart Account has enough voting power to propose!');
    }

  } catch (error) {
    console.error('❌ Error checking Governor:', error);
  }
}

checkGovernor().catch(console.error);
