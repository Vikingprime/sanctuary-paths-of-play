/**
 * A* Pathfinding for click-to-move navigation
 * 
 * UNITY PORTABLE: Pure functions, no React/Three.js dependencies
 * 
 * Uses fine-grained grid (0.25 units) for smoother paths and 
 * rotation-aware cost to minimize sharp turns.
 */

import { Maze } from '@/types/game';
import { isWall } from './MazeUtils';

// Fine grid resolution - smaller = smoother paths but more computation
const GRID_RESOLUTION = 0.25; // 4 nodes per cell unit

export interface PathNode {
  x: number;  // Fine grid coords
  y: number;
  g: number;  // Cost from start
  h: number;  // Heuristic to goal
  f: number;  // g + h
  parent: PathNode | null;
  direction?: number; // Direction we came from (for turn cost)
}

export interface PathPoint {
  x: number;
  y: number;
}

export interface BlockedPosition {
  x: number;
  y: number;
  radius?: number; // collision radius (defaults to 0.4 for characters)
}

// 8 directions for smoother movement
const DIRECTIONS = [
  { dx: 0, dy: -1, angle: 0 },      // Up (North)
  { dx: 1, dy: -1, angle: 1 },      // Up-Right (NE)
  { dx: 1, dy: 0, angle: 2 },       // Right (East)
  { dx: 1, dy: 1, angle: 3 },       // Down-Right (SE)
  { dx: 0, dy: 1, angle: 4 },       // Down (South)
  { dx: -1, dy: 1, angle: 5 },      // Down-Left (SW)
  { dx: -1, dy: 0, angle: 6 },      // Left (West)
  { dx: -1, dy: -1, angle: 7 },     // Up-Left (NW)
];

/**
 * Calculate turn cost between two directions (0-7)
 * Returns 0 for straight, higher for sharper turns
 */
function getTurnCost(fromDir: number | undefined, toDir: number): number {
  if (fromDir === undefined) return 0;
  
  // Calculate minimum angular difference (0-4, where 4 is 180°)
  let diff = Math.abs(toDir - fromDir);
  if (diff > 4) diff = 8 - diff;
  
  // Penalize turns heavily to prefer straight paths
  // 0 = straight, 1 = 45°, 2 = 90°, 3 = 135°, 4 = 180°
  const turnCosts = [0, 0.3, 0.8, 1.5, 3.0];
  return turnCosts[diff];
}

// Cow capsule dimensions for orientation-aware collision
const COW_HEAD_OFFSET = 0.4;  // Distance from center to head
const COW_TAIL_OFFSET = 0.35; // Distance from center to tail
const COW_BODY_RADIUS = 0.25; // Radius of collision points

/**
 * Convert direction index (0-7) to radians
 * Direction 0 = North (negative Y), going clockwise
 */
function directionToRadians(dir: number): number {
  // Each direction is 45 degrees (PI/4)
  return dir * (Math.PI / 4);
}

/**
 * Check if a fine-grid position is blocked (wall or too close to character/station)
 * Uses radius-based collision for characters instead of cell-based blocking
 */
function isPositionBlocked(
  maze: Maze,
  fineX: number,
  fineY: number,
  blockedPositions: BlockedPosition[],
  playerRadius: number = 0.35
): boolean {
  // Convert fine grid to world coords
  const worldX = fineX * GRID_RESOLUTION;
  const worldY = fineY * GRID_RESOLUTION;
  
  // Check if center is in wall
  const gridX = Math.floor(worldX);
  const gridY = Math.floor(worldY);
  if (isWall(maze, gridX, gridY)) return true;
  
  // Check radius clearance from walls (only for walls, not characters)
  const checkPoints = [
    { x: worldX + playerRadius, y: worldY },
    { x: worldX - playerRadius, y: worldY },
    { x: worldX, y: worldY + playerRadius },
    { x: worldX, y: worldY - playerRadius },
  ];
  
  for (const pt of checkPoints) {
    const ptGridX = Math.floor(pt.x);
    const ptGridY = Math.floor(pt.y);
    if (isWall(maze, ptGridX, ptGridY)) return true;
  }
  
  // Check radius-based collision with characters/stations
  for (const blocked of blockedPositions) {
    const obstacleRadius = blocked.radius ?? 0.4;
    const minClearance = playerRadius + obstacleRadius;
    
    const dx = worldX - blocked.x;
    const dy = worldY - blocked.y;
    const distSq = dx * dx + dy * dy;
    
    if (distSq < minClearance * minClearance) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a position WITH A SPECIFIC DIRECTION is blocked
 * This simulates the cow's full capsule collider based on travel direction
 * Checks head, tail, AND side points to ensure the cow can actually fit through
 */
function isPositionBlockedWithDirection(
  maze: Maze,
  fineX: number,
  fineY: number,
  direction: number,
  blockedPositions: BlockedPosition[]
): boolean {
  // First check basic position blocking
  if (isPositionBlocked(maze, fineX, fineY, blockedPositions, COW_BODY_RADIUS)) {
    return true;
  }
  
  // Convert to world coords
  const worldX = fineX * GRID_RESOLUTION;
  const worldY = fineY * GRID_RESOLUTION;
  
  // Calculate rotation from direction (direction 0 = moving north = -Y)
  const rotation = directionToRadians(direction);
  const sinRot = Math.sin(rotation);
  const cosRot = Math.cos(rotation);
  
  // Generate capsule check points: head, tail, and sides
  // Forward/back direction: sin(rot) for X, -cos(rot) for Y
  // Side direction (perpendicular): cos(rot) for X, sin(rot) for Y
  const capsulePoints = [
    // Head
    { x: worldX + sinRot * COW_HEAD_OFFSET, y: worldY - cosRot * COW_HEAD_OFFSET },
    // Tail
    { x: worldX - sinRot * COW_TAIL_OFFSET, y: worldY + cosRot * COW_TAIL_OFFSET },
    // Left side (midpoint)
    { x: worldX - cosRot * COW_BODY_RADIUS, y: worldY - sinRot * COW_BODY_RADIUS },
    // Right side (midpoint)
    { x: worldX + cosRot * COW_BODY_RADIUS, y: worldY + sinRot * COW_BODY_RADIUS },
    // Front-left
    { x: worldX + sinRot * (COW_HEAD_OFFSET * 0.5) - cosRot * COW_BODY_RADIUS, 
      y: worldY - cosRot * (COW_HEAD_OFFSET * 0.5) - sinRot * COW_BODY_RADIUS },
    // Front-right
    { x: worldX + sinRot * (COW_HEAD_OFFSET * 0.5) + cosRot * COW_BODY_RADIUS, 
      y: worldY - cosRot * (COW_HEAD_OFFSET * 0.5) + sinRot * COW_BODY_RADIUS },
    // Back-left
    { x: worldX - sinRot * (COW_TAIL_OFFSET * 0.5) - cosRot * COW_BODY_RADIUS, 
      y: worldY + cosRot * (COW_TAIL_OFFSET * 0.5) - sinRot * COW_BODY_RADIUS },
    // Back-right
    { x: worldX - sinRot * (COW_TAIL_OFFSET * 0.5) + cosRot * COW_BODY_RADIUS, 
      y: worldY + cosRot * (COW_TAIL_OFFSET * 0.5) + sinRot * COW_BODY_RADIUS },
  ];
  
  // Check all capsule points against walls
  for (const pt of capsulePoints) {
    if (isWall(maze, Math.floor(pt.x), Math.floor(pt.y))) return true;
  }
  
  // Check capsule points against obstacles (characters/stations)
  for (const blocked of blockedPositions) {
    const obstacleRadius = blocked.radius ?? 0.4;
    // Use smaller clearance for capsule points since we're checking multiple points
    const minClearance = 0.15 + obstacleRadius;
    const minClearanceSq = minClearance * minClearance;
    
    for (const pt of capsulePoints) {
      const dx = pt.x - blocked.x;
      const dy = pt.y - blocked.y;
      if (dx * dx + dy * dy < minClearanceSq) return true;
    }
  }
  
  return false;
}

/**
 * Check if the cow can rotate from one direction to another at a given position
 * This simulates the capsule sweeping through intermediate angles during rotation
 * Returns true if rotation would cause a collision (blocked)
 */
function isRotationBlocked(
  maze: Maze,
  fineX: number,
  fineY: number,
  fromDirection: number | undefined,
  toDirection: number,
  blockedPositions: BlockedPosition[]
): boolean {
  if (fromDirection === undefined) return false;
  if (fromDirection === toDirection) return false;
  
  // Calculate the angular difference and direction
  let diff = toDirection - fromDirection;
  if (diff > 4) diff -= 8;
  if (diff < -4) diff += 8;
  
  const steps = Math.abs(diff);
  if (steps === 0) return false;
  
  // Check each intermediate angle during rotation
  // For a 45° turn, check 1 intermediate; for 90°, check 2; etc.
  const stepDir = diff > 0 ? 1 : -1;
  
  for (let i = 1; i <= steps; i++) {
    const intermediateDir = (fromDirection + i * stepDir + 8) % 8;
    if (isPositionBlockedWithDirection(maze, fineX, fineY, intermediateDir, blockedPositions)) {
      return true; // Rotation blocked at this intermediate angle
    }
  }
  
  return false;
}

/**
 * Check if a world position is inside a blocked obstacle (character or station)
 * This is used to reject destinations that are directly on obstacles
 */
function isInsideBlockedObstacle(
  worldX: number,
  worldY: number,
  blockedPositions: BlockedPosition[]
): boolean {
  for (const blocked of blockedPositions) {
    const obstacleRadius = blocked.radius ?? 0.4;
    const dx = worldX - blocked.x;
    const dy = worldY - blocked.y;
    const distSq = dx * dx + dy * dy;
    // Check if point is inside the obstacle's core (not clearance zone)
    if (distSq < obstacleRadius * obstacleRadius) {
      return true;
    }
  }
  return false;
}

/**
 * Find the nearest valid position outside all blocked obstacles
 * Searches in a spiral pattern outward from the clicked position
 */
function findNearestValidPosition(
  maze: Maze,
  worldX: number,
  worldY: number,
  blockedPositions: BlockedPosition[],
  playerX: number,
  playerY: number
): { x: number; y: number } | null {
  // Direction from obstacle toward player (preferred escape direction)
  const toPlayerX = playerX - worldX;
  const toPlayerY = playerY - worldY;
  const toPlayerDist = Math.sqrt(toPlayerX * toPlayerX + toPlayerY * toPlayerY);
  
  // Normalize direction
  const dirX = toPlayerDist > 0.1 ? toPlayerX / toPlayerDist : 0;
  const dirY = toPlayerDist > 0.1 ? toPlayerY / toPlayerDist : -1;
  
  // Search in expanding circles, preferring direction toward player
  const searchDistances = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const angleOffsets = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, Math.PI]; // Radians from player direction
  
  for (const dist of searchDistances) {
    for (const angleOffset of angleOffsets) {
      const baseAngle = Math.atan2(dirY, dirX);
      const searchAngle = baseAngle + angleOffset;
      const testX = worldX + Math.cos(searchAngle) * dist;
      const testY = worldY + Math.sin(searchAngle) * dist;
      
      // Check if this position is valid (not in wall, not in obstacle)
      const gridX = Math.floor(testX);
      const gridY = Math.floor(testY);
      
      if (isWall(maze, gridX, gridY)) continue;
      if (isInsideBlockedObstacle(testX, testY, blockedPositions)) continue;
      
      // Also check clearance
      const fineX = Math.round(testX / GRID_RESOLUTION);
      const fineY = Math.round(testY / GRID_RESOLUTION);
      if (isPositionBlocked(maze, fineX, fineY, blockedPositions, 0.3)) continue;
      
      return { x: testX, y: testY };
    }
  }
  
  return null;
}

/**
 * Find path from start to goal using A* algorithm with fine grid
 * Uses rotation-aware cost to prefer smoother paths
 */
export function findPath(
  maze: Maze,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  blockedPositions?: BlockedPosition[]
): PathPoint[] | null {
  // Convert world coords to fine grid coords
  const startFineX = Math.round(startX / GRID_RESOLUTION);
  const startFineY = Math.round(startY / GRID_RESOLUTION);
  const goalFineX = Math.round(goalX / GRID_RESOLUTION);
  const goalFineY = Math.round(goalY / GRID_RESOLUTION);
  
  // Use the blockedPositions array directly for radius-based collision
  const blocked = blockedPositions ?? [];
  
  // FIRST: Check if goal is directly inside a blocked obstacle (map tower, character)
  // If so, find the nearest valid position outside
  if (isInsideBlockedObstacle(goalX, goalY, blocked)) {
    const alternate = findNearestValidPosition(maze, goalX, goalY, blocked, startX, startY);
    if (!alternate) {
      console.log('[Pathfinding] Goal is inside obstacle and no alternate found');
      return null;
    }
    console.log(`[Pathfinding] Goal inside obstacle, redirecting to (${alternate.x.toFixed(2)}, ${alternate.y.toFixed(2)})`);
    // Recursively find path to the alternate position
    return findPath(maze, startX, startY, alternate.x, alternate.y, blockedPositions);
  }
  
  // Quick check: if goal is blocked, try to find nearest unblocked point
  // Use smaller radius for goal check to allow getting closer to obstacles
  let finalGoalFineX = goalFineX;
  let finalGoalFineY = goalFineY;
  
  if (isPositionBlocked(maze, goalFineX, goalFineY, blocked, 0.25)) {
    // Try 8 directions around the goal to find an unblocked spot
    const searchOffsets = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
      { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 },
    ];
    
    let foundAlternate = false;
    for (const offset of searchOffsets) {
      const altX = goalFineX + offset.x;
      const altY = goalFineY + offset.y;
      if (!isPositionBlocked(maze, altX, altY, blocked, 0.25)) {
        finalGoalFineX = altX;
        finalGoalFineY = altY;
        foundAlternate = true;
        break;
      }
    }
    
    if (!foundAlternate) {
      return null;
    }
  }
  
  // If start equals goal (within tolerance), return single point
  const distToGoal = Math.sqrt(
    Math.pow((startFineX - finalGoalFineX) * GRID_RESOLUTION, 2) +
    Math.pow((startFineY - finalGoalFineY) * GRID_RESOLUTION, 2)
  );
  if (distToGoal < 0.3) {
    return [{ x: finalGoalFineX * GRID_RESOLUTION, y: finalGoalFineY * GRID_RESOLUTION }];
  }
  
  const openSet: PathNode[] = [];
  const closedSet = new Set<string>();
  const nodeScores = new Map<string, number>(); // Track best g score per node
  
  const heuristic = (x: number, y: number): number => {
    // Euclidean distance (better for 8-dir movement)
    const dx = (x - finalGoalFineX) * GRID_RESOLUTION;
    const dy = (y - finalGoalFineY) * GRID_RESOLUTION;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  const nodeKey = (x: number, y: number): string => `${x},${y}`;
  
  // Start node
  const startNode: PathNode = {
    x: startFineX,
    y: startFineY,
    g: 0,
    h: heuristic(startFineX, startFineY),
    f: heuristic(startFineX, startFineY),
    parent: null,
    direction: undefined,
  };
  openSet.push(startNode);
  nodeScores.set(nodeKey(startFineX, startFineY), 0);
  
  let iterations = 0;
  const maxIterations = 5000; // Higher limit for fine grid
  
  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;
    
    // Find node with lowest f score
    let lowestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[lowestIdx].f) {
        lowestIdx = i;
      }
    }
    
    const current = openSet[lowestIdx];
    
    // Check if we reached the goal (within 1 fine grid cell)
    const distToGoalNow = Math.abs(current.x - finalGoalFineX) + Math.abs(current.y - finalGoalFineY);
    if (distToGoalNow <= 1) {
      // Reconstruct path
      const rawPath: PathPoint[] = [];
      let node: PathNode | null = current;
      
      while (node) {
        rawPath.unshift({ 
          x: node.x * GRID_RESOLUTION, 
          y: node.y * GRID_RESOLUTION 
        });
        node = node.parent;
      }
      
      // Replace last point with the adjusted goal position
      if (rawPath.length > 0) {
        rawPath[rawPath.length - 1] = { 
          x: finalGoalFineX * GRID_RESOLUTION, 
          y: finalGoalFineY * GRID_RESOLUTION 
        };
      }
      
      // Simplify the path using line-of-sight to remove unnecessary waypoints
      // Note: simplification only checks walls, not characters (radius collision handled in main pathfinding)
      return simplifyFinePath(rawPath, maze, new Set<string>());
    }
    
    // Move current from open to closed
    openSet.splice(lowestIdx, 1);
    closedSet.add(nodeKey(current.x, current.y));
    
    // Check all 8 directions
    for (const dir of DIRECTIONS) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const key = nodeKey(nx, ny);
      
      // Skip if already visited
      if (closedSet.has(key)) continue;
      
      // Skip if blocked (basic point check)
      if (isPositionBlocked(maze, nx, ny, blocked)) continue;
      
      // For diagonal movement, check that both adjacent cells are clear
      if (dir.dx !== 0 && dir.dy !== 0) {
        if (isPositionBlocked(maze, current.x + dir.dx, current.y, blocked)) continue;
        if (isPositionBlocked(maze, current.x, current.y + dir.dy, blocked)) continue;
      }
      
      // CAPSULE-AWARE COLLISION CHECK:
      // 1. Check if the cow can ROTATE from current direction to the new direction at CURRENT position
      // 2. Check if the cow can EXIST at the new position with the new direction
      const worldNx = nx * GRID_RESOLUTION;
      const worldNy = ny * GRID_RESOLUTION;
      
      // Determine if we're near any obstacle (use expanded check for rotation simulation)
      let nearObstacle = false;
      for (const obs of blocked) {
        const dxCurrent = current.x * GRID_RESOLUTION - obs.x;
        const dyCurrent = current.y * GRID_RESOLUTION - obs.y;
        const dxNext = worldNx - obs.x;
        const dyNext = worldNy - obs.y;
        // Check both current and next position proximity
        if (dxCurrent * dxCurrent + dyCurrent * dyCurrent < 2.5 ||
            dxNext * dxNext + dyNext * dyNext < 2.5) {
          nearObstacle = true;
          break;
        }
      }
      
      if (nearObstacle) {
        // Step 1: Check if ROTATION at current position is blocked
        // This is the key fix - if cow can't turn left here, this path is rejected
        if (isRotationBlocked(maze, current.x, current.y, current.direction, dir.angle, blocked)) {
          continue; // Can't rotate to face this direction - path blocked
        }
        
        // Step 2: Check if destination position is valid with the travel direction
        if (isPositionBlockedWithDirection(maze, nx, ny, dir.angle, blocked)) {
          continue; // Can't fit at destination with this orientation
        }
      }
      
      // Calculate movement cost (diagonal costs more)
      const moveCost = (dir.dx !== 0 && dir.dy !== 0) 
        ? GRID_RESOLUTION * 1.414 
        : GRID_RESOLUTION;
      
      // Add turn cost to prefer straighter paths (but don't block - just prefer)
      const turnCost = getTurnCost(current.direction, dir.angle);
      
      const g = current.g + moveCost + turnCost;
      const h = heuristic(nx, ny);
      const f = g + h;
      
      // Check if we already have a better path to this node
      const existingScore = nodeScores.get(key);
      if (existingScore !== undefined && existingScore <= g) {
        continue;
      }
      
      // Update or add node
      nodeScores.set(key, g);
      
      // Remove existing node from open set if present
      const existingIdx = openSet.findIndex(n => n.x === nx && n.y === ny);
      if (existingIdx >= 0) {
        openSet.splice(existingIdx, 1);
      }
      
      openSet.push({
        x: nx,
        y: ny,
        g,
        h,
        f,
        parent: current,
        direction: dir.angle,
      });
    }
  }
  
  // No path found
  return null;
}

/**
 * Simplify path using line-of-sight - aggressively removes unnecessary waypoints
 * Only keeps waypoints that are necessary to avoid walls
 */
function simplifyFinePath(path: PathPoint[], maze: Maze, blockedCells: Set<string>): PathPoint[] {
  if (path.length <= 2) return path;
  
  const simplified: PathPoint[] = [path[0]];
  let currentIdx = 0;
  
  while (currentIdx < path.length - 1) {
    const current = path[currentIdx];
    
    // Look ahead to find the furthest point we can reach directly
    let furthestVisible = currentIdx + 1;
    
    for (let lookAhead = path.length - 1; lookAhead > currentIdx + 1; lookAhead--) {
      const target = path[lookAhead];
      if (hasLineOfSightInternal(maze, current.x, current.y, target.x, target.y, blockedCells)) {
        furthestVisible = lookAhead;
        break;
      }
    }
    
    // Add the furthest visible point (unless it's the last point, which we add at the end)
    if (furthestVisible < path.length - 1) {
      simplified.push(path[furthestVisible]);
    }
    currentIdx = furthestVisible;
  }
  
  // Always add the last point
  simplified.push(path[path.length - 1]);
  
  return simplified;
}

/**
 * Internal line-of-sight check that uses the same blocked cells set
 */
function hasLineOfSightInternal(
  maze: Maze,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  blockedCells: Set<string>,
  checkRadius: number = 0.35
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 0.1) return true;
  
  // Check along the line at regular intervals
  const steps = Math.ceil(dist * 4); // Check every ~0.25 units
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = fromX + dx * t;
    const y = fromY + dy * t;
    
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    // Check center
    if (isWall(maze, gridX, gridY)) return false;
    if (blockedCells.has(`${gridX},${gridY}`)) return false;
    
    // Check adjacent cells if close to edge (for radius clearance)
    const cellX = x - gridX;
    const cellY = y - gridY;
    
    if (cellX < checkRadius) {
      if (isWall(maze, gridX - 1, gridY)) return false;
      if (blockedCells.has(`${gridX - 1},${gridY}`)) return false;
    }
    if (cellX > 1 - checkRadius) {
      if (isWall(maze, gridX + 1, gridY)) return false;
      if (blockedCells.has(`${gridX + 1},${gridY}`)) return false;
    }
    if (cellY < checkRadius) {
      if (isWall(maze, gridX, gridY - 1)) return false;
      if (blockedCells.has(`${gridX},${gridY - 1}`)) return false;
    }
    if (cellY > 1 - checkRadius) {
      if (isWall(maze, gridX, gridY + 1)) return false;
      if (blockedCells.has(`${gridX},${gridY + 1}`)) return false;
    }
  }
  
  return true;
}

/**
 * Legacy simplifyPath - kept for compatibility but delegates to new system
 */
export function simplifyPath(path: PathPoint[]): PathPoint[] {
  // The new findPath already returns simplified paths
  return path;
}

/**
 * Check if a point is reachable from current position without hitting walls
 * Uses simple line-of-sight check
 */
export function hasLineOfSight(
  maze: Maze,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  checkRadius: number = 0.3
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 0.1) return true;
  
  // Check along the line at regular intervals
  const steps = Math.ceil(dist * 3); // Check every ~0.33 units
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = fromX + dx * t;
    const y = fromY + dy * t;
    
    // Check if this point is in a wall (with radius)
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    
    if (isWall(maze, gridX, gridY)) return false;
    
    // Check adjacent cells if close to edge
    const cellX = x - gridX;
    const cellY = y - gridY;
    
    if (cellX < checkRadius && isWall(maze, gridX - 1, gridY)) return false;
    if (cellX > 1 - checkRadius && isWall(maze, gridX + 1, gridY)) return false;
    if (cellY < checkRadius && isWall(maze, gridY, gridY - 1)) return false;
    if (cellY > 1 - checkRadius && isWall(maze, gridX, gridY + 1)) return false;
  }
  
  return true;
}
