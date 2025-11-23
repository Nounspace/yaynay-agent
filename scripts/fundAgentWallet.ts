#!/usr/bin/env tsx
import { CdpClient } from '@coinbase/cdp-sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

interface WalletInfo {
  eoaAddress: string;
  smartAccountAddress: string;
  eoaId?: string;
  smartAccountId?: string;
}

async function fundAgentWallet(): Promise<void> {
  console.log('💰 Funding AI Agent Wallet...\n');

  // Load wallet info
  const walletInfoPath = path.resolve(process.cwd(), '.agent-wallet.json');
  
  if (!fs.existsSync(walletInfoPath)) {
    throw new Error(
      '❌ Wallet info not found. Please run "pnpm create:agent-wallet" first.'
    );
  }

  const walletInfo: WalletInfo = JSON.parse(fs.readFileSync(walletInfoPath, 'utf-8'));
  console.log('✅ Wallet info loaded');
  console.log(`   Smart Account: ${walletInfo.smartAccountAddress}`);

  // Initialize CDP client
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;

  if (!apiKeyId || !apiKeySecret) {
    throw new Error(
      '❌ Missing CDP credentials. Please set CDP_API_KEY_ID and CDP_API_KEY_SECRET in .env.local'
    );
  }

  console.log('\n🔧 Initializing CDP client...');
  const cdp = new CdpClient({
    apiKeyId,
    apiKeySecret,
  });

  try {
    // Request testnet ETH from faucet
    console.log('\n💧 Requesting ETH from Base Sepolia faucet...');
    console.log(`   Address: ${walletInfo.smartAccountAddress}`);

    const faucetResponse = await cdp.evm.requestFaucet({
      address: walletInfo.smartAccountAddress,
      network: 'base-sepolia',
      token: 'eth',
    });

    console.log('✅ Faucet request successful!');
    console.log(`   Transaction Hash: ${faucetResponse.transactionHash}`);
    console.log(`   Explorer: https://sepolia.basescan.org/tx/${faucetResponse.transactionHash}`);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 AGENT WALLET FUNDED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\n💡 Your wallet is now ready for trading operations!');
    console.log(`\n   View on BaseScan: https://sepolia.basescan.org/address/${walletInfo.smartAccountAddress}`);
    console.log('\n' + '='.repeat(60));

  } catch (error: unknown) {
    const err = error as Error;
    console.error('\n❌ ERROR funding agent wallet:');
    console.error(`   Message: ${err.message}`);
    if (err.stack) {
      console.error(`   Stack trace:\n${err.stack}`);
    }
    throw error;
  }
}

// Run the function
fundAgentWallet()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Script failed: ${error.message}`);
    process.exit(1);
  });
