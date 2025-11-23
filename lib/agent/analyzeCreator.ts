/**
 * AI Agent Helper: Analyze Creator Coins by Username
 * 
 * This module provides analysis of specific Zora creator coins suggested by users.
 * It resolves usernames to creator coins, checks DAO holdings, and uses AI to
 * determine if the investment is worthwhile.
 */

import OpenAI from 'openai';
import {
  setApiKey,
  getProfile,
  getProfileCoins,
  getCoin,
  getMostValuableCreatorCoins,
  getCoinsNew,
  getCoinsLastTraded,
  getCoinsTopVolume24h,
  type GetProfileQuery,
  type GetProfileCoinsQuery,
  type GetCoinQuery,
  type ExploreResponse,
} from '@zoralabs/coins-sdk';
import { getDaoCoinHoldings, type DaoCoinHolding } from '../dao/portfolio';
import {
  wasRecentlyProposed,
  type ProposalHistoryEntry,
} from '../dao/proposalHistory';
import {
  addSuggestionToQueue,
  isCoinInQueue,
} from '../dao/suggestionsQueue';

// ============================================
// Types
// ============================================

export type CoinAnalysis = {
  username: string;
  creatorAddress: string;
  coinId: string;
  symbol?: string;
  name?: string;
  creatorName?: string; // Display name from profile
  pfpUrl?: string; // Profile picture URL
  currentPriceUsd?: number | null;
  volume24hUsd?: number | null;
  alreadyHeld: boolean;
  reason: string;
  confidenceScore: number; // 0–1
  suggestedAllocationUsd?: number | null;
};

export type CoinAnalysisWithProposal = CoinAnalysis & {
  proposalSubmitted: boolean | 'pending'; // false = rejected, 'pending' = queued, true = submitted
  recentProposal?: ProposalHistoryEntry | null;
  proposal?: {
    proposalId: string;
    onChainTxHash?: string;
    onChainProposalId?: string;
    ethAmount: string;
    status: string;
  };
};

interface ProfileResponse {
  data?: {
    profile?: {
      address?: string;
      username?: string;
      displayName?: string;
      pfpUrl?: string;
      publicWallet?: {
        walletAddress?: string;
      };
      creatorCoin?: {
        address?: string;
        marketCap?: string;
      };
    };
  };
}

interface ProfileCoinsResponse {
  data?: {
    profile?: {
      coins?: {
        edges?: Array<{
          node?: {
            id?: string;
            address?: string;
            symbol?: string;
            name?: string;
            tokenPrice?: {
              priceInUsdc?: string;
            };
            volume24h?: string;
            marketCap?: string;
          };
        }>;
      };
    };
  };
}

interface CoinDetailResponse {
  data?: {
    zora20Token?: {
      id?: string;
      address?: string;
      symbol?: string;
      name?: string;
      tokenPrice?: {
        priceInUsdc?: string;
      };
      volume24h?: string;
      marketCap?: string;
    };
  };
}

interface AIAnalysisResponse {
  reason: string;
  confidenceScore: number;
  suggestedAllocationUsd?: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Initialize Zora SDK with API key
 */
function initializeZoraSDK(): void {
  const apiKey = process.env.ZORA_API_KEY;

  if (!apiKey) {
    throw new Error(
      'ZORA_API_KEY is not configured. Please add it to your .env.local file.'
    );
  }

  setApiKey(apiKey);
}

/**
 * Validate environment variables
 */
function validateEnvironment(): { daoAddress: string; openaiKey: string } {
  const daoAddress = process.env.DAO_TREASURY_ADDRESS;
  if (!daoAddress) {
    throw new Error(
      'DAO_TREASURY_ADDRESS is not configured. Please add it to your .env.local file.'
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error(
      'OPENAI_API_KEY is not configured. Please add it to your .env.local file.'
    );
  }

  return { daoAddress, openaiKey };
}

/**
 * Search for a coin by name or symbol
 * Uses multiple explore APIs to search through different coin lists
 */
async function searchCoinByName(searchTerm: string): Promise<{
  address: string;
  symbol?: string;
  name?: string;
} | null> {
  console.log(`🔍 Searching for coin: "${searchTerm}"`);

  try {
    const searchLower = searchTerm.toLowerCase().trim();
    
    // Try multiple endpoints to find the coin
    const endpoints = [
      { fn: getMostValuableCreatorCoins, name: 'most valuable' },
      { fn: getCoinsTopVolume24h, name: 'top volume' },
      { fn: getCoinsNew, name: 'new coins' },
      { fn: getCoinsLastTraded, name: 'recently traded' },
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`   Trying ${endpoint.name}...`);
        const response = (await endpoint.fn({
          count: 100, // Search through 100 coins from each endpoint
        })) as ExploreResponse;

        const coins = response.data?.exploreList?.edges || [];
        
        // First pass: exact match
        for (const edge of coins) {
          const coin = edge.node;
          const name = (coin?.name || '').toLowerCase().trim();
          const symbol = (coin?.symbol || '').toLowerCase().trim();
          
          if (name === searchLower || symbol === searchLower) {
            console.log(`✅ Found exact match in ${endpoint.name}: ${coin.symbol || coin.name} (${coin.address})`);
            return {
              address: coin.address,
              symbol: coin.symbol,
              name: coin.name,
            };
          }
        }

        // Second pass: partial match
        for (const edge of coins) {
          const coin = edge.node;
          const name = (coin?.name || '').toLowerCase().trim();
          const symbol = (coin?.symbol || '').toLowerCase().trim();
          
          if (name.includes(searchLower) || symbol.includes(searchLower)) {
            console.log(`✅ Found partial match in ${endpoint.name}: ${coin.symbol || coin.name} (${coin.address})`);
            return {
              address: coin.address,
              symbol: coin.symbol,
              name: coin.name,
            };
          }
        }
      } catch {
        // Skip this endpoint if it fails
        console.log(`   ${endpoint.name} failed, trying next...`);
      }
    }

    console.log(`❌ No coin found matching "${searchTerm}" in any list`);
    return null;
  } catch (error) {
    console.log(`⚠️  Error searching for coin:`, error);
    return null;
  }
}

/**
 * Resolve username to creator profile
 * Note: The identifier can be either a username or an address
 */
async function resolveCreatorProfile(username: string): Promise<{
  address: string;
  displayName: string;
  pfpUrl?: string;
}> {
  console.log(`🔍 Resolving creator profile for: ${username}`);

  // If it's already an address, use it directly
  if (username.startsWith('0x')) {
    console.log(`✅ Input is already an address: ${username}`);
    return { address: username, displayName: username };
  }

  // Try multiple approaches to find the coin

  // 1. Try to search for the coin by name/symbol in top coins
  console.log(`   Trying search in top coins...`);
  const searchResult = await searchCoinByName(username);
  if (searchResult) {
    console.log(`✅ Found coin via search: ${searchResult.symbol || searchResult.name}`);
    
    // Try to get profile picture by looking up the profile
    let pfpUrl: string | undefined;
    try {
      const profileResponse = (await getProfile({ identifier: username })) as ProfileResponse;
      pfpUrl = profileResponse.data?.profile?.pfpUrl;
    } catch {
      console.log(`   Could not fetch profile picture`);
    }
    
    return { 
      address: searchResult.address, 
      displayName: searchResult.name || searchResult.symbol || username,
      pfpUrl 
    };
  }

  // 2. Try to get profile coins using the username as identifier
  console.log(`   Trying as profile identifier...`);
  try {
    const coinsQuery: GetProfileCoinsQuery = {
      identifier: username,
      count: 1,
    };

    const coinsResponse = (await getProfileCoins(
      coinsQuery
    )) as ProfileCoinsResponse;

    const coins = coinsResponse.data?.profile?.coins?.edges || [];
    const profileData = coinsResponse.data?.profile;

    if (coins.length > 0 && coins[0].node?.address) {
      const coin = coins[0].node;
      console.log(`✅ Found coin via profile lookup: ${coin.symbol || coin.name}`);
      return {
        address: coin.address!,
        displayName: coin.name || coin.symbol || username,
        pfpUrl: profileData?.pfpUrl,
      };
    }
  } catch {
    console.log(`   No profile found for identifier`);
  }

  // 3. Try profile lookup - check if they have a creator coin
  console.log(`   Trying profile lookup...`);
  try {
    const query: GetProfileQuery = {
      identifier: username,
    };

    const response = (await getProfile(query)) as ProfileResponse;

    if (response.data?.profile) {
      const profile = response.data.profile;
      
      // Check if profile has a creator coin
      if (profile.creatorCoin?.address) {
        console.log(`✅ Found creator coin via profile: ${username} → ${profile.creatorCoin.address}`);
        return {
          address: profile.creatorCoin.address,
          displayName: profile.displayName || profile.username || username,
          pfpUrl: profile.pfpUrl,
        };
      }
      
      // Otherwise use the profile's wallet address
      const address = profile.publicWallet?.walletAddress || profile.address;
      if (address) {
        const displayName = profile.displayName || profile.username || username;
        console.log(`✅ Resolved via profile: ${username} → ${address} (${displayName})`);
        return { 
          address, 
          displayName,
          pfpUrl: profile.pfpUrl,
        };
      }
    }
  } catch {
    console.log(`   Profile lookup failed`);
  }

  // If all methods fail, provide helpful error
  throw new Error(
    `Could not find coin for "${username}". Please provide:\n` +
      `  - A valid coin address (0x...)\n` +
      `  - The coin symbol/name if it's in the top valuable coins\n` +
      `  - A valid Zora username\n\n` +
      `Tip: You can find coin addresses on zora.co`
  );
}

/**
 * Get coin information - handles both creator address and coin address
 */
async function getCoinInfo(identifier: string): Promise<{
  coinId: string;
  address: string;
  creatorAddress: string;
  symbol?: string;
  name?: string;
  currentPriceUsd?: number | null;
  volume24hUsd?: number | null;
}> {
  console.log(`🪙 Fetching coin info for: ${identifier}`);

  // First, try to get it directly as a coin
  try {
    const coinQuery: GetCoinQuery = {
      address: identifier,
    };

    const coinResponse = (await getCoin(coinQuery)) as CoinDetailResponse;
    const coinData = coinResponse.data?.zora20Token;

    if (coinData?.address) {
      console.log(`✅ Found coin directly: ${coinData.symbol || coinData.name || identifier}`);
      
      const currentPriceUsd = coinData.tokenPrice?.priceInUsdc
        ? parseFloat(coinData.tokenPrice.priceInUsdc)
        : null;

      const volume24hUsd = coinData.volume24h
        ? parseFloat(coinData.volume24h)
        : null;

      console.log(`   Price: ${currentPriceUsd ? `$${currentPriceUsd}` : 'N/A'}`);
      console.log(`   24h Volume: ${volume24hUsd ? `$${volume24hUsd}` : 'N/A'}`);

      return {
        coinId: coinData.id || coinData.address,
        address: coinData.address,
        creatorAddress: identifier, // Use coin address as creator for now
        symbol: coinData.symbol,
        name: coinData.name,
        currentPriceUsd,
        volume24hUsd,
      };
    }
  } catch {
    console.log(`   Not a coin address, trying as creator address...`);
  }

  // If that didn't work, try to get the profile's coins
  const coinsQuery: GetProfileCoinsQuery = {
    identifier: identifier,
    count: 1,
  };

  const coinsResponse = (await getProfileCoins(
    coinsQuery
  )) as ProfileCoinsResponse;

  const coins = coinsResponse.data?.profile?.coins?.edges || [];

  if (coins.length === 0) {
    throw new Error(
      `No creator coin found for "${identifier}". ` +
        `This may not be a valid coin address or the creator may not have launched a coin yet.`
    );
  }

  const coinNode = coins[0].node;
  if (!coinNode?.address) {
    throw new Error(`Invalid coin data returned for ${identifier}`);
  }

  // Get detailed coin information
  const coinQuery: GetCoinQuery = {
    address: coinNode.address,
  };

  const coinResponse = (await getCoin(coinQuery)) as CoinDetailResponse;
  const coinData = coinResponse.data?.zora20Token;

  const currentPriceUsd = coinData?.tokenPrice?.priceInUsdc
    ? parseFloat(coinData.tokenPrice.priceInUsdc)
    : null;

  const volume24hUsd = coinData?.volume24h
    ? parseFloat(coinData.volume24h)
    : null;

  console.log(
    `✅ Found creator's coin: ${coinNode.symbol || coinNode.name || coinNode.address}`
  );
  console.log(`   Price: ${currentPriceUsd ? `$${currentPriceUsd}` : 'N/A'}`);
  console.log(`   24h Volume: ${volume24hUsd ? `$${volume24hUsd}` : 'N/A'}`);

  return {
    coinId: coinNode.id || coinNode.address,
    address: coinNode.address,
    creatorAddress: identifier,
    symbol: coinNode.symbol,
    name: coinNode.name,
    currentPriceUsd,
    volume24hUsd,
  };
}

/**
 * Check if DAO already holds this coin
 */
async function checkDaoHoldings(
  daoAddress: string,
  coinAddress: string
): Promise<{
  alreadyHeld: boolean;
  holding?: DaoCoinHolding;
}> {
  console.log(
    `📊 Checking DAO holdings for coin: ${coinAddress.slice(0, 10)}...`
  );

  const holdings = await getDaoCoinHoldings(daoAddress);

  const holding = holdings.find(
    (h) =>
      h.coinId.toLowerCase() === coinAddress.toLowerCase() ||
      h.coinId.toLowerCase().includes(coinAddress.toLowerCase())
  );

  if (holding) {
    console.log(`✅ DAO already holds this coin!`);
    console.log(`   Balance: ${holding.balanceRaw}`);
    console.log(
      `   USD Value: ${holding.balanceUsd ? `$${holding.balanceUsd.toFixed(2)}` : 'N/A'}`
    );
    return { alreadyHeld: true, holding };
  }

  console.log(`❌ DAO does not hold this coin yet`);
  return { alreadyHeld: false };
}

/**
 * Build analysis context for AI
 */
function buildAnalysisContext(params: {
  username: string;
  coinAddress: string;
  symbol?: string;
  name?: string;
  currentPriceUsd?: number | null;
  volume24hUsd?: number | null;
  alreadyHeld: boolean;
  currentHoldingUsd?: number | null;
}): string {
  const {
    username,
    coinAddress,
    symbol,
    name,
    currentPriceUsd,
    volume24hUsd,
    alreadyHeld,
    currentHoldingUsd,
  } = params;

  return JSON.stringify(
    {
      creator: {
        username,
        address: coinAddress,
      },
      coin: {
        symbol: symbol || 'Unknown',
        name: name || 'Unknown',
        address: coinAddress,
        currentPriceUsd: currentPriceUsd ?? 'N/A',
        volume24hUsd: volume24hUsd ?? 'N/A',
      },
      daoExposure: {
        alreadyHeld,
        currentHoldingUsd: currentHoldingUsd ?? 0,
      },
    },
    null,
    2
  );
}

/**
 * Get AI analysis using OpenAI
 */
async function getAIAnalysis(
  context: string,
  openaiKey: string
): Promise<AIAnalysisResponse> {
  console.log(`🧠 Analyzing with AI...`);

  const openai = new OpenAI({
    apiKey: openaiKey,
  });

  const systemPrompt = `You are the investment AI for a Zora-based investment DAO focused on supporting real creators.

Your role: Evaluate whether a creator coin belongs to a real creator who should be added to the proposal queue.

CONTEXT: Creator coins are extremely early. Volumes are low across the board. Even small traction is meaningful.

A coin should be approved if it shows ANY reasonable evidence of genuine creative activity.

POSITIVE SIGNALS (Approve if any are present):
- Creator has multiple real posts or content coins (even 3-5 is enough)
- Creator has 10+ holders (solid signal); 25+ holders is excellent
- Coin has hundreds of dollars in volume (normal); thousands = very strong signal
- Creator has consistent identity (pfp, style, theme, bio)
- Creator appears to be actual artist, musician, photographer, builder, or meme creator
- No obvious signs of automation or spammy pattern posting

NEGATIVE SIGNALS (Reject only if these are CLEAR):
- Near-zero real activity (0-1 posts or coins total)
- Almost no holders (<3) AND no other positive signals
- Totally generic or AI-spam content with no coherent theme
- Obvious bot/fake accounts posting random junk with no creator identity

DECISION RULE: Default to YES. If the creator appears real and has any traction—however small—approve.
Only reject when the account is clearly fake, inactive, or has no signs of genuine creative output.

Respond with a single JSON object:
{
  "reason": "A clear, concise explanation of your recommendation (2-3 sentences)",
  "confidenceScore": 0.75,  // Float between 0 and 1 (be generous - real creators deserve 0.5+)
  "suggestedAllocationUsd": 100  // Optional: suggested USD amount to invest, or null
}`;

  const userPrompt = `Analyze this creator coin:

${context}

Is this a real creator worth supporting? Should the DAO add this to the queue?`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const responseText = completion.choices[0]?.message?.content;

  if (!responseText) {
    throw new Error('No response from OpenAI');
  }

  console.log(`✅ AI analysis complete`);

  const analysis = JSON.parse(responseText) as AIAnalysisResponse;

  // Validate response structure
  if (
    typeof analysis.reason !== 'string' ||
    typeof analysis.confidenceScore !== 'number'
  ) {
    throw new Error(
      'Invalid response format from OpenAI. Expected reason (string) and confidenceScore (number).'
    );
  }

  // Clamp confidence score between 0 and 1
  analysis.confidenceScore = Math.max(
    0,
    Math.min(1, analysis.confidenceScore)
  );

  return analysis;
}

// ============================================
// Main Export
// ============================================

/**
 * Analyze a creator coin and optionally submit a proposal if confidence is high enough
 * 
 * This function:
 * 1. Analyzes the coin using analyzeCreatorCoinByUsername
 * 2. If confidence >= 30%, creates and submits a proposal to the Governor
 * 3. Returns analysis with proposal information
 * 
 * @param username - Zora username/handle or coin address to analyze
 * @param options - Configuration options
 * @returns CoinAnalysisWithProposal including proposal submission status
 * 
 * @example
 * ```typescript
 * const result = await analyzeAndPropose('jessepollak', { 
 *   confidenceThreshold: 0.3,
 *   ethAmount: '0.01' 
 * });
 * 
 * if (result.proposalSubmitted) {
 *   console.log(`✅ Proposal submitted: ${result.proposal?.onChainTxHash}`);
 * }
 * ```
 */
export async function analyzeAndPropose(
  username: string,
  options: {
    confidenceThreshold?: number;
    ethAmount?: string;
    slippagePercent?: number;
  } = {}
): Promise<CoinAnalysisWithProposal> {
  const {
    confidenceThreshold = 0.2, // 20% default - permissive for early creator economy
    ethAmount = '0.01', // Default to 0.01 ETH
    slippagePercent = 5,
  } = options;

  console.log(`\n🔎 Analyzing and potentially proposing for: ${username}\n`);
  console.log(`   Confidence threshold: ${(confidenceThreshold * 100).toFixed(0)}%`);
  console.log(`   Default ETH amount: ${ethAmount}`);

  // Step 1: Resolve username to coin address (lightweight, no AI yet)
  validateEnvironment();
  initializeZoraSDK();
  
  console.log(`🔍 Resolving creator profile for: ${username}`);
  const profile = await resolveCreatorProfile(username);
  const coinIdentifier = username.startsWith('0x') ? username : profile.address;
  const coin = await getCoinInfo(coinIdentifier);
  const coinAddress = coin.address;
  
  console.log(`✅ Resolved to coin: ${coinAddress}`);

  // Step 2: Check if this coin was already proposed in last 24 hours (BEFORE AI analysis)
  console.log(`\n🕐 Checking proposal history for ${coinAddress}...`);
  const recentProposal = await wasRecentlyProposed(coinAddress as `0x${string}`);
  
  if (recentProposal) {
    const now = Date.now();
    const submittedAt = new Date(recentProposal.submittedAt).getTime();
    const hoursAgo = ((now - submittedAt) / (60 * 60 * 1000)).toFixed(1);
    
    console.log(`\n⚠️  DUPLICATE PROPOSAL DETECTED`);
    console.log(`   This coin was already proposed ${hoursAgo}h ago`);
    console.log(`   Previous Proposal ID: ${recentProposal.proposalId}`);
    console.log(`   Skipping analysis to prevent duplicate\n`);
    
    // Return without doing expensive AI analysis
    return {
      username,
      creatorAddress: profile.address,
      coinId: coinAddress,
      symbol: recentProposal.coinSymbol || coin.symbol || undefined,
      name: recentProposal.coinName || coin.name || undefined,
      creatorName: profile.displayName,
      pfpUrl: profile.pfpUrl,
      currentPriceUsd: coin.currentPriceUsd,
      volume24hUsd: coin.volume24hUsd,
      alreadyHeld: false, // Unknown, but doesn't matter
      reason: `Proposal already submitted ${hoursAgo}h ago. Duplicate prevention active.`,
      confidenceScore: 0,
      proposalSubmitted: false,
      recentProposal,
    };
  }

  console.log(`   ✅ No recent proposals found, proceeding with analysis`);

  // Step 3: Do full analysis with AI (only if not recently proposed)
  const analysis = await analyzeCreatorCoinByUsername(username);

  // Step 4: Check if we should submit a proposal
  const shouldPropose = analysis.confidenceScore >= confidenceThreshold;

  console.log(`\n📊 Analysis complete:`);
  console.log(`   Confidence: ${(analysis.confidenceScore * 100).toFixed(1)}%`);
  console.log(`   Should propose: ${shouldPropose ? 'YES ✅' : 'NO ❌'}`);

  if (!shouldPropose) {
    console.log(`   Reason: Confidence below threshold (${(confidenceThreshold * 100).toFixed(0)}%)\n`);
    return {
      ...analysis,
      proposalSubmitted: false,
    };
  }

  // Step 5: Check if coin is already in suggestions queue
  console.log(`\n🔍 Checking suggestions queue...`);
  const alreadyInQueue = isCoinInQueue(analysis.coinId);
  
  if (alreadyInQueue) {
    console.log(`   ❌ Coin already in queue - suggestion not accepted`);
    console.log(`   Coin: ${analysis.symbol || analysis.name || analysis.coinId}`);
    console.log(`   Reason: Duplicate submission (already pending in queue)\n`);
    return {
      ...analysis,
      proposalSubmitted: false,
      reason: `Suggestion not accepted: This coin is already in the queue awaiting processing.`,
    };
  }

  // Step 6: Add to suggestions queue
  try {
    console.log(`\n📝 Adding to suggestions queue...`);

    const queuedSuggestion = addSuggestionToQueue({
      coinId: analysis.coinId,
      coinSymbol: analysis.symbol,
      coinName: analysis.name,
      creatorAddress: analysis.creatorAddress,
      creatorName: profile.displayName,
      pfpUrl: profile.pfpUrl,
      currentPriceUsd: analysis.currentPriceUsd,
      volume24hUsd: analysis.volume24hUsd,
      reason: analysis.reason,
      confidenceScore: analysis.confidenceScore,
      suggestedAllocationUsd: analysis.suggestedAllocationUsd,
      source: 'manual',
      submittedBy: username,
    });

    console.log(`✅ Suggestion added to queue!`);
    console.log(`   Queue ID: ${queuedSuggestion.id}`);
    console.log(`   Status: ${queuedSuggestion.status}`);
    console.log(`\n💡 This suggestion will be processed by the autonomous agent`);

    return {
      ...analysis,
      proposalSubmitted: 'pending',
    };
  } catch (error) {
    console.error(`\n❌ Failed to add to queue:`, error);
    
    return {
      ...analysis,
      proposalSubmitted: false,
    };
  }
}

/**
 * Analyze a creator coin by username
 * 
 * This function:
 * 1. Resolves the username to a creator profile and coin
 * 2. Fetches coin metrics (price, volume)
 * 3. Checks if DAO already holds the coin
 * 4. Uses AI to analyze if buying is recommended
 * 5. Returns comprehensive analysis
 * 
 * @param username - Zora username/handle to analyze
 * @returns CoinAnalysis with AI recommendation
 * @throws Error if username cannot be resolved, APIs fail, or env vars missing
 * 
 * @example
 * ```typescript
 * const analysis = await analyzeCreatorCoinByUsername('jessepollak');
 * 
 * if (analysis.confidenceScore > 0.7) {
 *   console.log(`✅ Recommended: ${analysis.reason}`);
 *   console.log(`💰 Suggested: $${analysis.suggestedAllocationUsd}`);
 * }
 * ```
 */
export async function analyzeCreatorCoinByUsername(
  username: string
): Promise<CoinAnalysis> {
  if (!username || username.trim() === '') {
    throw new Error('Username is required');
  }

  console.log(`\n🔎 Starting analysis for creator: ${username}\n`);

  // Step 1: Validate environment
  const { daoAddress, openaiKey } = validateEnvironment();
  initializeZoraSDK();

  try {
    // Step 2: Resolve username to creator profile (or use address directly)
    const profile = await resolveCreatorProfile(username);

    // Step 3: Get coin info (handles both creator address and coin address)
    // Use the original username if it's an address, otherwise use profile address
    const coinIdentifier = username.startsWith('0x') ? username : profile.address;
    const coin = await getCoinInfo(coinIdentifier);

    // Step 4: Check DAO holdings
    const { alreadyHeld, holding } = await checkDaoHoldings(
      daoAddress,
      coin.address
    );

    // Step 5: Build context for AI
    const context = buildAnalysisContext({
      username,
      coinAddress: coin.address,
      symbol: coin.symbol,
      name: coin.name,
      currentPriceUsd: coin.currentPriceUsd,
      volume24hUsd: coin.volume24hUsd,
      alreadyHeld,
      currentHoldingUsd: holding?.balanceUsd,
    });

    // Step 6: Get AI analysis
    const aiAnalysis = await getAIAnalysis(context, openaiKey);

    // Step 7: Build final result
    const result: CoinAnalysis = {
      username,
      creatorAddress: profile.address,
      coinId: coin.address, // Use contract address as coinId for trading
      symbol: coin.symbol,
      name: coin.name,
      creatorName: profile.displayName,
      pfpUrl: profile.pfpUrl,
      currentPriceUsd: coin.currentPriceUsd,
      volume24hUsd: coin.volume24hUsd,
      alreadyHeld,
      reason: aiAnalysis.reason,
      confidenceScore: aiAnalysis.confidenceScore,
      suggestedAllocationUsd: aiAnalysis.suggestedAllocationUsd ?? null,
    };

    console.log(`\n✅ Analysis complete for ${username}`);
    console.log(`   Confidence: ${(result.confidenceScore * 100).toFixed(1)}%`);
    console.log(`   Recommendation: ${result.reason}\n`);

    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to analyze creator coin for "${username}": ${error.message}`
      );
    }
    throw error;
  }
}
