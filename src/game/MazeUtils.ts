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
 * Find the initial rotation for the player to face an open path
 * Returns rotation in radians
 * Priority: finds any direction that is NOT a wall
 * 
 * NOTE: The 3D scene applies transform: -rotation + π
 * So we need to account for that here:
 *   - To face +Z (down in grid, toward higher Y), we need rotation = π
 *   - To face -Z (up in grid, toward lower Y), we need rotation = 0
 *   - To face +X (right in grid), we need rotation = -π/2
 *   - To face -X (left in grid), we need rotation = π/2
 */
export function findStartRotation(maze: Maze): number {
  const startPos = findStartPosition(maze);
  const gridX = Math.floor(startPos.x);
  const gridY = Math.floor(startPos.y);
  
  // Directions mapped for the 3D scene's rotation transform (-rotation + π)
  // Priority order: right, down, left, up - prefer horizontal first as paths often go that way
  const directions = [
    { dx: 1, dy: 0, rotation: -Math.PI / 2 }, // Right in grid (facing +X in 3D)
    { dx: 0, dy: 1, rotation: Math.PI },      // Down in grid (facing +Z in 3D)
    { dx: -1, dy: 0, rotation: Math.PI / 2 }, // Left in grid (facing -X in 3D)
    { dx: 0, dy: -1, rotation: 0 },           // Up in grid (facing -Z in 3D)
  ];
  
  // Count walls in each direction to find the most open path
  const directionScores: { dir: typeof directions[0]; score: number }[] = [];
  
  for (const dir of directions) {
    let score = 0;
    // Check immediate neighbor
    const checkX = gridX + dir.dx;
    const checkY = gridY + dir.dy;
    const cell = getCell(maze, checkX, checkY);
    
    if (!cell || cell.isWall) {
      score = -100; // Wall immediately ahead - very bad
    } else if (cell.isStart) {
      score = -10; // Another start cell - not ideal
    } else {
      score = 10; // Open path - good
      
      // Bonus for path continuing further
      const cell2 = getCell(maze, gridX + dir.dx * 2, gridY + dir.dy * 2);
      if (cell2 && !cell2.isWall && !cell2.isStart) {
        score += 5;
      }
      
      // Penalty if perpendicular directions are walls (dead end feel)
      const perpDirs = dir.dx === 0 
        ? [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }] 
        : [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
      
      for (const perpDir of perpDirs) {
        const perpCell = getCell(maze, checkX + perpDir.dx, checkY + perpDir.dy);
        if (perpCell && !perpCell.isWall) {
          score += 2; // Bonus for having side paths
        }
      }
    }
    
    directionScores.push({ dir, score });
  }
  
  // Sort by score descending and pick best
  directionScores.sort((a, b) => b.score - a.score);
  
  // Only return if score is positive (valid path)
  if (directionScores[0].score > 0) {
    return directionScores[0].dir.rotation;
  }
  
  // Fallback: find any non-wall direction
  for (const dir of directions) {
    const checkX = gridX + dir.dx;
    const checkY = gridY + dir.dy;
    if (!isWall(maze, checkX, checkY)) {
      return dir.rotation;
    }
  }
  
  return Math.PI; // Default facing down if all directions are walls
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
