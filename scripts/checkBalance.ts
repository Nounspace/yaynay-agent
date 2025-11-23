#!/usr/bin/env tsx
/**
 * Check Smart Account balance on Base mainnet
 */

import 'dotenv/config';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const SMART_ACCOUNT = process.env.AGENT_SMART_ACCOUNT_ADDRESS as `0x${string}`;

if (!SMART_ACCOUNT) {
  console.error('❌ Missing AGENT_SMART_ACCOUNT_ADDRESS environment variable!');
  process.exit(1);
}

async function checkBalance() {
  const client = createPublicClient({
    chain: base,
    transport: http(),
  });

  const balance = await client.getBalance({ address: SMART_ACCOUNT });
  
  console.log(`Smart Account: ${SMART_ACCOUNT}`);
  console.log(`Balance: ${formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    console.log('\n⚠️  WARNING: Smart Account has no ETH! You need to fund it first.');
    console.log('   Run: pnpm fund:agent-wallet');
  } else if (balance < 10000000000000000n) { // < 0.01 ETH
    console.log('\n⚠️  WARNING: Balance is low. Consider funding more for multiple proposals.');
  } else {
    console.log('\n✅ Balance looks good for testing!');
  }
}

checkBalance().catch(console.error);
