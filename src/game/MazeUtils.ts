/**
 * Maze Utilities - Pure functions for maze operations
 * 
 * UNITY PORTABLE: All functions are pure and stateless
 * Convert to static C# methods directly
 */

import { Maze, MazeCell } from '@/types/game';
import { GameConfig } from './GameConfig';

/**
 * Find the start position in a maze
 * Returns center of start cell in world units
 */
export function findStartPosition(maze: Maze): { x: number; y: number } {
  for (let y = 0; y < maze.grid.length; y++) {
    for (let x = 0; x < maze.grid[y].length; x++) {
      if (maze.grid[y][x].isStart) {
        return { 
          x: x + GameConfig.CELL_SIZE / 2, 
          y: y + GameConfig.CELL_SIZE / 2 
        };
      }
    }
  }
  return { x: 1.5, y: 1.5 }; // Fallback
}

/**
 * Core raycast function to find the most open direction from a position
 * Returns the raw angle (0 to 2π) of the best direction
 * 
 * @param maze - The maze to check walls against
 * @param posX - X position in world coordinates
 * @param posY - Y position in world coordinates  
 * @param checkDistance - How far to raycast (default 2.0 cells)
 * @returns Raw angle in radians (0 = +X, π/2 = +Z, π = -X, 3π/2 = -Z)
 */
export function findBestDirectionAngle(maze: Maze, posX: number, posY: number, checkDistance: number = 2.0): number {
  const numDirections = 24; // Every 15 degrees
  const stepSize = 0.1;
  
  let bestAngle = 0;
  let bestClearance = -1;
  
  for (let i = 0; i < numDirections; i++) {
    const angle = (i / numDirections) * Math.PI * 2; // 0 to 2π
    
    // Direction vector for this angle
    // angle 0 = facing +X, angle π/2 = facing +Z
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    
    // Find clearance in this direction
    let clearance = 0;
    for (let dist = stepSize; dist <= checkDistance; dist += stepSize) {
      const checkX = posX + dirX * dist;
      const checkZ = posY + dirZ * dist;
      
      const gridX = Math.floor(checkX);
      const gridZ = Math.floor(checkZ);
      
      if (isWall(maze, gridX, gridZ)) {
        break;
      }
      clearance = dist;
    }
    
    if (clearance > bestClearance) {
      bestClearance = clearance;
      bestAngle = angle;
    }
  }
  
  return bestAngle;
}

/**
 * Find the initial rotation for the player to face an open path
 * Returns rotation in radians (player rotation format)
 * 
 * In the 3D scene, the player group applies: rotation.y = -playerRotation + π
 * The model faces +Z by default.
 * 
 * After transform (-rotation + π), the model faces:
 *   rotation = 0      → model rotation = π     → faces +Z (down in grid)
 *   rotation = π      → model rotation = 0     → faces -Z (up in grid) 
 *   rotation = π/2    → model rotation = π/2   → faces -X (left in grid)
 *   rotation = -π/2   → model rotation = 3π/2  → faces +X (right in grid)
 * 
 * So to face a direction:
 *   - Face right (+X): rotation = -π/2
 *   - Face left (-X):  rotation = π/2
 *   - Face down (+Z):  rotation = 0
 *   - Face up (-Z):    rotation = π
 */
export function findStartRotation(maze: Maze): number {
  const startPos = findStartPosition(maze);
  const bestAngle = findBestDirectionAngle(maze, startPos.x, startPos.y, 1.5);
  
  // Convert angle to player rotation
  // Formula: playerRotation = π/2 - angle
  const playerRotation = Math.PI / 2 - bestAngle;
  
  return playerRotation;
}

/**
 * Find the best facing direction for any character at a given position
 * Returns rotation.y value to apply directly to a Three.js group (faces +Z by default)
 */
export function findBestFacingDirection(maze: Maze, posX: number, posY: number): number {
  const bestAngle = findBestDirectionAngle(maze, posX, posY, 2.0);
  
  // Convert to Three.js rotation.y
  // For Three.js group.rotation.y where model faces +Z:
  // rotation.y = -angle + π/2 makes model face the direction
  const rotationY = -bestAngle + Math.PI / 2;
  
  return rotationY;
}

/**
 * Find the end position in a maze
 */
export function findEndPosition(maze: Maze): { x: number; y: number } | null {
  for (let y = 0; y < maze.grid.length; y++) {
    for (let x = 0; x < maze.grid[y].length; x++) {
      if (maze.grid[y][x].isEnd) {
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Get cell at grid position (bounds-checked)
 */
export function getCell(maze: Maze, gridX: number, gridY: number): MazeCell | null {
  if (gridY < 0 || gridY >= maze.grid.length) return null;
  if (gridX < 0 || gridX >= maze.grid[0].length) return null;
  return maze.grid[gridY][gridX];
}

/**
 * Check if a grid position is a wall
 */
export function isWall(maze: Maze, gridX: number, gridY: number): boolean {
  const cell = getCell(maze, gridX, gridY);
  return cell === null || cell.isWall;
}

/**
 * Get all power-up positions in the maze
 */
export function getPowerUpPositions(maze: Maze): Array<{ x: number; y: number; type: string }> {
  const powerUps: Array<{ x: number; y: number; type: string }> = [];
  
  maze.grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.isPowerUp) {
        powerUps.push({ x, y, type: cell.powerUpType || 'time' });
      }
    });
  });
  
  return powerUps;
}

/**
 * Get all map station positions
 */
export function getStationPositions(maze: Maze): Array<{ x: number; y: number }> {
  const stations: Array<{ x: number; y: number }> = [];
  
  maze.grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.isStation) {
        stations.push({ x, y });
      }
    });
  });
  
  return stations;
}

/**
 * Parse a string layout into a maze grid
 * Legend: # = wall, S = start, E = end, P = power-up, H = help station, space = path
 */
export function parseMazeLayout(layout: string[]): MazeCell[][] {
  return layout.map((row, y) =>
    row.split('').map((cell, x) => ({
      x,
      y,
      isWall: cell === '#',
      isStart: cell === 'S',
      isEnd: cell === 'E',
      isPowerUp: cell === 'P',
      isStation: cell === 'H',
      powerUpType: cell === 'P' ? 'time' as const : undefined,
      brand: cell === 'P' ? 'T-Mobile' : undefined,
    }))
  );
}

/**
 * C# equivalent:
 * 
 * public static class MazeUtils
 * {
 *     public static Vector2 FindStartPosition(Maze maze) { ... }
 *     public static Vector2? FindEndPosition(Maze maze) { ... }
 *     public static MazeCell GetCell(Maze maze, int gridX, int gridY) { ... }
 *     public static bool IsWall(Maze maze, int gridX, int gridY) { ... }
 * }
 */
