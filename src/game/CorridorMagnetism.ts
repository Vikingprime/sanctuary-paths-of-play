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
import { buildSmoothedPolylines, PolylineGraph, PolylineSegment, Point2D, PolylineConfig, Junction } from './SkeletonPolyline';

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
    /** Nearest spine point (world space, smoothed) */
    spineX: number;
    spineZ: number;
    /** Raw nearest spine point (world space, no smoothing) */
    rawSpineX: number;
    rawSpineZ: number;
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

/** A point on a polyline segment with metadata for magnetism lookup */
interface PolylinePoint {
  /** World X position */
  wx: number;
  /** World Z position */
  wz: number;
  /** Index of the segment this point belongs to */
  segmentIndex: number;
  /** Index within the segment's points array */
  pointIndex: number;
  /** Whether this point is near a junction (suppressed for magnetism) */
  isSuppressed: boolean;
}

/** Spatial bucket for fast polyline point lookup */
interface PolylineSpatialBucket {
  /** Points in this spatial bucket */
  points: PolylinePoint[];
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
  
  // === POLYLINE DATA ===
  /** Complete polyline graph with smoothed segments */
  polylineGraph: PolylineGraph | null;
  /** Spatial hash for fast polyline point lookup (key: "gridX,gridZ") */
  polylineSpatialHash: Map<string, PolylineSpatialBucket>;
  /** Size of each spatial bucket in world units */
  polylineBucketSize: number;
}

/** State for smoothing turn corrections */
export interface MagnetismTurnState {
  /** Current smoothed turn correction (radians) */
  currentCorrection: number;
  /** Whether state has been initialized */
  initialized: boolean;
  /** Committed tangent direction sign (+1 or -1) for hysteresis */
  committedSign: number;
  /** Last locked skeleton pixel (fine grid coords) for sticky selection */
  lastNearestFx: number;
  lastNearestFy: number;
  /** Time the current point has been locked (for stability) */
  lockDuration: number;
  /** Smoothed spine X position (for stable tangent line anchor) */
  smoothedSpineX: number;
  /** Smoothed spine Z position (for stable tangent line anchor) */
  smoothedSpineZ: number;
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
  strength: 0.0,                      // DEFAULT TO 0 - magnetism off by default for manual control
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
  spurConfig?: SpurConfig,
  polylineConfig?: Partial<PolylineConfig>
): MagnetismCache {
  const result = computeMedialAxis(maze, 20, spurConfig);
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
  
  // === BUILD POLYLINE SPATIAL INDEX ===
  // Create wall check function for polyline building
  const isWallFn = (worldX: number, worldZ: number): boolean => {
    const gridX = Math.floor(worldX);
    const gridZ = Math.floor(worldZ);
    if (gridZ < 0 || gridZ >= maze.grid.length) return true;
    if (gridX < 0 || gridX >= maze.grid[0].length) return true;
    const cell = maze.grid[gridZ][gridX];
    return cell === null || cell === undefined || cell.isWall;
  };
  
  // Build smoothed polylines
  const polylineGraph = buildSmoothedPolylines(
    fineGrid,
    fineWidth,
    fineHeight,
    fineCellSize,
    { ...polylineConfig, isWallFn }
  );
  
  // Build spatial hash for fast polyline lookups
  // Bucket size of 0.5 world units provides good balance between precision and lookup speed
  const polylineBucketSize = 0.5;
  const polylineSpatialHash = new Map<string, PolylineSpatialBucket>();
  
  // Helper to get bucket key from world position
  const getBucketKey = (wx: number, wz: number): string => {
    const bx = Math.floor(wx / polylineBucketSize);
    const bz = Math.floor(wz / polylineBucketSize);
    return `${bx},${bz}`;
  };
  
  // Index all polyline points into spatial buckets
  // Also mark points near junctions as suppressed
  const junctionSet = new Set<string>();
  for (const junction of polylineGraph.junctions) {
    // Create a suppression zone around each junction (1 world unit radius)
    const suppressionWorldRadius = 1.0;
    junctionSet.add(`${junction.x.toFixed(1)},${junction.z.toFixed(1)}`);
  }
  
  for (let segIdx = 0; segIdx < polylineGraph.segments.length; segIdx++) {
    const segment = polylineGraph.segments[segIdx];
    
    for (let ptIdx = 0; ptIdx < segment.points.length; ptIdx++) {
      const pt = segment.points[ptIdx];
      
      // Check if this point is near any junction
      let isSuppressed = false;
      const junctionSuppressionRadius = 1.0; // 1 world unit from junction
      for (const junction of polylineGraph.junctions) {
        const dx = pt.x - junction.x;
        const dz = pt.z - junction.z;
        if (dx * dx + dz * dz < junctionSuppressionRadius * junctionSuppressionRadius) {
          isSuppressed = true;
          break;
        }
      }
      
      // Also suppress points near endpoints (first/last few points of segment)
      const endpointSuppressionCount = 5;
      if (segment.startIsEndpoint && ptIdx < endpointSuppressionCount) {
        isSuppressed = true;
      }
      if (segment.endIsEndpoint && ptIdx >= segment.points.length - endpointSuppressionCount) {
        isSuppressed = true;
      }
      
      const polyPoint: PolylinePoint = {
        wx: pt.x,
        wz: pt.z,
        segmentIndex: segIdx,
        pointIndex: ptIdx,
        isSuppressed,
      };
      
      // Add to the bucket for this point's position
      const key = getBucketKey(pt.x, pt.z);
      if (!polylineSpatialHash.has(key)) {
        polylineSpatialHash.set(key, { points: [] });
      }
      polylineSpatialHash.get(key)!.points.push(polyPoint);
    }
  }
  
  const totalPolyPoints = polylineGraph.segments.reduce((sum, s) => sum + s.points.length, 0);
  const suppressedPolyPoints = Array.from(polylineSpatialHash.values())
    .flatMap(b => b.points)
    .filter(p => p.isSuppressed).length;
  console.log(`[Magnetism] Indexed ${totalPolyPoints} polyline points into ${polylineSpatialHash.size} spatial buckets, ${suppressedPolyPoints} suppressed`);
  
  return {
    fineGrid,
    scale,
    fineCellSize,
    skeletonPixels,
    fineWidth,
    fineHeight,
    suppressionRadius,
    polylineGraph,
    polylineSpatialHash,
    polylineBucketSize,
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
// POLYLINE-BASED NEAREST POINT LOOKUP
// ============================================================================

/** Result of finding the nearest point on a polyline */
export interface PolylineNearestResult {
  /** World X of nearest point (may be interpolated on segment) */
  wx: number;
  /** World Z of nearest point (may be interpolated on segment) */
  wz: number;
  /** Tangent direction at this point (normalized) */
  tx: number;
  tz: number;
  /** Whether this point is suppressed (near junction/endpoint) */
  isSuppressed: boolean;
  /** Distance from query point to nearest polyline point */
  distance: number;
  /** Segment index */
  segmentIndex: number;
  /** Point index within segment (of the discrete point, for reference) */
  pointIndex: number;
  /** For visualization: position N points before */
  tangentStart: { wx: number; wz: number };
  /** For visualization: position N points after */
  tangentEnd: { wx: number; wz: number };
}

/**
 * Project a point onto a line segment, returning the closest point on the segment.
 * @returns { point: {x, z}, t: parameter [0,1], distSq: squared distance }
 */
function projectPointOntoSegment(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number
): { x: number; z: number; t: number; distSq: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  
  const ab2 = abx * abx + abz * abz;
  if (ab2 < 0.0001) {
    // Degenerate segment (a == b)
    const dx = px - ax;
    const dz = pz - az;
    return { x: ax, z: az, t: 0, distSq: dx * dx + dz * dz };
  }
  
  // Parameter t along segment [0, 1]
  let t = (apx * abx + apz * abz) / ab2;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment
  
  const closestX = ax + t * abx;
  const closestZ = az + t * abz;
  const dx = px - closestX;
  const dz = pz - closestZ;
  
  return { x: closestX, z: closestZ, t, distSq: dx * dx + dz * dz };
}

/**
 * Find the nearest point on the polyline to a query position using spatial hashing.
 * Projects onto line SEGMENTS between polyline points for exact positioning.
 * Also computes the tangent at that point by looking at neighboring points.
 * 
 * @param x - Query X position (world space)
 * @param z - Query Z position (world space)
 * @param cache - Magnetism cache with polyline spatial hash
 * @param searchRadius - Maximum search radius in world units
 * @param tangentLookAhead - Number of points to look ahead/behind for tangent calculation
 * @returns Nearest point result or null if none found
 */
export function findNearestPolylinePoint(
  x: number,
  z: number,
  cache: MagnetismCache,
  searchRadius: number = 4.0,
  tangentLookAhead: number = 5
): PolylineNearestResult | null {
  const { polylineSpatialHash, polylineBucketSize, polylineGraph } = cache;
  
  if (!polylineGraph || polylineSpatialHash.size === 0) {
    return null;
  }
  
  // Calculate which buckets to search (a grid of buckets around the query point)
  const bucketsToCheck = Math.ceil(searchRadius / polylineBucketSize) + 1;
  const centerBx = Math.floor(x / polylineBucketSize);
  const centerBz = Math.floor(z / polylineBucketSize);
  
  // First pass: find nearest discrete point (for segment lookup)
  let nearestPoint: PolylinePoint | null = null;
  let nearestDistSq = searchRadius * searchRadius;
  
  // Check all buckets in range
  for (let dbx = -bucketsToCheck; dbx <= bucketsToCheck; dbx++) {
    for (let dbz = -bucketsToCheck; dbz <= bucketsToCheck; dbz++) {
      const bucketKey = `${centerBx + dbx},${centerBz + dbz}`;
      const bucket = polylineSpatialHash.get(bucketKey);
      if (!bucket) continue;
      
      for (const point of bucket.points) {
        const dx = x - point.wx;
        const dz = z - point.wz;
        const distSq = dx * dx + dz * dz;
        
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestPoint = point;
        }
      }
    }
  }
  
  if (!nearestPoint) {
    return null;
  }
  
  // Get the segment
  const segment = polylineGraph.segments[nearestPoint.segmentIndex];
  if (!segment) {
    return null;
  }
  
  const points = segment.points;
  const ptIdx = nearestPoint.pointIndex;
  
  // Second pass: project onto adjacent segments for exact closest point
  // Check segment [ptIdx-1, ptIdx] and [ptIdx, ptIdx+1]
  let bestProjection = { x: nearestPoint.wx, z: nearestPoint.wz, distSq: nearestDistSq, usedPtIdx: ptIdx };
  
  // Check segment before (if exists)
  if (ptIdx > 0) {
    const prevPt = points[ptIdx - 1];
    const currPt = points[ptIdx];
    const proj = projectPointOntoSegment(x, z, prevPt.x, prevPt.z, currPt.x, currPt.z);
    if (proj.distSq < bestProjection.distSq) {
      bestProjection = { x: proj.x, z: proj.z, distSq: proj.distSq, usedPtIdx: ptIdx };
    }
  }
  
  // Check segment after (if exists)
  if (ptIdx < points.length - 1) {
    const currPt = points[ptIdx];
    const nextPt = points[ptIdx + 1];
    const proj = projectPointOntoSegment(x, z, currPt.x, currPt.z, nextPt.x, nextPt.z);
    if (proj.distSq < bestProjection.distSq) {
      bestProjection = { x: proj.x, z: proj.z, distSq: proj.distSq, usedPtIdx: ptIdx };
    }
  }
  
  // Compute tangent by looking at points before and after
  const lookBehindIdx = Math.max(0, ptIdx - tangentLookAhead);
  const lookAheadIdx = Math.min(points.length - 1, ptIdx + tangentLookAhead);
  
  const behindPt = points[lookBehindIdx];
  const aheadPt = points[lookAheadIdx];
  
  const dx = aheadPt.x - behindPt.x;
  const dz = aheadPt.z - behindPt.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  
  // Default tangent if points are coincident
  let tx = 0;
  let tz = 1;
  if (len > 0.001) {
    tx = dx / len;
    tz = dz / len;
  }
  
  return {
    wx: bestProjection.x,
    wz: bestProjection.z,
    tx,
    tz,
    isSuppressed: nearestPoint.isSuppressed,
    distance: Math.sqrt(bestProjection.distSq),
    segmentIndex: nearestPoint.segmentIndex,
    pointIndex: bestProjection.usedPtIdx,
    tangentStart: { wx: behindPt.x, wz: behindPt.z },
    tangentEnd: { wx: aheadPt.x, wz: aheadPt.z },
  };
}

// ============================================================================
// TURN-BASED MAGNETISM CALCULATION
// ============================================================================

/**
 * Find the best matching branch at a junction based on joystick direction.
 * Returns the segment index and direction that best matches where the player wants to go.
 */
function findBestBranchAtJunction(
  junctionX: number,
  junctionZ: number,
  joystickDirX: number,
  joystickDirZ: number,
  cache: MagnetismCache
): { segmentIndex: number; pointIndex: number; tangentX: number; tangentZ: number } | null {
  if (!cache.polylineGraph) return null;
  
  const { junctions, segments } = cache.polylineGraph;
  
  // Find the closest junction (search larger radius to cover the suppression zone)
  let junction: Junction | null = null;
  let junctionDist = Infinity;
  const junctionSearchRadius = 2.5; // Extended to cover the full suppression zone
  
  for (const j of junctions) {
    const dx = junctionX - j.x;
    const dz = junctionZ - j.z;
    const dist = dx * dx + dz * dz;
    if (dist < junctionSearchRadius * junctionSearchRadius && dist < junctionDist) {
      junctionDist = dist;
      junction = j;
    }
  }
  
  if (!junction || junction.connections.length === 0) return null;
  
  // Find the branch whose direction best matches the joystick direction
  let bestMatch: { segmentIndex: number; pointIndex: number; tangentX: number; tangentZ: number } | null = null;
  let bestDot = -Infinity;
  
  for (const conn of junction.connections) {
    const segment = segments[conn.segmentIndex];
    if (!segment || segment.points.length < 2) continue;
    
    // Get direction from junction into this segment
    // If atStart is true, segment starts at junction, so direction is toward segment.points[1+]
    // If atStart is false, segment ends at junction, so direction is toward segment.points[end-1-]
    let dirX: number, dirZ: number;
    let lookAheadIdx: number;
    const lookAhead = Math.min(10, Math.floor(segment.points.length / 2)); // Look 10 points or half the segment
    
    if (conn.atStart) {
      // Junction is at start of segment, direction goes toward higher indices
      lookAheadIdx = Math.min(lookAhead, segment.points.length - 1);
      const targetPt = segment.points[lookAheadIdx];
      dirX = targetPt.x - junction.x;
      dirZ = targetPt.z - junction.z;
    } else {
      // Junction is at end of segment, direction goes toward lower indices
      lookAheadIdx = Math.max(0, segment.points.length - 1 - lookAhead);
      const targetPt = segment.points[lookAheadIdx];
      dirX = targetPt.x - junction.x;
      dirZ = targetPt.z - junction.z;
    }
    
    // Normalize direction
    const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (len < 0.001) continue;
    dirX /= len;
    dirZ /= len;
    
    // Dot product with joystick direction (higher = better match)
    const dot = dirX * joystickDirX + dirZ * joystickDirZ;
    
    if (dot > bestDot) {
      bestDot = dot;
      bestMatch = {
        segmentIndex: conn.segmentIndex,
        pointIndex: conn.atStart ? lookAheadIdx : lookAheadIdx,
        tangentX: dirX,
        tangentZ: dirZ,
      };
    }
  }
  
  return bestMatch;
}

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
 * @param joystickDirX - Optional joystick direction X (world space, for junction prediction)
 * @param joystickDirZ - Optional joystick direction Z (world space, for junction prediction)
 * @returns Magnetism turn result with correction angle
 */
export function calculateMagnetismTurn(
  playerX: number,
  playerZ: number,
  playerRotation: number,
  cache: MagnetismCache,
  config: MagnetismConfig,
  state: MagnetismTurnState,
  delta: number,
  joystickDirX: number = 0,
  joystickDirZ: number = 0
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
      rawSpineX: playerX,
      rawSpineZ: playerZ,
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
    state.committedSign = 1;
    state.lastNearestFx = -1;
    state.lastNearestFy = -1;
    state.lockDuration = 0;
    state.smoothedSpineX = 0;
    state.smoothedSpineZ = 0;
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
  
  // Find nearest polyline point to front (head) point for better anticipation
  // This uses the smoothed polyline instead of the raw skeleton pixels
  const polylineResult = findNearestPolylinePoint(frontX, frontZ, cache, 4.0, 5);
  
  // Fallback to skeleton if polyline not available (shouldn't happen normally)
  if (!polylineResult) {
    // Decay and return
    state.currentCorrection *= Math.exp(-config.decayRate * delta);
    state.lastNearestFx = -1;
    state.lastNearestFy = -1;
    state.lockDuration = 0;
    return { ...noOpResult, turnCorrection: state.currentCorrection };
  }
  
  // Create a synthetic "nearest" point structure for compatibility with rest of code
  const nearest = {
    wx: polylineResult.wx,
    wz: polylineResult.wz,
    isSuppressed: polylineResult.isSuppressed,
    // For debug display - use segment/point index as a pseudo-degree
    degree: 2, // Polyline points are always "corridor" type (degree 2)
  };
  
  // Update sticky point tracking using segment/point indices
  // Reuse fx/fy fields to store segment/point indices
  const candidateKey = polylineResult.segmentIndex * 10000 + polylineResult.pointIndex;
  const candidateDist = polylineResult.distance;
  
  const lastKey = state.lastNearestFx * 10000 + state.lastNearestFy;
  if (state.lastNearestFx >= 0 && state.lastNearestFy >= 0 && lastKey !== candidateKey) {
    // Check if we should stick to the previous point
    const maxSearchRadius = 2.5;
    const switchThreshold = 0.85;
    
    // Try to get the distance to the previously locked point
    const prevSegment = cache.polylineGraph?.segments[state.lastNearestFx];
    if (prevSegment && state.lastNearestFy < prevSegment.points.length) {
      const prevPt = prevSegment.points[state.lastNearestFy];
      const lockedDist = Math.sqrt((frontX - prevPt.x) ** 2 + (frontZ - prevPt.z) ** 2);
      
      const shouldSwitch = lockedDist > maxSearchRadius || candidateDist < lockedDist * switchThreshold;
      
      if (!shouldSwitch) {
        // Stick to previous point - re-query from that position
        // (For simplicity, just continue with the new nearest since polyline is smooth)
        state.lockDuration += delta;
      } else {
        state.lastNearestFx = polylineResult.segmentIndex;
        state.lastNearestFy = polylineResult.pointIndex;
        state.lockDuration = 0;
        state.committedSign = 0;
      }
    } else {
      state.lastNearestFx = polylineResult.segmentIndex;
      state.lastNearestFy = polylineResult.pointIndex;
      state.lockDuration = 0;
      state.committedSign = 0;
    }
  } else if (state.lastNearestFx < 0) {
    state.lastNearestFx = polylineResult.segmentIndex;
    state.lastNearestFy = polylineResult.pointIndex;
    state.lockDuration = 0;
    state.committedSign = 0;
  }
  
  // Use polyline tangent directly (already computed by findNearestPolylinePoint)
  const tx = polylineResult.tx;
  const tz = polylineResult.tz;
  const endpoint1 = polylineResult.tangentStart;
  const endpoint2 = polylineResult.tangentEnd;
  
  // If suppressed (near junction/endpoint), handle based on strength level
  // At strength 10 (full lock), use joystick direction to predict best branch
  const isFullLockAtJunction = config.strength >= 9.9;
  
  if (polylineResult.isSuppressed) {
    // Check if we have joystick input for branch prediction
    const hasJoystickInput = Math.abs(joystickDirX) > 0.01 || Math.abs(joystickDirZ) > 0.01;
    
    if (isFullLockAtJunction && hasJoystickInput) {
      // FULL LOCK MODE: Use joystick to predict branch direction
      const branchResult = findBestBranchAtJunction(
        frontX, frontZ,
        joystickDirX, joystickDirZ,
        cache
      );
      
      if (branchResult) {
        // Use the predicted branch's tangent for alignment
        // This keeps the animal locked to the path through the junction
        const predictedTx = branchResult.tangentX;
        const predictedTz = branchResult.tangentZ;
        
        // Calculate angle diff to predicted tangent direction
        const facingX = Math.sin(playerRotation);
        const facingZ = Math.cos(playerRotation);
        
        // Align tangent to face forward (same direction as player)
        const dotFacing = facingX * predictedTx + facingZ * predictedTz;
        const alignedTx = dotFacing >= 0 ? predictedTx : -predictedTx;
        const alignedTz = dotFacing >= 0 ? predictedTz : -predictedTz;
        
        // Cross product for turn direction
        const crossProduct = facingX * alignedTz - facingZ * alignedTx;
        const dotAligned = facingX * alignedTx + facingZ * alignedTz;
        const angleMagnitude = Math.acos(Math.max(-1, Math.min(1, dotAligned)));
        const predictedAngleDiff = crossProduct < 0 ? angleMagnitude : -angleMagnitude;
        
        // Apply the full angle difference (full lock behavior)
        state.currentCorrection = predictedAngleDiff;
        
        return {
          turnCorrection: state.currentCorrection,
          debug: {
            backX,
            backZ,
            frontX,
            frontZ,
            spineX: nearest.wx,
            spineZ: nearest.wz,
            rawSpineX: nearest.wx,
            rawSpineZ: nearest.wz,
            targetX: nearest.wx,
            targetZ: nearest.wz,
            tangentX: alignedTx,
            tangentZ: alignedTz,
            neighbor1X: endpoint1.wx,
            neighbor1Z: endpoint1.wz,
            neighbor2X: endpoint2.wx,
            neighbor2Z: endpoint2.wz,
            rawAngleDiff: predictedAngleDiff,
            isActive: true,
            strengthMultiplier: 1.0,
            crossDist: polylineResult.distance,
            isJunctionSuppressed: false, // Not suppressed - we're predicting!
            nearestDegree: nearest.degree,
            appliedTurnCorrection: state.currentCorrection,
          },
        };
      }
    }
    
    // Default suppression behavior (no prediction or lower strength)
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
        rawSpineX: nearest.wx,
        rawSpineZ: nearest.wz,
        targetX: nearest.wx,
        targetZ: nearest.wz,
        tangentX: tx,
        tangentZ: tz,
        neighbor1X: endpoint1.wx,
        neighbor1Z: endpoint1.wz,
        neighbor2X: endpoint2.wx,
        neighbor2Z: endpoint2.wz,
        rawAngleDiff: 0,
        isActive: false,
        strengthMultiplier: 0,
        crossDist: polylineResult.distance,
        isJunctionSuppressed: true,
        nearestDegree: nearest.degree,
        appliedTurnCorrection: state.currentCorrection,
      },
    };
  }
  
  // ============================================================================
  // SMOOTH THE SPINE ANCHOR POINT TO PREVENT VIBRATION AT CURVES
  // ============================================================================
  // The polyline is already smooth, but we still apply position smoothing
  // to eliminate any remaining discrete jumps between points.
  // ============================================================================
  const spineSmoothingTau = 0.05;
  const spineAlpha = delta / (spineSmoothingTau + delta);
  
  if (state.smoothedSpineX === 0 && state.smoothedSpineZ === 0) {
    state.smoothedSpineX = nearest.wx;
    state.smoothedSpineZ = nearest.wz;
  } else {
    state.smoothedSpineX += (nearest.wx - state.smoothedSpineX) * spineAlpha;
    state.smoothedSpineZ += (nearest.wz - state.smoothedSpineZ) * spineAlpha;
  }
  
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
  // CROSS-PRODUCT BASED TURN DIRECTION WITH HYSTERESIS
  // ============================================================================
  // 
  // Step 1: Align tangent to point "forward" (same general direction as animal facing)
  //         Use dot product + hysteresis to prevent flip-flopping near 90°
  //
  // Step 2: Use cross product to determine if aligned tangent is left or right of animal
  //         Cross product sign directly tells us which way to turn
  //
  // The hysteresis prevents the tangent from flipping back and forth when the
  // animal is nearly perpendicular to the corridor (dot product near zero)
  // ============================================================================
  
  // Step 1: Choose tangent direction with hysteresis
  // Dot product: positive means vectors point in same general direction
  const dotPositive = facingX * tx + facingZ * tz;
  
  // Determine which tangent direction is currently preferred
  // +1 means use (tx, tz), -1 means use (-tx, -tz)
  const currentPreferredSign = dotPositive >= 0 ? 1 : -1;
  
  // Hysteresis: only switch committed direction if the dot product clearly favors the other
  // This prevents flip-flopping when near 90° (dot product near zero)
  const hysteresisThreshold = 0.15; // ~8.6 degrees from perpendicular
  
  // Initialize committedSign if neutral
  if (state.committedSign === 0) {
    state.committedSign = currentPreferredSign;
  }
  
  // Only switch if the new direction is significantly better
  // If currently committed to +1, only switch to -1 if dotPositive is clearly negative
  // If currently committed to -1, only switch to +1 if dotPositive is clearly positive
  if (state.committedSign > 0 && dotPositive < -hysteresisThreshold) {
    state.committedSign = -1;
  } else if (state.committedSign < 0 && dotPositive > hysteresisThreshold) {
    state.committedSign = 1;
  }
  
  // Use the committed direction for alignment
  let alignedTx = state.committedSign > 0 ? tx : -tx;
  let alignedTz = state.committedSign > 0 ? tz : -tz;
  
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
  // At strength 10, the animal is LOCKED to the tangent - full angleDiff is applied
  // At lower strengths, partial correction with smoothing
  const strengthScale = config.strength / 10; // 0-1 range where 10 = full lock
  
  // For full lock (strength 10), bypass smoothing and apply full correction
  // This makes the animal unable to deviate from the tangent line
  const isFullLock = strengthScale >= 0.99;
  
  let finalCorrection: number;
  
  if (isFullLock) {
    // FULL LOCK MODE: Apply the entire angle difference immediately
    // The animal's front point is locked to the tangent direction
    // No distFactor gating - lock applies everywhere magnetism is active
    finalCorrection = angleDiff;
    state.currentCorrection = finalCorrection;
  } else {
    // NORMAL MODE: Gradual correction with smoothing
    const targetCorrection = angleDiff * strengthScale * distFactor;
    
    // Smooth the correction using exponential moving average with increased time constant
    const effectiveTau = config.smoothingTau * 2.5;
    const alpha = delta / (effectiveTau + delta);
    let smoothedCorrection = state.currentCorrection + (targetCorrection - state.currentCorrection) * alpha;
    
    // Wobble prevention: suppress small sign changes that cause oscillation
    const wobbleThreshold = 0.02; // ~1.2 degrees
    if (state.currentCorrection !== 0 && 
        Math.sign(smoothedCorrection) !== Math.sign(state.currentCorrection) &&
        Math.abs(smoothedCorrection) < wobbleThreshold) {
      smoothedCorrection = state.currentCorrection * 0.8;
    }
    
    // Apply decay when target is smaller than current (prevents buildup)
    finalCorrection = smoothedCorrection;
    if (Math.abs(targetCorrection) < Math.abs(smoothedCorrection)) {
      finalCorrection = smoothedCorrection * Math.exp(-config.decayRate * delta);
    }
    
    // Clamp correction magnitude - max 10 degrees per frame to prevent sudden flips
    const maxCorrection = Math.PI / 18; // Max 10 degrees
    finalCorrection = Math.max(-maxCorrection, Math.min(maxCorrection, finalCorrection));
    
    state.currentCorrection = finalCorrection;
  }
  
  // Safety net: Reset state if somehow still NaN (shouldn't happen with early guard)
  if (!Number.isFinite(finalCorrection)) {
    console.warn('[Magnetism] Unexpected NaN - resetting state');
    state.currentCorrection = 0;
    return { 
      turnCorrection: 0, 
      debug: {
        backX, backZ, frontX, frontZ,
        spineX: nearest.wx, spineZ: nearest.wz,
        rawSpineX: nearest.wx, rawSpineZ: nearest.wz,
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
      spineX: state.smoothedSpineX,
      spineZ: state.smoothedSpineZ,
      rawSpineX: nearest.wx,
      rawSpineZ: nearest.wz,
      targetX: state.smoothedSpineX,
      targetZ: state.smoothedSpineZ,
      // Pass the ALIGNED tangent to debug so compass shows correct direction
      tangentX: alignedTx,
      tangentZ: alignedTz,
      neighbor1X: endpoint1.wx,
      neighbor1Z: endpoint1.wz,
      neighbor2X: endpoint2.wx,
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

/** Result of constraint calculation including tangent for rotation */
export interface ConstrainResult {
  x: number;
  z: number;
  /** Tangent angle of the polyline at this position (radians, for rotation alignment) */
  tangentAngle: number | null;
  /** Whether a valid tangent was found */
  hasTangent: boolean;
}

/**
 * Constrain the animal's position so the front sensing point stays ON the polyline.
 * At full magnetism strength (10), only the LATERAL offset is corrected - the animal
 * can still move forward freely along the path.
 * 
 * @param prevX Previous X position (animal center)
 * @param prevZ Previous Z position (animal center)
 * @param newX New X position (after movement calculation)
 * @param newZ New Z position (after movement calculation)
 * @param magnetismDebug Debug info from magnetism calculation (contains front point, spine, and tangent)
 * @param strength Magnetism strength (0-10, where 10 = full lock to polyline)
 * @returns Constrained position { x, z } and tangent angle for rotation
 */
export function constrainMovementToTangent(
  prevX: number,
  prevZ: number,
  newX: number,
  newZ: number,
  cache: MagnetismCache | null,
  strength: number,
  playerRotation: number,    // Current player rotation (to calculate fresh front point)
  frontOffset: number,       // Distance from center to front sensing point
  joystickDirX: number = 0,  // World-space joystick direction for junction prediction
  joystickDirZ: number = 0
): ConstrainResult {
  
  // Only apply constraint at high strength and when cache is available
  if (!cache || strength < 9.9) {
    return { x: newX, z: newZ, tangentAngle: null, hasTangent: false };
  }
  
  // Calculate CURRENT front point from the NEW position
  const facingX = Math.sin(playerRotation);
  const facingZ = Math.cos(playerRotation);
  const frontX = newX + facingX * frontOffset;
  const frontZ = newZ + facingZ * frontOffset;
  
  // Do a FRESH polyline lookup using the current front position
  // This eliminates the one-frame lag from using previous frame's debug data
  const nearest = findNearestPolylinePoint(frontX, frontZ, cache, 4.0, 5);
  
  if (!nearest) {
    return { x: newX, z: newZ, tangentAngle: null, hasTangent: false };
  }
  
  // At junctions with full lock (10.0), use joystick to predict branch and stay locked
  if (nearest.isSuppressed) {
    const hasJoystickInput = Math.abs(joystickDirX) > 0.01 || Math.abs(joystickDirZ) > 0.01;
    
    if (hasJoystickInput) {
      // Find best branch based on joystick direction
      const branchResult = findBestBranchAtJunction(frontX, frontZ, joystickDirX, joystickDirZ, cache);
      
      if (branchResult && cache.polylineGraph) {
        // Get actual segment points for lateral constraint
        const segment = cache.polylineGraph.segments[branchResult.segmentIndex];
        if (segment && segment.points.length > 0) {
          // Find the nearest point on this specific segment
          let bestDist = Infinity;
          let bestPt: { x: number; z: number } | null = null;
          
          for (const pt of segment.points) {
            const dx = frontX - pt.x;
            const dz = frontZ - pt.z;
            const dist = dx * dx + dz * dz;
            if (dist < bestDist) {
              bestDist = dist;
              bestPt = pt;
            }
          }
          
          if (bestPt) {
            // Apply lateral constraint to predicted branch
            const toTargetX = bestPt.x - frontX;
            const toTargetZ = bestPt.z - frontZ;
            
            const tx = branchResult.tangentX;
            const tz = branchResult.tangentZ;
            const tangentLen = Math.sqrt(tx * tx + tz * tz);
            
            if (tangentLen > 0.01) {
              const tanX = tx / tangentLen;
              const tanZ = tz / tangentLen;
              const tangentAngle = Math.atan2(tanX, tanZ);
              
              const perpX = -tanZ;
              const perpZ = tanX;
              const lateralDist = toTargetX * perpX + toTargetZ * perpZ;
              
              const offsetX = lateralDist * perpX;
              const offsetZ = lateralDist * perpZ;
              
              const constrainedX = newX + offsetX;
              const constrainedZ = newZ + offsetZ;
              const lockBlend = Math.min(1, (strength - 9.9) / 0.1);
              
              return {
                x: newX + (constrainedX - newX) * lockBlend,
                z: newZ + (constrainedZ - newZ) * lockBlend,
                tangentAngle,
                hasTangent: true,
              };
            }
          }
        }
      }
    }
    
    // No joystick input at junction - still stay near the nearest point
    // but don't enforce strict lateral constraint
    return { x: newX, z: newZ, tangentAngle: null, hasTangent: false };
  }
  
  // The target is the exact nearest point on the polyline
  const targetX = nearest.wx;
  const targetZ = nearest.wz;
  
  // Vector from front to target polyline point - this is the FULL offset needed
  const toTargetX = targetX - frontX;
  const toTargetZ = targetZ - frontZ;
  
  // Get path tangent direction from the fresh lookup
  const tx = nearest.tx;
  const tz = nearest.tz;
  const tangentLen = Math.sqrt(tx * tx + tz * tz);
  
  if (tangentLen < 0.01) {
    // No valid tangent, apply full offset to lock position
    const constrainedX = newX + toTargetX;
    const constrainedZ = newZ + toTargetZ;
    const lockBlend = Math.min(1, (strength - 9.9) / 0.1);
    return {
      x: newX + (constrainedX - newX) * lockBlend,
      z: newZ + (constrainedZ - newZ) * lockBlend,
      tangentAngle: null,
      hasTangent: false,
    };
  }
  
  // Normalize tangent
  const tanX = tx / tangentLen;
  const tanZ = tz / tangentLen;
  
  // Calculate tangent angle for rotation alignment
  // The tangent points along the path - we need to convert to rotation angle
  // atan2(tanX, tanZ) gives the angle where tanX is the "forward" X component
  const tangentAngle = Math.atan2(tanX, tanZ);
  
  // PATH's perpendicular direction (the lateral axis of the corridor)
  const perpX = -tanZ;
  const perpZ = tanX;
  
  // Project the offset onto the PATH's perpendicular (lateral to the corridor)
  // This way we correct drift perpendicular to the path, but never fight movement along the path
  const lateralDist = toTargetX * perpX + toTargetZ * perpZ;
  
  // Apply the lateral correction (perpendicular to path tangent)
  const offsetX = lateralDist * perpX;
  const offsetZ = lateralDist * perpZ;
  
  // Apply offset to animal center
  const constrainedX = newX + offsetX;
  const constrainedZ = newZ + offsetZ;
  
  // Blend based on how close to full strength (9.9-10 = full lock)
  const lockBlend = Math.min(1, (strength - 9.9) / 0.1);
  
  return {
    x: newX + (constrainedX - newX) * lockBlend,
    z: newZ + (constrainedZ - newZ) * lockBlend,
    tangentAngle,
    hasTangent: true,
  };
}
