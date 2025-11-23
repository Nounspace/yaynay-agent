/**
 * View Suggestions Queue
 * 
 * Displays all pending, processing, completed, and failed suggestions
 * in the queue with detailed information.
 */

import dotenv from 'dotenv';
import {
  getAllSuggestions,
  getQueueStats,
  getPendingSuggestions,
} from '../lib/dao/suggestionsQueue';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function viewQueue() {
  try {
    console.log('\n📋 SUGGESTIONS QUEUE');
    console.log('═'.repeat(60));
    console.log('');

    // Get stats
    const stats = getQueueStats();
    
    console.log('📊 Queue Statistics:');
    console.log(`   Total: ${stats.total}`);
    console.log(`   Pending: ${stats.pending}`);
    console.log(`   Processing: ${stats.processing}`);
    console.log(`   Completed: ${stats.completed}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Last Updated: ${new Date(stats.lastUpdated).toLocaleString()}`);
    console.log('');

    // Get all suggestions
    const allSuggestions = getAllSuggestions();
    
    if (allSuggestions.length === 0) {
      console.log('✅ Queue is empty');
      return;
    }

    // Display pending suggestions
    const pending = getPendingSuggestions();
    
    if (pending.length > 0) {
      console.log('\n' + '═'.repeat(60));
      console.log('⏳ PENDING SUGGESTIONS');
      console.log('═'.repeat(60));
      console.log('');

      pending.forEach((suggestion, index) => {
        console.log(`${index + 1}. ${suggestion.coinName || suggestion.coinSymbol || suggestion.coinId.slice(0, 10)}`);
        console.log(`   Queue ID: ${suggestion.id}`);
        console.log(`   Coin Address: ${suggestion.coinId}`);
        console.log(`   Confidence: ${(suggestion.confidenceScore * 100).toFixed(1)}%`);
        console.log(`   Source: ${suggestion.source}`);
        
        if (suggestion.submittedBy) {
          console.log(`   Submitted By: ${suggestion.submittedBy}`);
        }
        
        if (suggestion.currentPriceUsd !== undefined && suggestion.currentPriceUsd !== null) {
          console.log(`   Price: $${suggestion.currentPriceUsd.toFixed(6)}`);
        }
        
        if (suggestion.volume24hUsd !== undefined && suggestion.volume24hUsd !== null) {
          console.log(`   24h Volume: $${suggestion.volume24hUsd.toLocaleString()}`);
        }
        
        if (suggestion.suggestedAllocationUsd) {
          console.log(`   Suggested Allocation: $${suggestion.suggestedAllocationUsd.toLocaleString()}`);
        }
        
        console.log(`   Added: ${new Date(suggestion.addedAt).toLocaleString()}`);
        console.log('');
        console.log(`   Reason:`);
        console.log(`   ${suggestion.reason.substring(0, 200)}${suggestion.reason.length > 200 ? '...' : ''}`);
        console.log('');
        console.log('─'.repeat(60));
        console.log('');
      });
    }

    // Display processing/completed/failed
    const nonPending = allSuggestions.filter(s => s.status !== 'pending');
    
    if (nonPending.length > 0) {
      console.log('\n' + '═'.repeat(60));
      console.log('📜 PROCESSED SUGGESTIONS');
      console.log('═'.repeat(60));
      console.log('');

      nonPending.forEach((suggestion) => {
        const statusEmoji = suggestion.status === 'completed' ? '✅' : 
                           suggestion.status === 'processing' ? '⏳' : '❌';
        
        console.log(`${statusEmoji} ${suggestion.coinName || suggestion.coinSymbol || suggestion.coinId.slice(0, 10)}`);
        console.log(`   Status: ${suggestion.status.toUpperCase()}`);
        console.log(`   Queue ID: ${suggestion.id}`);
        console.log(`   Added: ${new Date(suggestion.addedAt).toLocaleString()}`);
        
        if (suggestion.processedAt) {
          console.log(`   Processed: ${new Date(suggestion.processedAt).toLocaleString()}`);
        }
        
        if (suggestion.proposalId) {
          console.log(`   Proposal ID: ${suggestion.proposalId}`);
        }
        
        if (suggestion.txHash) {
          console.log(`   Transaction: ${suggestion.txHash}`);
        }
        
        if (suggestion.errorMessage) {
          console.log(`   Error: ${suggestion.errorMessage}`);
        }
        
        console.log('');
      });
    }

  } catch (error) {
    console.error('\n❌ Error viewing queue:', error);
    throw error;
  }
}

// Run the script
console.log('\n🔍 Viewing Suggestions Queue...\n');

viewQueue()
  .then(() => {
    console.log('\n✅ Queue view complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Failed: ${error.message}`);
    process.exit(1);
  });
