/**
 * ============================================================================
 * CORRIDOR MAGNETISM SYSTEM
 * ============================================================================
 * 
 * Gently aligns the player with corridor centerlines using the medial axis
 * skeleton data. This applies a gradual turn correction to the joystick input,
 * not a position teleport.
 * 
 * Strategy: 
 * 1. Define back and front points on the animal
 * 2. Find nearest skeleton point to the back
 * 3. Calculate angle between animal facing and spine tangent
 * 4. Apply gradual turn correction to align with corridor
 * 
 * ============================================================================
 */

import { Maze } from '@/types/game';
import { GameConfig } from './GameConfig';
import { computeMedialAxis, MedialAxisResult, SpurConfig } from './MedialAxis';

// ============================================================================
// TYPES
// ============================================================================

/** Magnetism tuning configuration */
export interface MagnetismConfig {
  /** Dead zone angle - no correction applied when within this angle (radians) */
  deadzone: number;
  /** Maximum turn correction strength (0-1) */
  maxStrength: number;
  /** Smoothing time constant for turn correction (seconds) */
  smoothingTau: number;
  /** Decay rate when no correction needed (per second) */
  decayRate: number;
  /** Distance from center to back sensing point */
  backOffset: number;
  /** Distance from center to front sensing point */
  frontOffset: number;
  /** Master strength multiplier (0-10) */
  strength: number;
  /** Enable/disable magnetism entirely */
  enabled: boolean;
  /** Maximum turn rate limit (radians per second) - caps how fast correction can change */
  maxTurnRate: number;
}

/** Result of magnetism turn calculation */
export interface MagnetismTurnResult {
  /** Turn correction to apply to joystick (radians, positive = turn right) */
  turnCorrection: number;
  /** Debug info */
  debug: {
    /** Back sensing point (world space) */
    backX: number;
    backZ: number;
    /** Front sensing point (world space) */
    frontX: number;
    frontZ: number;
    /** Nearest spine point (world space) */
    spineX: number;
    spineZ: number;
    /** Target point on spine for visualization */
    targetX: number;
    targetZ: number;
    /** Spine tangent direction (normalized) */
    tangentX: number;
    tangentZ: number;
    /** Neighbor 1 position (world space) - for visualization */
    neighbor1X: number;
    neighbor1Z: number;
    /** Neighbor 2 position (world space) - for visualization */
    neighbor2X: number;
    neighbor2Z: number;
    /** Raw angle difference before smoothing */
    rawAngleDiff: number;
    /** Whether magnetism is active */
    isActive: boolean;
    /** Current smoothed correction strength */
    strengthMultiplier: number;
    /** Cross-track distance (for compatibility) */
    crossDist: number;
    /** Whether at a junction */
    isJunctionSuppressed: boolean;
    /** Degree of nearest skeleton pixel */
    nearestDegree: number;
    /** Final smoothed turn correction being applied (radians) */
    appliedTurnCorrection: number;
  };
}

/** Skeleton pixel with neighbor info for fast lookup */
interface SkeletonPixel {
  fx: number;  // Fine grid X
  fy: number;  // Fine grid Y
  wx: number;  // World X
  wz: number;  // World Z
  degree: number;  // Number of skeleton neighbors
  neighbors: Array<{ fx: number; fy: number; wx: number; wz: number }>;
  /** True if within suppression radius of junction or endpoint */
  isSuppressed: boolean;
}

/** Cached skeleton data for fast lookups */
export interface MagnetismCache {
  /** Fine grid reference */
  fineGrid: MedialAxisResult['fineGrid'];
  /** Scale factor */
  scale: number;
  /** Fine cell size in world units */
  fineCellSize: number;
  /** Indexed skeleton pixels for local search */
  skeletonPixels: SkeletonPixel[];
  /** Grid dimensions */
  fineWidth: number;
  fineHeight: number;
  /** Suppression radius in skeleton steps */
  suppressionRadius: number;
}

/** State for smoothing turn corrections */
export interface MagnetismTurnState {
  /** Current smoothed turn correction (radians) */
  currentCorrection: number;
  /** Whether state has been initialized */
  initialized: boolean;
  /** Last locked skeleton pixel (fine grid coords) for sticky selection */
  lastNearestFx: number;
  lastNearestFy: number;
  /** Time the current point has been locked (for stability) */
  lockDuration: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const CELL_SIZE = GameConfig.CELL_SIZE;

export const DEFAULT_MAGNETISM_CONFIG: MagnetismConfig = {
  deadzone: 0.08,                     // ~4.5 degrees (wider deadzone to prevent micro-wobble)
  maxStrength: 1.0,                   // 100% of angle diff (full strength)
  smoothingTau: 0.10,                 // 100ms base (multiplied by 2.5 in calculation for 250ms effective)
  decayRate: 5.0,                     // Faster decay
  backOffset: 0.2,                    // Distance to back sensing point
  frontOffset: 0.35,                  // Distance to front sensing point
  strength: 8.0,                      // Higher default strength (0-10 scale)
  enabled: true,
  maxTurnRate: 2.0,                   // Reduced for smoother turns
};

// ============================================================================
// CACHE BUILDING
// ============================================================================

/**
 * Build magnetism cache from maze. Call once when maze changes.
 */
export function buildMagnetismCache(
  maze: Maze,
  spurConfig?: SpurConfig
): MagnetismCache {
  const result = computeMedialAxis(maze, 100, spurConfig);
  const { fineGrid, scale, fineCellSize } = result;
  
  const fineHeight = fineGrid.length;
  const fineWidth = fineGrid[0]?.length ?? 0;
  
  // Suppression radius: 1 × scale (i.e., 1 real-world maze cell width in skeleton steps)
  // At scale=100, this is 100 steps. DO NOT change this - scale IS 1 cell by definition.
  const suppressionRadius = scale;
  
  // Build indexed skeleton pixels with neighbor info
  const skeletonPixels: SkeletonPixel[] = [];
  
  // 8-connected neighbor offsets
  const dx8 = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy8 = [-1, -1, -1, 0, 0, 1, 1, 1];
  
  // First pass: create all pixels with basic info
  const pixelMap = new Map<string, SkeletonPixel>();
  
  for (let fy = 0; fy < fineHeight; fy++) {
    for (let fx = 0; fx < fineWidth; fx++) {
      if (!fineGrid[fy][fx].isSkeleton) continue;
      
      const wx = (fx + 0.5) * fineCellSize;
      const wz = (fy + 0.5) * fineCellSize;
      
      // Find skeleton neighbors
      const neighbors: SkeletonPixel['neighbors'] = [];
      for (let i = 0; i < 8; i++) {
        const nx = fx + dx8[i];
        const ny = fy + dy8[i];
        if (nx >= 0 && nx < fineWidth && ny >= 0 && ny < fineHeight) {
          if (fineGrid[ny][nx].isSkeleton) {
            neighbors.push({
              fx: nx,
              fy: ny,
              wx: (nx + 0.5) * fineCellSize,
              wz: (ny + 0.5) * fineCellSize,
            });
          }
        }
      }
      
      const pixel: SkeletonPixel = {
        fx,
        fy,
        wx,
        wz,
        degree: neighbors.length,
        neighbors,
        isSuppressed: false, // Will be set in second pass
      };
      
      pixelMap.set(`${fx},${fy}`, pixel);
      skeletonPixels.push(pixel);
    }
  }
  
  // Second pass: mark pixels within suppressionRadius of junctions (degree >= 3) or endpoints (degree == 1)
  // Find all junctions and endpoints first
  const seedPixels = skeletonPixels.filter(p => p.degree >= 3 || p.degree === 1);
  
  // BFS from each seed to mark suppression zones
  for (const seed of seedPixels) {
    // BFS to find all pixels within suppressionRadius steps
    const visited = new Set<string>();
    const queue: Array<{ fx: number; fy: number; steps: number }> = [
      { fx: seed.fx, fy: seed.fy, steps: 0 }
    ];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.fx},${current.fy}`;
      
      if (visited.has(key)) continue;
      visited.add(key);
      
      const pixel = pixelMap.get(key);
      if (!pixel) continue;
      
      // Mark as suppressed
      pixel.isSuppressed = true;
      
      // Continue BFS if we haven't reached the radius limit
      if (current.steps < suppressionRadius) {
        for (const neighbor of pixel.neighbors) {
          const nKey = `${neighbor.fx},${neighbor.fy}`;
          if (!visited.has(nKey)) {
            queue.push({ fx: neighbor.fx, fy: neighbor.fy, steps: current.steps + 1 });
          }
        }
      }
    }
  }
  
  const suppressedCount = skeletonPixels.filter(p => p.isSuppressed).length;
  console.log(`[Magnetism] Built cache with ${skeletonPixels.length} skeleton pixels, ${suppressedCount} suppressed (${seedPixels.length} seeds, radius=${suppressionRadius})`);
  
  return {
    fineGrid,
    scale,
    fineCellSize,
    skeletonPixels,
    fineWidth,
    fineHeight,
    suppressionRadius,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find nearest skeleton pixel within a local search window.
 */
function findNearestSkeletonPixel(
  x: number,
  z: number,
  cache: MagnetismCache,
  searchRadius: number = 4.0
): SkeletonPixel | null {
  const { skeletonPixels } = cache;
  
  let nearest: SkeletonPixel | null = null;
  let nearestDistSq = Infinity;
  const searchRadiusSq = searchRadius * searchRadius;
  
  for (const pixel of skeletonPixels) {
    const dx = x - pixel.wx;
    const dz = z - pixel.wz;
    const distSq = dx * dx + dz * dz;
    
    if (distSq < searchRadiusSq && distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = pixel;
    }
  }
  
  return nearest;
}

/** Neighbor reference type (subset of SkeletonPixel) */
type NeighborRef = { fx: number; fy: number; wx: number; wz: number };

/**
 * Look up full SkeletonPixel by fine grid coords.
 */
function lookupPixel(cache: MagnetismCache, fx: number, fy: number): SkeletonPixel | null {
  return cache.skeletonPixels.find(p => p.fx === fx && p.fy === fy) ?? null;
}

/**
 * Walk along skeleton from a starting position in one direction for N steps.
 * Returns the world position N steps away, or the furthest reachable (endpoint/junction).
 * Requires cache for full pixel lookups.
 */
function walkSkeletonFromNeighbor(
  cache: MagnetismCache,
  startNeighbor: NeighborRef, 
  steps: number, 
  cameFromFx: number,
  cameFromFy: number
): { wx: number; wz: number } {
  let currentFx = startNeighbor.fx;
  let currentFy = startNeighbor.fy;
  let currentWx = startNeighbor.wx;
  let currentWz = startNeighbor.wz;
  let prevFx = cameFromFx;
  let prevFy = cameFromFy;
  
  for (let i = 0; i < steps; i++) {
    const pixel = lookupPixel(cache, currentFx, currentFy);
    if (!pixel) {
      // Can't find pixel, return current position
      return { wx: currentWx, wz: currentWz };
    }
    
    // Stop at junctions to avoid crossing into other corridors
    if (pixel.degree >= 3) {
      return { wx: currentWx, wz: currentWz };
    }
    
    // Find next neighbor that isn't where we came from
    const nextNeighbor = pixel.neighbors.find(n => n.fx !== prevFx || n.fy !== prevFy);
    if (!nextNeighbor) {
      // Hit an endpoint, return current
      return { wx: currentWx, wz: currentWz };
    }
    
    prevFx = currentFx;
    prevFy = currentFy;
    currentFx = nextNeighbor.fx;
    currentFy = nextNeighbor.fy;
    currentWx = nextNeighbor.wx;
    currentWz = nextNeighbor.wz;
  }
  
  return { wx: currentWx, wz: currentWz };
}

/**
 * Compute corridor tangent at a skeleton pixel using extended neighbors.
 * Walks 3 steps in each direction along the skeleton to get a longer, more stable tangent.
 * For junctions (degree >= 3), returns null to indicate no turn correction should apply.
 * 
 * Returns both the tangent and the two endpoint positions used for debug visualization.
 */
function computeTangentExtended(
  pixel: SkeletonPixel, 
  cache: MagnetismCache,
  lookAhead: number = 1
): { 
  tx: number; 
  tz: number; 
  endpoint1: { wx: number; wz: number };
  endpoint2: { wx: number; wz: number };
} | null {
  const { degree, neighbors, fx, fy, wx, wz } = pixel;
  
  // No neighbors - can't compute tangent
  if (degree === 0) {
    return null;
  }
  
  // Endpoint - use direction from neighbor to this pixel, but still try to extend
  if (degree === 1) {
    const n = neighbors[0];
    // Walk further from the single neighbor
    const farPoint = walkSkeletonFromNeighbor(cache, n, lookAhead - 1, fx, fy);
    const dx = wx - farPoint.wx;
    const dz = wz - farPoint.wz;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len <= 0.001) return null;
    return { 
      tx: dx / len, 
      tz: dz / len, 
      endpoint1: { wx, wz }, 
      endpoint2: farPoint 
    };
  }
  
  // Normal corridor (degree 2) - walk 3 steps in each direction
  if (degree === 2) {
    const n1 = neighbors[0];
    const n2 = neighbors[1];
    
    // Walk from n1 away from pixel (lookAhead-1 more steps since n1 is already 1 step away)
    const endpoint1 = walkSkeletonFromNeighbor(cache, n1, lookAhead - 1, fx, fy);
    // Walk from n2 away from pixel
    const endpoint2 = walkSkeletonFromNeighbor(cache, n2, lookAhead - 1, fx, fy);
    
    const dx = endpoint2.wx - endpoint1.wx;
    const dz = endpoint2.wz - endpoint1.wz;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len <= 0.001) return null;
    const tx = dx / len;
    const tz = dz / len;
    return { tx, tz, endpoint1, endpoint2 };
  }
  
  // Junction (degree >= 3): do not apply turn correction
  return null;
}

/**
 * Normalize angle to [-PI, PI]
 */
function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Smoothstep interpolation
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ============================================================================
// TURN-BASED MAGNETISM CALCULATION
// ============================================================================

/**
 * Calculate turn-based magnetism correction.
 * 
 * This calculates how much the animal should turn to align with the corridor.
 * The correction is applied to the joystick input, not the position.
 * 
 * @param playerX - Player world X position
 * @param playerZ - Player world Z position  
 * @param playerRotation - Player facing angle (radians, 0 = +Z, increases clockwise)
 * @param cache - Magnetism cache (skeleton data)
 * @param config - Magnetism configuration
 * @param state - Turn smoothing state (mutated)
 * @param delta - Frame time in seconds
 * @returns Magnetism turn result with correction angle
 */
export function calculateMagnetismTurn(
  playerX: number,
  playerZ: number,
  playerRotation: number,
  cache: MagnetismCache,
  config: MagnetismConfig,
  state: MagnetismTurnState,
  delta: number
): MagnetismTurnResult {
  const noOpResult: MagnetismTurnResult = {
    turnCorrection: 0,
    debug: {
      backX: playerX,
      backZ: playerZ,
      frontX: playerX,
      frontZ: playerZ,
      spineX: playerX,
      spineZ: playerZ,
      targetX: playerX,
      targetZ: playerZ,
      tangentX: 0,
      tangentZ: 1,
      neighbor1X: playerX,
      neighbor1Z: playerZ,
      neighbor2X: playerX,
      neighbor2Z: playerZ,
      rawAngleDiff: 0,
      isActive: false,
      strengthMultiplier: 0,
      crossDist: 0,
      isJunctionSuppressed: false,
      nearestDegree: 0,
      appliedTurnCorrection: 0,
    },
  };
  
  // EARLY GUARD: Validate delta before any calculations or state mutations
  // This prevents NaN corruption from negative/zero/non-finite delta values
  // (Browser timing edge cases like tab switching can produce invalid deltas)
  if (!Number.isFinite(delta) || delta <= 0) {
    return {
      turnCorrection: Number.isFinite(state.currentCorrection) ? state.currentCorrection : 0,
      debug: { ...noOpResult.debug },
    };
  }
  
  if (!config.enabled || config.strength <= 0) {
    // Decay existing correction (delta is now guaranteed valid)
    if (state.initialized && Math.abs(state.currentCorrection) > 0.001) {
      state.currentCorrection *= Math.exp(-config.decayRate * delta);
    }
    return { ...noOpResult, turnCorrection: state.currentCorrection };
  }
  
  // Initialize state if needed
  if (!state.initialized) {
    state.currentCorrection = 0;
    state.lastNearestFx = -1;
    state.lastNearestFy = -1;
    state.lockDuration = 0;
    state.initialized = true;
  }
  
  // Calculate facing direction
  const facingX = Math.sin(playerRotation);
  const facingZ = Math.cos(playerRotation);
  
  // Calculate back and front sensing points
  const backX = playerX - facingX * config.backOffset;
  const backZ = playerZ - facingZ * config.backOffset;
  const frontX = playerX + facingX * config.frontOffset;
  const frontZ = playerZ + facingZ * config.frontOffset;
  
  // Find nearest skeleton pixel to front (head) point for better anticipation
  const candidateNearest = findNearestSkeletonPixel(frontX, frontZ, cache);
  if (!candidateNearest) {
    // Decay and return
    state.currentCorrection *= Math.exp(-config.decayRate * delta);
    state.lastNearestFx = -1;
    state.lastNearestFy = -1;
    state.lockDuration = 0;
    return { ...noOpResult, turnCorrection: state.currentCorrection };
  }
  
  // Sticky skeleton point selection:
  // Once locked to a point, only switch if:
  // 1. The new point is significantly closer (>15% closer), OR
  // 2. The locked point is no longer valid (outside search radius)
  let nearest = candidateNearest;
  const candidateDist = Math.sqrt((frontX - candidateNearest.wx) ** 2 + (frontZ - candidateNearest.wz) ** 2);
  
  if (state.lastNearestFx >= 0 && state.lastNearestFy >= 0) {
    // Try to find the previously locked point
    const lockedPixel = cache.skeletonPixels.find(
      p => p.fx === state.lastNearestFx && p.fy === state.lastNearestFy
    );
    
    if (lockedPixel) {
      const lockedDist = Math.sqrt((frontX - lockedPixel.wx) ** 2 + (frontZ - lockedPixel.wz) ** 2);
      const maxSearchRadius = 2.5; // Reduced from 4.0 - don't hold onto distant points
      
      // Stick to locked point unless candidate is significantly better
      // Require 15% closer OR locked point is too far (reduced from 30% for more responsive switching)
      const switchThreshold = 0.85; // New point must be 85% of locked distance (15% closer)
      const shouldSwitch = lockedDist > maxSearchRadius || candidateDist < lockedDist * switchThreshold;
      
      if (!shouldSwitch) {
        nearest = lockedPixel;
        state.lockDuration += delta;
      } else {
        // Switching to new point
        state.lastNearestFx = candidateNearest.fx;
        state.lastNearestFy = candidateNearest.fy;
        state.lockDuration = 0;
      }
    } else {
      // Locked point no longer exists, use candidate
      state.lastNearestFx = candidateNearest.fx;
      state.lastNearestFy = candidateNearest.fy;
      state.lockDuration = 0;
    }
  } else {
    // No locked point, use candidate
    state.lastNearestFx = candidateNearest.fx;
    state.lastNearestFy = candidateNearest.fy;
    state.lockDuration = 0;
  }
  
  // Get tangent at skeleton point using extended neighbors (±100 steps) for maximum stability
  // At scale=100, ±100 steps = 2 cell widths - very smooth, averages over full corridor sections
  const tangent = computeTangentExtended(nearest, cache, 100);
  
  // If at a junction (tangent is null) OR in suppression zone, skip turn correction entirely
  const isSuppressed = tangent === null || nearest.isSuppressed;
  if (isSuppressed) {
    // Decay existing correction and return with suppression flag
    state.currentCorrection *= Math.exp(-config.decayRate * delta);
    return {
      turnCorrection: state.currentCorrection,
      debug: {
        backX,
        backZ,
        frontX,
        frontZ,
        spineX: nearest.wx,
        spineZ: nearest.wz,
        targetX: nearest.wx,
        targetZ: nearest.wz,
        tangentX: 0,
        tangentZ: 1,
        neighbor1X: nearest.wx,
        neighbor1Z: nearest.wz,
        neighbor2X: nearest.wx,
        neighbor2Z: nearest.wz,
        rawAngleDiff: 0,
        isActive: false,
        strengthMultiplier: 0,
        crossDist: Math.sqrt((nearest.wx - frontX) ** 2 + (nearest.wz - frontZ) ** 2),
        isJunctionSuppressed: true,
        nearestDegree: nearest.degree,
        appliedTurnCorrection: state.currentCorrection,
      },
    };
  }
  
  const { tx, tz, endpoint1, endpoint2 } = tangent;
  
  // Calculate cross-track distance from front point to spine for gating
  const toSpineX = nearest.wx - frontX;
  const toSpineZ = nearest.wz - frontZ;
  const crossDist = Math.sqrt(toSpineX * toSpineX + toSpineZ * toSpineZ);
  
  // Distance-based strength gating (stronger when closer to spine)
  // Use 4.0 cells to ensure magnetism works in wider corridors (corridors can be 2-3 cells wide)
  // With CELL_SIZE=1.0, corridors are typically 2-3 units wide, so max distance should be ~4
  const maxDist = CELL_SIZE * 4.0;
  const distFactor = 1 - smoothstep(0, maxDist, crossDist);
  
  // ============================================================================
  // TANGENT ALIGNMENT USING DOT PRODUCT
  // ============================================================================
  // 
  // Simple rule: choose the tangent direction that makes the smaller angle
  // with the animal's facing direction. No state, no hysteresis.
  //
  // Dot product < 0 means angle > 90°, so flip the tangent.
  // ============================================================================
  
  const dot = facingX * tx + facingZ * tz;
  const alignedTx = dot >= 0 ? tx : -tx;
  const alignedTz = dot >= 0 ? tz : -tz;
  
  // Step 2: Use cross product to determine turn direction
  // 2D cross product: A × T = Ax*Tz - Az*Tx
  // In our coordinate system (X-right, Z-forward):
  //   Positive cross = tangent is to the LEFT of facing (counter-clockwise)
  //   Negative cross = tangent is to the RIGHT of facing (clockwise)
  // 
  // To ALIGN with the tangent:
  //   If tangent is left (cross > 0), turn LEFT (negative angleDiff)
  //   If tangent is right (cross < 0), turn RIGHT (positive angleDiff)
  const crossProduct = facingX * alignedTz - facingZ * alignedTx;
  
  // Step 3: Calculate the angle magnitude between them
  // Since we aligned the tangent to point forward, angle will be <= 90°
  const dotAligned = facingX * alignedTx + facingZ * alignedTz;
  const angleMagnitude = Math.acos(Math.max(-1, Math.min(1, dotAligned)));
  
  // Step 4: Signed angle - INVERT cross product sign for correct turn direction
  // Positive angleDiff = turn right (to align with tangent on right)
  // Negative angleDiff = turn left (to align with tangent on left)
  let angleDiff = crossProduct < 0 ? angleMagnitude : -angleMagnitude;
  
  // Apply deadzone
  const rawAngleDiff = angleDiff;
  if (Math.abs(angleDiff) < config.deadzone) {
    angleDiff = 0;
  } else {
    // Reduce by deadzone amount (smooth ramp from deadzone edge)
    const sign = angleDiff > 0 ? 1 : -1;
    angleDiff = sign * (Math.abs(angleDiff) - config.deadzone);
  }
  
  // Calculate target correction (no junctionFactor needed - junctions return early)
  const strengthScale = (config.strength / 10) * config.maxStrength;
  const targetCorrection = angleDiff * strengthScale * distFactor;
  
  // Note: delta validation is done at function entry, so delta is guaranteed valid here
  
  // Smooth the correction using exponential moving average with increased time constant
  // Multiply base tau by 2.5 for smoother, less jerky response (0.10 → 0.25 effective)
  const effectiveTau = config.smoothingTau * 2.5;
  const alpha = delta / (effectiveTau + delta);
  let smoothedCorrection = state.currentCorrection + (targetCorrection - state.currentCorrection) * alpha;
  
  // Wobble prevention: suppress small sign changes that cause oscillation
  // When correction oscillates between tiny +/- values, decay instead of flip
  const wobbleThreshold = 0.02; // ~1.2 degrees
  if (state.currentCorrection !== 0 && 
      Math.sign(smoothedCorrection) !== Math.sign(state.currentCorrection) &&
      Math.abs(smoothedCorrection) < wobbleThreshold) {
    // Sign is flipping with tiny magnitude - decay instead of flip
    smoothedCorrection = state.currentCorrection * 0.8;
  }
  
  // Apply decay when target is smaller than current (prevents buildup)
  let finalCorrection = smoothedCorrection;
  if (Math.abs(targetCorrection) < Math.abs(smoothedCorrection)) {
    finalCorrection = smoothedCorrection * Math.exp(-config.decayRate * delta);
  }
  
  // Clamp correction magnitude - max 10 degrees to prevent sudden flips
  const maxCorrection = Math.PI / 18; // Max 10 degrees (reduced from 15)
  finalCorrection = Math.max(-maxCorrection, Math.min(maxCorrection, finalCorrection));
  
  // Safety net: Reset state if somehow still NaN (shouldn't happen with early guard)
  if (!Number.isFinite(finalCorrection)) {
    console.warn('[Magnetism] Unexpected NaN - resetting state');
    state.currentCorrection = 0;
    return { 
      turnCorrection: 0, 
      debug: {
        backX, backZ, frontX, frontZ,
        spineX: nearest.wx, spineZ: nearest.wz,
        targetX: nearest.wx, targetZ: nearest.wz,
        tangentX: alignedTx, tangentZ: alignedTz,
        neighbor1X: endpoint1.wx, neighbor1Z: endpoint1.wz,
        neighbor2X: endpoint2.wx, neighbor2Z: endpoint2.wz,
        rawAngleDiff, isActive: false,
        strengthMultiplier: 0, crossDist,
        isJunctionSuppressed: false,
        nearestDegree: nearest.degree,
        appliedTurnCorrection: 0,
      },
    };
  }
  state.currentCorrection = finalCorrection;
  
  // isActive = system is engaged (nearby and enabled)
  const isActive = distFactor > 0.1;
  
  // Output the smoothed correction directly - smoothing already prevents sudden jumps
  return {
    turnCorrection: state.currentCorrection,
    debug: {
      backX,
      backZ,
      frontX,
      frontZ,
      spineX: nearest.wx,
      spineZ: nearest.wz,
      targetX: nearest.wx,
      targetZ: nearest.wz,
      // Pass the ALIGNED tangent to debug so compass shows correct direction
      tangentX: alignedTx,
      tangentZ: alignedTz,
      // Export neighbors aligned with tangent direction (neighbor1=behind, neighbor2=ahead)
      neighbor1X: dot >= 0 ? endpoint1.wx : endpoint2.wx,
      neighbor1Z: dot >= 0 ? endpoint1.wz : endpoint2.wz,
      neighbor2X: dot >= 0 ? endpoint2.wx : endpoint1.wx,
      neighbor2Z: endpoint2.wz,
      rawAngleDiff,
      isActive,
      strengthMultiplier: strengthScale * distFactor,
      crossDist,
      isJunctionSuppressed: false,
      nearestDegree: nearest.degree,
      appliedTurnCorrection: state.currentCorrection,
    },
  };
}

// ============================================================================
// LEGACY POSITION-BASED MAGNETISM (kept for reference/fallback)
// ============================================================================

/** Result of legacy position magnetism calculation */
export interface MagnetismResult {
  correctionX: number;
  correctionZ: number;
  debug: {
    targetX: number;
    targetZ: number;
    isActive: boolean;
    crossDist: number;
    strengthMultiplier: number;
    isJunctionSuppressed: boolean;
    nearestDegree: number;
    tangentX: number;
    tangentZ: number;
  };
}

/** Legacy filter state */
export interface MagnetismFilterState {
  targetX: number;
  targetZ: number;
  initialized: boolean;
}

/**
 * Legacy position-based magnetism (deprecated, kept for compatibility)
 */
export function calculateMagnetism(
  playerX: number,
  playerZ: number,
  inputDirX: number,
  inputDirZ: number,
  cache: MagnetismCache,
  config: MagnetismConfig,
  delta: number
): MagnetismResult {
  // Return no-op for legacy function
  return {
    correctionX: 0,
    correctionZ: 0,
    debug: {
      targetX: playerX,
      targetZ: playerZ,
      isActive: false,
      crossDist: 0,
      strengthMultiplier: 0,
      isJunctionSuppressed: false,
      nearestDegree: 0,
      tangentX: 0,
      tangentZ: 0,
    },
  };
}

export function filterTargetPoint(
  rawX: number,
  rawZ: number,
  state: MagnetismFilterState,
  tau: number,
  delta: number
): { x: number; z: number } {
  if (!state.initialized) {
    state.targetX = rawX;
    state.targetZ = rawZ;
    state.initialized = true;
    return { x: rawX, z: rawZ };
  }
  
  const alpha = delta / (tau + delta);
  state.targetX += (rawX - state.targetX) * alpha;
  state.targetZ += (rawZ - state.targetZ) * alpha;
  
  return { x: state.targetX, z: state.targetZ };
}
