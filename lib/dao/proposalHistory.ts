/**
 * Proposal History Tracking
 * 
 * This module fetches recent proposals from the Builder DAO subgraph
 * to prevent duplicate submissions within a configurable time window (default: 24 hours).
 * 
 * Use Cases:
 * - User-triggered analysis: Skip analysis if coin already proposed recently
 * - Autonomous agent: Filter coins before AI analysis to save API costs
 */

import type { Address } from 'viem';

// ============================================
// Types
// ============================================

export type ProposalHistoryEntry = {
  coinAddress: Address;
  coinSymbol: string | null;
  coinName: string | null;
  proposalId: string;
  submittedAt: string; // ISO timestamp
  txHash: string | null;
  blockNumber: bigint;
};

// Subgraph proposal type
type SubgraphProposal = {
  proposalId: string;
  proposalNumber: number;
  description: string;
  title: string;
  timeCreated: string;
  transactionHash: string;
  snapshotBlockNumber: string;
  dao: {
    governorAddress: string;
  };
};

// ============================================
// Configuration
// ============================================

/**
 * Time window for duplicate prevention (milliseconds)
 * Default: 24 hours
 */
const DUPLICATE_PREVENTION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Builder DAO Subgraph endpoint (Base Mainnet)
 */
const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cm33ek8kjx6pz010i2c3w8z25/subgraphs/nouns-builder-base-mainnet/latest/gn';

/**
 * Get DAO entity address from environment
 * Note: In the Nouns Builder subgraph, the DAO entity ID is the NFT token address
 */
function getDaoAddress(): string {
  // Builder DAO NFT token address on Base Mainnet
  const address = '0x3740fea2a46ca4414b4afde16264389642e6596a';
  return address.toLowerCase();
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract coin address from proposal description
 * Looks for patterns like "Address: 0x..." or "Coin ID: 0x..."
 */
function extractCoinAddressFromDescription(description: string | null): Address | null {
  if (!description) {
    return null;
  }
  
  // Try different patterns
  const patterns = [
    /Address:\s*(0x[a-fA-F0-9]{40})/,
    /Coin ID:\s*(0x[a-fA-F0-9]{40})/,
    /coin:\s*(0x[a-fA-F0-9]{40})/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1] as Address;
    }
  }

  return null;
}

/**
 * Extract coin symbol from proposal description
 */
function extractCoinSymbolFromDescription(description: string | null): string | null {
  if (!description) {
    return null;
  }
  const match = description.match(/Symbol:\s*([^\n]+)/);
  return match && match[1] && match[1] !== 'N/A' ? match[1].trim() : null;
}

/**
 * Extract coin name from proposal description
 */
function extractCoinNameFromDescription(description: string | null): string | null {
  if (!description) {
    return null;
  }
  const match = description.match(/Name:\s*([^\n]+)/);
  return match && match[1] && match[1] !== 'N/A' ? match[1].trim() : null;
}

// ============================================
// Main Exports
// ============================================

/**
 * Fetch recent proposals from the Builder DAO subgraph
 * 
 * @param windowMs - Time window in milliseconds (default: 24 hours)
 * @returns Array of proposal entries within the time window
 */
export async function getRecentProposals(
  windowMs: number = DUPLICATE_PREVENTION_WINDOW_MS
): Promise<ProposalHistoryEntry[]> {
  const daoAddress = getDaoAddress();
  
  console.log(`📊 Fetching proposals from Builder DAO subgraph`);
  console.log(`   DAO Address: ${daoAddress}`);
  console.log(`   Time window: ${(windowMs / (60 * 60 * 1000)).toFixed(1)}h`);

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
        transactionHash
        snapshotBlockNumber
        dao {
          governorAddress
        }
      }
    }
  `;

  const variables = {
    where: {
      dao: daoAddress,
    },
    first: 100, // Get last 100 proposals (more than enough for 24h)
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
      throw new Error(`Subgraph request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`Subgraph errors: ${JSON.stringify(result.errors)}`);
    }

    const allProposals = result.data?.proposals || [];
    console.log(`   Found ${allProposals.length} total proposals`);

    // Filter by time window
    const now = Date.now();
    const cutoffTime = now - windowMs;
    
    const recentProposals: ProposalHistoryEntry[] = [];

    for (const proposal of allProposals) {
      const timeCreated = parseInt(proposal.timeCreated) * 1000; // Convert to ms
      
      if (timeCreated < cutoffTime) {
        break; // Proposals are ordered by time desc, so we can stop here
      }

      // Extract coin address from description
      const coinAddress = extractCoinAddressFromDescription(proposal.description);
      
      if (!coinAddress) {
        console.log(`   ⚠️  Could not extract coin address from proposal ${proposal.proposalNumber}`);
        continue;
      }

      recentProposals.push({
        coinAddress,
        coinSymbol: extractCoinSymbolFromDescription(proposal.description),
        coinName: extractCoinNameFromDescription(proposal.description),
        proposalId: proposal.proposalId,
        submittedAt: new Date(timeCreated).toISOString(),
        txHash: proposal.transactionHash,
        blockNumber: BigInt(proposal.snapshotBlockNumber),
      });

      const hoursAgo = ((now - timeCreated) / (60 * 60 * 1000)).toFixed(1);
      console.log(`   ✅ Proposal #${proposal.proposalNumber}: ${coinAddress} (${hoursAgo}h ago)`);
    }

    console.log(`   Found ${recentProposals.length} proposal(s) in the last ${(windowMs / (60 * 60 * 1000)).toFixed(1)}h`);
    
    return recentProposals;
  } catch (error) {
    console.error(`   ❌ Error fetching proposals from subgraph:`, error);
    // Return empty array on error - don't block the flow
    return [];
  }
}

/**
 * Check if a coin was proposed within the last N hours
 * 
 * @param coinAddress - Coin contract address
 * @param windowMs - Time window in milliseconds (default: 24 hours)
 * @returns Proposal entry if found within window, null otherwise
 */
export async function wasRecentlyProposed(
  coinAddress: Address,
  windowMs: number = DUPLICATE_PREVENTION_WINDOW_MS
): Promise<ProposalHistoryEntry | null> {
  const proposals = await getRecentProposals(windowMs);
  const coinAddressLower = coinAddress.toLowerCase();

  const match = proposals.find(
    (p) => p.coinAddress.toLowerCase() === coinAddressLower
  );

  if (match) {
    const now = Date.now();
    const submittedAt = new Date(match.submittedAt).getTime();
    const hoursAgo = ((now - submittedAt) / (60 * 60 * 1000)).toFixed(1);
    
    console.log(`⚠️  Coin ${coinAddress} was already proposed ${hoursAgo}h ago`);
    console.log(`   Proposal ID: ${match.proposalId}`);
    console.log(`   Block: ${match.blockNumber}`);
    
    return match;
  }

  return null;
}

/**
 * Filter coin addresses to exclude recently proposed ones
 * 
 * Useful for autonomous agent to pre-filter coins before AI analysis
 * 
 * @param coinAddresses - Array of coin addresses to check
 * @param windowMs - Time window in milliseconds (default: 24 hours)
 * @returns Object with filtered coins and excluded coins with reasons
 */
export async function filterRecentlyProposedCoins(
  coinAddresses: Address[],
  windowMs: number = DUPLICATE_PREVENTION_WINDOW_MS
): Promise<{
  allowed: Address[];
  excluded: Array<{
    coinAddress: Address;
    reason: string;
    proposalId: string;
    hoursAgo: number;
  }>;
}> {
  const proposals = await getRecentProposals(windowMs);

  const allowed: Address[] = [];
  const excluded: Array<{
    coinAddress: Address;
    reason: string;
    proposalId: string;
    hoursAgo: number;
  }> = [];

  const now = Date.now();

  for (const coinAddress of coinAddresses) {
    const coinAddressLower = coinAddress.toLowerCase();
    const proposal = proposals.find(
      (p) => p.coinAddress.toLowerCase() === coinAddressLower
    );

    if (proposal) {
      const submittedAt = new Date(proposal.submittedAt).getTime();
      const hoursAgo = (now - submittedAt) / (60 * 60 * 1000);

      excluded.push({
        coinAddress,
        reason: `Already proposed ${hoursAgo.toFixed(1)}h ago`,
        proposalId: proposal.proposalId,
        hoursAgo,
      });
    } else {
      allowed.push(coinAddress);
    }
  }

  return { allowed, excluded };
}
