/**
 * Debug Logging Utility
 * 
 * All hot-path logging goes through this module.
 * Logs are disabled by default and only enabled when debug mode is active.
 */

// Global debug settings
let isDebugModeEnabled = false;
let isVerboseLoggingEnabled = false;

// Throttling state
const throttleTimers = new Map<string, number>();

/**
 * Enable/disable debug mode (from settings)
 */
export function setDebugMode(enabled: boolean) {
  isDebugModeEnabled = enabled;
}

/**
 * Enable/disable verbose logging (collision, autopush, etc.)
 * This is separate from debug mode - even in debug mode, verbose logs are off by default
 */
export function setVerboseLogging(enabled: boolean) {
  isVerboseLoggingEnabled = enabled;
}

// Expose for checking in hot paths
export function getVerboseLogging(): boolean {
  return isVerboseLoggingEnabled;
}

/**
 * Log only when debug mode is enabled
 */
export function debugLog(category: string, ...args: unknown[]) {
  if (isDebugModeEnabled) {
    console.log(`[${category}]`, ...args);
  }
}

/**
 * Log only when verbose logging is enabled (for hot paths)
 * This is OFF by default even in debug mode
 */
export function verboseLog(category: string, ...args: unknown[]) {
  if (isVerboseLoggingEnabled) {
    console.log(`[${category}]`, ...args);
  }
}

/**
 * Throttled log - only logs once per interval (ms)
 * Useful for per-frame logs that would spam the console
 */
export function throttledLog(key: string, intervalMs: number, category: string, ...args: unknown[]) {
  if (!isDebugModeEnabled) return;
  
  const now = performance.now();
  const lastLog = throttleTimers.get(key) || 0;
  
  if (now - lastLog >= intervalMs) {
    throttleTimers.set(key, now);
    console.log(`[${category}]`, ...args);
  }
}

/**
 * One-time log - only logs the first time it's called with a given key
 */
const oneTimeKeys = new Set<string>();
export function oneTimeLog(key: string, category: string, ...args: unknown[]) {
  if (!isDebugModeEnabled) return;
  if (oneTimeKeys.has(key)) return;
  
  oneTimeKeys.add(key);
  console.log(`[${category}]`, ...args);
}

/**
 * Reset one-time log keys (e.g., on level restart)
 */
export function resetOneTimeLogs() {
  oneTimeKeys.clear();
}
