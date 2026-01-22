/**
 * Medial Axis (Skeleton) Computation
 * 
 * Computes the centerline spine of walkable maze corridors.
 * Works for corridors of any width (1-wide, 2-wide, n-wide).
 * For even-width corridors, the spine appears between cells.
 * 
 * VISUALIZATION ONLY - Does not affect gameplay or movement.
 */

import { Maze } from '@/types/game';
import { GameConfig } from './GameConfig';

/** Fine grid cell with distance and ridge info */
interface FineCell {
  walkable: boolean;
  distance: number;  // Distance to nearest wall (in fine-cell units)
  isRidge: boolean;  // Local maximum in distance field
  isSkeleton: boolean; // After thinning
}

/** Result of medial axis computation */
export interface MedialAxisResult {
  /** Fine grid (upsampled by SCALE factor) */
  fineGrid: FineCell[][];
  /** Scale factor used (each original cell = SCALE x SCALE fine cells) */
  scale: number;
  /** Fine cell size in world units */
  fineCellSize: number;
  /** World-space skeleton points */
  skeletonPoints: Array<{ x: number; z: number }>;
  /** World-space ridge points (pre-thinning, for debug) */
  ridgePoints: Array<{ x: number; z: number }>;
}

/**
 * Compute the medial axis (skeleton) of walkable space in a maze.
 * 
 * @param maze - The maze to analyze
 * @param scale - Upsampling factor (default 2: each cell becomes 2x2)
 * @returns MedialAxisResult with skeleton points in world coordinates
 */
export function computeMedialAxis(maze: Maze, scale: number = 2): MedialAxisResult {
  const cellSize = GameConfig.CELL_SIZE;
  const fineCellSize = cellSize / scale;
  
  const gridHeight = maze.grid.length;
  const gridWidth = maze.grid[0]?.length ?? 0;
  
  const fineHeight = gridHeight * scale;
  const fineWidth = gridWidth * scale;
  
  // =========================================================
  // STEP 1: Upsample the grid
  // Create a fine grid where each original cell becomes scale x scale fine cells
  // =========================================================
  const fineGrid: FineCell[][] = [];
  
  for (let fy = 0; fy < fineHeight; fy++) {
    const row: FineCell[] = [];
    for (let fx = 0; fx < fineWidth; fx++) {
      // Map fine cell back to original grid
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
      });
    }
    fineGrid.push(row);
  }
  
  // =========================================================
  // STEP 2: Distance transform
  // Compute distance to nearest blocked cell using BFS
  // =========================================================
  computeDistanceTransform(fineGrid, fineWidth, fineHeight);
  
  // =========================================================
  // STEP 3: Ridge detection (local maxima)
  // A cell is a ridge if its distance >= all neighbors in at least one axis
  // =========================================================
  detectRidges(fineGrid, fineWidth, fineHeight);
  
  // =========================================================
  // STEP 4: Zhang-Suen thinning
  // Reduce thick ridges to 1-cell-wide skeleton
  // =========================================================
  zhangSuenThinning(fineGrid, fineWidth, fineHeight);
  
  // =========================================================
  // STEP 5: Convert to world coordinates
  // =========================================================
  const skeletonPoints: Array<{ x: number; z: number }> = [];
  const ridgePoints: Array<{ x: number; z: number }> = [];
  
  for (let fy = 0; fy < fineHeight; fy++) {
    for (let fx = 0; fx < fineWidth; fx++) {
      const cell = fineGrid[fy][fx];
      
      // Convert fine cell to world space (center of fine cell)
      const worldX = (fx + 0.5) * fineCellSize;
      const worldZ = (fy + 0.5) * fineCellSize;
      
      if (cell.isSkeleton) {
        skeletonPoints.push({ x: worldX, z: worldZ });
      }
      if (cell.isRidge) {
        ridgePoints.push({ x: worldX, z: worldZ });
      }
    }
  }
  
  return {
    fineGrid,
    scale,
    fineCellSize,
    skeletonPoints,
    ridgePoints,
  };
}

/**
 * BFS-based distance transform
 * Computes distance from each walkable cell to the nearest wall
 */
function computeDistanceTransform(
  fineGrid: FineCell[][],
  width: number,
  height: number
): void {
  // Initialize: walls have distance 0, walkable cells start at Infinity
  const queue: Array<{ x: number; y: number }> = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!fineGrid[y][x].walkable) {
        fineGrid[y][x].distance = 0;
        queue.push({ x, y });
      } else {
        fineGrid[y][x].distance = Infinity;
      }
    }
  }
  
  // BFS from all wall cells simultaneously (multi-source BFS)
  // Using Chebyshev distance (8-connected, diagonal = 1)
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];
  
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const currDist = fineGrid[curr.y][curr.x].distance;
    
    for (let i = 0; i < 8; i++) {
      const nx = curr.x + dx[i];
      const ny = curr.y + dy[i];
      
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      
      const neighbor = fineGrid[ny][nx];
      const newDist = currDist + 1;
      
      if (newDist < neighbor.distance) {
        neighbor.distance = newDist;
        queue.push({ x: nx, y: ny });
      }
    }
  }
}

/**
 * Detect ridge cells (local maxima in distance field)
 * A cell is a ridge if its distance >= neighbors in at least one direction pair
 */
function detectRidges(
  fineGrid: FineCell[][],
  width: number,
  height: number
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = fineGrid[y][x];
      if (!cell.walkable || cell.distance === 0) continue;
      
      const d = cell.distance;
      
      // Check 4 direction pairs (N-S, E-W, NE-SW, NW-SE)
      // A cell is a ridge if it's a local max in at least one pair
      const neighbors = [
        getDistance(fineGrid, x, y - 1, width, height),     // N
        getDistance(fineGrid, x, y + 1, width, height),     // S
        getDistance(fineGrid, x - 1, y, width, height),     // W
        getDistance(fineGrid, x + 1, y, width, height),     // E
        getDistance(fineGrid, x - 1, y - 1, width, height), // NW
        getDistance(fineGrid, x + 1, y + 1, width, height), // SE
        getDistance(fineGrid, x + 1, y - 1, width, height), // NE
        getDistance(fineGrid, x - 1, y + 1, width, height), // SW
      ];
      
      // Check each direction pair
      const isRidgeNS = d >= neighbors[0] && d >= neighbors[1];
      const isRidgeEW = d >= neighbors[2] && d >= neighbors[3];
      const isRidgeNWSE = d >= neighbors[4] && d >= neighbors[5];
      const isRidgeNESW = d >= neighbors[6] && d >= neighbors[7];
      
      cell.isRidge = isRidgeNS || isRidgeEW || isRidgeNWSE || isRidgeNESW;
    }
  }
}

/** Get distance value with bounds checking */
function getDistance(
  fineGrid: FineCell[][],
  x: number,
  y: number,
  width: number,
  height: number
): number {
  if (x < 0 || x >= width || y < 0 || y >= height) return 0;
  return fineGrid[y][x].distance;
}

/**
 * Zhang-Suen thinning algorithm
 * Reduces thick ridges to 1-cell-wide skeleton while preserving topology
 */
function zhangSuenThinning(
  fineGrid: FineCell[][],
  width: number,
  height: number
): void {
  // Initialize skeleton from ridge
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      fineGrid[y][x].isSkeleton = fineGrid[y][x].isRidge;
    }
  }
  
  let changed = true;
  
  while (changed) {
    changed = false;
    
    // Sub-iteration 1
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
    
    // Sub-iteration 2
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
}

/**
 * Zhang-Suen step 1 removal condition
 * P2 P3 P4
 * P1  P  P5
 * P8 P7 P6
 */
function canRemoveStep1(fineGrid: FineCell[][], x: number, y: number): boolean {
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
  const B = neighbors.filter(n => n).length; // Count of 1s
  
  // Count 0→1 transitions in clockwise order
  const A = countTransitions(neighbors);
  
  // Conditions for step 1
  if (B < 2 || B > 6) return false;
  if (A !== 1) return false;
  if (P3 && P5 && P7) return false;
  if (P1 && P5 && P7) return false;
  
  return true;
}

/**
 * Zhang-Suen step 2 removal condition
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
  
  // Conditions for step 2
  if (B < 2 || B > 6) return false;
  if (A !== 1) return false;
  if (P1 && P3 && P5) return false;
  if (P1 && P3 && P7) return false;
  
  return true;
}

/** Get skeleton value as boolean */
function getPixel(fineGrid: FineCell[][], x: number, y: number): boolean {
  if (y < 0 || y >= fineGrid.length) return false;
  if (x < 0 || x >= fineGrid[0].length) return false;
  return fineGrid[y][x].isSkeleton;
}

/** Count 0→1 transitions in clockwise neighbor array */
function countTransitions(neighbors: boolean[]): number {
  let count = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const curr = neighbors[i];
    const next = neighbors[(i + 1) % neighbors.length];
    if (!curr && next) count++;
  }
  return count;
}
