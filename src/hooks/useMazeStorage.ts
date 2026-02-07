import { useMemo } from 'react';
import { Maze, MazeCell } from '@/types/game';
import { mazes as defaultMazes } from '@/data/mazes';
import { storyMazes, storyMazeToMaze } from '@/data/storyMazes';

// Helper to create a maze grid from layout strings
export const createGrid = (layout: string[]): MazeCell[][] => {
  return layout.map((row, y) =>
    row.split('').map((cell, x) => ({
      x,
      y,
      isWall: cell === '#',
      isStart: cell === 'S',
      isEnd: cell === 'E',
      isPowerUp: cell === 'P',
      isStation: cell === 'H',
      isBerry: cell === 'B', // Berry collectible
      powerUpType: cell === 'P' ? 'time' : undefined,
      brand: cell === 'P' ? 'T-Mobile' : undefined,
    }))
  );
};

// Convert grid back to layout strings
export const gridToLayout = (grid: MazeCell[][]): string[] => {
  return grid.map(row =>
    row.map(cell => {
      if (cell.isWall) return '#';
      if (cell.isStart) return 'S';
      if (cell.isEnd) return 'E';
      if (cell.isPowerUp) return 'P';
      if (cell.isStation) return 'H';
      if (cell.isBerry) return 'B';
      return ' ';
    }).join('')
  );
};

// Difficulty order for sorting
const difficultyOrder: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export function useMazeStorage() {
  // Get all mazes sorted by difficulty, then by id (includes story mazes)
  const getAllMazes = useMemo(() => {
    return (includeStoryMazes = false): Maze[] => {
      const allMazes: Maze[] = [...defaultMazes];
      
      // Include story mazes if requested (for editor)
      if (includeStoryMazes) {
        storyMazes.forEach(sm => {
          allMazes.push(storyMazeToMaze(sm));
        });
      }
      
      return allMazes.sort((a, b) => {
        const diffA = difficultyOrder[a.difficulty] || 99;
        const diffB = difficultyOrder[b.difficulty] || 99;
        if (diffA !== diffB) return diffA - diffB;
        return a.id - b.id;
      });
    };
  }, []);

  const getMaze = useMemo(() => {
    return (id: number): Maze | undefined => {
      // Check default mazes first
      const defaultMaze = defaultMazes.find(m => m.id === id);
      if (defaultMaze) return defaultMaze;
      
      // Check story mazes
      const storyMaze = storyMazes.find(m => m.id === id);
      if (storyMaze) return storyMazeToMaze(storyMaze);
      
      return undefined;
    };
  }, []);

  return {
    getAllMazes,
    getMaze,
    isLoaded: true,
  };
}
