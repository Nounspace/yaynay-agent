/**
 * Suggestions Queue Management
 * 
 * Manages a persistent queue of coin purchase suggestions that have passed
 * AI analysis. Suggestions are stored in a JSON file and can be processed
 * by the autonomous agent at controlled intervals.
 */

import fs from 'fs';
import path from 'path';

// ============================================
// Types
// ============================================

export type QueuedSuggestion = {
  id: string; // Unique identifier for this suggestion
  coinId: string; // Contract address
  coinSymbol?: string;
  coinName?: string;
  creatorAddress?: string;
  creatorName?: string; // Display name of creator
  pfpUrl?: string; // Profile picture URL
  currentPriceUsd?: number | null;
  volume24hUsd?: number | null;
  
  // AI Analysis
  reason: string;
  confidenceScore: number; // 0-1
  suggestedAllocationUsd?: number | null;
  
  // Metadata
  source: 'manual' | 'agent'; // Where suggestion came from
  submittedBy?: string; // Username or 'agent'
  addedAt: string; // ISO timestamp
  status: 'pending' | 'processing' | 'completed' | 'failed';
  
  // Processing info (set when processed)
  processedAt?: string;
  proposalId?: string;
  txHash?: string;
  errorMessage?: string;
};

export type SuggestionsQueue = {
  suggestions: QueuedSuggestion[];
  lastUpdated: string;
};

// ============================================
// Configuration
// ============================================

const QUEUE_FILE_PATH = path.join(process.cwd(), 'data', 'suggestions-queue.json');

/**
 * Ensure the data directory exists
 */
function ensureDataDir() {
  const dataDir = path.dirname(QUEUE_FILE_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Load queue from file (or create empty queue if doesn't exist)
 */
function loadQueue(): SuggestionsQueue {
  ensureDataDir();
  
  if (!fs.existsSync(QUEUE_FILE_PATH)) {
    return {
      suggestions: [],
      lastUpdated: new Date().toISOString(),
    };
  }
  
  try {
    const content = fs.readFileSync(QUEUE_FILE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('⚠️  Failed to load queue file, starting with empty queue:', error);
    return {
      suggestions: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Save queue to file
 */
function saveQueue(queue: SuggestionsQueue): void {
  ensureDataDir();
  queue.lastUpdated = new Date().toISOString();
  fs.writeFileSync(QUEUE_FILE_PATH, JSON.stringify(queue, null, 2), 'utf-8');
}

// ============================================
// Queue Operations
// ============================================

/**
 * Add a suggestion to the queue
 */
export function addSuggestionToQueue(suggestion: Omit<QueuedSuggestion, 'id' | 'addedAt' | 'status'>): QueuedSuggestion {
  const queue = loadQueue();
  
  const newSuggestion: QueuedSuggestion = {
    ...suggestion,
    id: `suggestion_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    addedAt: new Date().toISOString(),
    status: 'pending',
  };
  
  queue.suggestions.push(newSuggestion);
  saveQueue(queue);
  
  console.log(`✅ Added suggestion to queue: ${newSuggestion.id}`);
  console.log(`   Coin: ${newSuggestion.coinName || newSuggestion.coinSymbol || newSuggestion.coinId}`);
  console.log(`   Confidence: ${(newSuggestion.confidenceScore * 100).toFixed(1)}%`);
  console.log(`   Queue position: ${queue.suggestions.filter(s => s.status === 'pending').length}`);
  
  return newSuggestion;
}

/**
 * Get all pending suggestions (not yet processed)
 */
export function getPendingSuggestions(): QueuedSuggestion[] {
  const queue = loadQueue();
  return queue.suggestions.filter(s => s.status === 'pending');
}

/**
 * Get the next pending suggestion (oldest first, FIFO)
 */
export function getNextSuggestion(): QueuedSuggestion | null {
  const pending = getPendingSuggestions();
  return pending.length > 0 ? pending[0] : null;
}

/**
 * Update suggestion status
 */
export function updateSuggestionStatus(
  id: string,
  status: QueuedSuggestion['status'],
  metadata?: {
    proposalId?: string;
    txHash?: string;
    errorMessage?: string;
  }
): void {
  const queue = loadQueue();
  const suggestion = queue.suggestions.find(s => s.id === id);
  
  if (!suggestion) {
    throw new Error(`Suggestion not found: ${id}`);
  }
  
  suggestion.status = status;
  
  if (status === 'completed' || status === 'failed') {
    suggestion.processedAt = new Date().toISOString();
  }
  
  if (metadata?.proposalId) {
    suggestion.proposalId = metadata.proposalId;
  }
  
  if (metadata?.txHash) {
    suggestion.txHash = metadata.txHash;
  }
  
  if (metadata?.errorMessage) {
    suggestion.errorMessage = metadata.errorMessage;
  }
  
  saveQueue(queue);
  
  console.log(`✅ Updated suggestion ${id} status: ${status}`);
}

/**
 * Get all suggestions (for viewing/debugging)
 */
export function getAllSuggestions(): QueuedSuggestion[] {
  const queue = loadQueue();
  return queue.suggestions;
}

/**
 * Get queue statistics
 */
export function getQueueStats() {
  const queue = loadQueue();
  
  return {
    total: queue.suggestions.length,
    pending: queue.suggestions.filter(s => s.status === 'pending').length,
    processing: queue.suggestions.filter(s => s.status === 'processing').length,
    completed: queue.suggestions.filter(s => s.status === 'completed').length,
    failed: queue.suggestions.filter(s => s.status === 'failed').length,
    lastUpdated: queue.lastUpdated,
  };
}

/**
 * Clear completed/failed suggestions older than X days
 */
export function cleanupOldSuggestions(daysOld: number = 7): number {
  const queue = loadQueue();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const originalLength = queue.suggestions.length;
  
  queue.suggestions = queue.suggestions.filter(s => {
    // Keep all pending/processing
    if (s.status === 'pending' || s.status === 'processing') {
      return true;
    }
    
    // Keep completed/failed if recent
    if (s.processedAt) {
      const processedDate = new Date(s.processedAt);
      return processedDate > cutoffDate;
    }
    
    return true;
  });
  
  const removed = originalLength - queue.suggestions.length;
  
  if (removed > 0) {
    saveQueue(queue);
    console.log(`✅ Cleaned up ${removed} old suggestion(s) from queue`);
  }
  
  return removed;
}

/**
 * Delete a suggestion from the queue
 */
export function deleteSuggestion(id: string): boolean {
  const queue = loadQueue();
  const originalLength = queue.suggestions.length;
  
  queue.suggestions = queue.suggestions.filter(s => s.id !== id);
  
  if (queue.suggestions.length < originalLength) {
    saveQueue(queue);
    console.log(`✅ Deleted suggestion ${id} from queue`);
    return true;
  }
  
  console.log(`⚠️  Suggestion ${id} not found in queue`);
  return false;
}

/**
 * Check if a coin is already in the queue (pending)
 */
export function isCoinInQueue(coinAddress: string): boolean {
  const pending = getPendingSuggestions();
  const addressLower = coinAddress.toLowerCase();
  return pending.some(s => s.coinId.toLowerCase() === addressLower);
}
