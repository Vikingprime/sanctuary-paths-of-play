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
  radius?: number; // defaults to 0.5 (blocks entire cell)
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

/**
 * Check if a fine-grid position is blocked (wall or character)
 */
function isPositionBlocked(
  maze: Maze,
  fineX: number,
  fineY: number,
  blockedCells: Set<string>,
  playerRadius: number = 0.35
): boolean {
  // Convert fine grid to world coords
  const worldX = fineX * GRID_RESOLUTION;
  const worldY = fineY * GRID_RESOLUTION;
  
  // Check if center is in wall
  const gridX = Math.floor(worldX);
  const gridY = Math.floor(worldY);
  if (isWall(maze, gridX, gridY)) return true;
  if (blockedCells.has(`${gridX},${gridY}`)) return true;
  
  // Check radius clearance from walls
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
    if (blockedCells.has(`${ptGridX},${ptGridY}`)) return true;
  }
  
  return false;
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
  
  // Build set of blocked cells from characters/towers
  const blockedCells = new Set<string>();
  if (blockedPositions) {
    for (const pos of blockedPositions) {
      const cellX = Math.floor(pos.x);
      const cellY = Math.floor(pos.y);
      blockedCells.add(`${cellX},${cellY}`);
    }
  }
  
  // Quick check: if goal is blocked, no path possible
  if (isPositionBlocked(maze, goalFineX, goalFineY, blockedCells)) {
    return null;
  }
  
  // If start equals goal (within tolerance), return single point
  const distToGoal = Math.sqrt(
    Math.pow((startFineX - goalFineX) * GRID_RESOLUTION, 2) +
    Math.pow((startFineY - goalFineY) * GRID_RESOLUTION, 2)
  );
  if (distToGoal < 0.3) {
    return [{ x: goalX, y: goalY }];
  }
  
  const openSet: PathNode[] = [];
  const closedSet = new Set<string>();
  const nodeScores = new Map<string, number>(); // Track best g score per node
  
  const heuristic = (x: number, y: number): number => {
    // Euclidean distance (better for 8-dir movement)
    const dx = (x - goalFineX) * GRID_RESOLUTION;
    const dy = (y - goalFineY) * GRID_RESOLUTION;
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
    const distToGoalNow = Math.abs(current.x - goalFineX) + Math.abs(current.y - goalFineY);
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
      
      // Replace last point with exact goal position
      if (rawPath.length > 0) {
        rawPath[rawPath.length - 1] = { x: goalX, y: goalY };
      }
      
      // Simplify the path to reduce waypoints while keeping smooth turns
      return simplifyFinePath(rawPath);
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
      
      // Skip if blocked
      if (isPositionBlocked(maze, nx, ny, blockedCells)) continue;
      
      // For diagonal movement, check that both adjacent cells are clear
      if (dir.dx !== 0 && dir.dy !== 0) {
        if (isPositionBlocked(maze, current.x + dir.dx, current.y, blockedCells)) continue;
        if (isPositionBlocked(maze, current.x, current.y + dir.dy, blockedCells)) continue;
      }
      
      // Calculate movement cost (diagonal costs more)
      const moveCost = (dir.dx !== 0 && dir.dy !== 0) 
        ? GRID_RESOLUTION * 1.414 
        : GRID_RESOLUTION;
      
      // Add turn cost to prefer straighter paths
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
 * Simplify fine-grained path by removing unnecessary intermediate points
 * Keeps only points where direction changes significantly
 */
function simplifyFinePath(path: PathPoint[]): PathPoint[] {
  if (path.length <= 2) return path;
  
  const simplified: PathPoint[] = [path[0]];
  const MIN_ANGLE_CHANGE = 20 * (Math.PI / 180); // 20 degrees
  const MIN_DISTANCE = 0.4; // Minimum distance between waypoints
  
  let lastAddedIdx = 0;
  let lastDirection: number | null = null;
  
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[lastAddedIdx];
    const curr = path[i];
    const next = path[i + 1];
    
    // Calculate direction from prev to curr
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dir1 = Math.atan2(dx1, -dy1);
    
    // Calculate direction from curr to next
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const dir2 = Math.atan2(dx2, -dy2);
    
    // Calculate angle change
    let angleDiff = Math.abs(dir2 - dir1);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
    
    // Calculate distance from last added point
    const distFromLast = Math.sqrt(
      Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
    );
    
    // Add point if direction changes significantly AND we've traveled enough
    if (angleDiff > MIN_ANGLE_CHANGE && distFromLast >= MIN_DISTANCE) {
      simplified.push(curr);
      lastAddedIdx = i;
      lastDirection = dir2;
    }
  }
  
  // Always add the last point
  simplified.push(path[path.length - 1]);
  
  return simplified;
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
