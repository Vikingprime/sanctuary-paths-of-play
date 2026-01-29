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
    /** Spine tangent direction */
    tangentX: number;
    tangentZ: number;
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
}

/** State for smoothing turn corrections */
export interface MagnetismTurnState {
  /** Current smoothed turn correction (radians) */
  currentCorrection: number;
  /** Whether state has been initialized */
  initialized: boolean;
  /** Committed tangent direction sign (+1 or -1) for hysteresis */
  committedSign: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const CELL_SIZE = GameConfig.CELL_SIZE;

export const DEFAULT_MAGNETISM_CONFIG: MagnetismConfig = {
  deadzone: 0.1,                      // ~6 degrees
  maxStrength: 0.25,                  // 25% of full turn
  smoothingTau: 0.15,                 // 150ms smoothing
  decayRate: 3.0,                     // Decay over ~0.3s
  backOffset: 0.2,                    // Distance to back sensing point
  frontOffset: 0.35,                  // Distance to front sensing point
  strength: 5.0,                      // Default strength (0-10 scale)
  enabled: true,
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
  const result = computeMedialAxis(maze, 5, spurConfig);
  const { fineGrid, scale, fineCellSize } = result;
  
  const fineHeight = fineGrid.length;
  const fineWidth = fineGrid[0]?.length ?? 0;
  
  // Build indexed skeleton pixels with neighbor info
  const skeletonPixels: SkeletonPixel[] = [];
  
  // 8-connected neighbor offsets
  const dx8 = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy8 = [-1, -1, -1, 0, 0, 1, 1, 1];
  
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
      
      skeletonPixels.push({
        fx,
        fy,
        wx,
        wz,
        degree: neighbors.length,
        neighbors,
      });
    }
  }
  
  console.log(`[Magnetism] Built cache with ${skeletonPixels.length} skeleton pixels`);
  
  return {
    fineGrid,
    scale,
    fineCellSize,
    skeletonPixels,
    fineWidth,
    fineHeight,
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

/**
 * Compute corridor tangent at a skeleton pixel.
 * Returns normalized tangent vector in XZ plane.
 */
/**
 * Compute corridor tangent at a skeleton pixel using neighbors.
 * For degree 2 (normal corridor), uses the vector between the two neighbors (P+1 to P-1).
 * For junctions (degree >= 3), returns null to indicate no turn correction should apply.
 */
function computeTangent(pixel: SkeletonPixel): { tx: number; tz: number } | null {
  const { degree, neighbors, wx, wz } = pixel;
  
  // No neighbors - can't compute tangent
  if (degree === 0) {
    return null;
  }
  
  // Endpoint - use direction from neighbor to this pixel
  if (degree === 1) {
    const n = neighbors[0];
    const dx = wx - n.wx;
    const dz = wz - n.wz;
    const len = Math.sqrt(dx * dx + dz * dz);
    return len > 0.001 ? { tx: dx / len, tz: dz / len } : null;
  }
  
  // Normal corridor (degree 2) - compute tangent from neighbor1 to neighbor2 (P-1 to P+1)
  if (degree === 2) {
    const n1 = neighbors[0];
    const n2 = neighbors[1];
    const dx = n2.wx - n1.wx;
    const dz = n2.wz - n1.wz;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len <= 0.001) return null;
    const tx = dx / len;
    const tz = dz / len;
    // Debug: log the tangent calculation to diagnose perpendicular issue
    // console.log(`[Tangent] n1=(${n1.wx.toFixed(2)},${n1.wz.toFixed(2)}) n2=(${n2.wx.toFixed(2)},${n2.wz.toFixed(2)}) → tangent=(${tx.toFixed(3)},${tz.toFixed(3)}) angle=${(Math.atan2(tx, tz) * 180 / Math.PI).toFixed(1)}°`);
    return { tx, tz };
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
      rawAngleDiff: 0,
      isActive: false,
      strengthMultiplier: 0,
      crossDist: 0,
      isJunctionSuppressed: false,
      nearestDegree: 0,
      appliedTurnCorrection: 0,
    },
  };
  
  if (!config.enabled || config.strength <= 0) {
    // Decay existing correction
    if (state.initialized && Math.abs(state.currentCorrection) > 0.001) {
      state.currentCorrection *= Math.exp(-config.decayRate * delta);
    }
    return { ...noOpResult, turnCorrection: state.currentCorrection };
  }
  
  // Initialize state if needed
  if (!state.initialized) {
    state.currentCorrection = 0;
    state.committedSign = 1;
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
  const nearest = findNearestSkeletonPixel(frontX, frontZ, cache);
  if (!nearest) {
    // Decay and return
    state.currentCorrection *= Math.exp(-config.decayRate * delta);
    return { ...noOpResult, turnCorrection: state.currentCorrection };
  }
  
  // Get tangent at skeleton point - returns null for junctions (no turn correction)
  const tangent = computeTangent(nearest);
  
  // If at a junction (tangent is null), skip turn correction entirely
  const isJunction = tangent === null;
  if (isJunction) {
    // Decay existing correction and return with junction flag
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
  
  const { tx, tz } = tangent;
  
  // Calculate cross-track distance from front point to spine for gating
  const toSpineX = nearest.wx - frontX;
  const toSpineZ = nearest.wz - frontZ;
  const crossDist = Math.sqrt(toSpineX * toSpineX + toSpineZ * toSpineZ);
  
  // Distance-based strength gating (stronger when closer to spine)
  // Use 2.5 cells to ensure magnetism works in wider corridors (corridors can be 2-3 cells wide)
  const maxDist = CELL_SIZE * 2.5;
  const distFactor = 1 - smoothstep(0, maxDist, crossDist);
  
  // Calculate animal's facing angle and spine tangent angle
  const animalAngle = Math.atan2(facingX, facingZ);
  const spineAngle = Math.atan2(tx, tz);
  
  // The spine tangent has two possible directions (±180°)
  // Use hysteresis to prevent flip-flopping when near the boundary
  const angleDiffPositive = normalizeAngle(spineAngle - animalAngle);
  const angleDiffNegative = normalizeAngle(spineAngle + Math.PI - animalAngle);
  
  // Determine which direction is currently closer
  const usePositive = Math.abs(angleDiffPositive) <= Math.abs(angleDiffNegative);
  const currentPreferredSign = usePositive ? 1 : -1;
  
  // Hysteresis: only switch committed direction if the difference is significant (>15 degrees)
  const hysteresisThreshold = 0.26; // ~15 degrees
  const currentAngleDiff = usePositive ? angleDiffPositive : angleDiffNegative;
  const committedAngleDiff = state.committedSign > 0 ? angleDiffPositive : angleDiffNegative;
  
  // Switch only if the new direction is significantly better
  if (Math.abs(currentAngleDiff) < Math.abs(committedAngleDiff) - hysteresisThreshold) {
    state.committedSign = currentPreferredSign;
  }
  
  // Use the committed direction
  let angleDiff = state.committedSign > 0 ? angleDiffPositive : angleDiffNegative;
  
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
  
  // Smooth the correction using exponential moving average
  const alpha = delta / (config.smoothingTau + delta);
  state.currentCorrection += (targetCorrection - state.currentCorrection) * alpha;
  
  // Also apply decay to prevent buildup
  if (Math.abs(targetCorrection) < Math.abs(state.currentCorrection)) {
    state.currentCorrection *= Math.exp(-config.decayRate * delta * 0.5);
  }
  
  // Clamp final correction
  const maxCorrection = Math.PI / 6; // Max 30 degrees
  state.currentCorrection = Math.max(-maxCorrection, Math.min(maxCorrection, state.currentCorrection));
  
  // isActive = system is engaged (nearby and enabled)
  // This shows green when running parallel but still tracking the spine
  const isActive = distFactor > 0.1;
  
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
      tangentX: tx,
      tangentZ: tz,
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
