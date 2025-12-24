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
    characters: [
      {
        id: 'sanctuary_sam',
        name: 'Sanctuary Sam',
        emoji: '🧑‍🌾',
        model: 'Farmer.glb',
        animation: 'wave',
        position: { x: 13, y: 14 },
      }
    ],
    dialogues: [
      {
        id: 'farmer_greeting_1',
        speaker: 'Sanctuary Sam',
        speakerEmoji: '👨‍🌾',
        message: "By Golly, I've been looking everywhere for you!",
        cells: [{ x: 12, y: 13 }, { x: 13, y: 13 }, { x: 12, y: 14 }, { x: 13, y: 14 }],
        speakerCharacterId: 'sanctuary_sam',
      },
    ],
    endConditions: {
      requiredDialogues: ['farmer_greeting_1'],
    },
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
    characters: [
      {
        id: 'sanctuary_sam',
        name: 'Sanctuary Sam',
        emoji: '🧑‍🌾',
        model: 'Farmer.glb',
        animation: 'wave',
        position: { x: 17, y: 13 },
      }
    ],
    dialogues: [
      {
        id: 'farmer_greeting_2',
        speaker: 'Sanctuary Sam',
        speakerEmoji: '👨‍🌾',
        message: "By Golly, I've been looking everywhere for you!",
        cells: [{ x: 16, y: 12 }, { x: 17, y: 12 }, { x: 16, y: 13 }, { x: 17, y: 13 }],
        speakerCharacterId: 'sanctuary_sam',
      },
    ],
    endConditions: {
      requiredDialogues: ['farmer_greeting_2'],
    },
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
    characters: [
      {
        id: 'sanctuary_sam',
        name: 'Sanctuary Sam',
        emoji: '🧑‍🌾',
        model: 'Farmer.glb',
        animation: 'wave',
        position: { x: 27, y: 35 },
      }
    ],
    dialogues: [
      {
        id: 'farmer_greeting_3',
        speaker: 'Sanctuary Sam',
        speakerEmoji: '👨‍🌾',
        message: "By Golly, I've been looking everywhere for you!",
        cells: [{ x: 26, y: 34 }, { x: 27, y: 34 }, { x: 26, y: 35 }, { x: 27, y: 35 }],
        speakerCharacterId: 'sanctuary_sam',
      },
    ],
    endConditions: {
      requiredDialogues: ['farmer_greeting_3'],
    },
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
    currencyCost: 100,
    characters: [
      {
        id: 'sanctuary_sam',
        name: 'Sanctuary Sam',
        emoji: '🧑‍🌾',
        model: 'Farmer.glb',
        animation: 'wave',
        position: { x: 11, y: 13 },
      }
    ],
    dialogues: [
      {
        id: 'farmer_greeting_4',
        speaker: 'Sanctuary Sam',
        speakerEmoji: '👨‍🌾',
        message: "By Golly, I've been looking everywhere for you!",
        cells: [{ x: 11, y: 13 }],
        speakerCharacterId: 'sanctuary_sam',
      },
    ],
    endConditions: {
      requiredDialogues: ['farmer_greeting_4'],
    },
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
  {
    id: 5,
    name: 'Stella',
    difficulty: 'easy',
    timeLimit: 60,
    previewTime: 5,
    medalTimes: { gold: 15, silver: 25, bronze: 40 },
    characters: [
      {
        id: 'sanctuary_sam',
        name: 'Sanctuary Sam',
        emoji: '🧑‍🌾',
        model: 'Farmer.glb',
        animation: 'wave',
        position: { x: 5, y: 6 },
      }
    ],
    dialogues: [
      {
        id: 'dialogue_stella_1',
        speaker: 'Sanctuary Stella',
        speakerEmoji: '👩‍🌾',
        message: 'Hello there!',
        cells: [{ x: 11, y: 2 }, { x: 10, y: 2 }, { x: 11, y: 3 }, { x: 10, y: 3 }],
        speakerPosition: { x: 12, y: 2 },
        characterModel: 'Animated_Woman.glb',
        characterAnimation: 'idle',
      },
      {
        id: 'dialogue_stella_2',
        speaker: 'Sanctuary Stella',
        speakerEmoji: '👩‍🌾',
        message: 'Find Sanctuary Sam!',
        cells: [],
        characterAnimation: 'celebrate',
        requires: ['dialogue_stella_1'],
      },
      {
        id: 'sam_greeting_5',
        speaker: 'Sanctuary Sam',
        speakerEmoji: '👨‍🌾',
        message: "By Golly, I've been looking everywhere for you!",
        cells: [{ x: 4, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 7 }, { x: 5, y: 7 }],
        speakerCharacterId: 'sanctuary_sam',
      }
    ],
    endConditions: {
      requiredDialogues: ['dialogue_stella_1', 'dialogue_stella_2', 'sam_greeting_5'],
    },
    grid: createGrid([
      '################',
      '################',
      '##S       H   ##',
      '##            ##',
      '########  #   ##',
      '##     #  #   ##',
      '##  EE #  #   ##',
      '##  ####  #   ##',
      '##  #     #   ##',
      '##  #     #   ##',
      '##  #  ####   ##',
      '##  #  #      ##',
      '##  #  #      ##',
      '##     #     P##',
      '################',
      '################',
    ]),
  },
  {
    id: 6,
    name: 'Soda Pop',
    difficulty: 'easy',
    timeLimit: 60,
    previewTime: 5,
    medalTimes: { gold: 15, silver: 25, bronze: 40 },
    characters: [
      {
        id: 'char_stella',
        name: 'Sanctuary Stella',
        emoji: '🧑',
        model: 'Animated_Woman.glb',
        animation: 'idle',
        position: { x: 13, y: 2 },
      },
      {
        id: 'sanctuary_sam',
        name: 'Sanctuary Sam',
        emoji: '🧑‍🌾',
        model: 'Farmer.glb',
        animation: 'wave',
        position: { x: 10, y: 12 },
      }
    ],
    // Intro sequence - plays before the maze starts
    introDialogues: [
      {
        characterId: 'char_stella',
        speaker: 'Sanctuary Stella',
        speakerEmoji: '👩‍🌾',
        message: "Welcome to Foggy Farm! I'm Sanctuary Stella, and I help take care of all the animals here.",
      },
      {
        characterId: 'sanctuary_sam',
        speaker: 'Sanctuary Sam',
        speakerEmoji: '👨‍🌾',
        message: "And I'm Sanctuary Sam! We've got a bit of a corn maze situation here...",
      },
      {
        characterId: 'char_stella',
        speaker: 'Sanctuary Stella',
        speakerEmoji: '👩‍🌾',
        message: "Your job is to navigate through the maze and find Sam. Good luck!",
      },
    ],
    dialogues: [
      {
        id: 'stella_greeting',
        speaker: 'Sanctuary Stella',
        speakerEmoji: '🧑',
        message: 'Say hi to Sanctuary Sam for me!',
        cells: [{ x: 12, y: 2 }, { x: 13, y: 2 }, { x: 13, y: 3 }, { x: 12, y: 3 }],
        speakerCharacterId: 'char_stella',
        characterAnimation: 'idle',
      },
      {
        id: 'sam_greeting',
        speaker: 'Sanctuary Sam',
        speakerEmoji: '👨‍🌾',
        message: 'By Golly!',
        messages: [
          { speaker: 'Sanctuary Sam', speakerEmoji: '👨‍🌾', message: "I've been looking for you!" }
        ],
        cells: [{ x: 9, y: 11 }, { x: 10, y: 11 }, { x: 10, y: 12 }, { x: 9, y: 12 }],
        speakerCharacterId: 'sanctuary_sam',
        characterAnimation: 'idle',
      },
    ],
    endConditions: {
      requiredDialogues: ['sam_greeting'],
    },
    grid: createGrid([
      '################',
      '################',
      '##SS          ##',
      '##SS          ##',
      '############  ##',
      '##         #  ##',
      '##         #  ##',
      '##         #  ##',
      '##         #  ##',
      '##         #  ##',
      '##         #  ##',
      '##         #  ##',
      '##         #EE##',
      '##         #EE##',
      '################',
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
