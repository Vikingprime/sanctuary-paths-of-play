/**
 * ============================================================================
 * MEDIAL AXIS (SKELETON) COMPUTATION
 * ============================================================================
 * 
 * Computes the centerline spine of walkable maze corridors using a classic
 * image processing pipeline: Distance Transform → Ridge Detection → Thinning.
 * 
 * VISUALIZATION ONLY - Does not affect gameplay or movement.
 * 
 * Algorithm Steps:
 * ----------------
 * 1. UPSAMPLE: Convert maze grid to fine grid (SCALE × SCALE subcells per cell)
 * 2. DISTANCE TRANSFORM: BFS from walls to compute Manhattan distance field
 * 3. RIDGE DETECTION: Find local maxima using opposite-direction pair logic
 * 4. THINNING: Zhang-Suen algorithm to reduce ridges to 1-pixel-wide skeleton
 * 5. CONVERT: Map skeleton pixels to world-space coordinates
 * 
 * Key Parameters:
 * ---------------
 * - SCALE: Upsampling factor (default 5, so each cell = 5×5 = 25 subcells)
 * - MIN_RIDGE_DISTANCE: Minimum distance from walls for ridge candidates (2)
 * 
 * ============================================================================
 */

import { Maze } from '@/types/game';
import { GameConfig } from './GameConfig';

// ============================================================================
// TYPES
// ============================================================================

/** Fine grid cell with distance and classification info */
interface FineCell {
  walkable: boolean;      // True if this subcell is in a walkable area
  distance: number;       // Manhattan distance to nearest wall (in subcell units)
  isRidge: boolean;       // True if this is a ridge candidate (local maximum)
  isSkeleton: boolean;    // True after thinning (final skeleton)
  isSpur: boolean;        // True if identified as a spur (for visualization, not removed)
}

/** Result of medial axis computation */
export interface MedialAxisResult {
  /** Fine grid (upsampled by SCALE factor) */
  fineGrid: FineCell[][];
  /** Scale factor used (each original cell = SCALE × SCALE fine cells) */
  scale: number;
  /** Fine cell size in world units */
  fineCellSize: number;
  /** Maximum distance value in the grid (for heatmap normalization) */
  maxDistance: number;
  /** World-space skeleton points (final, after thinning and pruning) */
  skeletonPoints: Array<{ x: number; z: number }>;
  /** World-space ridge points (pre-thinning, for debug visualization) */
  ridgePoints: Array<{ x: number; z: number }>;
  /** World-space pruned spur points (for debug visualization) */
  prunedSpurPoints: Array<{ x: number; z: number }>;
}

// ============================================================================
// SCALE-DEPENDENT CONSTANTS (computed in computeMedialAxis)
// ============================================================================

/**
 * Compute scale-dependent constants for the medial axis algorithm.
 * 
 * @param scale - The upsampling factor
 * @returns Object with MIN_RIDGE_DISTANCE, MAX_SPUR_LEN, MIN_SPUR_DISTANCE
 */
function getScaleConstants(scale: number) {
  return {
    /** Minimum distance from walls for ridge detection: ceil(0.5 * scale) */
    MIN_RIDGE_DISTANCE: Math.ceil(0.4 * scale),
    /** Maximum spur length to identify: ceil(1.0 * scale) */
    MAX_SPUR_LEN: Math.ceil(1.0 * scale),
    /** Minimum avg distance for spur protection: ceil(0.7 * scale) */
    MIN_SPUR_DISTANCE: Math.ceil(1.0 * scale),
    /** Maximum cycle length to treat as artifact: ceil(1.2 * scale) */
    CYCLE_MAX: Math.ceil(1.2 * scale),
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Compute the medial axis (skeleton) of walkable space in a maze.
 * 
 * The skeleton represents the centerline of corridors:
 * - 1-wide corridor → skeleton runs through cell centers
 * - 2-wide corridor → skeleton runs between the two lanes
 * - n-wide corridor → skeleton stays centered
 * 
 * @param maze - The maze to analyze
 * @param scale - Upsampling factor (default 5: each cell becomes 5×5 subcells)
 * @returns MedialAxisResult with skeleton points in world coordinates
 * 
 * @example
 * ```
 * const result = computeMedialAxis(maze, 5);
 * console.log(`Found ${result.skeletonPoints.length} skeleton points`);
 * ```
 */
export function computeMedialAxis(maze: Maze, scale: number = 5): MedialAxisResult {
  const cellSize = GameConfig.CELL_SIZE;
  const fineCellSize = cellSize / scale;
  
  const gridHeight = maze.grid.length;
  const gridWidth = maze.grid[0]?.length ?? 0;
  
  const fineHeight = gridHeight * scale;
  const fineWidth = gridWidth * scale;
  
  // =========================================================================
  // STEP 1: UPSAMPLE THE GRID
  // =========================================================================
  // Create a fine grid where each original maze cell becomes scale × scale
  // fine cells. Wall cells become blocked subcells, path cells become walkable.
  //
  // Original (3×3):          Fine (6×6 with scale=2):
  //   W W W                    B B B B B B
  //   W . W     ───────►       B B B B B B
  //   W W W                    B B . . B B
  //                            B B . . B B
  //                            B B B B B B
  //                            B B B B B B
  // =========================================================================
  
  const fineGrid: FineCell[][] = [];
  
  for (let fy = 0; fy < fineHeight; fy++) {
    const row: FineCell[] = [];
    for (let fx = 0; fx < fineWidth; fx++) {
      // Map fine cell back to original grid cell
      const origX = Math.floor(fx / scale);
      const origY = Math.floor(fy / scale);
      
      // Check if original cell is walkable (not a wall)
      const origRow = maze.grid[origY];
      const origCell = origRow?.[origX];
      const walkable = origCell ? !origCell.isWall : false;
      
      row.push({
        walkable,
        distance: 0,
        isRidge: false,
        isSkeleton: false,
        isSpur: false,
      });
    }
    fineGrid.push(row);
  }
  
  // Get scale-dependent constants
  const { MIN_RIDGE_DISTANCE, MAX_SPUR_LEN, MIN_SPUR_DISTANCE, CYCLE_MAX } = getScaleConstants(scale);
  
  // =========================================================================
  // STEP 2: DISTANCE TRANSFORM
  // =========================================================================
  // Compute Manhattan distance from each walkable cell to the nearest wall.
  // Uses multi-source BFS starting from all wall cells simultaneously.
  //
  // Result example (3-wide corridor):
  //   0 0 0 0 0
  //   0 1 2 1 0    ← distance = 2 in center (furthest from walls)
  //   0 1 2 1 0
  //   0 1 2 1 0
  //   0 0 0 0 0
  // =========================================================================
  
  const maxDistance = computeDistanceTransform(fineGrid, fineWidth, fineHeight);
  
  // =========================================================================
  // STEP 3: RIDGE DETECTION
  // =========================================================================
  // Find cells that are local maxima in the distance field using
  // opposite-direction pair logic. A cell is a ridge if:
  //   1. distance >= MIN_RIDGE_DISTANCE (not near walls)
  //   2. For at least one direction pair (E-W, N-S, NE-SW, NW-SE):
  //      - distance >= both neighbors in that pair
  //      - distance > at least one neighbor in that pair
  //
  // This detects "crest lines" (centerlines) rather than isolated peaks.
  // =========================================================================
  
  detectRidges(fineGrid, fineWidth, fineHeight, MIN_RIDGE_DISTANCE);
  
  // =========================================================================
  // STEP 4: ZHANG-SUEN THINNING
  // =========================================================================
  // Reduce thick ridge regions to 1-pixel-wide skeleton while preserving
  // topology (connectivity). Uses iterative boundary erosion with two
  // sub-iterations per pass.
  // =========================================================================
  
  zhangSuenThinning(fineGrid, fineWidth, fineHeight, MIN_RIDGE_DISTANCE);
  
  // =========================================================================
  // STEP 5: SPUR PRUNING
  // =========================================================================
  // Remove short dangling branches (spurs) that extend into corners.
  // These are artifacts of the thinning process and do not represent
  // true corridor centerlines. Spurs are now REMOVED from the skeleton.
  // =========================================================================
  
  const prunedSpurs = removeSpurs(fineGrid, fineWidth, fineHeight, MAX_SPUR_LEN, MIN_SPUR_DISTANCE);
  
  // =========================================================================
  // STEP 6: BFS-TREE CYCLE CLEANUP
  // =========================================================================
  // Remove tiny diagonal artifacts/shortcut cycles using BFS spanning tree.
  // Detects non-tree edges that form small cycles and breaks them.
  // =========================================================================
  
  // Find maze start position for BFS root
  const mazeStart = findMazeStart(maze, scale, fineCellSize, fineGrid, fineWidth, fineHeight);
  bfsTreeCycleCleanup(fineGrid, fineWidth, fineHeight, mazeStart, CYCLE_MAX);
  
  // =========================================================================
  // STEP 7: ORPHAN PIXEL CLEANUP
  // =========================================================================
  // Remove disconnected skeleton pixels/fragments left by cycle cleanup.
  // Only keep the largest connected component of the skeleton.
  // =========================================================================
  
  removeOrphanedPixels(fineGrid, fineWidth, fineHeight);
  
  // =========================================================================
  // STEP 7: CONVERT TO WORLD COORDINATES
  // =========================================================================
  // Map fine grid (fx, fy) indices to world-space (x, z) coordinates.
  // Each subcell center is at ((fx + 0.5) * fineCellSize, (fy + 0.5) * fineCellSize).
  // =========================================================================
  
  const skeletonPoints: Array<{ x: number; z: number }> = [];
  const ridgePoints: Array<{ x: number; z: number }> = [];
  const prunedSpurPoints: Array<{ x: number; z: number }> = [];
  
  for (let fy = 0; fy < fineHeight; fy++) {
    for (let fx = 0; fx < fineWidth; fx++) {
      const cell = fineGrid[fy][fx];
      
      // Convert fine cell index to world-space (center of subcell)
      const worldX = (fx + 0.5) * fineCellSize;
      const worldZ = (fy + 0.5) * fineCellSize;
      
      // Exclude spurs from main skeleton (they'll be rendered separately in orange)
      if (cell.isSkeleton && !cell.isSpur) {
        skeletonPoints.push({ x: worldX, z: worldZ });
      }
      if (cell.isRidge) {
        ridgePoints.push({ x: worldX, z: worldZ });
      }
    }
  }
  
  // Convert pruned spurs to world coordinates
  for (const spur of prunedSpurs) {
    const worldX = (spur.x + 0.5) * fineCellSize;
    const worldZ = (spur.y + 0.5) * fineCellSize;
    prunedSpurPoints.push({ x: worldX, z: worldZ });
  }
  
  console.log(`[MedialAxis] Computed: maxDist=${maxDistance}, ridges=${ridgePoints.length}, skeleton=${skeletonPoints.length}, pruned=${prunedSpurPoints.length}`);
  
  return {
    fineGrid,
    scale,
    fineCellSize,
    maxDistance,
    skeletonPoints,
    ridgePoints,
    prunedSpurPoints,
  };
}

// ============================================================================
// STEP 2: DISTANCE TRANSFORM (Manhattan / 4-connected BFS)
// ============================================================================

/**
 * Compute distance from each walkable cell to the nearest wall using BFS.
 * 
 * Uses 4-connected (Manhattan) distance for cleaner centerlines:
 * - Only N, S, E, W neighbors are considered
 * - Diagonal distance is NOT 1, it's 2 (N+E or N+W, etc.)
 * 
 * This produces more accurate ridge detection for medial axis computation.
 * 
 * @param fineGrid - The fine grid to update (mutates distance field)
 * @param width - Fine grid width
 * @param height - Fine grid height
 * @returns Maximum distance value found
 */
function computeDistanceTransform(
  fineGrid: FineCell[][],
  width: number,
  height: number
): number {
  // Initialize: wall/blocked cells have distance 0, walkable cells start at Infinity
  const queue: Array<{ x: number; y: number }> = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!fineGrid[y][x].walkable) {
        // Blocked cell - this IS a wall, distance = 0
        fineGrid[y][x].distance = 0;
        queue.push({ x, y });
      } else {
        // Walkable cell - distance unknown, will be computed
        fineGrid[y][x].distance = Infinity;
      }
    }
  }
  
  // 4-connected BFS (Manhattan distance)
  // Only N, S, E, W - NO diagonals
  const dx = [0, 1, 0, -1];  // E, S, W, N
  const dy = [-1, 0, 1, 0];  // (note: y increases downward in grid)
  
  let head = 0;
  let maxDistance = 0;
  
  // Multi-source BFS from all wall cells simultaneously
  while (head < queue.length) {
    const curr = queue[head++];
    const currDist = fineGrid[curr.y][curr.x].distance;
    
    // Check 4 cardinal neighbors
    for (let i = 0; i < 4; i++) {
      const nx = curr.x + dx[i];
      const ny = curr.y + dy[i];
      
      // Bounds check
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      
      const neighbor = fineGrid[ny][nx];
      const newDist = currDist + 1;
      
      // If we found a shorter path to this neighbor, update it
      if (newDist < neighbor.distance) {
        neighbor.distance = newDist;
        queue.push({ x: nx, y: ny });
        
        if (newDist > maxDistance) {
          maxDistance = newDist;
        }
      }
    }
  }
  
  return maxDistance;
}

// ============================================================================
// STEP 3: RIDGE DETECTION (Opposite-Direction Pair Logic)
// ============================================================================

/**
 * Detect ridge cells using opposite-direction pair logic.
 * 
 * A cell is marked as a ridge if:
 * 1. It's walkable and distance >= MIN_RIDGE_DISTANCE
 * 2. For at least ONE of the four direction pairs:
 *    - (E, W), (N, S), (NE, SW), (NW, SE)
 *    - The cell's distance is >= both neighbors in the pair
 *    - AND the cell's distance is > at least one neighbor in the pair
 * 
 * This detects "crest lines" (centerlines) rather than isolated peaks,
 * and works correctly for corridors of any width including even widths.
 * 
 * @param fineGrid - The fine grid to update (mutates isRidge)
 * @param width - Fine grid width
 * @param height - Fine grid height
 */
function detectRidges(
  fineGrid: FineCell[][],
  width: number,
  height: number,
  minRidgeDistance: number
): void {
  /**
   * Check if distance d forms a ridge with neighbors a and b.
   * Ridge condition: d >= a AND d >= b AND (d > a OR d > b)
   * 
   * This means:
   * - d is at least as high as both neighbors (local maximum or plateau)
   * - d is strictly higher than at least one (not a flat plateau)
   */
  function isRidgePair(d: number, a: number, b: number): boolean {
    return (d >= a && d >= b) && (d > a || d > b);
  }
  
  /**
   * Get distance value with bounds checking.
   * Out-of-bounds returns 0 (treated as wall).
   */
  function getDist(x: number, y: number): number {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return fineGrid[y][x].distance;
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = fineGrid[y][x];
      
      // Skip non-walkable cells
      if (!cell.walkable) {
        cell.isRidge = false;
        continue;
      }
      
      // CRITICAL: Skip cells too close to walls
      // This is the primary fix - no skeleton points near walls
      if (cell.distance < minRidgeDistance) {
        cell.isRidge = false;
        continue;
      }
      
      const d = cell.distance;
      
      // Get all 8 neighbor distances
      const N  = getDist(x, y - 1);      // North
      const S  = getDist(x, y + 1);      // South
      const E  = getDist(x + 1, y);      // East
      const W  = getDist(x - 1, y);      // West
      const NE = getDist(x + 1, y - 1);  // Northeast
      const NW = getDist(x - 1, y - 1);  // Northwest
      const SE = getDist(x + 1, y + 1);  // Southeast
      const SW = getDist(x - 1, y + 1);  // Southwest
      
      // Check each of the 4 direction pairs
      // A cell is a ridge if it's a local max in at least one pair
      const ridgeEW   = isRidgePair(d, E, W);    // East-West axis
      const ridgeNS   = isRidgePair(d, N, S);    // North-South axis
      const ridgeNESW = isRidgePair(d, NE, SW);  // Northeast-Southwest diagonal
      const ridgeNWSE = isRidgePair(d, NW, SE);  // Northwest-Southeast diagonal
      
      // Mark as ridge if ANY pair qualifies
      cell.isRidge = ridgeEW || ridgeNS || ridgeNESW || ridgeNWSE;
    }
  }
}

// ============================================================================
// STEP 4: ZHANG-SUEN THINNING
// ============================================================================

/**
 * Zhang-Suen thinning algorithm to reduce ridges to 1-pixel-wide skeleton.
 * 
 * Iteratively erodes boundary pixels while preserving:
 * - Topology (connectivity of the skeleton)
 * - End points (tips of branches)
 * - Skeleton centeredness
 * 
 * Uses two sub-iterations per pass with different removal conditions.
 * 
 * Neighbor layout (P1-P8 around center P):
 *   P2 P3 P4
 *   P1  P  P5
 *   P8 P7 P6
 * 
 * @param fineGrid - The fine grid to update (mutates isSkeleton)
 * @param width - Fine grid width
 * @param height - Fine grid height
 */
function zhangSuenThinning(
  fineGrid: FineCell[][],
  width: number,
  height: number,
  minRidgeDistance: number
): void {
  // Initialize skeleton from ridge candidates that passed minRidgeDistance
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = fineGrid[y][x];
      // Only include ridges that passed the minimum distance filter
      fineGrid[y][x].isSkeleton = cell.isRidge && cell.distance >= minRidgeDistance;
    }
  }
  
  let changed = true;
  let iterations = 0;
  const maxIterations = 1000; // Safety limit
  
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    
    // Sub-iteration 1: Remove south-east boundary pixels
    const toRemove1: Array<{ x: number; y: number }> = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (fineGrid[y][x].isSkeleton && canRemoveStep1(fineGrid, x, y)) {
          toRemove1.push({ x, y });
        }
      }
    }
    for (const p of toRemove1) {
      fineGrid[p.y][p.x].isSkeleton = false;
      changed = true;
    }
    
    // Sub-iteration 2: Remove north-west boundary pixels
    const toRemove2: Array<{ x: number; y: number }> = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (fineGrid[y][x].isSkeleton && canRemoveStep2(fineGrid, x, y)) {
          toRemove2.push({ x, y });
        }
      }
    }
    for (const p of toRemove2) {
      fineGrid[p.y][p.x].isSkeleton = false;
      changed = true;
    }
  }
  
  if (iterations >= maxIterations) {
    console.warn('[MedialAxis] Thinning reached max iterations');
  }
}

/**
 * Zhang-Suen step 1 removal condition.
 * 
 * Neighbor layout:
 *   P2 P3 P4
 *   P1  P  P5
 *   P8 P7 P6
 * 
 * Conditions for removal:
 * 1. 2 ≤ B(P) ≤ 6 (B = number of non-zero neighbors)
 * 2. A(P) = 1 (A = number of 0→1 transitions in clockwise order)
 * 3. P3 * P5 * P7 = 0 (at least one of N, E, S is background)
 * 4. P1 * P5 * P7 = 0 (at least one of W, E, S is background)
 */
function canRemoveStep1(fineGrid: FineCell[][], x: number, y: number): boolean {
  const P = getPixel(fineGrid, x, y);
  if (!P) return false;
  
  // Get 8 neighbors in clockwise order starting from west
  const P1 = getPixel(fineGrid, x - 1, y);      // West
  const P2 = getPixel(fineGrid, x - 1, y - 1);  // Northwest
  const P3 = getPixel(fineGrid, x, y - 1);      // North
  const P4 = getPixel(fineGrid, x + 1, y - 1);  // Northeast
  const P5 = getPixel(fineGrid, x + 1, y);      // East
  const P6 = getPixel(fineGrid, x + 1, y + 1);  // Southeast
  const P7 = getPixel(fineGrid, x, y + 1);      // South
  const P8 = getPixel(fineGrid, x - 1, y + 1);  // Southwest
  
  const neighbors = [P2, P3, P4, P5, P6, P7, P8, P1];
  const B = neighbors.filter(n => n).length; // Count of foreground neighbors
  
  // Count 0→1 transitions in clockwise order
  const A = countTransitions(neighbors);
  
  // Apply removal conditions
  if (B < 2 || B > 6) return false;  // Not a boundary pixel
  if (A !== 1) return false;          // Would break connectivity
  if (P3 && P5 && P7) return false;   // Condition 3
  if (P1 && P5 && P7) return false;   // Condition 4
  
  return true;
}

/**
 * Zhang-Suen step 2 removal condition.
 * 
 * Similar to step 1 but with different directional conditions:
 * 3. P1 * P3 * P5 = 0 (at least one of W, N, E is background)
 * 4. P1 * P3 * P7 = 0 (at least one of W, N, S is background)
 */
function canRemoveStep2(fineGrid: FineCell[][], x: number, y: number): boolean {
  const P = getPixel(fineGrid, x, y);
  if (!P) return false;
  
  const P1 = getPixel(fineGrid, x - 1, y);
  const P2 = getPixel(fineGrid, x - 1, y - 1);
  const P3 = getPixel(fineGrid, x, y - 1);
  const P4 = getPixel(fineGrid, x + 1, y - 1);
  const P5 = getPixel(fineGrid, x + 1, y);
  const P6 = getPixel(fineGrid, x + 1, y + 1);
  const P7 = getPixel(fineGrid, x, y + 1);
  const P8 = getPixel(fineGrid, x - 1, y + 1);
  
  const neighbors = [P2, P3, P4, P5, P6, P7, P8, P1];
  const B = neighbors.filter(n => n).length;
  const A = countTransitions(neighbors);
  
  if (B < 2 || B > 6) return false;
  if (A !== 1) return false;
  if (P1 && P3 && P5) return false;   // Condition 3 (different from step 1)
  if (P1 && P3 && P7) return false;   // Condition 4 (different from step 1)
  
  return true;
}

/**
 * Get skeleton value as boolean with bounds checking.
 */
function getPixel(fineGrid: FineCell[][], x: number, y: number): boolean {
  if (y < 0 || y >= fineGrid.length) return false;
  if (x < 0 || x >= fineGrid[0].length) return false;
  return fineGrid[y][x].isSkeleton;
}

/**
 * Count 0→1 transitions in a clockwise neighbor array.
 * Used to detect connectivity - A=1 means the pixel is on a simple boundary.
 */
function countTransitions(neighbors: boolean[]): number {
  let count = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const curr = neighbors[i];
    const next = neighbors[(i + 1) % neighbors.length];
    if (!curr && next) count++;
  }
  return count;
}

// ============================================================================
// STEP 5: SPUR REMOVAL
// ============================================================================

/**
 * Remove short dangling branches (spurs) from the skeleton.
 * 
 * A spur is a branch that:
 * 1. Starts at an endpoint (degree = 1)
 * 2. Has length <= maxSpurLen
 * 3. Either ends at another endpoint OR at a junction (degree >= 3)
 * 4. Optionally: has low average distance-to-wall (close to walls = corner artifact)
 * 
 * Algorithm:
 * 1. Build degree map for all skeleton pixels (8-neighborhood)
 * 2. Find all endpoints (degree = 1)
 * 3. For each endpoint, trace the spur until junction/endpoint or max length
 * 4. If spur qualifies, REMOVE all pixels in the path from the skeleton
 * 
 * @param fineGrid - The fine grid (mutates isSkeleton and isSpur)
 * @param width - Fine grid width
 * @param height - Fine grid height
 * @param maxSpurLen - Maximum spur length to remove
 * @param minSpurDistance - Minimum avg distance for spur protection
 * @returns Array of removed spur pixel coordinates for debug visualization
 */
function removeSpurs(
  fineGrid: FineCell[][],
  width: number,
  height: number,
  maxSpurLen: number,
  minSpurDistance: number
): Array<{ x: number; y: number }> {
  const spurPixels: Array<{ x: number; y: number }> = [];
  
  // 8-neighborhood offsets
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];
  
  function getSkeletonNeighbors(x: number, y: number): Array<{ x: number; y: number }> {
    const neighbors: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 8; i++) {
      const nx = x + dx[i];
      const ny = y + dy[i];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (fineGrid[ny][nx].isSkeleton) {
          neighbors.push({ x: nx, y: ny });
        }
      }
    }
    return neighbors;
  }
  
  function getDegree(x: number, y: number): number {
    return getSkeletonNeighbors(x, y).length;
  }
  
  function traceSpur(
    startX: number,
    startY: number
  ): Array<{ x: number; y: number; distance: number }> | null {
    const path: Array<{ x: number; y: number; distance: number }> = [];
    const visited = new Set<string>();
    
    let currX = startX;
    let currY = startY;
    let prevX = -1;
    let prevY = -1;
    
    while (path.length <= maxSpurLen) {
      const key = `${currX},${currY}`;
      if (visited.has(key)) break;
      visited.add(key);
      
      const cell = fineGrid[currY][currX];
      path.push({ x: currX, y: currY, distance: cell.distance });
      
      const neighbors = getSkeletonNeighbors(currX, currY).filter(
        n => !(n.x === prevX && n.y === prevY)
      );
      
      const degree = neighbors.length + (prevX >= 0 ? 1 : 0);
      
      if (degree >= 3) {
        path.pop();
        return path.length > 0 && path.length <= maxSpurLen ? path : null;
      }
      
      if (neighbors.length === 0) {
        return path.length <= maxSpurLen ? path : null;
      }
      
      if (neighbors.length === 1) {
        prevX = currX;
        prevY = currY;
        currX = neighbors[0].x;
        currY = neighbors[0].y;
      } else {
        path.pop();
        return path.length > 0 && path.length <= maxSpurLen ? path : null;
      }
    }
    
    return null;
  }
  
  // Find all endpoints (degree = 1)
  const endpoints: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (fineGrid[y][x].isSkeleton && getDegree(x, y) === 1) {
        endpoints.push({ x, y });
      }
    }
  }
  
  // Process each endpoint
  for (const endpoint of endpoints) {
    if (!fineGrid[endpoint.y][endpoint.x].isSkeleton) continue;
    
    const path = traceSpur(endpoint.x, endpoint.y);
    
    if (path && path.length > 0) {
      if (minSpurDistance > 0) {
        const avgDistance = path.reduce((sum, p) => sum + p.distance, 0) / path.length;
        if (avgDistance >= minSpurDistance) {
          continue;
        }
      }
      
      // REMOVE the spur from skeleton (not just mark)
      for (const pixel of path) {
        fineGrid[pixel.y][pixel.x].isSkeleton = false;
        fineGrid[pixel.y][pixel.x].isSpur = true;
        spurPixels.push({ x: pixel.x, y: pixel.y });
      }
    }
  }
  
  console.log(`[MedialAxis] Removed ${spurPixels.length} spur pixels from ${endpoints.length} endpoints`);
  
  return spurPixels;
}

// ============================================================================
// STEP 6: BFS-TREE CYCLE CLEANUP
// ============================================================================

/**
 * Find the skeleton pixel closest to the maze start position.
 */
function findMazeStart(
  maze: Maze,
  scale: number,
  fineCellSize: number,
  fineGrid: FineCell[][],
  width: number,
  height: number
): { x: number; y: number } {
  // Find the maze start cell (first non-wall cell in top row, or fallback)
  let startX = 0;
  let startY = 0;
  
  for (let y = 0; y < maze.grid.length; y++) {
    for (let x = 0; x < (maze.grid[y]?.length ?? 0); x++) {
      if (!maze.grid[y][x].isWall) {
        startX = x;
        startY = y;
        break;
      }
    }
    if (startX !== 0 || startY !== 0) break;
  }
  
  // Convert to fine grid coordinates (center of cell)
  const fineStartX = Math.floor(startX * scale + scale / 2);
  const fineStartY = Math.floor(startY * scale + scale / 2);
  
  // Find nearest skeleton pixel to start
  let nearestSkeleton: { x: number; y: number } | null = null;
  let minDistSq = Infinity;
  
  for (let fy = 0; fy < height; fy++) {
    for (let fx = 0; fx < width; fx++) {
      if (fineGrid[fy][fx].isSkeleton) {
        const dx = fx - fineStartX;
        const dy = fy - fineStartY;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          nearestSkeleton = { x: fx, y: fy };
        }
      }
    }
  }
  
  return nearestSkeleton ?? { x: fineStartX, y: fineStartY };
}

/**
 * BFS-tree cleanup to remove tiny diagonal artifact cycles.
 * 
 * Algorithm:
 * 1. Build BFS spanning tree from skeleton pixel nearest to maze start
 * 2. Detect non-tree edges (cycle/shortcut edges)
 * 3. For tiny cycles (length <= CYCLE_MAX), break deterministically
 * 4. Apply deletions
 * 
 * @param fineGrid - The fine grid (mutates isSkeleton)
 * @param width - Fine grid width
 * @param height - Fine grid height
 * @param startPixel - Starting skeleton pixel for BFS
 * @param cycleMax - Maximum cycle length to treat as artifact
 */
function bfsTreeCycleCleanup(
  fineGrid: FineCell[][],
  width: number,
  height: number,
  startPixel: { x: number; y: number },
  cycleMax: number
): void {
  // 8-neighborhood offsets
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];
  
  function getSkeletonNeighbors(x: number, y: number): Array<{ x: number; y: number }> {
    const neighbors: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 8; i++) {
      const nx = x + dx[i];
      const ny = y + dy[i];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (fineGrid[ny][nx].isSkeleton) {
          neighbors.push({ x: nx, y: ny });
        }
      }
    }
    return neighbors;
  }
  
  function key(x: number, y: number): string {
    return `${x},${y}`;
  }
  
  // =========================================================================
  // STEP 1: Build BFS spanning tree
  // =========================================================================
  const parent = new Map<string, { x: number; y: number } | null>();
  const depth = new Map<string, number>();
  const queue: Array<{ x: number; y: number }> = [];
  const nonTreeEdges: Array<{ u: { x: number; y: number }; v: { x: number; y: number } }> = [];
  
  // Check if start pixel is valid skeleton
  if (!fineGrid[startPixel.y]?.[startPixel.x]?.isSkeleton) {
    console.log('[MedialAxis] BFS start pixel not on skeleton, skipping cycle cleanup');
    return;
  }
  
  const startKey = key(startPixel.x, startPixel.y);
  parent.set(startKey, null);
  depth.set(startKey, 0);
  queue.push(startPixel);
  
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const currKey = key(curr.x, curr.y);
    const currDepth = depth.get(currKey)!;
    const currParent = parent.get(currKey);
    
    const neighbors = getSkeletonNeighbors(curr.x, curr.y);
    
    for (const neighbor of neighbors) {
      const neighborKey = key(neighbor.x, neighbor.y);
      
      // Skip parent
      if (currParent && neighbor.x === currParent.x && neighbor.y === currParent.y) {
        continue;
      }
      
      if (!parent.has(neighborKey)) {
        // Tree edge - add to BFS tree
        parent.set(neighborKey, curr);
        depth.set(neighborKey, currDepth + 1);
        queue.push(neighbor);
      } else {
        // Non-tree edge detected (cycle/shortcut)
        // Only record once per edge (when curr key < neighbor key lexicographically)
        if (currKey < neighborKey) {
          nonTreeEdges.push({ u: curr, v: neighbor });
        }
      }
    }
  }
  
  // =========================================================================
  // STEP 2 & 3: Process non-tree edges and detect tiny cycles
  // =========================================================================
  const pixelsToDelete = new Set<string>();
  
  for (const edge of nonTreeEdges) {
    const { u, v } = edge;
    const uKey = key(u.x, u.y);
    const vKey = key(v.x, v.y);
    
    // Walk parents from u and v to find common ancestor and cycle length
    const uPath: Array<{ x: number; y: number }> = [u];
    const vPath: Array<{ x: number; y: number }> = [v];
    const uAncestors = new Set<string>([uKey]);
    const vAncestors = new Set<string>([vKey]);
    
    let uCurr = parent.get(uKey);
    let vCurr = parent.get(vKey);
    
    // Build paths up to cycleMax steps
    for (let i = 0; i < cycleMax && (uCurr || vCurr); i++) {
      if (uCurr) {
        const uk = key(uCurr.x, uCurr.y);
        uPath.push(uCurr);
        uAncestors.add(uk);
        uCurr = parent.get(uk) ?? null;
      }
      if (vCurr) {
        const vk = key(vCurr.x, vCurr.y);
        vPath.push(vCurr);
        vAncestors.add(vk);
        vCurr = parent.get(vk) ?? null;
      }
    }
    
    // Find common ancestor
    let commonAncestor: { x: number; y: number } | null = null;
    let uDistToAncestor = 0;
    let vDistToAncestor = 0;
    
    for (let i = 0; i < uPath.length; i++) {
      const uk = key(uPath[i].x, uPath[i].y);
      if (vAncestors.has(uk)) {
        commonAncestor = uPath[i];
        uDistToAncestor = i;
        // Find v's distance to this ancestor
        for (let j = 0; j < vPath.length; j++) {
          if (vPath[j].x === commonAncestor.x && vPath[j].y === commonAncestor.y) {
            vDistToAncestor = j;
            break;
          }
        }
        break;
      }
    }
    
    if (!commonAncestor) {
      // Also check if v is ancestor of u
      for (let i = 0; i < vPath.length; i++) {
        const vk = key(vPath[i].x, vPath[i].y);
        if (uAncestors.has(vk)) {
          commonAncestor = vPath[i];
          vDistToAncestor = i;
          for (let j = 0; j < uPath.length; j++) {
            if (uPath[j].x === commonAncestor.x && uPath[j].y === commonAncestor.y) {
              uDistToAncestor = j;
              break;
            }
          }
          break;
        }
      }
    }
    
    if (!commonAncestor) continue;
    
    // Cycle length = distance from u to ancestor + distance from v to ancestor + 1 (the non-tree edge)
    const cycleLength = uDistToAncestor + vDistToAncestor + 1;
    
    if (cycleLength > cycleMax) continue;
    
    // =========================================================================
    // STEP 4: Choose pixel to delete
    // =========================================================================
    // Collect candidates: u, v, and pixels along the short cycle path
    const candidates: Array<{ x: number; y: number }> = [];
    
    // Add u and v
    candidates.push(u, v);
    
    // Add path pixels (excluding common ancestor)
    for (let i = 1; i < uDistToAncestor; i++) {
      candidates.push(uPath[i]);
    }
    for (let i = 1; i < vDistToAncestor; i++) {
      candidates.push(vPath[i]);
    }
    
    // Score candidates: prefer lower distance-to-wall, avoid high-degree, avoid start
    let bestCandidate: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    
    for (const cand of candidates) {
      // Skip start pixel
      if (cand.x === startPixel.x && cand.y === startPixel.y) continue;
      
      // Skip already marked for deletion
      const candKey = key(cand.x, cand.y);
      if (pixelsToDelete.has(candKey)) continue;
      
      // Check degree (using 4-connectivity for junction detection)
      const deg = getSkeletonNeighbors(cand.x, cand.y).length;
      if (deg >= 3) continue; // Avoid deleting junctions
      
      // Score by distance (lower = more artifact-like = preferred)
      const dist = fineGrid[cand.y][cand.x].distance;
      if (dist < bestScore) {
        bestScore = dist;
        bestCandidate = cand;
      }
    }
    
    if (bestCandidate) {
      pixelsToDelete.add(key(bestCandidate.x, bestCandidate.y));
    }
  }
  
  // =========================================================================
  // STEP 5: Apply deletions
  // =========================================================================
  for (const pk of pixelsToDelete) {
    const [px, py] = pk.split(',').map(Number);
    fineGrid[py][px].isSkeleton = false;
  }
  
  console.log(`[MedialAxis] BFS cycle cleanup: ${nonTreeEdges.length} non-tree edges, deleted ${pixelsToDelete.size} pixels`);
}

// ============================================================================
// STEP 7: ORPHAN PIXEL CLEANUP
// ============================================================================

/**
 * Remove skeleton pixels not connected to the main (largest) component.
 * This cleans up isolated pixels left behind by BFS cycle cleanup.
 * 
 * Algorithm:
 * 1. Find all connected components using BFS (8-connectivity)
 * 2. Identify the largest component
 * 3. Remove all pixels NOT in the largest component
 * 
 * @param fineGrid - The fine grid (mutates isSkeleton)
 * @param width - Fine grid width
 * @param height - Fine grid height
 * @returns Number of orphaned pixels removed
 */
function removeOrphanedPixels(
  fineGrid: FineCell[][],
  width: number,
  height: number
): number {
  // 8-neighborhood offsets
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];
  
  // Find all connected components via BFS
  const visited = new Set<string>();
  const components: Array<Set<string>> = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!fineGrid[y][x].isSkeleton) continue;
      const startKey = `${x},${y}`;
      if (visited.has(startKey)) continue;
      
      // BFS to find this component
      const component = new Set<string>();
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      visited.add(startKey);
      component.add(startKey);
      
      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (let i = 0; i < 8; i++) {
          const nx = curr.x + dx[i];
          const ny = curr.y + dy[i];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (!fineGrid[ny][nx].isSkeleton) continue;
          const nkey = `${nx},${ny}`;
          if (visited.has(nkey)) continue;
          visited.add(nkey);
          component.add(nkey);
          queue.push({ x: nx, y: ny });
        }
      }
      
      components.push(component);
    }
  }
  
  if (components.length <= 1) {
    console.log(`[MedialAxis] Orphan cleanup: ${components.length} component(s), no orphans removed`);
    return 0;
  }
  
  // Find the largest component
  let largest = components[0];
  for (const comp of components) {
    if (comp.size > largest.size) largest = comp;
  }
  
  // Remove all pixels NOT in the largest component
  let removed = 0;
  for (const comp of components) {
    if (comp === largest) continue;
    for (const key of comp) {
      const [px, py] = key.split(',').map(Number);
      fineGrid[py][px].isSkeleton = false;
      removed++;
    }
  }
  
  console.log(`[MedialAxis] Orphan cleanup: ${components.length} component(s), removed ${removed} orphan pixels`);
  
  return removed;
}
