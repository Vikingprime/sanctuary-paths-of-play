import { useMemo } from 'react';
import { Maze, MazeCell } from '@/types/game';
import { mazes as defaultMazes } from '@/data/mazes';

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
  // Get all mazes sorted by difficulty, then by id
  const getAllMazes = useMemo(() => {
    return (): Maze[] => {
      return [...defaultMazes].sort((a, b) => {
        const diffA = difficultyOrder[a.difficulty] || 99;
        const diffB = difficultyOrder[b.difficulty] || 99;
        if (diffA !== diffB) return diffA - diffB;
        return a.id - b.id;
      });
    };
  }, []);

  const getMaze = useMemo(() => {
    return (id: number): Maze | undefined => {
      return defaultMazes.find(m => m.id === id);
    };
  }, []);

  return {
    getAllMazes,
    getMaze,
    isLoaded: true,
  };
}
