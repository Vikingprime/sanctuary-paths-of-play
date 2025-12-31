/**
 * Debug Logging Utility
 * 
 * All hot-path logging goes through this module.
 * Logs are disabled by default and only enabled when debug mode is active.
 */

// Global debug settings
let isDebugModeEnabled = false;
let isVerboseLoggingEnabled = false;
let isAutopushEnabled = true;
let isLOSFaderEnabled = true;

// Per-frame metrics (reset each interval in RendererInfoTracker)
export const frameMetrics = {
  raycastCount: 0,
  activeFadedCells: 0,
  collisionChecks: 0,
  // New diagnostic metrics
  opacityBufferUpdates: 0,
  shadowLightMoves: 0,
  animationMixerUpdates: 0,
  gcSpikes: 0,  // Frame time > 50ms
};

// Track GC spike detection
let lastGcCheckTime = performance.now();

export function checkGcSpike(frameTime: number) {
  if (frameTime > 50) {
    frameMetrics.gcSpikes++;
  }
}

export function resetFrameMetrics() {
  frameMetrics.raycastCount = 0;
  frameMetrics.activeFadedCells = 0;
  frameMetrics.collisionChecks = 0;
  frameMetrics.opacityBufferUpdates = 0;
  frameMetrics.shadowLightMoves = 0;
  frameMetrics.animationMixerUpdates = 0;
  // gcSpikes NOT reset here - it's reset in RendererInfoTracker after reporting
}

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
 * Enable/disable autopush raycasting
 */
export function setAutopushEnabled(enabled: boolean) {
  isAutopushEnabled = enabled;
}

export function getAutopushEnabled(): boolean {
  return isAutopushEnabled;
}

/**
 * Enable/disable LOS corn fader
 */
export function setLOSFaderEnabled(enabled: boolean) {
  isLOSFaderEnabled = enabled;
}

export function getLOSFaderEnabled(): boolean {
  return isLOSFaderEnabled;
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
