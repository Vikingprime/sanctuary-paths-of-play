/**
 * Corridor Edge Utilities - Pure functions for corridor boundary detection
 * 
 * UNITY PORTABLE: All functions are pure and stateless
 * Used for path assist, border avoidance, and debug visualization
 */

import { Maze } from '@/types/game';
import { GameConfig } from './GameConfig';

// ============================================
// TYPES
// ============================================

export interface CorridorEdge {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  // Normal pointing towards center of corridor (perpendicular to edge)
  normalX: number;
  normalZ: number;
}

export interface EdgeProximityResult {
  nearestEdge: CorridorEdge | null;
  distance: number;
  // Direction to push away from edge (towards corridor center)
  pushX: number;
  pushZ: number;
}

// ============================================
// CORRIDOR EDGE COMPUTATION
// ============================================

/**
 * Compute all corridor edges for a maze
 * These are lines connecting path cell centers along the boundary of corridors
 * (where the path is adjacent to walls)
 * 
 * Returns edges with normals pointing towards the center of the corridor
 */
export function computeCorridorEdges(maze: Maze): CorridorEdge[] {
  const CELL_SIZE = GameConfig.CELL_SIZE;
  const edges: CorridorEdge[] = [];
  
  // Helper to check if a cell is a wall (out of bounds = wall)
  const isWall = (gx: number, gy: number): boolean => {
    if (gy < 0 || gy >= maze.grid.length) return true;
    const row = maze.grid[gy];
    if (gx < 0 || gx >= row.length) return true;
    return row[gx].isWall;
  };
  
  // Connect path cell centers, but ONLY along corridor edges (adjacent to wall)
  maze.grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.isWall) return;
      
      const cx = (x + 0.5) * CELL_SIZE;
      const cz = (y + 0.5) * CELL_SIZE;
      
      // Check RIGHT neighbor - draw line if there's a wall above OR below this horizontal segment
      if (!isWall(x + 1, y)) {
        const hasWallAbove = isWall(x, y - 1) || isWall(x + 1, y - 1);
        const hasWallBelow = isWall(x, y + 1) || isWall(x + 1, y + 1);
        
        if (hasWallAbove) {
          // Edge along top of corridor, normal points down (+Z)
          edges.push({
            x1: cx,
            z1: cz,
            x2: (x + 1.5) * CELL_SIZE,
            z2: cz,
            normalX: 0,
            normalZ: 1,
          });
        }
        if (hasWallBelow) {
          // Edge along bottom of corridor, normal points up (-Z)
          edges.push({
            x1: cx,
            z1: cz,
            x2: (x + 1.5) * CELL_SIZE,
            z2: cz,
            normalX: 0,
            normalZ: -1,
          });
        }
      }
      
      // Check DOWN neighbor - draw line if there's a wall to LEFT OR RIGHT of this vertical segment
      if (!isWall(x, y + 1)) {
        const hasWallLeft = isWall(x - 1, y) || isWall(x - 1, y + 1);
        const hasWallRight = isWall(x + 1, y) || isWall(x + 1, y + 1);
        
        if (hasWallLeft) {
          // Edge along left of corridor, normal points right (+X)
          edges.push({
            x1: cx,
            z1: cz,
            x2: cx,
            z2: (y + 1.5) * CELL_SIZE,
            normalX: 1,
            normalZ: 0,
          });
        }
        if (hasWallRight) {
          // Edge along right of corridor, normal points left (-X)
          edges.push({
            x1: cx,
            z1: cz,
            x2: cx,
            z2: (y + 1.5) * CELL_SIZE,
            normalX: -1,
            normalZ: 0,
          });
        }
      }
    });
  });
  
  return edges;
}

/**
 * Find the distance from a point to a line segment
 * Returns the closest point on the segment and the perpendicular distance
 */
function pointToSegmentDistance(
  px: number, pz: number,
  x1: number, z1: number,
  x2: number, z2: number
): { distance: number; closestX: number; closestZ: number } {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSq = dx * dx + dz * dz;
  
  if (lengthSq < 0.0001) {
    // Degenerate segment (point)
    const dist = Math.sqrt((px - x1) * (px - x1) + (pz - z1) * (pz - z1));
    return { distance: dist, closestX: x1, closestZ: z1 };
  }
  
  // Project point onto line, clamped to segment
  let t = ((px - x1) * dx + (pz - z1) * dz) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  
  const closestX = x1 + t * dx;
  const closestZ = z1 + t * dz;
  const distance = Math.sqrt((px - closestX) * (px - closestX) + (pz - closestZ) * (pz - closestZ));
  
  return { distance, closestX, closestZ };
}

/**
 * Find the nearest corridor edge to a point and compute the push direction
 * 
 * @param x - World X position
 * @param z - World Z position  
 * @param edges - Pre-computed corridor edges
 * @param maxDistance - Only consider edges within this distance
 * @returns Proximity result with nearest edge and push direction
 */
export function findNearestCorridorEdge(
  x: number,
  z: number,
  edges: CorridorEdge[],
  maxDistance: number = Infinity
): EdgeProximityResult {
  let nearestEdge: CorridorEdge | null = null;
  let nearestDistance = Infinity;
  let pushX = 0;
  let pushZ = 0;
  
  for (const edge of edges) {
    const result = pointToSegmentDistance(x, z, edge.x1, edge.z1, edge.x2, edge.z2);
    
    if (result.distance < nearestDistance && result.distance <= maxDistance) {
      nearestDistance = result.distance;
      nearestEdge = edge;
      // Push direction is the edge's normal (points towards corridor center)
      pushX = edge.normalX;
      pushZ = edge.normalZ;
    }
  }
  
  return {
    nearestEdge,
    distance: nearestDistance,
    pushX,
    pushZ,
  };
}

/**
 * Calculate border avoidance turn adjustment
 * When the animal's head is near a corridor edge, apply a turn vector
 * perpendicular to movement and towards the center
 * 
 * @param headX - Head position X (world coords)
 * @param headZ - Head position Z (world coords)
 * @param moveSpeed - Current movement speed
 * @param edges - Pre-computed corridor edges
 * @param config - Border avoidance configuration
 * @returns Rotation adjustment in radians (positive = turn right, negative = turn left)
 */
export function calculateBorderAvoidance(
  headX: number,
  headZ: number,
  rotation: number,
  moveSpeed: number,
  edges: CorridorEdge[],
  config: { triggerDistance: number; strength: number }
): { rotationAdjustment: number; debugInfo: { distance: number; edge: CorridorEdge | null } } {
  const proximity = findNearestCorridorEdge(headX, headZ, edges, config.triggerDistance);
  
  if (!proximity.nearestEdge || proximity.distance >= config.triggerDistance) {
    return { 
      rotationAdjustment: 0, 
      debugInfo: { distance: proximity.distance, edge: null } 
    };
  }
  
  // Calculate how close we are (0 = at trigger distance, 1 = at edge)
  const closeness = 1 - (proximity.distance / config.triggerDistance);
  
  // Get current movement direction
  const moveX = Math.sin(rotation);
  const moveZ = -Math.cos(rotation);
  
  // Check if we're moving towards the edge (dot product with normal)
  // If moving away from edge, no correction needed
  const dotMovementWithNormal = moveX * proximity.pushX + moveZ * proximity.pushZ;
  if (dotMovementWithNormal >= 0) {
    // Moving towards center (away from edge), no correction
    return { 
      rotationAdjustment: 0, 
      debugInfo: { distance: proximity.distance, edge: proximity.nearestEdge } 
    };
  }
  
  // Calculate turn direction: cross product of movement with push direction
  // Positive cross = turn right, negative = turn left
  const cross = moveX * proximity.pushZ - moveZ * proximity.pushX;
  const turnDirection = cross >= 0 ? 1 : -1;
  
  // Strength proportional to:
  // 1. How close to edge (closeness^2 for smooth ramp-up)
  // 2. Speed of movement
  // 3. Base strength setting
  const adjustment = turnDirection * closeness * closeness * moveSpeed * config.strength;
  
  return {
    rotationAdjustment: adjustment,
    debugInfo: { distance: proximity.distance, edge: proximity.nearestEdge },
  };
}

/**
 * Get simplified edges for debug visualization (without duplicate overlapping segments)
 * For rendering purposes - returns unique visual segments
 */
export function getUniqueCorridorEdgeSegments(maze: Maze): { x1: number; z1: number; x2: number; z2: number }[] {
  const CELL_SIZE = GameConfig.CELL_SIZE;
  const segments: { x1: number; z1: number; x2: number; z2: number }[] = [];
  const seen = new Set<string>();
  
  const isWall = (gx: number, gy: number): boolean => {
    if (gy < 0 || gy >= maze.grid.length) return true;
    const row = maze.grid[gy];
    if (gx < 0 || gx >= row.length) return true;
    return row[gx].isWall;
  };
  
  maze.grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.isWall) return;
      
      const cx = (x + 0.5) * CELL_SIZE;
      const cz = (y + 0.5) * CELL_SIZE;
      
      // Horizontal segment to right
      if (!isWall(x + 1, y)) {
        const hasWallAbove = isWall(x, y - 1) || isWall(x + 1, y - 1);
        const hasWallBelow = isWall(x, y + 1) || isWall(x + 1, y + 1);
        if (hasWallAbove || hasWallBelow) {
          const key = `H${x},${y}`;
          if (!seen.has(key)) {
            seen.add(key);
            segments.push({
              x1: cx,
              z1: cz,
              x2: (x + 1.5) * CELL_SIZE,
              z2: cz,
            });
          }
        }
      }
      
      // Vertical segment down
      if (!isWall(x, y + 1)) {
        const hasWallLeft = isWall(x - 1, y) || isWall(x - 1, y + 1);
        const hasWallRight = isWall(x + 1, y) || isWall(x + 1, y + 1);
        if (hasWallLeft || hasWallRight) {
          const key = `V${x},${y}`;
          if (!seen.has(key)) {
            seen.add(key);
            segments.push({
              x1: cx,
              z1: cz,
              x2: cx,
              z2: (y + 1.5) * CELL_SIZE,
            });
          }
        }
      }
    });
  });
  
  return segments;
}
