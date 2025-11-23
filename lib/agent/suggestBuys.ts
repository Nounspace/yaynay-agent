/**
 * AI Agent Helper: Buy Suggestions for Zora Creator Coins
 * 
 * This module provides reusable logic for generating AI-powered
 * investment recommendations for Zora creator coins.
 */

import OpenAI from 'openai';
import {
  setApiKey,
  getMostValuableCreatorCoins,
  getCoinsTopVolume24h,
  getCoinsNew,
  getCoinsLastTraded,
  type ExploreResponse,
} from '@zoralabs/coins-sdk';
import { getDaoCoinHoldings } from '../dao/portfolio';
import { getRecentProposals } from '../dao/proposalHistory';

// ============================================
// Types
// ============================================

type ZoraCoin = {
  address: string;
  symbol?: string;
  name?: string;
  creator?: string;
  currentPrice?: string;
  volume24h?: string;
  marketCap?: string;
  totalSupply?: string;
};

export type SuggestedCoin = {
  coinId: string;
  symbol?: string;
  name?: string;
  creatorAddress?: string;
  currentPriceUsd?: number | null;
  volume24hUsd?: number | null;
};

export type BuySuggestion = {
  coin: SuggestedCoin;
  reason: string;
  confidenceScore: number; // 0–1
  suggestedAllocationUsd?: number | null;
  source: 'agent';
};

interface OpenAIRecommendation {
  coinId: string;
  reason: string;
  confidenceScore: number;
  suggestedAllocationUsd?: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Validate required API keys and environment variables
 */
function validateEnvironment(): string {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not configured. Please add it to your .env.local file.'
    );
  }

  if (!process.env.ZORA_API_KEY) {
    throw new Error(
      'ZORA_API_KEY is not configured. Please add it to your .env.local file.'
    );
  }

  const daoAddress = process.env.DAO_TREASURY_ADDRESS;
  if (!daoAddress) {
    throw new Error(
      'DAO_TREASURY_ADDRESS is not configured. Please add it to your .env.local file.'
    );
  }

  return daoAddress;
}

/**
 * Build compact JSON summary for LLM analysis
 * 
 * Note: coinId is the contract address (not GraphQL ID) - required for trading
 */
function buildCoinsSummary(coins: ZoraCoin[]) {
  return coins.map((coin, index) => ({
    rank: index + 1,
    coinId: coin.address, // Contract address (used for trading via Zora SDK)
    name: coin.name || 'Unknown',
    symbol: coin.symbol || 'N/A',
    creator: coin.creator || 'Unknown',
    currentPrice: coin.currentPrice || 'N/A',
    volume24h: coin.volume24h || 'N/A',
    marketCap: coin.marketCap || 'N/A',
    totalSupply: coin.totalSupply || 'N/A',
  }));
}

/**
 * Convert Zora coin to suggested coin format
 */
function mapToSuggestedCoin(coin: ZoraCoin): SuggestedCoin {
  return {
    coinId: coin.address, // Use contract address (required for trading)
    symbol: coin.symbol || undefined,
    name: coin.name || undefined,
    creatorAddress: coin.creator || undefined,
    currentPriceUsd: coin.currentPrice ? parseFloat(coin.currentPrice) : null,
    volume24hUsd: coin.volume24h ? parseFloat(coin.volume24h) : null,
  };
}

/**
 * Get AI recommendation (single coin) from OpenAI
 */
async function getAIRecommendation(
  coinsSummary: ReturnType<typeof buildCoinsSummary>
): Promise<OpenAIRecommendation> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const systemPrompt = `You are an onchain investment DAO agent specializing in Zora creator coins.

Your role is to analyze trending creator coins and pick the single best investment opportunity RIGHT NOW.

Key considerations:
- Market momentum and volume trends
- Price stability vs volatility
- Creator reputation and past performance
- Risk-reward ratio
- Market cap and growth potential

From the provided list of coins (already filtered to exclude holdings the DAO already owns), pick exactly 1 coin to buy now.

Output your response as valid JSON with this exact structure:
{
  "coinId": "coin-id-here",
  "reason": "Brief explanation of why this coin is the best buy right now",
  "confidenceScore": 0.85,
  "suggestedAllocationUsd": 1000
}

IMPORTANT:
- Pick exactly ONE coin, not multiple.
- Be strategic and confident. Only recommend if you have high conviction (0.7+ confidence).
- suggestedAllocationUsd is optional but recommended.
- Respond ONLY with JSON, no additional text.`;

  const userPrompt = `Analyze these trending Zora creator coins (already filtered to exclude coins the DAO owns) and pick the single best coin to buy now:

${JSON.stringify(coinsSummary, null, 2)}

Remember to output valid JSON only.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const aiResponse = completion.choices[0]?.message?.content;
  if (!aiResponse) {
    throw new Error('No response from OpenAI');
  }

  return JSON.parse(aiResponse);
}

// ============================================
// Main Export
// ============================================

/**
 * Generate AI-powered buy suggestion for a Zora creator coin
 * 
 * Fetches coins from multiple Zora endpoints, filters duplicates and coins
 * already held or recently proposed, then uses AI to pick the single best coin.
 * 
 * @returns Single buy suggestion with AI reasoning, or null if no suitable coins found
 * @throws Error if API keys or DAO address are missing, or if API calls fail
 * 
 * @example
 * ```typescript
 * const suggestion = await suggestBuys();
 * if (suggestion) {
 *   console.log(`Buy ${suggestion.coin.name}: ${suggestion.reason}`);
 *   console.log(`Confidence: ${suggestion.confidenceScore * 100}%`);
 * }
 * ```
 */
export async function suggestBuys(): Promise<BuySuggestion | null> {
  // Step 1: Validate environment and get DAO address
  const daoAddress = validateEnvironment();

  // Step 2: Initialize Zora SDK
  console.log('🔧 Initializing Zora SDK...');
  setApiKey(process.env.ZORA_API_KEY || '');

  // Step 3: Fetch coins from multiple sources
  console.log('📊 Fetching coins from multiple Zora endpoints...');
  
  const endpoints = [
    { name: 'Most Valuable', fn: getMostValuableCreatorCoins },
    { name: 'Top Volume 24h', fn: getCoinsTopVolume24h },
    { name: 'New Coins', fn: getCoinsNew },
    { name: 'Last Traded', fn: getCoinsLastTraded },
  ];

  const allCoins: ZoraCoin[] = [];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`   Fetching from ${endpoint.name}...`);
      const response = (await endpoint.fn({ count: 25 })) as ExploreResponse;
      const coins = response.data?.exploreList?.edges || [];
      
      for (const edge of coins) {
        const node = edge.node;
        if (node?.address) {
          allCoins.push({
            address: node.address,
            symbol: node.symbol || undefined,
            name: node.name || undefined,
            creator: node.creatorAddress || undefined,
            currentPrice: undefined, // Not available from explore endpoints
            volume24h: node.volume24h || undefined,
            marketCap: node.marketCap || undefined,
            totalSupply: node.totalSupply || undefined,
          });
        }
      }
      
      console.log(`   ✅ Found ${coins.length} coins from ${endpoint.name}`);
    } catch (error) {
      console.error(`   ⚠️  Failed to fetch from ${endpoint.name}:`, error);
    }
  }

  console.log(`✅ Retrieved ${allCoins.length} total coins from all sources`);

  if (allCoins.length === 0) {
    console.warn('⚠️  No coins available from any endpoint');
    return null;
  }

  // Step 4: Remove duplicates by address (keep first occurrence)
  const uniqueCoins: ZoraCoin[] = [];
  const seenAddresses = new Set<string>();
  
  for (const coin of allCoins) {
    const addressLower = coin.address.toLowerCase();
    if (!seenAddresses.has(addressLower)) {
      seenAddresses.add(addressLower);
      uniqueCoins.push(coin);
    }
  }
  
  console.log(`🔍 Deduplicated to ${uniqueCoins.length} unique coins`);

  // Step 5: Get DAO's current holdings and filter out
  console.log(`🏦 Fetching current holdings for DAO: ${daoAddress}...`);
  const holdings = await getDaoCoinHoldings(daoAddress);
  const heldCoinIds = new Set(holdings.map(h => h.coinId.toLowerCase()));
  console.log(`✅ DAO currently holds ${holdings.length} coins`);

  const nonHeldCoins = uniqueCoins.filter(coin => {
    const addressLower = coin.address.toLowerCase();
    const creatorLower = coin.creator?.toLowerCase();
    
    return !heldCoinIds.has(addressLower) && 
           (!creatorLower || !heldCoinIds.has(creatorLower));
  });

  console.log(`🔍 Filtered to ${nonHeldCoins.length} coins not held by DAO`);

  if (nonHeldCoins.length === 0) {
    console.log('✅ DAO already holds all available coins - no new purchases needed');
    return null;
  }

  // Step 6: Filter out coins recently proposed (last 24 hours)
  console.log(`🕐 Checking for recently proposed coins (last 24h)...`);
  const recentProposals = await getRecentProposals();
  const recentlyProposedAddresses = new Set(
    recentProposals.map(p => p.coinAddress.toLowerCase())
  );
  
  const filteredCoins = nonHeldCoins.filter(coin => {
    const addressLower = coin.address.toLowerCase();
    return !recentlyProposedAddresses.has(addressLower);
  });

  const numExcluded = nonHeldCoins.length - filteredCoins.length;
  if (numExcluded > 0) {
    console.log(`   ⚠️  Excluded ${numExcluded} coin(s) with recent proposals:`);
    for (const coin of nonHeldCoins) {
      if (recentlyProposedAddresses.has(coin.address.toLowerCase())) {
        const proposal = recentProposals.find(
          p => p.coinAddress.toLowerCase() === coin.address.toLowerCase()
        );
        if (proposal) {
          const hoursAgo = (
            (Date.now() - new Date(proposal.submittedAt).getTime()) /
            (60 * 60 * 1000)
          ).toFixed(1);
          console.log(`      - ${coin.name || coin.symbol || coin.address.slice(0, 10)} (proposed ${hoursAgo}h ago)`);
        }
      }
    }
  }
  
  console.log(`🔍 After duplicate proposal filter: ${filteredCoins.length} coins`);

  if (filteredCoins.length === 0) {
    console.log('✅ All available coins either held or recently proposed - no new purchases needed');
    return null;
  }

  // Step 7: Limit to top 20 coins for AI analysis
  const coinsForAI = filteredCoins.slice(0, 20);
  
  if (coinsForAI.length < filteredCoins.length) {
    console.log(`📊 Limited to top ${coinsForAI.length} coins for AI analysis (from ${filteredCoins.length} total)`);
  }

  // Step 8: Build compact summary for LLM
  console.log('📝 Preparing data for AI analysis...');
  const coinsSummary = buildCoinsSummary(coinsForAI);

  // Step 9: Get AI recommendation (single coin)
  console.log('🧠 Analyzing with OpenAI...');
  const aiResponse = await getAIRecommendation(coinsSummary);
  console.log(`✅ AI selected: ${aiResponse.coinId}`);

  // Step 10: Map AI recommendation to BuySuggestion format
  const originalCoin = coinsForAI.find(c => c.address.toLowerCase() === aiResponse.coinId.toLowerCase());
  
  if (!originalCoin) {
    console.warn(`⚠️  AI selected coin ${aiResponse.coinId} not found in analyzed list`);
    return null;
  }

  const suggestion: BuySuggestion = {
    coin: mapToSuggestedCoin(originalCoin),
    reason: aiResponse.reason,
    confidenceScore: aiResponse.confidenceScore,
    suggestedAllocationUsd: aiResponse.suggestedAllocationUsd || null,
    source: 'agent' as const,
  };

  console.log(`💡 Generated buy suggestion for ${suggestion.coin.name || suggestion.coin.symbol}`);
  
  return suggestion;
}
