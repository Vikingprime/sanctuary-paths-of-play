import { Maze, MazeCell } from '@/types/game';

// Helper to create a maze grid
const createGrid = (layout: string[]): MazeCell[][] => {
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

export const mazes: Maze[] = [
  {
    id: 1,
    name: 'Sunny Meadow',
    difficulty: 'easy',
    timeLimit: 30,
    previewTime: 5,
    grid: createGrid([
      '################',
      '################',
      '##SS  ####    ##',
      '##    ####    ##',
      '##  ####      ##',
      '##  ####  ######',
      '##        ######',
      '##  ############',
      '##  ############',
      '##      P     ##',
      '##            ##',
      '######    ######',
      '######    ######',
      '##          EE##',
      '##          EE##',
      '################',
    ]),
  },
  {
    id: 2,
    name: 'Cornfield Challenge',
    difficulty: 'medium',
    timeLimit: 45,
    previewTime: 6,
    grid: createGrid([
      '##################',
      '##################',
      '##SS    ####    ##',
      '##      ####    ##',
      '####  ##    ##  ##',
      '####  ##    ##  ##',
      '##    ##  H ##  ##',
      '##    ##    ##  ##',
      '##  ######  ##  ##',
      '##  ######  ##  ##',
      '##      P       ##',
      '##              ##',
      '##############EE##',
      '##############EE##',
      '##################',
    ]),
  },
  {
    id: 3,
    name: 'Harvest Moon',
    difficulty: 'hard',
    timeLimit: 60,
    previewTime: 7,
    grid: createGrid([
      '######################',
      '######################',
      '##SS        ##      ##',
      '##          ##      ##',
      '##  ######  ##  ######',
      '##  ######  ##  ######',
      '##      H   ##      ##',
      '##          ##      ##',
      '##  ##########  ##  ##',
      '##  ##########  ##  ##',
      '##      P           ##',
      '##                  ##',
      '######  ######  ##  ##',
      '######  ######  ##  ##',
      '##          ##  ##  ##',
      '##          ##  ##  ##',
      '##  ######  ##      ##',
      '##  ######  ##      ##',
      '##          ##    EE##',
      '##          ##    EE##',
      '######################',
      '######################',
    ]),
  },
];

export const findStartPosition = (maze: Maze): { x: number; y: number } => {
  for (let y = 0; y < maze.grid.length; y++) {
    for (let x = 0; x < maze.grid[y].length; x++) {
      if (maze.grid[y][x].isStart) {
        return { x, y };
      }
    }
  }
  return { x: 1, y: 1 };
};
