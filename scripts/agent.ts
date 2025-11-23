#!/usr/bin/env tsx
/**
 * AI Agent for Zora Creator Coins Trading
 * 
 * This script runs autonomously to:
 * 1. Fetch trending Zora creator coins
 * 2. Analyze them using OpenAI
 * 3. Generate trading recommendations
 * 4. Create proposals for promising coins
 * 5. Execute trades (coming soon)
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { suggestBuys } from '../lib/agent/suggestBuys';
import { createBuyCoinProposal } from '../lib/dao/proposals';
import { 
  getNextSuggestion, 
  updateSuggestionStatus,
  deleteSuggestion,
  type QueuedSuggestion 
} from '../lib/dao/suggestionsQueue';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Confidence threshold for auto-creating proposals
const CONFIDENCE_THRESHOLD = 0.7;

// Cooldown period in minutes (prevent running too frequently)
const COOLDOWN_MINUTES = 12;
const LAST_RUN_FILE = path.resolve(process.cwd(), 'data', 'last-agent-run.json');

/**
 * Check if agent ran recently (within cooldown period)
 */
function checkCooldown(): boolean {
  try {
    if (!fs.existsSync(LAST_RUN_FILE)) {
      return false; // No previous run
    }

    const data = JSON.parse(fs.readFileSync(LAST_RUN_FILE, 'utf-8'));
    const lastRun = new Date(data.timestamp);
    const now = new Date();
    const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);

    if (minutesSinceLastRun < COOLDOWN_MINUTES) {
      console.log(`⏰ Cooldown active: Last run was ${minutesSinceLastRun.toFixed(1)} minutes ago`);
      console.log(`   Need to wait ${(COOLDOWN_MINUTES - minutesSinceLastRun).toFixed(1)} more minutes`);
      return true;
    }

    return false;
  } catch {
    console.log('⚠️  Could not read last run file, proceeding anyway');
    return false;
  }
}

/**
 * Record the current run time
 */
function recordRunTime(): void {
  try {
    const dir = path.dirname(LAST_RUN_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      LAST_RUN_FILE,
      JSON.stringify({ timestamp: new Date().toISOString() }, null, 2)
    );
  } catch {
    console.log('⚠️  Could not write last run file');
  }
}

/**
 * Process a queued suggestion by creating and submitting a proposal
 */
async function processQueuedSuggestion(suggestion: QueuedSuggestion): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('📋 PROCESSING QUEUED SUGGESTION');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`Queue Item ID: ${suggestion.id}`);
  console.log(`Coin: ${suggestion.coinName || suggestion.coinSymbol || suggestion.coinId}`);
  console.log(`Confidence: ${(suggestion.confidenceScore * 100).toFixed(1)}%`);
  console.log(`Reason: ${suggestion.reason}`);
  console.log(`Added at: ${suggestion.addedAt}`);
  console.log(`Source: ${suggestion.source}`);
  console.log('');

  try {
    // Mark as processing
    updateSuggestionStatus(suggestion.id, 'processing');

    // Calculate dynamic ETH allocation based on treasury and active proposals
    const { calculateProposalAllocation } = await import('../lib/dao/calculateAllocation.js');
    const ethAmount = await calculateProposalAllocation(1); // 1% of available funds
    const slippagePercent = 5; // 5% max slippage

    console.log(`💰 Trade Parameters:`);
    console.log(`   ETH Amount: ${ethAmount} ETH`);
    console.log(`   Max Slippage: ${slippagePercent}%`);
    console.log(`   Generating transaction via Zora SDK...`);

    // Create proposal
    const proposal = await createBuyCoinProposal({
      coinAddress: suggestion.coinId as `0x${string}`,
      coinSymbol: suggestion.coinSymbol || null,
      coinName: suggestion.coinName || null,
      ethAmount,
      slippagePercent,
      suggestedReason: suggestion.reason,
      triggerSource: suggestion.source,
    });

    console.log(`✅ Proposal created: ${proposal.proposalId}`);
    console.log(`   Status: ${proposal.status}`);
    console.log(`   Governor data ready: ${proposal.governorProposal.targets.length} transaction(s)`);

    // Submit proposal to Governor contract
    console.log('\n' + '═'.repeat(60));
    console.log('📤 SUBMITTING PROPOSAL TO GOVERNOR CONTRACT');
    console.log('═'.repeat(60));
    console.log('');

    const { submitProposalToGovernor } = await import('../lib/dao/proposals');
    
    const submissionResult = await submitProposalToGovernor({
      targets: proposal.governorProposal.targets,
      values: proposal.governorProposal.values.map(v => v.toString()),
      calldatas: proposal.governorProposal.calldatas,
      description: proposal.governorProposal.description,
    });

    console.log(`✅ Proposal submitted to Governor!`);
    console.log(`   Transaction Hash: ${submissionResult.txHash}`);
    if (submissionResult.proposalId) {
      console.log(`   On-chain Proposal ID: ${submissionResult.proposalId}`);
    }

    // Delete from queue (successfully processed)
    deleteSuggestion(suggestion.id);

    console.log('\n✅ Queue item processed and removed from queue');

  } catch (error: unknown) {
    const err = error as Error;
    console.error('\n❌ Failed to process queue item:', err.message);
    
    // Mark as failed
    updateSuggestionStatus(suggestion.id, 'failed', {
      errorMessage: err.message,
    });
    
    throw error;
  }
}

/**
 * Perform autonomous analysis to find and propose a new coin
 */
async function performAutonomousAnalysis(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('🤖 AUTONOMOUS ANALYSIS MODE');
  console.log('═'.repeat(60));
  console.log('');

  // Get AI-powered buy suggestion (single coin)
  const suggestion = await suggestBuys();

  // Display results
  console.log('\n' + '═'.repeat(60));
  console.log('📈 AI INVESTMENT RECOMMENDATION');
  console.log('═'.repeat(60));

  if (!suggestion) {
    console.log('\n⚠️  No new coins to suggest right now');
    console.log('   (Either no trending coins available, or DAO already holds all top coins)');
    return;
  }

  // Log the recommendation
  console.log(`\n🎯 Recommended Coin:\n`);
  console.log(`${suggestion.coin.name || suggestion.coin.symbol || 'Unknown'}`);
  console.log(`   Coin ID: ${suggestion.coin.coinId}`);
  console.log(`   Symbol: ${suggestion.coin.symbol || 'N/A'}`);
  console.log(`   Creator: ${suggestion.coin.creatorAddress || 'Unknown'}`);
  console.log(`   Confidence: ${(suggestion.confidenceScore * 100).toFixed(1)}%`);
  console.log(`   Reason: ${suggestion.reason}`);
  
  if (suggestion.coin.currentPriceUsd !== null && suggestion.coin.currentPriceUsd !== undefined) {
    console.log(`   Current Price: $${suggestion.coin.currentPriceUsd.toFixed(6)}`);
  }
  
  if (suggestion.coin.volume24hUsd !== null && suggestion.coin.volume24hUsd !== undefined) {
    console.log(`   24h Volume: $${suggestion.coin.volume24hUsd.toLocaleString()}`);
  }
  
  if (suggestion.suggestedAllocationUsd) {
    console.log(`   Suggested Allocation: $${suggestion.suggestedAllocationUsd.toLocaleString()}`);
  }
  
  console.log('');

  // Check confidence threshold
  if (suggestion.confidenceScore < CONFIDENCE_THRESHOLD) {
    console.log(`⚠️  Confidence score (${(suggestion.confidenceScore * 100).toFixed(1)}%) is below threshold (${(CONFIDENCE_THRESHOLD * 100).toFixed(1)}%)`);
    console.log('   Skipping proposal creation.');
    return;
  }

  // Create proposal
  console.log('\n' + '═'.repeat(60));
  console.log('📝 CREATING GOVERNOR PROPOSAL');
  console.log('═'.repeat(60));
  console.log('');

  // Calculate dynamic ETH allocation based on treasury and active proposals
  const { calculateProposalAllocation } = await import('../lib/dao/calculateAllocation.js');
  const ethAmount = await calculateProposalAllocation(1); // 1% of available funds
  const slippagePercent = 5; // 5% max slippage

  console.log(`💰 Trade Parameters:`);
  console.log(`   ETH Amount: ${ethAmount} ETH`);
  console.log(`   Max Slippage: ${slippagePercent}%`);
  console.log(`   Generating transaction via Zora SDK...`);

  const proposal = await createBuyCoinProposal({
    coinAddress: suggestion.coin.coinId as `0x${string}`, // Coin ID is the contract address
    coinSymbol: suggestion.coin.symbol || null,
    coinName: suggestion.coin.name || null,
    ethAmount,
    slippagePercent,
    suggestedReason: suggestion.reason,
    triggerSource: 'agent',
  });

  console.log(`✅ Proposal created: ${proposal.proposalId}`);
  console.log(`   Status: ${proposal.status}`);
  console.log(`   Created at: ${proposal.createdAt}`);
  console.log(`   Governor data ready: ${proposal.governorProposal.targets.length} transaction(s)`);
  console.log(`   Target: ${proposal.governorProposal.targets[0]}`);
  console.log(`   Value: ${proposal.governorProposal.values[0].toString()} wei`);
  console.log(`   Calldata length: ${proposal.governorProposal.calldatas[0].length} bytes`);
  
  if (proposal.txHash) {
    console.log(`   Transaction: ${proposal.txHash}`);
  }

  console.log('\n📄 Proposal Description:');
  console.log('─'.repeat(60));
  console.log(proposal.governorProposal.description.split('\n').slice(0, 5).join('\n') + '\n...');
  console.log('─'.repeat(60));

  // Submit proposal to Governor contract
  console.log('\n' + '═'.repeat(60));
  console.log('📤 SUBMITTING PROPOSAL TO GOVERNOR CONTRACT');
  console.log('═'.repeat(60));
  console.log('');

  const { submitProposalToGovernor } = await import('../lib/dao/proposals');
  
  const submissionResult = await submitProposalToGovernor({
    targets: proposal.governorProposal.targets,
    values: proposal.governorProposal.values.map(v => v.toString()),
    calldatas: proposal.governorProposal.calldatas,
    description: proposal.governorProposal.description,
  });

  console.log(`✅ Proposal submitted to Governor!`);
  console.log(`   Transaction Hash: ${submissionResult.txHash}`);
  if (submissionResult.proposalId) {
    console.log(`   On-chain Proposal ID: ${submissionResult.proposalId}`);
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('✅ AGENT RUN COMPLETED SUCCESSFULLY');
  console.log('═'.repeat(60));
  console.log('\n💡 Next Steps:');
  console.log('   1. DAO members can now vote on the proposal');
  console.log(`   2. View proposal on Builder DAO: https://build.top/dao/base/${process.env.DAO_GOVERNOR_ADDRESS}`);
  console.log('═'.repeat(60));
}

/**
 * Run the AI agent once to analyze trending coins and generate recommendations
 */
async function runAgentOnce(): Promise<void> {
  console.log('🤖 AI AGENT STARTING...\n');
  console.log('═'.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));
  console.log('');

  // Check cooldown
  if (checkCooldown()) {
    console.log('🛑 Skipping run due to cooldown period');
    return;
  }

  // Record this run
  recordRunTime();

  try {
    // 1. Check the queue first
    const queuedSuggestion = getNextSuggestion();
    
    if (queuedSuggestion) {
      console.log('📋 Queue has pending items. Processing queue first...');
      await processQueuedSuggestion(queuedSuggestion);
    } else {
      console.log('📋 Queue is empty. Running autonomous analysis...');
      await performAutonomousAnalysis();
    }

  } catch (error: unknown) {
    const err = error as Error;
    console.error('\n❌ ERROR in agent execution:');
    console.error(`   Message: ${err.message}`);
    if (err.stack) {
      console.error(`   Stack trace:\n${err.stack}`);
    }
    throw error;
  }
}

// Main execution
console.log('\n🚀 Starting AI Trading Agent...\n');

runAgentOnce()
  .then(() => {
    console.log('\n✅ Agent execution completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Agent failed: ${error.message}`);
    process.exit(1);
  });
