import {
  setApiKey,
  getMostValuableCreatorCoins,
  getCoin,
  type GetCoinQuery,
  type CoinData,
  type ExploreResponse,
} from '@zoralabs/coins-sdk';

// Initialize Zora API key
const initializeZoraSDK = () => {
  const apiKey = process.env.ZORA_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'ZORA_API_KEY is not configured. Please add it to your .env.local file.'
    );
  }
  
  setApiKey(apiKey);
  return apiKey;
};

// Normalized types for trending coins
export type TrendingCoin = {
  id: string;
  address: string;
  symbol: string | null;
  name: string | null;
  creator: string | null;
  currentPrice: string | null; // Price in ETH or native token
  volume24h: string | null; // 24h trading volume
  marketCap: string | null;
  totalSupply: string | null;
};

// Detailed coin information
export type CoinDetails = {
  id: string;
  address: string;
  symbol: string | null;
  name: string | null;
  description: string | null;
  creator: string | null;
  creatorAddress: string | null;
  currentPrice: string | null;
  volume24h: string | null;
  marketCap: string | null;
  totalSupply: string | null;
  holdersCount: number | null;
  createdAt: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
};

/**
 * Get trending creator coins based on value and activity
 * @param limit - Number of coins to return (default: 10)
 * @returns Array of normalized trending creator coins
 */
export async function getTrendingCoins(limit: number = 10): Promise<TrendingCoin[]> {
  try {
    // Initialize SDK with API key
    initializeZoraSDK();
    
    console.log(`🔥 Fetching top ${limit} trending creator coins...`);
    
    // Get most valuable creator coins
    const response: ExploreResponse = await getMostValuableCreatorCoins({
      // The SDK uses cursor pagination, not limit
      // We'll fetch and slice the results
    });
    
    if (!response.data?.exploreList?.edges) {
      console.warn('No trending creator coins data returned from Zora API');
      return [];
    }
    
    // Normalize the response - the API uses edges/node structure
    const trendingCoins: TrendingCoin[] = response.data.exploreList.edges
      .slice(0, limit)
      .map((edge) => {
        const coin = edge.node;
        return {
          id: coin.id,
          address: coin.address,
          symbol: coin.symbol || null,
          name: coin.name || null,
          creator: coin.creatorAddress || null,
          currentPrice: null, // Price calculation would need additional processing
          volume24h: coin.volume24h || null,
          marketCap: coin.marketCap || null,
          totalSupply: coin.totalSupply || null,
        };
      });
    
    console.log(`✅ Retrieved ${trendingCoins.length} trending creator coins`);
    return trendingCoins;
    
  } catch (error: unknown) {
    console.error('❌ Error fetching trending creator coins:', error);
    
    if (error instanceof Error && error.message.includes('ZORA_API_KEY')) {
      throw error; // Re-throw API key errors
    }
    
    throw new Error(
      `Failed to fetch trending creator coins: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get detailed information for a specific coin
 * @param coinIdOrAddress - Coin ID or contract address
 * @returns Detailed coin information
 */
export async function getCoinDetails(coinIdOrAddress: string): Promise<CoinDetails> {
  try {
    // Initialize SDK with API key
    initializeZoraSDK();
    
    if (!coinIdOrAddress) {
      throw new Error('Coin ID or address is required');
    }
    
    console.log(`🪙 Fetching details for coin: ${coinIdOrAddress}`);
    
    // Build the query - the SDK requires address field
    const query: GetCoinQuery = {
      address: coinIdOrAddress,
    };
    
    const response = await getCoin(query);
    
    if (!response.data?.zora20Token) {
      throw new Error(`Coin not found: ${coinIdOrAddress}`);
    }
    
    const coin: CoinData = response.data.zora20Token;
    
    // Normalize the detailed response
    const details: CoinDetails = {
      id: coin.id || coinIdOrAddress,
      address: coin.address || coinIdOrAddress,
      symbol: coin.symbol || null,
      name: coin.name || null,
      description: coin.description || null,
      creator: coin.creatorProfile?.handle || null,
      creatorAddress: coin.creatorAddress || null,
      currentPrice: null, // Would need additional price calculation
      volume24h: coin.volume24h || null,
      marketCap: coin.marketCap || null,
      totalSupply: coin.totalSupply || null,
      holdersCount: null, // Not directly available in this response
      createdAt: coin.createdAt || null,
      imageUrl: null, // Would need to fetch from metadata
      externalUrl: null, // Not directly available
    };
    
    console.log(`✅ Retrieved details for: ${details.name || details.symbol || 'Unknown coin'}`);
    return details;
    
  } catch (error: unknown) {
    console.error('❌ Error fetching coin details:', error);
    
    if (error instanceof Error && error.message.includes('ZORA_API_KEY')) {
      throw error; // Re-throw API key errors
    }
    
    throw new Error(
      `Failed to fetch coin details for ${coinIdOrAddress}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Helper function to check if Zora API is configured
 * @returns true if ZORA_API_KEY is set
 */
export function isZoraConfigured(): boolean {
  return !!process.env.ZORA_API_KEY;
}
