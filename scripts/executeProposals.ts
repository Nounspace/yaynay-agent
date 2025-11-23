#!/usr/bin/env tsx
/**
 * Proposal Executor
 * 
 * Monitors approved proposals and executes them automatically.
 * Runs every 12 minutes via PM2 cron.
 */

import 'dotenv/config';
import { createPublicClient, http, keccak256, toHex, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { CdpClient } from '@coinbase/cdp-sdk';

interface SubgraphProposal {
  proposalId: string;
  proposalNumber: number;
  description: string;
  title: string;
  timeCreated: string;
}

interface SubgraphResponse {
  data?: {
    proposals?: SubgraphProposal[];
  };
}

const GOVERNOR_ADDRESS = process.env.DAO_GOVERNOR_ADDRESS as `0x${string}`;
const AGENT_SMART_ACCOUNT = process.env.AGENT_SMART_ACCOUNT_ADDRESS as `0x${string}`;
const AGENT_EOA_ADDRESS = process.env.AGENT_EOA_ADDRESS as `0x${string}`;

// Subgraph URL for Builder DAO (Base Mainnet)
const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cm33ek8kjx6pz010i2c3w8z25/subgraphs/nouns-builder-base-mainnet/latest/gn';
// Builder DAO NFT token address (this is the DAO entity ID in the subgraph)
const DAO_ADDRESS = '0xbfBadc73C07f96f77Fd23d86912912409fa144D8';

// Cooldown to prevent rapid executions
const COOLDOWN_MS = 12 * 60 * 1000; // 12 minutes
const COOLDOWN_FILE = './data/last-executor-run.json';

// Governor ABI
const GOVERNOR_ABI = [
  {
    name: 'state',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'proposalId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'targets', type: 'address[]' },
      { name: 'values', type: 'uint256[]' },
      { name: 'calldatas', type: 'bytes[]' },
      { name: 'descriptionHash', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Proposal states from Governor
enum ProposalState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}

interface SubgraphProposal {
  proposalId: string;
  proposalNumber: number;
  description: string;
  title: string;
  timeCreated: string;
}

interface ProposalData {
  proposalId: `0x${string}`; // bytes32 hex string from subgraph
  proposalNumber: number;
  description: string;
  targets: `0x${string}`[];
  values: bigint[];
  calldatas: `0x${string}`[];
  descriptionHash: `0x${string}`;
}

async function checkCooldown(): Promise<boolean> {
  try {
    const fs = await import('fs/promises');
    const data = await fs.readFile(COOLDOWN_FILE, 'utf-8');
    const { lastRun } = JSON.parse(data);
    const timeSinceLastRun = Date.now() - lastRun;
    
    if (timeSinceLastRun < COOLDOWN_MS) {
      const minutesRemaining = ((COOLDOWN_MS - timeSinceLastRun) / 60000).toFixed(1);
      console.log(`⏰ Cooldown active: Last run was ${(timeSinceLastRun / 60000).toFixed(1)} minutes ago`);
      console.log(`   Need to wait ${minutesRemaining} more minutes`);
      return false;
    }
  } catch {
    // File doesn't exist, allow execution
  }
  return true;
}

async function updateCooldown(): Promise<void> {
  try {
    const fs = await import('fs/promises');
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(COOLDOWN_FILE, JSON.stringify({ lastRun: Date.now() }));
  } catch (error) {
    console.error('⚠️  Failed to update cooldown file:', error);
  }
}

/**
 * Extract transaction details from proposal description
 */
function extractProposalDetails(description: string): {
  targets: `0x${string}`[];
  values: bigint[];
  calldatas: `0x${string}`[];
} | null {
  try {
    // Look for coin address in description
    const addressMatch = description.match(/Address:\s*(0x[a-fA-F0-9]{40})/);
    if (!addressMatch) return null;
    
    const coinAddress = addressMatch[1] as `0x${string}`;
    
    // Extract amount (default to 0.01 ETH if not found)
    const amountMatch = description.match(/Amount:\s*([\d.]+)\s*ETH/);
    const amount = amountMatch ? amountMatch[1] : '0.01';
    const valueInWei = BigInt(parseFloat(amount) * 1e18);
    
    return {
      targets: [coinAddress],
      values: [valueInWei],
      calldatas: ['0x' as `0x${string}`], // Empty calldata for ETH transfer
    };
  } catch {
    return null;
  }
}

async function getRecentProposals(): Promise<ProposalData[]> {
  console.log('🔍 Fetching recent proposals from subgraph...\n');
  
  const query = `
    query proposals($where: Proposal_filter, $first: Int!) {
      proposals(
        where: $where
        first: $first
        orderBy: timeCreated
        orderDirection: desc
      ) {
        proposalId
        proposalNumber
        description
        title
        timeCreated
      }
    }
  `;

  const variables = {
    where: {
      dao: DAO_ADDRESS.toLowerCase(),
    },
    first: 50, // Get last 50 proposals
  };

  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Subgraph request failed: ${response.status}`);
    }

    const result = await response.json() as SubgraphResponse;
    const proposals = result.data?.proposals || [];
    
    console.log(`   Found ${proposals.length} proposals from subgraph\n`);

    // Parse proposals and extract transaction details
    const parsedProposals: ProposalData[] = [];

    for (const p of proposals as SubgraphProposal[]) {
      const details = extractProposalDetails(p.description);
      if (!details) {
        continue; // Skip if we can't parse the proposal
      }

      const descriptionHash = keccak256(toHex(p.description));

      parsedProposals.push({
        proposalId: p.proposalId as `0x${string}`,
        proposalNumber: p.proposalNumber,
        description: p.description,
        targets: details.targets,
        values: details.values,
        calldatas: details.calldatas,
        descriptionHash,
      });
    }

    console.log(`   Parsed ${parsedProposals.length} proposals with valid transaction data\n`);
    return parsedProposals;
  } catch (error) {
    console.error('   ❌ Error fetching from subgraph:', error);
    return [];
  }
}

async function getProposalState(proposalId: `0x${string}`): Promise<ProposalState> {
  const client = createPublicClient({
    chain: base,
    transport: http(), // Uses default Base RPC
  });

  const state = await client.readContract({
    address: GOVERNOR_ADDRESS,
    abi: GOVERNOR_ABI,
    functionName: 'state',
    args: [proposalId as `0x${string}`],
  }) as number;

  return state;
}

async function executeProposal(proposal: ProposalData): Promise<void> {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🚀 EXECUTING APPROVED PROPOSAL');
  console.log('════════════════════════════════════════════════════════════\n');

  console.log(`Proposal #${proposal.proposalNumber}`);
  console.log(`ID: ${proposal.proposalId}`);
  console.log(`Description: ${proposal.description.substring(0, 100)}...`);
  console.log(`Targets: ${proposal.targets.length} transaction(s)`);
  console.log(`Total value: ${proposal.values.reduce((a, b) => a + b, 0n)} wei\n`);

  // Initialize CDP client
  console.log('🔧 Initializing CDP client...');
  const cdp = new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    debugging: false,
  });
  console.log('✅ CDP client initialized\n');

  // Load Smart Account
  console.log('🔑 Loading Smart Account...');
  
  // First, get the EOA owner
  const owner = await cdp.evm.getAccount({
    address: AGENT_EOA_ADDRESS,
  });
  console.log(`   Owner: ${AGENT_EOA_ADDRESS}`);

  // Then get the Smart Account with the owner
  const smartAccount = await cdp.evm.getSmartAccount({
    address: AGENT_SMART_ACCOUNT,
    owner,
  });
  console.log(`   Smart Account: ${AGENT_SMART_ACCOUNT}`);
  console.log('✅ Smart Account loaded\n');

  // Prepare execute transaction
  console.log('📝 Preparing execute transaction...');
  
  const executeCalldata = encodeFunctionData({
    abi: GOVERNOR_ABI,
    functionName: 'execute',
    args: [
      proposal.targets,
      proposal.values,
      proposal.calldatas,
      proposal.descriptionHash,
    ],
  });

  console.log(`   Calldata: ${executeCalldata.substring(0, 66)}...`);
  console.log('✅ Transaction prepared\n');

  // Execute via Smart Account
  console.log('🚀 Submitting execution transaction...');
  
  try {
    const result = await cdp.evm.sendUserOperation({
      smartAccount,
      network: 'base',
      calls: [{
        to: GOVERNOR_ADDRESS,
        data: executeCalldata,
        value: 0n,
      }],
    });

    console.log('\n✅ EXECUTION TRANSACTION SUBMITTED!');
    console.log('════════════════════════════════════════════════════════════');
    console.log('Result:', result);
    console.log('════════════════════════════════════════════════════════════\n');
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('\n❌ EXECUTION FAILED!');
      console.error('════════════════════════════════════════════════════════════');
      console.error(`Error: ${error.message}`);
      console.error('════════════════════════════════════════════════════════════\n');
      throw error;
    }
    throw new Error('Unknown error during execution');
  }
}

async function main() {
  console.log('\n🚀 Starting Proposal Executor...');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════════════════════\n');

  // Check cooldown
  const canRun = await checkCooldown();
  if (!canRun) {
    console.log('⏸️  Exiting due to cooldown\n');
    return;
  }

  try {
    // Get recent proposals from subgraph
    const proposals = await getRecentProposals();

    if (proposals.length === 0) {
      console.log('📭 No proposals found\n');
      await updateCooldown();
      return;
    }

    // Check each proposal's state
    console.log('🔍 Checking proposal states...\n');
    
    let executedCount = 0;

    for (const proposal of proposals) {
      const state = await getProposalState(proposal.proposalId);
      const stateName = ProposalState[state];

      console.log(`   Proposal #${proposal.proposalNumber}: ${stateName} (${state})`);

      // Execute if Succeeded (4) or Queued (5)
      if (state === ProposalState.Succeeded || state === ProposalState.Queued) {
        console.log(`   ✅ Proposal #${proposal.proposalNumber} is ready for execution!\n`);
        
        try {
          await executeProposal(proposal);
          executedCount++;
          
          // Only execute one proposal per run to be safe
          console.log('✅ Executed 1 proposal. Stopping to prevent issues.\n');
          break;
        } catch (error: unknown) {
          if (error instanceof Error) {
            console.error(`   ❌ Failed to execute proposal #${proposal.proposalNumber}:`, error.message);
          } else {
            console.error(`   ❌ Failed to execute proposal #${proposal.proposalNumber}: Unknown error`);
          }
          // Continue to next proposal
        }
      }
    }

    if (executedCount === 0) {
      console.log('\n📋 No proposals ready for execution');
      console.log('   (Looking for Succeeded or Queued state)\n');
    }

    // Update cooldown
    await updateCooldown();
    console.log('✅ Executor run complete\n');
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('\n❌ ERROR in executor:');
      console.error(`   Message: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack trace:`);
        console.error(error.stack);
      }
    } else {
      console.error('\n❌ Unknown error in executor');
    }
    process.exit(1);
  }
}

main();
