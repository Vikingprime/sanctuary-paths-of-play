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
 * These are lines at the ACTUAL WALL BOUNDARIES (not cell centers)
 * Each edge has a normal pointing INTO the corridor (away from the wall)
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
  
  // For each path cell, check all 4 sides for adjacent walls
  // Place edge lines AT the wall boundary (cell edge), not at cell center
  maze.grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.isWall) return;
      
      // Wall ABOVE this path cell - edge at top boundary
      if (isWall(x, y - 1)) {
        edges.push({
          x1: x * CELL_SIZE,
          z1: y * CELL_SIZE,           // Top edge of this cell
          x2: (x + 1) * CELL_SIZE,
          z2: y * CELL_SIZE,
          normalX: 0,
          normalZ: 1,                   // Points INTO corridor (down/+Z)
        });
      }
      
      // Wall BELOW this path cell - edge at bottom boundary
      if (isWall(x, y + 1)) {
        edges.push({
          x1: x * CELL_SIZE,
          z1: (y + 1) * CELL_SIZE,     // Bottom edge of this cell
          x2: (x + 1) * CELL_SIZE,
          z2: (y + 1) * CELL_SIZE,
          normalX: 0,
          normalZ: -1,                  // Points INTO corridor (up/-Z)
        });
      }
      
      // Wall to the LEFT of this path cell - edge at left boundary
      if (isWall(x - 1, y)) {
        edges.push({
          x1: x * CELL_SIZE,           // Left edge of this cell
          z1: y * CELL_SIZE,
          x2: x * CELL_SIZE,
          z2: (y + 1) * CELL_SIZE,
          normalX: 1,                   // Points INTO corridor (right/+X)
          normalZ: 0,
        });
      }
      
      // Wall to the RIGHT of this path cell - edge at right boundary
      if (isWall(x + 1, y)) {
        edges.push({
          x1: (x + 1) * CELL_SIZE,     // Right edge of this cell
          z1: y * CELL_SIZE,
          x2: (x + 1) * CELL_SIZE,
          z2: (y + 1) * CELL_SIZE,
          normalX: -1,                  // Points INTO corridor (left/-X)
          normalZ: 0,
        });
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
export interface BorderAvoidanceResult {
  rotationAdjustment: number;
  debugInfo: {
    distance: number;
    edge: CorridorEdge | null;
    closeness: number; // 0 = at trigger distance, 1 = at edge
    pushVectorX: number; // Direction of the push (towards corridor center)
    pushVectorZ: number;
    pushMagnitude: number; // Strength of the push (scaled by closeness and speed)
    isActive: boolean; // Whether avoidance is being applied
  };
}

// Distance thresholds for avoidance curve
const OUTER_TRIGGER = 0.9;  // Start applying avoidance at this distance
const PEAK_DISTANCE = 0.3;   // Maximum strength at this distance
// Below PEAK_DISTANCE, strength drops off to allow mobility after collision

export function calculateBorderAvoidance(
  headX: number,
  headZ: number,
  rotation: number,
  moveSpeed: number,
  edges: CorridorEdge[],
  config: { triggerDistance: number; strength: number }
): BorderAvoidanceResult {
  // Use OUTER_TRIGGER as the search radius
  const proximity = findNearestCorridorEdge(headX, headZ, edges, OUTER_TRIGGER);
  
  if (!proximity.nearestEdge || proximity.distance >= OUTER_TRIGGER) {
    return { 
      rotationAdjustment: 0, 
      debugInfo: { 
        distance: proximity.distance, 
        edge: null, 
        closeness: 0,
        pushVectorX: 0,
        pushVectorZ: 0,
        pushMagnitude: 0,
        isActive: false,
      } 
    };
  }
  
  // Calculate strength curve:
  // - At OUTER_TRIGGER (0.9): strength = 0
  // - At PEAK_DISTANCE (0.3): strength = 1 (maximum)
  // - Below PEAK_DISTANCE: strength drops off linearly to 0 at distance 0
  let closeness: number;
  if (proximity.distance >= PEAK_DISTANCE) {
    // Ramp UP from 0 at OUTER_TRIGGER to 1 at PEAK_DISTANCE
    closeness = (OUTER_TRIGGER - proximity.distance) / (OUTER_TRIGGER - PEAK_DISTANCE);
  } else {
    // Ramp DOWN from 1 at PEAK_DISTANCE to 0 at distance 0
    closeness = proximity.distance / PEAK_DISTANCE;
  }
  closeness = Math.max(0, Math.min(1, closeness)); // Clamp to [0, 1]
  
  // Get current movement direction
  const moveX = Math.sin(rotation);
  const moveZ = -Math.cos(rotation);
  
  // Check if we're moving towards the edge (dot product with normal)
  // Normal points INTO corridor (away from wall)
  // If dot(movement, normal) > 0: moving with normal = away from wall (toward center) - skip
  // If dot(movement, normal) < 0: moving against normal = toward wall - apply avoidance
  const dotMovementWithNormal = moveX * proximity.pushX + moveZ * proximity.pushZ;
  
  // REMOVED: The early return was preventing avoidance when approaching walls head-on
  // because the nearest edge might be a side wall with a perpendicular normal.
  // Instead, we should ALWAYS apply avoidance when close to a wall, just adjust the strength
  // based on how much we're moving toward it.
  
  // Scale avoidance by how much we're moving toward the wall (0 = parallel, 1 = head-on)
  // Only skip if we're clearly moving AWAY from the wall
  const movingTowardWall = dotMovementWithNormal < 0;
  const approachFactor = movingTowardWall ? Math.min(1, Math.abs(dotMovementWithNormal)) : 0.3; // Still apply 30% even when moving away
  
  if (approachFactor < 0.01) {
    // Essentially stationary or moving perfectly away - no correction
    return { 
      rotationAdjustment: 0, 
      debugInfo: { 
        distance: proximity.distance, 
        edge: proximity.nearestEdge, 
        closeness,
        pushVectorX: proximity.pushX,
        pushVectorZ: proximity.pushZ,
        pushMagnitude: 0,
        isActive: false,
      } 
    };
  }
  
  // TURN DIRECTION LOGIC:
  // The goal is to turn the animal TOWARDS the corridor center.
  // The "normal" (pushX, pushZ) points from the edge towards the center.
  // We use the cross product (2D: moveX * normalZ - moveZ * normalX) to determine
  // which way to turn to align with the normal direction.
  //
  // Cross product in 2D: 
  //   move × normal = moveX * normalZ - moveZ * normalX
  //   If positive → normal is to the LEFT of move → turn LEFT (negative rotation)
  //   If negative → normal is to the RIGHT of move → turn RIGHT (positive rotation)
  
  const crossProduct = moveX * proximity.pushZ - moveZ * proximity.pushX;
  
  // turnDirection: which way to rotate to steer toward the corridor center
  // In Three.js: positive rotation = counter-clockwise (LEFT), negative = clockwise (RIGHT)
  // Cross product determines which side the normal (corridor center) is relative to movement:
  //   Positive cross → normal is to the LEFT → turn LEFT (positive rotation)
  //   Negative cross → normal is to the RIGHT → turn RIGHT (negative rotation)
  const turnDirection = crossProduct > 0 ? 1 : -1;
  
  // Calculate perpendicular to movement in the turn direction for debug visualization
  // Left perpendicular (-moveZ, moveX) for positive turn (left)
  // Right perpendicular (moveZ, -moveX) for negative turn (right)
  const bounceX = turnDirection > 0 ? -moveZ : moveZ;
  const bounceZ = turnDirection > 0 ? moveX : -moveX;
  
  // Strength proportional to:
  // 1. Closeness curve (ramp-up then ramp-down)
  // 2. Speed of movement
  // 3. Base strength setting
  // 4. BASE_MULTIPLIER to make the effect impactful
  // 5. approachFactor - how much we're moving toward the wall
  const BASE_MULTIPLIER = 1.0; // Reduced from 3.0 to prevent oscillation
  const proximityFactor = closeness * closeness;
  const adjustment = turnDirection * proximityFactor * moveSpeed * config.strength * BASE_MULTIPLIER * approachFactor;
  
  // Calculate the push magnitude for debug visualization
  const pushMagnitude = proximityFactor * moveSpeed * config.strength * BASE_MULTIPLIER * approachFactor;
  
  return {
    rotationAdjustment: adjustment,
    debugInfo: { 
      distance: proximity.distance, 
      edge: proximity.nearestEdge,
      closeness,
      pushVectorX: bounceX * pushMagnitude, // Perpendicular to movement, scaled by magnitude
      pushVectorZ: bounceZ * pushMagnitude,
      pushMagnitude,
      isActive: true,
    },
  };
}

/**
 * Get simplified edges for debug visualization (without duplicate overlapping segments)
 * For rendering purposes - returns unique visual segments at WALL BOUNDARIES
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
      
      // Wall above - horizontal edge at top boundary
      if (isWall(x, y - 1)) {
        const key = `T${x},${y}`;
        if (!seen.has(key)) {
          seen.add(key);
          segments.push({
            x1: x * CELL_SIZE,
            z1: y * CELL_SIZE,
            x2: (x + 1) * CELL_SIZE,
            z2: y * CELL_SIZE,
          });
        }
      }
      
      // Wall below - horizontal edge at bottom boundary
      if (isWall(x, y + 1)) {
        const key = `B${x},${y}`;
        if (!seen.has(key)) {
          seen.add(key);
          segments.push({
            x1: x * CELL_SIZE,
            z1: (y + 1) * CELL_SIZE,
            x2: (x + 1) * CELL_SIZE,
            z2: (y + 1) * CELL_SIZE,
          });
        }
      }
      
      // Wall left - vertical edge at left boundary
      if (isWall(x - 1, y)) {
        const key = `L${x},${y}`;
        if (!seen.has(key)) {
          seen.add(key);
          segments.push({
            x1: x * CELL_SIZE,
            z1: y * CELL_SIZE,
            x2: x * CELL_SIZE,
            z2: (y + 1) * CELL_SIZE,
          });
        }
      }
      
      // Wall right - vertical edge at right boundary
      if (isWall(x + 1, y)) {
        const key = `R${x},${y}`;
        if (!seen.has(key)) {
          seen.add(key);
          segments.push({
            x1: (x + 1) * CELL_SIZE,
            z1: y * CELL_SIZE,
            x2: (x + 1) * CELL_SIZE,
            z2: (y + 1) * CELL_SIZE,
          });
        }
      }
    });
  });
  
  return segments;
}
