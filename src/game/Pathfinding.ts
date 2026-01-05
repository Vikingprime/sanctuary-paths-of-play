/**
 * A* Pathfinding for click-to-move navigation
 * 
 * UNITY PORTABLE: Pure functions, no React/Three.js dependencies
 */

import { Maze } from '@/types/game';
import { isWall } from './MazeUtils';

export interface PathNode {
  x: number;
  y: number;
  g: number;  // Cost from start
  h: number;  // Heuristic to goal
  f: number;  // g + h
  parent: PathNode | null;
}

export interface PathPoint {
  x: number;
  y: number;
}

/**
 * Find path from start to goal using A* algorithm
 * Returns array of world positions (cell centers) or null if no path
 */
export function findPath(
  maze: Maze,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number
): PathPoint[] | null {
  // Convert world coords to grid coords
  const startGridX = Math.floor(startX);
  const startGridY = Math.floor(startY);
  const goalGridX = Math.floor(goalX);
  const goalGridY = Math.floor(goalY);
  
  // Quick check: if goal is a wall, no path possible
  if (isWall(maze, goalGridX, goalGridY)) {
    return null;
  }
  
  // If start equals goal, return single point
  if (startGridX === goalGridX && startGridY === goalGridY) {
    return [{ x: goalX, y: goalY }];
  }
  
  const openSet: PathNode[] = [];
  const closedSet = new Set<string>();
  
  const heuristic = (x: number, y: number): number => {
    // Manhattan distance
    return Math.abs(x - goalGridX) + Math.abs(y - goalGridY);
  };
  
  const nodeKey = (x: number, y: number): string => `${x},${y}`;
  
  // Start node
  const startNode: PathNode = {
    x: startGridX,
    y: startGridY,
    g: 0,
    h: heuristic(startGridX, startGridY),
    f: heuristic(startGridX, startGridY),
    parent: null,
  };
  openSet.push(startNode);
  
  // 4-directional movement (no diagonals for cleaner paths)
  const directions = [
    { dx: 0, dy: -1 },  // Up
    { dx: 0, dy: 1 },   // Down
    { dx: -1, dy: 0 },  // Left
    { dx: 1, dy: 0 },   // Right
  ];
  
  let iterations = 0;
  const maxIterations = 1000; // Prevent infinite loops
  
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
    
    // Check if we reached the goal
    if (current.x === goalGridX && current.y === goalGridY) {
      // Reconstruct path
      const path: PathPoint[] = [];
      let node: PathNode | null = current;
      
      while (node) {
        // Use cell center for smoother movement
        path.unshift({ x: node.x + 0.5, y: node.y + 0.5 });
        node = node.parent;
      }
      
      // Replace last point with exact goal position
      if (path.length > 0) {
        path[path.length - 1] = { x: goalX, y: goalY };
      }
      
      return path;
    }
    
    // Move current from open to closed
    openSet.splice(lowestIdx, 1);
    closedSet.add(nodeKey(current.x, current.y));
    
    // Check neighbors
    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const key = nodeKey(nx, ny);
      
      // Skip if already visited or is a wall
      if (closedSet.has(key)) continue;
      if (isWall(maze, nx, ny)) continue;
      
      const g = current.g + 1;
      const h = heuristic(nx, ny);
      const f = g + h;
      
      // Check if already in open set with better score
      const existingIdx = openSet.findIndex(n => n.x === nx && n.y === ny);
      if (existingIdx >= 0) {
        if (g < openSet[existingIdx].g) {
          // Found better path
          openSet[existingIdx].g = g;
          openSet[existingIdx].f = f;
          openSet[existingIdx].parent = current;
        }
      } else {
        // Add new node
        openSet.push({
          x: nx,
          y: ny,
          g,
          h,
          f,
          parent: current,
        });
      }
    }
  }
  
  // No path found
  return null;
}

/**
 * Simplify path by removing intermediate points on straight lines
 * Returns a more efficient path with only turn points
 */
export function simplifyPath(path: PathPoint[]): PathPoint[] {
  if (path.length <= 2) return path;
  
  const simplified: PathPoint[] = [path[0]];
  
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];
    
    // Check if direction changes
    const dx1 = Math.sign(curr.x - prev.x);
    const dy1 = Math.sign(curr.y - prev.y);
    const dx2 = Math.sign(next.x - curr.x);
    const dy2 = Math.sign(next.y - curr.y);
    
    if (dx1 !== dx2 || dy1 !== dy2) {
      simplified.push(curr);
    }
  }
  
  simplified.push(path[path.length - 1]);
  return simplified;
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
