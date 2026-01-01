import cron from 'node-cron';
import { cleanupExpiredExtractions } from './extraction.js';
import { env } from '../config/env.js';

let cleanupTask: cron.ScheduledTask | null = null;

/**
 * Start the cleanup scheduler
 */
export function startCleanupScheduler(): void {
  if (!env.ENABLE_AUTO_CLEANUP) {
    console.log('Auto cleanup is disabled');
    return;
  }
  
  // Run cleanup every hour
  cleanupTask = cron.schedule('0 * * * *', async () => {
    console.log('[Cleanup] Running scheduled cleanup...');
    
    try {
      const deletedCount = await cleanupExpiredExtractions();
      
      if (deletedCount > 0) {
        console.log(`[Cleanup] Deleted ${deletedCount} expired extractions`);
      } else {
        console.log('[Cleanup] No expired extractions found');
      }
    } catch (error) {
      console.error('[Cleanup] Error during cleanup:', error);
    }
  });
  
  console.log('Cleanup scheduler started (runs every hour)');
}

/**
 * Stop the cleanup scheduler
 */
export function stopCleanupScheduler(): void {
  if (cleanupTask) {
    cleanupTask.stop();
    cleanupTask = null;
    console.log('Cleanup scheduler stopped');
  }
}

/**
 * Run cleanup immediately
 */
export async function runCleanupNow(): Promise<number> {
  return cleanupExpiredExtractions();
}
