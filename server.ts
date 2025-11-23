/**
 * AI Treasurer Backend API Server
 * 
 * Standalone Express server providing API endpoints for:
 * - Treasury balance
 * - Suggestions queue
 * - Creator coin analysis (user submissions)
 * - Zora coin data
 * 
 * Run: node server.js or tsx server.ts
 * Port: 3001 (configurable via PORT env var)
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getAllSuggestions,
  getQueueStats,
  getPendingSuggestions,
} from './lib/dao/suggestionsQueue';
import { analyzeAndPropose } from './lib/agent/analyzeCreator';
import { getDaoCoinHoldings } from './lib/dao/portfolio';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// BigInt serialization middleware - must come before routes
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function(data: any) {
    // Convert BigInt to string in the data
    const sanitized = JSON.parse(JSON.stringify(data, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    return originalJson(sanitized);
  };
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ai-treasurer-api',
  });
});

// ============================================
// Queue Endpoints
// ============================================

/**
 * GET /api/queue
 * Get suggestions queue with optional status filter
 * Query params: ?status=pending|processing|completed|failed
 */
app.get('/api/queue', (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;

    // Get queue statistics
    const stats = getQueueStats();

    // Get suggestions based on filter
    let suggestions;
    
    if (statusFilter === 'pending') {
      suggestions = getPendingSuggestions();
    } else if (statusFilter) {
      const allSuggestions = getAllSuggestions();
      suggestions = allSuggestions.filter(s => s.status === statusFilter);
    } else {
      suggestions = getAllSuggestions();
    }

    res.json({
      success: true,
      stats,
      suggestions,
      count: suggestions.length,
    });
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch suggestions queue',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// Creator Coin Analysis (User Submission)
// ============================================

/**
 * POST /api/analyze
 * Analyze a creator coin and add to queue if confidence >= 30%
 * Body: { username: string, confidenceThreshold?: number }
 */
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const { username, confidenceThreshold } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required',
      });
    }

    console.log(`\n📊 API: Analyzing creator: ${username}`);

    const result = await analyzeAndPropose(username, {
      confidenceThreshold: confidenceThreshold || 0.3,
    });

    res.json({
      success: true,
      analysis: {
        username: result.username,
        coinId: result.coinId,
        symbol: result.symbol,
        name: result.name,
        creatorAddress: result.creatorAddress,
        creatorName: result.creatorName,
        pfpUrl: result.pfpUrl,
        currentPriceUsd: result.currentPriceUsd,
        volume24hUsd: result.volume24hUsd,
        alreadyHeld: result.alreadyHeld,
        reason: result.reason,
        confidenceScore: result.confidenceScore,
        suggestedAllocationUsd: result.suggestedAllocationUsd,
        proposalSubmitted: result.proposalSubmitted,
        recentProposal: result.recentProposal,
      },
    });
  } catch (error) {
    console.error('Error analyzing creator:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze creator',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// Portfolio Endpoints
// ============================================

/**
 * GET /api/portfolio
 * Get DAO portfolio holdings
 */
app.get('/api/portfolio', async (req: Request, res: Response) => {
  try {
    const treasuryAddress = process.env.DAO_TREASURY_ADDRESS;
    
    if (!treasuryAddress) {
      return res.status(500).json({
        success: false,
        error: 'DAO_TREASURY_ADDRESS not configured',
      });
    }

    console.log(`\n📊 API: Fetching portfolio for ${treasuryAddress}`);

    const holdings = await getDaoCoinHoldings(treasuryAddress);

    res.json({
      success: true,
      address: treasuryAddress,
      holdings,
      count: holdings.length,
    });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch portfolio',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// Error handling
// ============================================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
  });
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  console.log('\n🚀 AI Treasurer Backend API');
  console.log('═'.repeat(60));
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log('\n📋 Available Endpoints:');
  console.log(`   GET  /api/queue - Get suggestions queue`);
  console.log(`   POST /api/analyze - Analyze creator coin`);
  console.log(`   GET  /api/portfolio - Get DAO holdings`);
  console.log('═'.repeat(60));
  console.log('');
});

export default app;
