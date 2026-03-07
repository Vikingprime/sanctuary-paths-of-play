import { Maze, MazeCell, DialogueTrigger, MazeCharacter } from '@/types/game';
import { Quest, StoryChapter, StoryCharacter, QuestDialogueAction } from '@/types/quest';

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
      isBerry: cell === 'B', // Berry collectible
      powerUpType: cell === 'P' ? 'time' : undefined,
    }))
  );
};

// Extended dialogue type for story mode
export interface StoryDialogue extends DialogueTrigger {
  questAction?: QuestDialogueAction;
  questActions?: QuestDialogueAction[]; // Multiple actions for a single dialogue
}

// Story mode specific maze with quest data
export interface StoryMaze extends Omit<Maze, 'dialogues'> {
  storyCharacters: StoryCharacter[]; // Characters hidden from preview
  dialogues: StoryDialogue[];
  quest: Quest;
  chapterId: string; // Which chapter this maze belongs to
}

// === CHAPTER 1: The Missing Ring (Find Remy) ===
const chapter1Maze: StoryMaze = {
  id: 101,
  name: "The Missing Ring",
  chapterId: 'chapter_1',
  difficulty: 'easy',
  timeLimit: 180,
  timerDisabled: true,
  previewTime: 10,
  medalTimes: {
    gold: 15,
    silver: 25,
    bronze: 40,
  },
  characters: [
    {
      id: 'remy_rat',
      name: 'Remy',
      emoji: '🐀',
      model: 'Rat.glb',
      animation: 'idle',
      position: { x: 13, y: 13 },
      dialogueSequence: [{ type: 'normal', id: 'dialogue_1771794526007' }],
    },
    {
      id: 'char_1771794423842',
      name: 'Stella',
      emoji: '👩‍🌾',
      model: 'Animated_Woman.glb',
      animation: 'idle',
      position: { x: 2, y: 13 },
      dialogueSequence: [{ type: 'normal', id: 'dialogue_1771794532112' }],
    },
  ],
  storyCharacters: [],
  quest: {
    id: 'quest_ch1_missing_ring',
    title: 'The Missing Wedding Ring',
    description: "Sanctuary Sam lost his wedding ring! Help him find clues.",
    objectives: [
      {
        id: 'talk_stella',
        type: 'talk_to',
        description: 'Talk to Stella',
        targetCharacterId: 'char_1771794423842',
        completed: false,
        hidden: false,
      },
      {
        id: 'find_remy',
        type: 'talk_to',
        description: 'Find Remy the Rat',
        targetCharacterId: 'remy_rat',
        completed: false,
        hidden: false,
      },
    ],
    rewards: { stars: 10, medal: true },
    nextQuestId: 'quest_ch2_cousin_riddle',
  },
  dialogues: [
    {
      id: 'dialogue_1771794526007',
      speaker: 'Remy',
      speakerEmoji: '🐀',
      message: 'You made it! ',
      cells: [{ x: 12, y: 12 }, { x: 13, y: 12 }, { x: 13, y: 13 }, { x: 12, y: 13 }],
      speakerCharacterId: 'remy_rat',
      characterAnimation: 'idle',
      requires: ['dialogue_1771794532112'],
    },
    {
      id: 'dialogue_1771794532112',
      speaker: 'Stella',
      speakerEmoji: '👩‍🌾',
      message: 'Hello there!',
      cells: [{ x: 2, y: 12 }, { x: 3, y: 12 }, { x: 3, y: 13 }, { x: 2, y: 13 }],
      speakerCharacterId: 'char_1771794423842',
      characterAnimation: 'idle',
    },
  ],
  endConditions: {
    requiredDialogues: ['dialogue_1771794532112', 'dialogue_1771794526007'],
  },
  goalCharacterId: 'remy_rat',
  grid: createGrid([
    '##################',
    '##################',
    '##SS##############',
    '##SS##############',
    '##  ##############',
    '##  ##############',
    '##  ##############',
    '##  ##############',
    '##  ##############',
    '##  ##############',
    '##  ##############',
    '##  ##############',
    '##          EE####',
    '##          EE####',
    '##################',
    '##################',
  ]),
};

// === CHAPTER 2: The Cousin Riddle (Talk to Remy's 5 cousins - 3 in correct order) ===
// Riddle: "First, rendez-vous with the legend, a pet-turned escapee,
//          then, locate the athlete, the jumper,
//          finally, find the collector, the one that stores their treasures."
// Legend = Hamster (Nugget), Athlete = Kangaroo Rat (Bounce), Collector = Squirrel (Stash)
// Decoys: Rat-2 (Scuttle), Spiny Mouse (Bristle)
const chapter2Maze: StoryMaze = {
  id: 102,
  name: "The Cousin Riddle",
  chapterId: 'chapter_2',
  difficulty: 'medium',
  timeLimit: 300,
  timerDisabled: true,
  previewTime: 12,
  medalTimes: {
    gold: 15,
    silver: 25,
    bronze: 40,
  },
  deletedSpineBranches: [
    { start: { x: 371, y: 88 }, end: { x: 350, y: 109 } },
    { start: { x: 339, y: 110 }, end: { x: 339, y: 120 } },
    { start: { x: 350, y: 110 }, end: { x: 371, y: 131 } },
    { start: { x: 371, y: 168 }, end: { x: 349, y: 199 } },
    { start: { x: 350, y: 200 }, end: { x: 360, y: 200 } },
    { start: { x: 59, y: 209 }, end: { x: 28, y: 231 } },
    { start: { x: 79, y: 309 }, end: { x: 48, y: 331 } },
    { start: { x: 80, y: 310 }, end: { x: 80, y: 320 } },
  ],
  deletedSpineFineCells: [
    { x: 338, y: 109 }, { x: 339, y: 109 }, { x: 340, y: 109 }, { x: 341, y: 109 },
    { x: 342, y: 109 }, { x: 343, y: 109 }, { x: 344, y: 109 }, { x: 345, y: 109 },
    { x: 346, y: 109 }, { x: 347, y: 109 }, { x: 348, y: 109 }, { x: 349, y: 109 },
    { x: 49, y: 129 }, { x: 50, y: 129 }, { x: 51, y: 129 }, { x: 52, y: 129 },
    { x: 53, y: 129 }, { x: 54, y: 129 }, { x: 55, y: 129 }, { x: 56, y: 129 },
    { x: 57, y: 129 }, { x: 58, y: 129 }, { x: 59, y: 129 }, { x: 60, y: 129 },
    { x: 61, y: 129 }, { x: 62, y: 129 }, { x: 63, y: 129 }, { x: 64, y: 129 },
    { x: 48, y: 130 }, { x: 48, y: 131 }, { x: 47, y: 132 }, { x: 46, y: 133 },
    { x: 45, y: 134 }, { x: 44, y: 135 }, { x: 43, y: 136 }, { x: 42, y: 137 },
    { x: 41, y: 138 }, { x: 40, y: 139 }, { x: 39, y: 140 }, { x: 38, y: 141 },
    { x: 37, y: 142 }, { x: 36, y: 143 }, { x: 35, y: 144 }, { x: 34, y: 145 },
    { x: 33, y: 146 }, { x: 32, y: 147 }, { x: 31, y: 148 }, { x: 30, y: 149 },
    { x: 29, y: 150 }, { x: 28, y: 151 },
  ],
  characters: [
    {
      id: 'cousin_hamster',
      name: 'Nugget',
      emoji: '🐹',
      model: 'Hamster.glb',
      animation: 'idle',
      position: { x: 3, y: 15 },
    },
    {
      id: 'cousin_kangaroo',
      name: 'Bounce',
      emoji: '🐀',
      model: 'Kangaroo_rat.glb',
      animation: 'idle',
      position: { x: 17, y: 5 },
    },
    {
      id: 'cousin_squirrel',
      name: 'Stash',
      emoji: '🐿️',
      model: 'Squirrel.glb',
      animation: 'idle',
      position: { x: 17, y: 9 },
    },
    {
      id: 'cousin_rat2',
      name: 'Scuttle',
      emoji: '🐀',
      model: 'Rat-2.glb',
      animation: 'idle',
      position: { x: 2, y: 6 },
    },
    {
      id: 'cousin_spiny',
      name: 'Bristle',
      emoji: '🐁',
      model: 'Spiny_mouse.glb',
      animation: 'idle',
      position: { x: 2, y: 10 },
    },
  ],
  storyCharacters: [],
  quest: {
    id: 'quest_ch2_cousin_riddle',
    title: 'The Cousin Riddle',
    description: "Remy's five cousins are scattered through the maze. Solve the riddle to find the right three in order.",
    objectives: [
      {
        id: 'talk_hamster',
        type: 'talk_to',
        description: '1st: Find the legend, a pet-turned escapee',
        targetCharacterId: 'cousin_hamster',
        completed: false,
        hidden: false,
      },
      {
        id: 'talk_kangaroo',
        type: 'talk_to',
        description: '2nd: Locate the athlete, the jumper',
        targetCharacterId: 'cousin_kangaroo',
        completed: false,
        hidden: false,
      },
      {
        id: 'talk_squirrel',
        type: 'talk_to',
        description: '3rd: Find the collector, the one that stores their treasures',
        targetCharacterId: 'cousin_squirrel',
        completed: false,
        hidden: false,
      },
    ],
    rewards: { stars: 15, medal: true },
    nextQuestId: 'quest_ch3_skunk_trail',
    riddleHint: "\"First, rendez-vous with the legend, a pet-turned escapee,\nthen, locate the athlete, the jumper,\nfinally, find the collector, the one that stores their treasures.\"",
  },
  dialogues: [
    {
      id: 'scuttle_chat',
      speaker: 'Scuttle',
      speakerEmoji: '🐀',
      message: "Hey there! I'm Scuttle. I'm not part of any riddle, but I saw something shiny earlier...",
      cells: [{ x: 1, y: 5 }, { x: 1, y: 7 }, { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 2, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 7 }, { x: 3, y: 6 }, { x: 3, y: 5 }],
      speakerCharacterId: 'cousin_rat2',
    },
    {
      id: 'bristle_chat',
      speaker: 'Bristle',
      speakerEmoji: '🐁',
      message: "*prickles up* Oh! You startled me! I'm Bristle, the spiny mouse.",
      cells: [{ x: 1, y: 10 }, { x: 2, y: 10 }, { x: 3, y: 10 }, { x: 1, y: 11 }, { x: 2, y: 11 }, { x: 3, y: 11 }, { x: 2, y: 9 }, { x: 3, y: 9 }, { x: 1, y: 9 }],
      speakerCharacterId: 'cousin_spiny',
    },
    {
      id: 'kangaroo_wrong',
      speaker: 'Bounce',
      speakerEmoji: '🐀',
      message: "*bouncing in place* Whoa there! You need to find the LEGEND first! The pet-turned-escapee!",
      cells: [{ x: 16, y: 5 }, { x: 17, y: 4 }, { x: 18, y: 4 }, { x: 18, y: 5 }, { x: 18, y: 6 }, { x: 17, y: 6 }, { x: 16, y: 6 }, { x: 17, y: 5 }, { x: 16, y: 4 }],
      speakerCharacterId: 'cousin_kangaroo',
      requiresNot: ['hamster_correct'],
    },
    {
      id: 'squirrel_wrong',
      speaker: 'Stash',
      speakerEmoji: '🐿️',
      message: "*busy sorting acorns* Not yet! You haven't solved the first two parts of the riddle!",
      cells: [{ x: 16, y: 8 }, { x: 17, y: 8 }, { x: 18, y: 8 }, { x: 16, y: 9 }, { x: 17, y: 9 }, { x: 18, y: 9 }, { x: 16, y: 10 }, { x: 17, y: 10 }, { x: 18, y: 10 }],
      speakerCharacterId: 'cousin_squirrel',
      requiresNot: ['kangaroo_correct'],
    },
    {
      id: 'hamster_correct',
      speaker: 'Nugget',
      speakerEmoji: '🐹',
      message: "*squeaks excitedly* You found me! I'm Nugget — the LEGEND!",
      cells: [{ x: 2, y: 14 }, { x: 3, y: 14 }, { x: 4, y: 14 }, { x: 2, y: 15 }, { x: 3, y: 15 }, { x: 4, y: 15 }, { x: 2, y: 16 }, { x: 3, y: 16 }, { x: 4, y: 16 }],
      speakerCharacterId: 'cousin_hamster',
      questAction: { type: 'complete_objective', objectiveId: 'talk_hamster' },
    },
    {
      id: 'kangaroo_correct',
      speaker: 'Bounce',
      speakerEmoji: '🐀',
      message: "*lands from a huge leap* Woah! You solved the first clue! I'm Bounce, the ATHLETE!",
      cells: [{ x: 16, y: 5 }, { x: 17, y: 4 }, { x: 18, y: 4 }, { x: 18, y: 5 }, { x: 18, y: 6 }, { x: 17, y: 6 }, { x: 16, y: 6 }, { x: 17, y: 5 }, { x: 16, y: 4 }],
      speakerCharacterId: 'cousin_kangaroo',
      requires: ['hamster_correct'],
      questAction: { type: 'complete_objective', objectiveId: 'talk_kangaroo' },
    },
    {
      id: 'squirrel_correct',
      speaker: 'Stash',
      speakerEmoji: '🐿️',
      message: "*surrounded by acorn piles* You made it! And in the right order too! I'm Stash!",
      cells: [{ x: 16, y: 8 }, { x: 17, y: 8 }, { x: 18, y: 8 }, { x: 16, y: 9 }, { x: 17, y: 9 }, { x: 18, y: 9 }, { x: 16, y: 10 }, { x: 17, y: 10 }, { x: 18, y: 10 }],
      speakerCharacterId: 'cousin_squirrel',
      requires: ['kangaroo_correct'],
      questAction: { type: 'complete_objective', objectiveId: 'talk_squirrel' },
    },
  ],
  endConditions: {
    requiredDialogues: ['hamster_correct', 'kangaroo_correct', 'squirrel_correct'],
  },
  grid: createGrid([
    '######################',
    '######################',
    '##SS          ########',
    '##            ########',
    '####  ######       ###',
    '#     ######       ###',
    '#             ##   ###',
    '#             ########',
    '######    ######   ###',
    '#   ##    ######   ###',
    '#             ##   ###',
    '#             ##  ####',
    '####    ####  ##  ####',
    '####    ####  ##  ####',
    '##        ##      ####',
    '##        ##      ####',
    '##   #################',
    '######################',
  ]),
};

// === CHAPTER 3: The Skunk Trail (Placeholder - smell trail to find skunk) ===
const chapter3Maze: StoryMaze = {
  id: 103,
  name: "The Skunk's Alibi",
  chapterId: 'chapter_3',
  difficulty: 'medium',
  timeLimit: 200,
  previewTime: 10,
  medalTimes: {
    gold: 70,
    silver: 100,
    bronze: 150,
  },
  characters: [],
  storyCharacters: [
    {
      id: 'skunk_suspect',
      name: 'Pepper',
      emoji: '🦨',
      model: 'Pig.glb', // Placeholder until we have Skunk model
      animation: 'idle',
      position: { x: 14, y: 12 },
      hiddenFromPreview: true,
      questRelevant: 'find_skunk',
    },
  ],
  quest: {
    id: 'quest_ch3_skunk_trail',
    title: "The Skunk's Alibi",
    description: "Follow the trail to find the skunk who was seen near the farmhouse.",
    objectives: [
      {
        id: 'find_skunk',
        type: 'talk_to',
        description: 'Find and talk to the skunk (follow the smell trail - coming soon!)',
        targetCharacterId: 'skunk_suspect',
        completed: false,
        hidden: true,
      },
    ],
    rewards: { stars: 15, medal: true },
    // Hint for future smell trail feature
    trailHint: "Look for patches of green fog to follow the skunk's trail...",
  },
  dialogues: [
    {
      id: 'skunk_encounter',
      speaker: 'Pepper the Skunk',
      speakerEmoji: '🦨',
      message: "*sniff sniff* Oh! A visitor! Don't worry, I won't spray unless startled!",
      messages: [
        {
          speaker: 'You',
          speakerEmoji: '🗣️',
          message: "The rats said you were near the farmhouse the night Sam's ring went missing...",
        },
        {
          speaker: 'Pepper the Skunk',
          speakerEmoji: '🦨',
          message: "Me?! I would never steal anything! I was just... looking for grubs!",
        },
        {
          speaker: 'Pepper the Skunk',
          speakerEmoji: '😅',
          message: "Okay, okay... I DID see something shiny near the old oak tree...",
        },
        {
          speaker: 'Pepper the Skunk',
          speakerEmoji: '🦨',
          message: "But a CROW swooped down and took it before I could get closer!",
        },
        {
          speaker: 'Pepper the Skunk',
          speakerEmoji: '🦨',
          message: "The crow flew toward the tall silo. That's probably where it took the ring!",
        },
      ],
      cells: [{ x: 13, y: 12 }, { x: 14, y: 12 }, { x: 14, y: 13 }, { x: 15, y: 12 }],
      speakerCharacterId: 'skunk_suspect',
      questAction: { type: 'complete_objective', objectiveId: 'find_skunk' },
    },
  ],
  endConditions: {
    requiredDialogues: ['skunk_encounter'],
  },
  grid: createGrid([
    '##################',
    '##################',
    '##SS        ######',
    '##          ######',
    '####  ##        ##',
    '####  ##        ##',
    '##        ####  ##',
    '##        ####  ##',
    '##  ####        ##',
    '##  ####        ##',
    '####        ##  ##',
    '####        ##  ##',
    '##          ##EE##',
    '##          ##EE##',
    '##################',
    '##################',
  ]),
};

// === CHAPTER 4: Berry Picking (Fetch a berry, avoid the sparrow watcher) ===
const chapter4BerryFetch: StoryMaze = {
  id: 104,
  name: "Berry Picking",
  chapterId: 'berry_fetch',
  difficulty: 'easy',
  timeLimit: 120,
  timerDisabled: true,
  previewTime: 10,
  medalTimes: {
    gold: 30,
    silver: 50,
    bronze: 80,
  },
  characters: [
    {
      id: 'berry_bush',
      name: 'Berry Bush',
      emoji: '🫐',
      model: 'Bush_with_Berries.glb',
      animation: 'idle',
      position: { x: 8, y: 2 },
    },
    {
      id: 'sparrow_watcher',
      name: 'Sparrow',
      emoji: '🐦',
      model: 'Sparrow.glb',
      animation: 'idle',
      position: { x: 3, y: 3 },
      alwaysFacePlayer: false,
      visionDialogueId: 'sparrow_caught',
      // Looks north (across corridor toward berries) then south (away)
      directionalVision: {
        north: { cells: [
          { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
          { dx: -1, dy: -2 }, { dx: 0, dy: -2 }, { dx: 1, dy: -2 },
          { dx: 0, dy: -3 },
        ]},
        south: { cells: [
          { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
          { dx: -1, dy: 2 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 },
        ]},
      },
      turning: {
        pattern: 'ping-pong',
        directions: ['north', 'south'],
        intervalMs: 3000,
        initialDirection: 'north',
      },
    },
  ],
  storyCharacters: [],
  quest: {
    id: 'quest_ch4_berry_fetch',
    title: 'Berry Picking',
    description: 'Grab a berry from the bush and sneak back — don\'t let the sparrow see you!',
    objectives: [
      {
        id: 'reach_bush',
        type: 'talk_to',
        description: 'Reach the berry bush',
        targetCharacterId: 'berry_bush',
        completed: false,
      },
      {
        id: 'return_berry',
        type: 'reach',
        description: 'Bring the berry back to the start',
        targetPosition: { x: 1, y: 1 },
        completed: false,
        hidden: true,
      },
    ],
    rewards: { stars: 10, medal: true },
  },
  dialogues: [
    {
      id: 'sparrow_caught',
      speaker: 'Sparrow',
      speakerEmoji: '🐦',
      message: "CHEEP CHEEP! Get away from my berries!",
      cells: [],
      speakerCharacterId: 'sparrow_watcher',
      effect: 'game_over',
    },
    {
      id: 'bush_found',
      speaker: 'You',
      speakerEmoji: '🐀',
      message: "Found the berry bush! Let me grab some berries...",
      messages: [
        {
          speaker: 'You',
          speakerEmoji: '🐀',
          message: "Got them! Now I need to sneak back without the sparrow spotting me!",
        },
      ],
      cells: [
        { x: 7, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 1 },
      ],
      speakerCharacterId: 'berry_bush',
      questAction: { type: 'complete_objective', objectiveId: 'reach_bush' },
      questActions: [
        { type: 'complete_objective', objectiveId: 'reach_bush' },
        { type: 'grant_item', itemType: 'berry', itemCount: 1 },
      ],
    },
  ],
  goalCharacterId: undefined,
  endConditions: {
    requiredDialogues: ['bush_found'],
  },
  // Open room — sparrow in middle, berry bush top-right
  grid: createGrid([
    '###########',
    '#SE      ##',
    '#       B #',
    '#   O     #',
    '#         #',
    '###########',
  ]),
};

// All story mazes
export const storyMazes: StoryMaze[] = [
  chapter1Maze,
  chapter2Maze,
  chapter3Maze,
  chapter4BerryFetch,
];

// Story chapters
export const storyChapters: StoryChapter[] = [
  {
    id: 'chapter_1',
    title: 'Chapter 1: The Mystery Begins',
    description: "Sanctuary Sam lost his wedding ring. Find Remy the Rat for clues.",
    quests: [chapter1Maze.quest],
    mazeId: 101,
  },
  {
    id: 'chapter_2',
    title: 'Chapter 2: The Cousin Riddle',
    description: "Talk to Remy's cousins in the correct order to learn who took the ring.",
    quests: [chapter2Maze.quest],
    mazeId: 102,
    unlockCondition: {
      chapterId: 'chapter_1',
      questId: 'quest_ch1_missing_ring',
    },
  },
  {
    id: 'chapter_3',
    title: 'Chapter 3: The Skunk Trail',
    description: "Follow the trail to find the skunk who was spotted that night.",
    quests: [chapter3Maze.quest],
    mazeId: 103,
    unlockCondition: {
      chapterId: 'chapter_2',
      questId: 'quest_ch2_cousin_riddle',
    },
  },
  {
    id: 'berry_fetch',
    title: 'Berry Picking',
    description: "Fetch berries from the bush — but watch out for the sparrow!",
    quests: [chapter4BerryFetch.quest],
    mazeId: 104,
    unlockCondition: {
      chapterId: 'chapter_2',
      questId: 'quest_ch2_cousin_riddle',
    },
  },
];

// Helper to get a story maze by ID
export const getStoryMaze = (id: number): StoryMaze | undefined => {
  return storyMazes.find(m => m.id === id);
};

// Helper to get story maze for a chapter
export const getChapterMaze = (chapterId: string): StoryMaze | undefined => {
  return storyMazes.find(m => m.chapterId === chapterId);
};

// Helper to get all story mazes for a chapter
export const getChapterMazes = (chapterId: string): StoryMaze[] => {
  const chapter = storyChapters.find(c => c.id === chapterId);
  if (!chapter) return [];
  return storyMazes.filter(m => m.id === chapter.mazeId);
};

// Convert StoryMaze to regular Maze for game engine
export const storyMazeToMaze = (storyMaze: StoryMaze): Maze => {
  const allCharacters: MazeCharacter[] = [
    ...(storyMaze.characters || []),
    ...storyMaze.storyCharacters.map(sc => ({
      id: sc.id,
      name: sc.name,
      emoji: sc.emoji,
      model: sc.model,
      animation: sc.animation,
      position: sc.position,
      alwaysFacePlayer: true,
      dialogueSequence: sc.dialogueSequence,
    })),
  ];

  return {
    id: storyMaze.id,
    name: storyMaze.name,
    difficulty: storyMaze.difficulty,
    grid: storyMaze.grid,
    timeLimit: storyMaze.timeLimit,
    previewTime: storyMaze.previewTime,
    medalTimes: storyMaze.medalTimes,
    characters: allCharacters,
    dialogues: storyMaze.dialogues,
    endConditions: storyMaze.endConditions,
    freeMapAccess: storyMaze.freeMapAccess ?? true, // Default to true for story mazes
    deletedSpineBranches: storyMaze.deletedSpineBranches,
    deletedSpineFineCells: storyMaze.deletedSpineFineCells,
  };
};

// Get characters that should be shown on preview (not hidden)
export const getPreviewCharacters = (storyMaze: StoryMaze): MazeCharacter[] => {
  return storyMaze.characters || [];
};
