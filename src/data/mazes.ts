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
    medalTimes: {
      gold: 15,
      silver: 20,
      bronze: 25,
    },
    // No unlock conditions - always available
    grid: createGrid([
      '################',
      '################',
      '##SS  ####    ##',
      '##    ####  P ##',
      '##  ####      ##',
      '##  ####  ######',
      '##        ######',
      '##  ############',
      '##  ############',
      '##            ##',
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
    medalTimes: {
      gold: 25,
      silver: 32,
      bronze: 40,
    },
    unlockConditions: [
      { mazeId: 1, requiredMedal: 'bronze' },
    ],
    grid: createGrid([
      '##################',
      '##################',
      '##SS    ####    ##',
      '##      ####    ##',
      '####  ##    ##P ##',
      '####  ##    ##  ##',
      '##    ##  H ##  ##',
      '##    ##    ##  ##',
      '##  ######  ##  ##',
      '##  ######  ##  ##',
      '##              ##',
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
    timeLimit: 90,
    previewTime: 8,
    medalTimes: {
      gold: 50,
      silver: 65,
      bronze: 80,
    },
    unlockConditions: [
      { mazeId: 2, requiredMedal: 'silver' },
    ],
    grid: createGrid([
      '##############################',
      '##############################',
      '##SS      ##      ##        ##',
      '##        ##      ##        ##',
      '##  ####  ##  ##  ######  ####',
      '##  ####  ##  ##  ######  ####',
      '##  ##        ##      ##    ##',
      '##  ##        ##      ##    ##',
      '##  ######  ######  ##  ##  ##',
      '##  ######  ######  ##  ##  ##',
      '##      ##      ##  ##  ##  ##',
      '##      ##      ##  ##  ##  ##',
      '####  ######  ####  ##  ######',
      '####  ######  ####  ##  ######',
      '##        ##    ##  ##      ##',
      '##        ##    ##  ##    P ##',
      '##  ####  ##  ####  ######  ##',
      '##  ####  ##  ####  ######  ##',
      '##  ##    ##  ##        ##  ##',
      '##  ##    ##  ##        ##  ##',
      '##  ##  ####  ####  ##  ##  ##',
      '##  ##  ####  ####  ##  ##  ##',
      '##  ##      H     ####  ##  ##',
      '##  ##            ####  ##  ##',
      '##  ##########  ##      ##  ##',
      '##  ##########  ##      ##  ##',
      '##          ##  ##  ######  ##',
      '##          ##  ##  ######  ##',
      '######  ##  ##  ##      ##  ##',
      '######  ##  ##  ##      ##  ##',
      '##      ##      ######  ##  ##',
      '##      ##      ######  ##  ##',
      '##  ##########      ##      ##',
      '##  ##########      ##      ##',
      '##              ##      ##EE##',
      '##              ##      ##EE##',
      '##############################',
      '##############################',
    ]),
  },
  {
    id: 4,
    name: 'New Maze',
    difficulty: 'easy',
    timeLimit: 60,
    previewTime: 5,
    medalTimes: {
      gold: 30,
      silver: 40,
      bronze: 50,
    },
    currencyCost: 100, // Special maze - costs currency to unlock
    grid: createGrid([
      '################',
      '##############P#',
      '##SS         # #',
      '##S#########   #',
      '## #   #     ###',
      '## # # # ##  ###',
      '##   # #     ###',
      '###### #####   #',
      '##     #     # #',
      '#P ##### ##### #',
      '##     #   #   #',
      '# #### ## ### ##',
      '#      #    # ##',
      '## ########E# ##',
      '##       P##  ##',
      '################',
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
