#!/usr/bin/env tsx
/**
 * Proposal Executor
 * 
 * Monitors approved proposals and executes them automatically.
 * Runs every 12 minutes via PM2 cron.
 */

import 'dotenv/config';
import { createPublicClient, http, decodeEventLog } from 'viem';
import { base } from 'viem/chains';
import { CdpClient } from '@coinbase/cdp-sdk';
import { encodeFunctionData } from 'viem';

const GOVERNOR_ADDRESS = process.env.DAO_GOVERNOR_ADDRESS as `0x${string}`;
const AGENT_SMART_ACCOUNT = process.env.AGENT_SMART_ACCOUNT_ADDRESS as `0x${string}`;
const AGENT_EOA_ADDRESS = process.env.AGENT_EOA_ADDRESS as `0x${string}`;

// Cooldown to prevent rapid executions
const COOLDOWN_MS = 12 * 60 * 1000; // 12 minutes
const COOLDOWN_FILE = './data/last-executor-run.json';

// Governor ABI - key functions
const GOVERNOR_ABI = [
  {
    name: 'state',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
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
  {
    name: 'ProposalCreated',
    type: 'event',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: false },
      { name: 'proposer', type: 'address', indexed: false },
      { name: 'targets', type: 'address[]', indexed: false },
      { name: 'values', type: 'uint256[]', indexed: false },
      { name: 'signatures', type: 'string[]', indexed: false },
      { name: 'calldatas', type: 'bytes[]', indexed: false },
      { name: 'startBlock', type: 'uint256', indexed: false },
      { name: 'endBlock', type: 'uint256', indexed: false },
      { name: 'description', type: 'string', indexed: false },
    ],
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

interface ProposalData {
  proposalId: bigint;
  targets: `0x${string}`[];
  values: bigint[];
  calldatas: `0x${string}`[];
  description: string;
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
  } catch (error) {
    // File doesn't exist or error reading, allow execution
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

async function getRecentProposals(): Promise<ProposalData[]> {
  console.log('🔍 Fetching recent proposals from Governor...\n');
  
  // Use Base's official RPC endpoint (more reliable than public endpoint)
  const client = createPublicClient({
    chain: base,
    transport: http('https://base.blockpi.network/v1/rpc/public'),
  });

  // Get logs for ProposalCreated events from last 7 days
  const currentBlock = await client.getBlockNumber();
  const blocksPerDay = 43200n; // ~2 seconds per block on Base
  const fromBlock = currentBlock - (blocksPerDay * 7n);

  const logs = await client.getLogs({
    address: GOVERNOR_ADDRESS,
    event: GOVERNOR_ABI.find(item => item.name === 'ProposalCreated'),
    fromBlock,
    toBlock: 'latest',
  });

  console.log(`   Found ${logs.length} proposals in last 7 days\n`);

  const proposals: ProposalData[] = [];

  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: GOVERNOR_ABI,
        data: log.data,
        topics: log.topics,
      });

      const { proposalId, targets, values, calldatas, description } = decoded.args as any;

      // Calculate description hash (keccak256 of description)
      const { keccak256, toHex } = await import('viem');
      const descriptionHash = keccak256(toHex(description));

      proposals.push({
        proposalId,
        targets,
        values,
        calldatas,
        description,
        descriptionHash,
      });
    } catch (error) {
      console.error('⚠️  Failed to decode proposal:', error);
    }
  }

  return proposals;
}

async function getProposalState(proposalId: bigint): Promise<ProposalState> {
  const client = createPublicClient({
    chain: base,
    transport: http('https://base.blockpi.network/v1/rpc/public'),
  });

  const state = await client.readContract({
    address: GOVERNOR_ADDRESS,
    abi: GOVERNOR_ABI,
    functionName: 'state',
    args: [proposalId],
  }) as number;

  return state;
}

async function executeProposal(proposal: ProposalData): Promise<void> {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🚀 EXECUTING APPROVED PROPOSAL');
  console.log('════════════════════════════════════════════════════════════\n');

  console.log(`Proposal ID: ${proposal.proposalId.toString()}`);
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
  
  console.log(`   ✅ EOA owner loaded: ${owner.address}`);
  
  // Then get the Smart Account with the owner
  const smartAccount = await cdp.evm.getSmartAccount({
    address: AGENT_SMART_ACCOUNT,
    owner: owner,
  });
  
  console.log(`   ✅ Smart Account loaded: ${smartAccount.address}\n`);

  // Encode execute() function call
  console.log('📝 Encoding execute() function call...');
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
  console.log(`✅ Encoded calldata: ${executeCalldata.substring(0, 66)}... (${executeCalldata.length / 2 - 1} bytes)\n`);

  // Send user operation
  console.log('📤 Sending execution transaction...');
  console.log(`   Governor: ${GOVERNOR_ADDRESS}`);
  console.log(`   Network: base\n`);

  try {
    const userOpResult = await cdp.evm.sendUserOperation({
      smartAccount,
      network: 'base',
      calls: [{
        to: GOVERNOR_ADDRESS,
        data: executeCalldata,
        value: 0n,
      }],
    });

    console.log('   ✅ User operation submitted!');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userOpHash = (userOpResult as any).userOpHash || (userOpResult as any).hash || (userOpResult as any).userOperationHash;
    console.log(`   User Op Hash: ${userOpHash}\n`);

    console.log('⏳ Waiting for transaction confirmation...');
    console.log('   (This may take 10-30 seconds)\n');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const receipt = await (userOpResult as any).wait();
    console.log('   ✅ Transaction confirmed!\n');

    console.log('✅ Proposal executed successfully!');
    console.log(`   Transaction Hash: ${receipt.transactionHash}`);
    console.log(`   View on BaseScan: https://basescan.org/tx/${receipt.transactionHash}`);
    console.log(`   View on Builder: https://build.top/dao/base/${GOVERNOR_ADDRESS}\n`);
  } catch (error: any) {
    console.error('\n❌ Error executing proposal:');
    console.error(`   Message: ${error.message}`);
    throw error;
  }
}

function getStateName(state: ProposalState): string {
  const names = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];
  return names[state] || 'Unknown';
}

async function runExecutorOnce() {
  console.log('\n🚀 Starting Proposal Executor...');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════════════════════\n');

  // Check cooldown
  const canRun = await checkCooldown();
  if (!canRun) {
    console.log('🛑 Skipping run due to cooldown period\n');
    return;
  }

  try {
    // Fetch recent proposals
    const proposals = await getRecentProposals();

    if (proposals.length === 0) {
      console.log('📋 No recent proposals found\n');
      await updateCooldown();
      return;
    }

    // Check each proposal for execution readiness
    console.log('🔎 Checking proposal states...\n');
    
    let executedCount = 0;
    let succeededCount = 0;

    for (const proposal of proposals) {
      const state = await getProposalState(proposal.proposalId);
      const stateName = getStateName(state);
      
      console.log(`Proposal ${proposal.proposalId.toString()}: ${stateName}`);

      if (state === ProposalState.Succeeded || state === ProposalState.Queued) {
        succeededCount++;
        console.log(`   ✅ Ready for execution!\n`);
        
        try {
          await executeProposal(proposal);
          executedCount++;
          console.log('════════════════════════════════════════════════════════════\n');
        } catch (error: any) {
          console.error(`   ❌ Execution failed: ${error.message}\n`);
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total proposals checked: ${proposals.length}`);
    console.log(`   Succeeded/Queued: ${succeededCount}`);
    console.log(`   Executed: ${executedCount}\n`);

    // Update cooldown after processing
    await updateCooldown();

  } catch (error: any) {
    console.error('\n❌ ERROR in executor:');
    console.error(`   Message: ${error.message}`);
    console.error(`   Stack trace:`);
    console.error(error);
    process.exit(1);
  }

  console.log('✅ Executor completed successfully\n');
}

// Run the executor
runExecutorOnce().catch(error => {
  console.error('❌ Executor failed:', error);
  process.exit(1);
});
