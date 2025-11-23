#!/usr/bin/env ts-node

/**
 * Script to create an AI Agent wallet using Coinbase CDP SDK
 * This creates both an EOA (Externally Owned Account) and a Smart Account on Zora network
 * 
 * Usage: pnpm create:agent-wallet
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

interface WalletInfo {
  eoaAddress: string;
  smartAccountAddress: string;
  eoaId?: string;
  smartAccountId?: string;
}

async function createAgentWallet(): Promise<WalletInfo> {
  console.log('🤖 Creating AI Agent Wallet...\n');

  // Validate environment variables
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;

  if (!apiKeyId || !apiKeySecret) {
    throw new Error(
      '❌ Missing CDP credentials. Please set CDP_API_KEY_ID and CDP_API_KEY_SECRET in .env.local'
    );
  }

  console.log('✅ CDP credentials found');
  console.log(`📋 API Key ID: ${apiKeyId.slice(0, 8)}...`);

  // Initialize CDP client (walletSecret is optional - SDK will generate internally if needed)
  console.log('\n🔧 Initializing CDP client...');
  const cdp = new CdpClient({
    apiKeyId,
    apiKeySecret,
    debugging: true, // Enable debugging to see API errors
  });

  try {
    // Step 1: Create EOA (Externally Owned Account)
    console.log('\n📝 Step 1: Creating EOA (Externally Owned Account)...');
    
    // Try a simpler approach - create account without name first
    const eoaAccount = await cdp.evm.createAccount();

    console.log('✅ EOA created successfully!');
    console.log(`   Address: ${eoaAccount.address}`);

    // Step 2: Create Smart Account owned by the EOA
    console.log('\n📝 Step 2: Creating Smart Account on Base Sepolia...');
    console.log('   (Smart Accounts are currently only supported on Base Sepolia and Base Mainnet)');
    
    const smartAccount = await cdp.evm.createSmartAccount({
      owner: eoaAccount,
      name: 'AI-Agent-Smart-Account',
    });

    console.log('✅ Smart Account created successfully!');
    console.log(`   Address: ${smartAccount.address}`);

    // Prepare wallet info
    const walletInfo: WalletInfo = {
      eoaAddress: eoaAccount.address,
      smartAccountAddress: smartAccount.address,
      eoaId: undefined, // CDP SDK doesn't expose account IDs directly
      smartAccountId: undefined,
    };

    // Save wallet info to file
    const walletInfoPath = path.resolve(process.cwd(), '.agent-wallet.json');
    fs.writeFileSync(walletInfoPath, JSON.stringify(walletInfo, null, 2));
    console.log(`\n💾 Wallet info saved to: ${walletInfoPath}`);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 AI AGENT WALLET CREATED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\n📋 WALLET DETAILS:');
    console.log(`\n  EOA Address:           ${walletInfo.eoaAddress}`);
    console.log(`\n  Smart Account Address: ${walletInfo.smartAccountAddress}`);
    console.log('\n  Network:               base-sepolia (Smart Account compatible)');
    console.log('\n' + '='.repeat(60));
    console.log('\n⚠️  IMPORTANT:');
    console.log('   - Keep your .agent-wallet.json file secure!');
    console.log('   - Add it to .gitignore to prevent committing');
    console.log('   - You will need these addresses for future operations');
    console.log('\n💡 NEXT STEPS:');
    console.log('   1. Fund the Smart Account with ETH for gas fees');
    console.log('   2. Update your .env.local with these addresses if needed');
    console.log('   3. Use the Smart Account address for trading operations');
    console.log('\n');

    return walletInfo;

  } catch (error: unknown) {
    console.error('\n❌ ERROR creating agent wallet:');
    
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      
      // Try to extract more details from the error
      const errorObj = error as unknown as { 
        response?: { status: number; data: unknown }; 
        config?: { url: string } 
      };
      
      if (errorObj.response) {
        console.error(`   Status: ${errorObj.response.status}`);
        console.error(`   Response:`, JSON.stringify(errorObj.response.data, null, 2));
      }
      if (errorObj.config) {
        console.error(`   API Endpoint: ${errorObj.config.url}`);
      }
      
      if (error.stack) {
        console.error(`\n   Stack trace:`);
        console.error(error.stack);
      }
    } else {
      console.error(`   ${JSON.stringify(error, null, 2)}`);
    }

    throw error;
  }
}

// Run the script
if (require.main === module) {
  createAgentWallet()
    .then(() => {
      console.log('✅ Script completed successfully\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error.message);
      process.exit(1);
    });
}

export { createAgentWallet };
