/**
 * ============================================================================
 * CORRIDOR MAGNETISM SYSTEM
 * ============================================================================
 * 
 * Gently pulls the player toward corridor centerlines using the medial axis
 * skeleton data. This is a movement assist that modifies velocity, not teleporting.
 * 
 * Phase 1: Basic magnetism using nearest skeleton pixel
 * Phase 2: Segment-based targeting with low-pass filtering
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
  /** Dead zone - no correction applied when within this distance */
  deadzone: number;
  /** Distance at which full magnetism strength applies (D0) */
  fullStrengthDist: number;
  /** Distance beyond which magnetism fades to zero (D1) */
  fadeOutDist: number;
  /** Spring constant (1/sec) - how aggressively to pull toward centerline */
  springK: number;
  /** Maximum pull speed in world units/second */
  maxPullSpeed: number;
  /** Minimum alignment with corridor to apply magnetism (0-1) */
  alignMin: number;
  /** Master strength multiplier (0-10) */
  strength: number;
  /** Curve boost multiplier (1.0 = no boost, 2.0 = double at sharp curves) */
  curveBoost: number;
  /** Enable/disable magnetism entirely */
  enabled: boolean;
}

/** Result of magnetism calculation for one frame */
export interface MagnetismResult {
  /** Correction velocity to add to player movement (world space XZ) */
  correctionX: number;
  correctionZ: number;
  /** Debug info */
  debug: {
    /** Target point on skeleton (world space) */
    targetX: number;
    targetZ: number;
    /** Whether magnetism is active */
    isActive: boolean;
    /** Cross-track distance from skeleton */
    crossDist: number;
    /** Current strength multiplier (0-1) */
    strengthMultiplier: number;
    /** Whether suppressed due to junction */
    isJunctionSuppressed: boolean;
    /** Degree of nearest skeleton pixel */
    nearestDegree: number;
    /** Tangent direction at target */
    tangentX: number;
    tangentZ: number;
    /** Curve sharpness (0 = straight, 1 = 90° turn) */
    curveSharpness: number;
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

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const CELL_SIZE = GameConfig.CELL_SIZE;

export const DEFAULT_MAGNETISM_CONFIG: MagnetismConfig = {
  deadzone: 0.15 * CELL_SIZE,        // ~0.15 cells
  fullStrengthDist: 0.35 * CELL_SIZE, // D0
  fadeOutDist: 0.85 * CELL_SIZE,      // D1
  springK: 6.0,                       // 1/sec
  maxPullSpeed: 0.8 * 2.5,            // 80% of base player speed (2.5)
  alignMin: 0.4,                      // Minimum alignment with corridor
  strength: 5.0,                      // Default strength (0-10 scale)
  curveBoost: 1.5,                    // 50% boost at sharp curves
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
// MAGNETISM CALCULATION
// ============================================================================

/**
 * Find nearest skeleton pixel within a local search window.
 * Returns null if no skeleton pixel found nearby.
 */
function findNearestSkeletonPixel(
  playerX: number,
  playerZ: number,
  cache: MagnetismCache,
  searchRadius: number = 2.0 // World units
): SkeletonPixel | null {
  const { skeletonPixels, fineCellSize } = cache;
  
  let nearest: SkeletonPixel | null = null;
  let nearestDistSq = Infinity;
  const searchRadiusSq = searchRadius * searchRadius;
  
  // Linear search through skeleton pixels (fast enough for ~1000 pixels)
  for (const pixel of skeletonPixels) {
    const dx = playerX - pixel.wx;
    const dz = playerZ - pixel.wz;
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
function computeTangent(pixel: SkeletonPixel): { tx: number; tz: number } {
  const { degree, neighbors, wx, wz } = pixel;
  
  if (degree === 0) {
    // Isolated pixel - no tangent (shouldn't happen)
    return { tx: 1, tz: 0 };
  }
  
  if (degree === 1) {
    // Endpoint: tangent points from neighbor to this pixel
    const n = neighbors[0];
    const dx = wx - n.wx;
    const dz = wz - n.wz;
    const len = Math.sqrt(dx * dx + dz * dz);
    return len > 0.001 ? { tx: dx / len, tz: dz / len } : { tx: 1, tz: 0 };
  }
  
  if (degree === 2) {
    // Normal corridor: tangent is direction between the two neighbors
    const n1 = neighbors[0];
    const n2 = neighbors[1];
    const dx = n2.wx - n1.wx;
    const dz = n2.wz - n1.wz;
    const len = Math.sqrt(dx * dx + dz * dz);
    return len > 0.001 ? { tx: dx / len, tz: dz / len } : { tx: 1, tz: 0 };
  }
  
  // Junction (degree >= 3): use average direction of neighbors
  let avgDx = 0, avgDz = 0;
  for (const n of neighbors) {
    const dx = n.wx - wx;
    const dz = n.wz - wz;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) {
      avgDx += dx / len;
      avgDz += dz / len;
    }
  }
  const len = Math.sqrt(avgDx * avgDx + avgDz * avgDz);
  return len > 0.001 ? { tx: avgDx / len, tz: avgDz / len } : { tx: 1, tz: 0 };
}

/**
 * Compute curve sharpness at a degree-2 skeleton pixel.
 * Returns 0 for straight corridors, 1 for 90° turns.
 */
function computeCurveSharpness(pixel: SkeletonPixel): number {
  if (pixel.degree !== 2) return 0;
  
  const n1 = pixel.neighbors[0];
  const n2 = pixel.neighbors[1];
  
  // Vectors from pixel to each neighbor
  const v1x = n1.wx - pixel.wx;
  const v1z = n1.wz - pixel.wz;
  const v2x = n2.wx - pixel.wx;
  const v2z = n2.wz - pixel.wz;
  
  const len1 = Math.sqrt(v1x * v1x + v1z * v1z);
  const len2 = Math.sqrt(v2x * v2x + v2z * v2z);
  
  if (len1 < 0.001 || len2 < 0.001) return 0;
  
  // Dot product of normalized vectors
  // For a straight line, vectors point in opposite directions: dot = -1
  // For a 90° turn, dot = 0
  const dot = (v1x * v2x + v1z * v2z) / (len1 * len2);
  
  // Convert: -1 (straight) -> 0, 0 (90°) -> 1, +1 (hairpin) -> 2
  // Clamp to 0-1 range for practical use
  const sharpness = Math.max(0, Math.min(1, (dot + 1) / 2));
  
  return sharpness;
}

/**
 * Smoothstep interpolation: 0 at edge0, 1 at edge1, smooth transition between
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Phase 2: Find nearest point on skeleton segment (between pixel and neighbor)
 * Returns the closest point on the line segment.
 */
function nearestPointOnSegment(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number
): { x: number; z: number; t: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq < 0.0001) {
    return { x: ax, z: az, t: 0 };
  }
  
  let t = (apx * abx + apz * abz) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  
  return {
    x: ax + t * abx,
    z: az + t * abz,
    t,
  };
}

/**
 * Calculate magnetism correction for this frame.
 * 
 * @param playerX - Player world X position
 * @param playerZ - Player world Z position  
 * @param inputDirX - Player input direction X (normalized)
 * @param inputDirZ - Player input direction Z (normalized)
 * @param cache - Magnetism cache (skeleton data)
 * @param config - Magnetism configuration
 * @param delta - Frame time in seconds
 * @returns Magnetism result with correction velocity
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
  const noOpResult: MagnetismResult = {
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
      curveSharpness: 0,
    },
  };
  
  if (!config.enabled || config.strength <= 0) {
    return noOpResult;
  }
  
  // Step 1: Find nearest skeleton pixel
  const nearest = findNearestSkeletonPixel(playerX, playerZ, cache);
  if (!nearest) {
    return noOpResult;
  }
  
  // Step 2: Compute tangent at skeleton pixel
  const { tx, tz } = computeTangent(nearest);
  
  // Step 3: Compute cross-track vector
  // v = playerPos - spinePos
  let vx = playerX - nearest.wx;
  let vz = playerZ - nearest.wz;
  
  // Phase 2: Use nearest point on segment for degree-2 pixels
  let targetX = nearest.wx;
  let targetZ = nearest.wz;
  
  if (nearest.degree === 2) {
    const n1 = nearest.neighbors[0];
    const n2 = nearest.neighbors[1];
    
    // Find nearest point on segment n1->n2
    const seg = nearestPointOnSegment(playerX, playerZ, n1.wx, n1.wz, n2.wx, n2.wz);
    targetX = seg.x;
    targetZ = seg.z;
    
    // Update v to point from segment
    vx = playerX - targetX;
    vz = playerZ - targetZ;
  }
  
  // along = dot(v, tangent)
  const along = vx * tx + vz * tz;
  
  // cross = v - along * tangent (perpendicular to corridor)
  const crossX = vx - along * tx;
  const crossZ = vz - along * tz;
  const crossDist = Math.sqrt(crossX * crossX + crossZ * crossZ);
  
  // Step 4: Check junction suppression (degree >= 3) and curve sharpness
  const isJunctionSuppressed = nearest.degree >= 3;
  const curveSharpness = computeCurveSharpness(nearest);
  
  // Step 5: Compute strength based on distance
  let distStrength = 0;
  if (crossDist < config.deadzone) {
    distStrength = 0; // In dead zone
  } else if (crossDist <= config.fullStrengthDist) {
    // Full strength zone
    distStrength = 1;
  } else if (crossDist < config.fadeOutDist) {
    // Fade zone: smoothstep from D0 to D1
    distStrength = 1 - smoothstep(config.fullStrengthDist, config.fadeOutDist, crossDist);
  } else {
    distStrength = 0; // Too far
  }
  
  // Step 6: Compute alignment strength
  // align = abs(dot(inputDir, tangent))
  const inputLen = Math.sqrt(inputDirX * inputDirX + inputDirZ * inputDirZ);
  let alignStrength = 1;
  
  if (inputLen > 0.01) {
    const inputNormX = inputDirX / inputLen;
    const inputNormZ = inputDirZ / inputLen;
    const align = Math.abs(inputNormX * tx + inputNormZ * tz);
    alignStrength = smoothstep(config.alignMin, 1, align);
  }
  
  // Step 7: Combine strength factors with curve boost
  // curveSharpness is 0 for straight, 1 for 90° turns
  // Apply boost: 1.0 at straight, up to curveBoost at sharp curves
  const curveMultiplier = 1 + curveSharpness * (config.curveBoost - 1);
  let totalStrength = distStrength * alignStrength * curveMultiplier * (config.strength / 10);
  
  // Suppress at junctions
  if (isJunctionSuppressed) {
    totalStrength *= 0.1; // Strongly reduce, not zero (allows gentle guidance)
  }
  
  // Step 8: Calculate correction velocity
  // Direction: toward skeleton (opposite of cross vector)
  if (crossDist < 0.001 || totalStrength < 0.001) {
    return {
      correctionX: 0,
      correctionZ: 0,
      debug: {
        targetX,
        targetZ,
        isActive: false,
        crossDist,
        strengthMultiplier: totalStrength,
        isJunctionSuppressed,
        nearestDegree: nearest.degree,
        tangentX: tx,
        tangentZ: tz,
        curveSharpness,
      },
    };
  }
  
  // Normalized direction toward skeleton
  const toSkeletonX = -crossX / crossDist;
  const toSkeletonZ = -crossZ / crossDist;
  
  // Correction velocity = K * crossDist * direction (clamped to max)
  const correctionMag = Math.min(
    config.springK * crossDist * totalStrength,
    config.maxPullSpeed
  );
  
  // Scale by delta for frame-rate independence
  let correctionX = toSkeletonX * correctionMag * delta;
  let correctionZ = toSkeletonZ * correctionMag * delta;
  
  // NaN guard - never return invalid values
  if (!Number.isFinite(correctionX) || !Number.isFinite(correctionZ)) {
    correctionX = 0;
    correctionZ = 0;
  }
  
  return {
    correctionX,
    correctionZ,
    debug: {
      targetX,
      targetZ,
      isActive: true,
      crossDist,
      strengthMultiplier: totalStrength,
      isJunctionSuppressed,
      nearestDegree: nearest.degree,
      tangentX: tx,
      tangentZ: tz,
      curveSharpness,
    },
  };
}

// ============================================================================
// LOW-PASS FILTER FOR TARGET POINT (Phase 2 stability)
// ============================================================================

/** State for low-pass filtering the target point */
export interface MagnetismFilterState {
  targetX: number;
  targetZ: number;
  initialized: boolean;
}

/**
 * Apply low-pass filter to target point to reduce jitter.
 * Call this each frame before using the target for correction.
 * 
 * @param raw - Raw target point from magnetism calculation
 * @param state - Filter state (mutated)
 * @param tau - Filter time constant (seconds, ~0.15 recommended)
 * @param delta - Frame time in seconds
 * @returns Filtered target point
 */
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
  
  // Exponential smoothing: α = delta / (tau + delta)
  const alpha = delta / (tau + delta);
  
  state.targetX += (rawX - state.targetX) * alpha;
  state.targetZ += (rawZ - state.targetZ) * alpha;
  
  return { x: state.targetX, z: state.targetZ };
}
