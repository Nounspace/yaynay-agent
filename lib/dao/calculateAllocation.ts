/**
 * Calculate ETH Allocation for Proposals
 * 
 * Dynamically determines how much ETH to allocate for each proposal based on:
 * - Total treasury balance
 * - Total value of active (non-executed) proposals
 * - Configurable percentage (default: 1%)
 */

import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';

const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cm33ek8kjx6pz010i2c3w8z25/subgraphs/nouns-builder-base-mainnet/latest/gn';
const DAO_NFT_ADDRESS = '0x3740fea2a46ca4414b4afde16264389642e6596a';

/**
 * Get Treasury ETH balance
 */
async function getTreasuryBalance(treasuryAddress: Address): Promise<bigint> {
  const client = createPublicClient({
    chain: base,
    transport: http(),
  });

  const balance = await client.getBalance({ address: treasuryAddress });
  return balance;
}

/**
 * Get total value of active proposals (not executed, not defeated, not expired)
 * States: 0=Pending, 1=Active, 2=Canceled, 3=Defeated, 4=Succeeded, 5=Queued, 6=Expired, 7=Executed
 * Active states: 0, 1, 4, 5 (Pending, Active, Succeeded, Queued)
 */
async function getTotalActiveProposalValue(): Promise<bigint> {
  // Query subgraph for recent proposals
  const query = `
    query proposals($where: Proposal_filter, $first: Int!) {
      proposals(
        where: $where
        first: $first
        orderBy: timeCreated
        orderDirection: desc
      ) {
        proposalId
        description
        values
      }
    }
  `;

  const variables = {
    where: {
      dao: DAO_NFT_ADDRESS.toLowerCase(),
    },
    first: 100, // Get recent proposals
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
      console.warn('⚠️  Failed to fetch proposals from subgraph, using 0 for active proposals');
      return 0n;
    }

    const result = await response.json();
    const proposals = result.data?.proposals || [];

    // Now check state of each proposal via contract
    const client = createPublicClient({
      chain: base,
      transport: http(),
    });

    const governorAddress = process.env.DAO_GOVERNOR_ADDRESS as Address;
    const governorAbi = [
      {
        name: 'state',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'proposalId', type: 'bytes32' }],
        outputs: [{ name: '', type: 'uint8' }],
      },
    ] as const;

    let totalValue = 0n;

    for (const proposal of proposals) {
      try {
        // Check proposal state
        const state = await client.readContract({
          address: governorAddress,
          abi: governorAbi,
          functionName: 'state',
          args: [proposal.proposalId as `0x${string}`],
        }) as number;

        // Only count active states: 0 (Pending), 1 (Active), 4 (Succeeded), 5 (Queued)
        if ([0, 1, 4, 5].includes(state)) {
          // Extract ETH value from proposal description (format: "Amount: X ETH")
          const amountMatch = proposal.description?.match(/Amount:\s*([\d.]+)\s*ETH/);
          if (amountMatch) {
            const ethAmount = parseFloat(amountMatch[1]);
            const weiAmount = BigInt(Math.floor(ethAmount * 1e18));
            totalValue += weiAmount;
          }
        }
      } catch (error) {
        // Skip proposals that error (might be old format or RPC issue)
        continue;
      }
    }

    return totalValue;
  } catch (error) {
    console.warn('⚠️  Error calculating active proposal value:', error);
    return 0n;
  }
}

/**
 * Calculate ETH allocation for a new proposal
 * Formula: (Treasury Balance - Total Active Proposal Value) * percentage
 * 
 * @param allocationPercent - Percentage of available funds to allocate (default: 1%)
 * @returns ETH amount as a string (e.g., "0.01")
 */
export async function calculateProposalAllocation(
  allocationPercent: number = 1
): Promise<string> {
  const treasuryAddress = process.env.DAO_TREASURY_ADDRESS as Address;
  
  if (!treasuryAddress) {
    console.warn('⚠️  DAO_TREASURY_ADDRESS not set, using default 0.01 ETH');
    return '0.01';
  }

  console.log('💰 Calculating proposal allocation...');

  try {
    // Get treasury balance
    const treasuryBalance = await getTreasuryBalance(treasuryAddress);
    console.log(`   Treasury Balance: ${(Number(treasuryBalance) / 1e18).toFixed(6)} ETH`);

    // Get total active proposal value
    const activeProposalValue = await getTotalActiveProposalValue();
    console.log(`   Active Proposals Value: ${(Number(activeProposalValue) / 1e18).toFixed(6)} ETH`);

    // Calculate available funds
    const availableFunds = treasuryBalance - activeProposalValue;
    console.log(`   Available Funds: ${(Number(availableFunds) / 1e18).toFixed(6)} ETH`);

    // Calculate allocation (percentage of available funds)
    const allocationWei = (availableFunds * BigInt(allocationPercent * 100)) / 10000n;
    const allocationEth = Number(allocationWei) / 1e18;

    // Minimum allocation: 0.0001 ETH, Maximum: 0.1 ETH (for safety)
    const minAllocation = 0.0001;
    const maxAllocation = 0.1;
    const finalAllocation = Math.max(minAllocation, Math.min(maxAllocation, allocationEth));

    console.log(`   Calculated Allocation (${allocationPercent}%): ${finalAllocation.toFixed(6)} ETH`);

    // Round to 4 decimal places
    return finalAllocation.toFixed(4);
  } catch (error) {
    console.error('❌ Error calculating allocation:', error);
    console.log('   Falling back to default: 0.01 ETH');
    return '0.01';
  }
}
