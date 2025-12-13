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
