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
  deletedSpineBranches: [
    { start: { x: 80, y: 60 }, end: { x: 169, y: 70 } },
  ],
  medalTimes: {
    gold: 15,
    silver: 25,
    bronze: 40,
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
      position: { x: 5, y: 3 },
      alwaysFacePlayer: false,
      visionDialogueId: 'sparrow_caught',
      coneVision: { range: 5, spreadPerCell: 1 },
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
    requireReturnToEnd: true, // Must walk back to start after grabbing berries
  },
  // Open room — sparrow in middle, berry bush top-right
  grid: createGrid([
    '###########',
    '#SE      ##',
    '#     #  ##',
    '#     #  ##',
    '#        ##',
    '###########',
  ]),
};

// === ACT 1 LEVEL 5: Berry Gauntlet (collect ALL berries, more watchers) ===
const chapter5BerryGauntlet: StoryMaze = {
  id: 105,
  name: "Berry Gauntlet",
  chapterId: 'berry_gauntlet',
  difficulty: 'medium',
  timeLimit: 300,
  timerDisabled: true,
  previewTime: 10,
  medalTimes: { gold: 60, silver: 90, bronze: 120 },
  characters: [
    { id: 'bush_1', name: 'Berry Bush', emoji: '🫐', model: 'Bush_with_Berries.glb', animation: 'idle', position: { x: 3, y: 2 } },
    { id: 'bush_2', name: 'Berry Bush', emoji: '🫐', model: 'Bush_with_Berries.glb', animation: 'idle', position: { x: 12, y: 4 } },
    { id: 'bush_3', name: 'Berry Bush', emoji: '🫐', model: 'Bush_with_Berries.glb', animation: 'idle', position: { x: 8, y: 10 } },
    { id: 'sparrow_g1', name: 'Sparrow', emoji: '🐦', model: 'Sparrow.glb', animation: 'idle', position: { x: 6, y: 3 }, visionDialogueId: 'sparrow_caught_g', coneVision: { range: 4, spreadPerCell: 1 }, turning: { pattern: 'ping-pong', directions: ['east', 'west'], intervalMs: 2500 } },
    { id: 'sparrow_g2', name: 'Sparrow', emoji: '🐦', model: 'Sparrow.glb', animation: 'idle', position: { x: 10, y: 7 }, visionDialogueId: 'sparrow_caught_g', coneVision: { range: 5, spreadPerCell: 1 }, turning: { pattern: 'ping-pong', directions: ['north', 'south'], intervalMs: 3000 } },
    { id: 'sparrow_g3', name: 'Sparrow', emoji: '🐦', model: 'Sparrow.glb', animation: 'idle', position: { x: 4, y: 8 }, visionDialogueId: 'sparrow_caught_g', coneVision: { range: 4, spreadPerCell: 1 }, turning: { pattern: 'ping-pong', directions: ['south', 'east'], intervalMs: 2800 } },
  ],
  storyCharacters: [],
  quest: { id: 'quest_berry_gauntlet', title: 'Berry Gauntlet', description: 'Collect ALL berries — more sparrows patrol this larger maze!', objectives: [
    { id: 'get_berry_1', type: 'talk_to', description: 'Get berries from bush #1', targetCharacterId: 'bush_1', completed: false },
    { id: 'get_berry_2', type: 'talk_to', description: 'Get berries from bush #2', targetCharacterId: 'bush_2', completed: false },
    { id: 'get_berry_3', type: 'talk_to', description: 'Get berries from bush #3', targetCharacterId: 'bush_3', completed: false },
  ], rewards: { stars: 15, medal: true } },
  dialogues: [
    { id: 'sparrow_caught_g', speaker: 'Sparrow', speakerEmoji: '🐦', message: "CHEEP! Those are MY berries!", cells: [], speakerCharacterId: 'sparrow_g1', effect: 'game_over' },
    { id: 'bush1_found', speaker: 'You', speakerEmoji: '🐀', message: "Got berries from this bush!", cells: [{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 1 }], speakerCharacterId: 'bush_1', questActions: [{ type: 'complete_objective', objectiveId: 'get_berry_1' }, { type: 'grant_item', itemType: 'berry', itemCount: 1 }] },
    { id: 'bush2_found', speaker: 'You', speakerEmoji: '🐀', message: "Another bush — grabbed the berries!", cells: [{ x: 12, y: 4 }, { x: 11, y: 4 }, { x: 12, y: 3 }], speakerCharacterId: 'bush_2', questActions: [{ type: 'complete_objective', objectiveId: 'get_berry_2' }, { type: 'grant_item', itemType: 'berry', itemCount: 1 }] },
    { id: 'bush3_found', speaker: 'You', speakerEmoji: '🐀', message: "Last bush — got all the berries!", cells: [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 8, y: 9 }], speakerCharacterId: 'bush_3', questActions: [{ type: 'complete_objective', objectiveId: 'get_berry_3' }, { type: 'grant_item', itemType: 'berry', itemCount: 1 }] },
  ],
  endConditions: { requiredDialogues: ['bush1_found', 'bush2_found', 'bush3_found'] },
  grid: createGrid([
    '################', '##SS        ####', '##   ##     ####', '##   ##   ######',
    '####      ######', '####  ##      ##', '##    ##      ##', '##        ##  ##',
    '######    ##  ##', '######        ##', '##        ######', '##    EE  ######', '################',
  ]),
};

// === ACT 1 LEVEL 6: Pumpkin Hunt (timed race) ===
const chapter6PumpkinHunt: StoryMaze = {
  id: 106, name: "The Pumpkin Race", chapterId: 'pumpkin_hunt', difficulty: 'medium',
  timeLimit: 90, timerDisabled: false, previewTime: 10, medalTimes: { gold: 40, silver: 60, bronze: 80 },
  characters: [
    { id: 'pumpkin', name: 'Pumpkin', emoji: '🎃', model: 'Bush_with_Berries.glb', animation: 'idle', position: { x: 14, y: 8 } },
    { id: 'horse_1', name: 'Horse', emoji: '🐴', model: 'Cow.glb', animation: 'idle', position: { x: 6, y: 4 }, patrol: { pattern: 'loop', waypoints: [{ x: 6, y: 4 }, { x: 6, y: 8 }, { x: 10, y: 8 }, { x: 10, y: 4 }], speedCellsPerSec: 1.5 } },
    { id: 'horse_2', name: 'Horse', emoji: '🐴', model: 'Cow.glb', animation: 'idle', position: { x: 12, y: 6 }, patrol: { pattern: 'loop', waypoints: [{ x: 12, y: 3 }, { x: 12, y: 9 }], speedCellsPerSec: 1.2 } },
  ],
  storyCharacters: [], quest: { id: 'quest_pumpkin_hunt', title: 'The Pumpkin Race', description: 'Find the pumpkin before time runs out!', objectives: [{ id: 'find_pumpkin', type: 'talk_to', description: 'Reach the pumpkin', targetCharacterId: 'pumpkin', completed: false }], rewards: { stars: 12, medal: true } },
  dialogues: [{ id: 'pumpkin_found', speaker: 'You', speakerEmoji: '🐷', message: "Found the pumpkin! 🎃 Perfect for the feast!", cells: [{ x: 13, y: 8 }, { x: 14, y: 8 }, { x: 14, y: 7 }], speakerCharacterId: 'pumpkin', questAction: { type: 'complete_objective', objectiveId: 'find_pumpkin' } }],
  endConditions: { requiredDialogues: ['pumpkin_found'] },
  grid: createGrid([
    '##################', '##SS          ####', '##    ####    ####', '##    ####      ##',
    '####        ##  ##', '####  ####  ##  ##', '##    ####      ##', '##          ##  ##',
    '####  ##        ##', '####  ##    ######', '##          ######', '##################',
  ]),
};

// === ACT 1 LEVEL 7: Llama Roadblock ===
const chapter7LlamaBlockade: StoryMaze = {
  id: 107, name: "Llama Roadblock", chapterId: 'llama_blockade', difficulty: 'medium',
  timeLimit: 200, timerDisabled: true, previewTime: 10, medalTimes: { gold: 60, silver: 90, bronze: 120 },
  characters: [
    { id: 'llama_1', name: 'Llama', emoji: '🦙', model: 'Cow.glb', animation: 'idle', position: { x: 5, y: 5 } },
    { id: 'llama_2', name: 'Llama', emoji: '🦙', model: 'Cow.glb', animation: 'idle', position: { x: 10, y: 7 } },
    { id: 'pumpkin_patch', name: 'Pumpkin Patch', emoji: '🎃', model: 'Bush_with_Berries.glb', animation: 'idle', position: { x: 14, y: 10 } },
  ],
  storyCharacters: [], quest: { id: 'quest_llama_blockade', title: 'Llama Roadblock', description: 'Convince the llamas to move and reach the pumpkin patch!', objectives: [
    { id: 'talk_llama', type: 'talk_to', description: 'Talk to the llama', targetCharacterId: 'llama_1', completed: false },
    { id: 'reach_pumpkins', type: 'talk_to', description: 'Reach the pumpkin patch', targetCharacterId: 'pumpkin_patch', completed: false },
  ], rewards: { stars: 12, medal: true } },
  dialogues: [
    { id: 'llama1_talk', speaker: 'Llama', speakerEmoji: '🦙', message: "*chews slowly* Fine, I'll move. Only because you said please.", cells: [{ x: 4, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 4 }, { x: 6, y: 5 }], speakerCharacterId: 'llama_1', questAction: { type: 'complete_objective', objectiveId: 'talk_llama' } },
    { id: 'patch_found', speaker: 'You', speakerEmoji: '🐷', message: "Found the pumpkin patch! 🎃", cells: [{ x: 13, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 9 }], speakerCharacterId: 'pumpkin_patch', requires: ['llama1_talk'], questAction: { type: 'complete_objective', objectiveId: 'reach_pumpkins' } },
  ],
  endConditions: { requiredDialogues: ['llama1_talk', 'patch_found'] },
  grid: createGrid([
    '##################', '##SS        ######', '##    ##    ######', '####  ##      ####',
    '####            ##', '##        ##    ##', '##    ##  ##  ####', '####  ##      ####',
    '####        ##  ##', '##    ####  ##  ##', '##    ####      ##', '##################',
  ]),
};

// === ACT 1 LEVEL 8: Rootbeer Cellar ===
const chapter8RootbeerCellar: StoryMaze = {
  id: 108, name: "Remy's Root Beer Run", chapterId: 'rootbeer_cellar', difficulty: 'medium',
  timeLimit: 200, timerDisabled: true, previewTime: 10, medalTimes: { gold: 50, silver: 80, bronze: 120 },
  characters: [
    { id: 'remy_cellar', name: 'Remy', emoji: '🐀', model: 'Rat.glb', animation: 'idle', position: { x: 2, y: 2 } },
    { id: 'rootbeer', name: 'Root Beer', emoji: '🍺', model: 'Log.glb', animation: 'idle', position: { x: 13, y: 10 } },
  ],
  storyCharacters: [], quest: { id: 'quest_rootbeer_cellar', title: "Remy's Root Beer Run", description: 'Navigate the cellar to find the root beer stash!', objectives: [{ id: 'find_rootbeer', type: 'talk_to', description: 'Find the root beer', targetCharacterId: 'rootbeer', completed: false }], rewards: { stars: 12, medal: true } },
  dialogues: [
    { id: 'remy_cellar_intro', speaker: 'Remy', speakerEmoji: '🐀', message: "This is my favorite cellar! The root beer is hidden somewhere down here.", cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }], speakerCharacterId: 'remy_cellar' },
    { id: 'rootbeer_found', speaker: 'Remy', speakerEmoji: '🐀', message: "🍺 Found it! Perfect for the feast!", cells: [{ x: 12, y: 10 }, { x: 13, y: 10 }, { x: 13, y: 9 }], speakerCharacterId: 'rootbeer', requires: ['remy_cellar_intro'], questAction: { type: 'complete_objective', objectiveId: 'find_rootbeer' } },
  ],
  endConditions: { requiredDialogues: ['rootbeer_found'] },
  grid: createGrid([
    '################', '##SS      ######', '##    ##  ######', '####  ##      ##',
    '####      ##  ##', '##    ##  ##  ##', '##    ##      ##', '####      ######',
    '####  ##  ######', '##    ##      ##', '##          EE##', '################',
  ]),
};

// === ACT 1 LEVEL 9: Rat City ===
const chapter9RatCity: StoryMaze = {
  id: 109, name: "Rat City", chapterId: 'rat_city', difficulty: 'easy',
  timeLimit: 200, timerDisabled: true, previewTime: 10, medalTimes: { gold: 30, silver: 50, bronze: 80 },
  characters: [
    { id: 'rat_citizen_1', name: 'Rat Citizen', emoji: '🐀', model: 'Rat.glb', animation: 'idle', position: { x: 4, y: 3 } },
    { id: 'rat_citizen_2', name: 'Rat Citizen', emoji: '🐀', model: 'Rat-2.glb', animation: 'idle', position: { x: 10, y: 5 } },
    { id: 'remy_cousin_city', name: "Remy's Cousin", emoji: '🐀', model: 'Kangaroo_rat.glb', animation: 'idle', position: { x: 14, y: 8 } },
  ],
  storyCharacters: [], quest: { id: 'quest_rat_city', title: 'Rat City', description: "Find Remy's cousin in the underground rat city.", objectives: [{ id: 'find_cousin', type: 'talk_to', description: "Find Remy's cousin", targetCharacterId: 'remy_cousin_city', completed: false }], rewards: { stars: 10, medal: true } },
  dialogues: [
    { id: 'citizen1_chat', speaker: 'Rat Citizen', speakerEmoji: '🐀', message: "Welcome to Rat City! Try the east tunnels.", cells: [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 2 }], speakerCharacterId: 'rat_citizen_1' },
    { id: 'citizen2_chat', speaker: 'Rat Citizen', speakerEmoji: '🐀', message: "Remy's cousin lives further east.", cells: [{ x: 9, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 4 }], speakerCharacterId: 'rat_citizen_2' },
    { id: 'cousin_found', speaker: "Remy's Cousin", speakerEmoji: '🐀', message: "Ah, you must be the one Remy sent! The Raccoon knows things.", messages: [{ speaker: "Remy's Cousin", speakerEmoji: '🐀', message: "I'll help with the feast — but talk to Raccoon first." }], cells: [{ x: 13, y: 8 }, { x: 14, y: 8 }, { x: 14, y: 7 }], speakerCharacterId: 'remy_cousin_city', questAction: { type: 'complete_objective', objectiveId: 'find_cousin' } },
  ],
  endConditions: { requiredDialogues: ['cousin_found'] },
  grid: createGrid([
    '##################', '##SS        ######', '##      ##  ######', '####    ##      ##',
    '####          ####', '##    ####    ####', '##    ####      ##', '####        ##  ##',
    '####    ##      ##', '##      ######EE##', '##################',
  ]),
};

// === ACT 1 LEVEL 10: The Grand Feast (timed) ===
const chapter10Feast: StoryMaze = {
  id: 110, name: "The Grand Feast", chapterId: 'attend_feast', difficulty: 'medium',
  timeLimit: 120, timerDisabled: false, previewTime: 10, medalTimes: { gold: 50, silver: 80, bronze: 110 },
  characters: [{ id: 'raccoon', name: 'Raccoon', emoji: '🦝', model: 'Squirrel.glb', animation: 'idle', position: { x: 14, y: 10 } }],
  storyCharacters: [], quest: { id: 'quest_attend_feast', title: 'The Grand Feast', description: "Don't be late! Raccoon has important information.", objectives: [{ id: 'reach_raccoon', type: 'talk_to', description: 'Reach Raccoon', targetCharacterId: 'raccoon', completed: false }], rewards: { stars: 15, medal: true } },
  dialogues: [{ id: 'raccoon_feast', speaker: 'Raccoon', speakerEmoji: '🦝', message: "You made it! Listen — the Porcupine Boss knows about the ring.", messages: [{ speaker: 'Raccoon', speakerEmoji: '🦝', message: "But he doesn't like big animals. Find a chicken friend, and bring glitter as an offering!" }], cells: [{ x: 13, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 9 }], speakerCharacterId: 'raccoon', questAction: { type: 'complete_objective', objectiveId: 'reach_raccoon' } }],
  endConditions: { requiredDialogues: ['raccoon_feast'] },
  grid: createGrid([
    '##################', '##SS    ##    ####', '##      ##    ####', '####          ####',
    '####    ####    ##', '##      ####    ##', '##  ##        ####', '####  ##      ####',
    '####  ##  ##    ##', '##        ##    ##', '##            EE##', '##################',
  ]),
};

// === ACT 1 LEVEL 11: Make a Friend (find chicken, timed) ===
const chapter11FindChicken: StoryMaze = {
  id: 111, name: "Make a Friend", chapterId: 'find_chicken', difficulty: 'medium',
  timeLimit: 90, timerDisabled: false, previewTime: 10, medalTimes: { gold: 40, silver: 60, bronze: 80 },
  characters: [
    { id: 'nest_1', name: 'Empty Nest', emoji: '🪺', model: 'Bush_with_Berries.glb', animation: 'idle', position: { x: 4, y: 3 } },
    { id: 'nest_2', name: 'Empty Nest', emoji: '🪺', model: 'Bush_with_Berries.glb', animation: 'idle', position: { x: 10, y: 6 } },
    { id: 'chicken_friend', name: 'Henrietta', emoji: '🐔', model: 'Hen.glb', animation: 'idle', position: { x: 14, y: 9 } },
  ],
  storyCharacters: [], quest: { id: 'quest_find_chicken', title: 'Make a Friend', description: 'Find the chicken before sunset!', objectives: [{ id: 'find_hen', type: 'talk_to', description: 'Find Henrietta', targetCharacterId: 'chicken_friend', completed: false }], rewards: { stars: 12, medal: true } },
  dialogues: [
    { id: 'nest1_empty', speaker: 'You', speakerEmoji: '🐷', message: "Empty nest... keep looking!", cells: [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 2 }], speakerCharacterId: 'nest_1' },
    { id: 'nest2_empty', speaker: 'You', speakerEmoji: '🐷', message: "Another empty nest.", cells: [{ x: 9, y: 6 }, { x: 10, y: 6 }, { x: 10, y: 5 }], speakerCharacterId: 'nest_2' },
    { id: 'chicken_found', speaker: 'Henrietta', speakerEmoji: '🐔', message: "BAWK! You found me! I can help with Porcupine Boss — but first, my chicks escaped!", cells: [{ x: 13, y: 9 }, { x: 14, y: 9 }, { x: 14, y: 8 }], speakerCharacterId: 'chicken_friend', questAction: { type: 'complete_objective', objectiveId: 'find_hen' } },
  ],
  endConditions: { requiredDialogues: ['chicken_found'] },
  grid: createGrid([
    '##################', '##SS        ######', '##    ####  ######', '####  ####      ##',
    '####            ##', '##    ##    ######', '##    ##        ##', '####        ##  ##',
    '####  ####  ##  ##', '##    ####      ##', '##################',
  ]),
};

// === ACT 1 LEVEL 12: Herd the Chicks ===
const chapter12HerdChicks: StoryMaze = {
  id: 112, name: "Herd the Chicks", chapterId: 'herd_chicks', difficulty: 'easy',
  timeLimit: 200, timerDisabled: true, previewTime: 10, medalTimes: { gold: 45, silver: 70, bronze: 100 },
  characters: [
    { id: 'henrietta_home', name: 'Henrietta', emoji: '🐔', model: 'Hen.glb', animation: 'idle', position: { x: 2, y: 2 } },
    { id: 'chick_1', name: 'Chick', emoji: '🐥', model: 'Hen.glb', animation: 'idle', position: { x: 8, y: 3 } },
    { id: 'chick_2', name: 'Chick', emoji: '🐥', model: 'Hen.glb', animation: 'idle', position: { x: 12, y: 7 } },
    { id: 'chick_3', name: 'Chick', emoji: '🐥', model: 'Hen.glb', animation: 'idle', position: { x: 5, y: 9 } },
  ],
  storyCharacters: [], quest: { id: 'quest_herd_chicks', title: 'Herd the Chicks', description: "Find all 3 escaped chicks!", objectives: [
    { id: 'find_chick_1', type: 'talk_to', description: 'Find chick #1', targetCharacterId: 'chick_1', completed: false },
    { id: 'find_chick_2', type: 'talk_to', description: 'Find chick #2', targetCharacterId: 'chick_2', completed: false },
    { id: 'find_chick_3', type: 'talk_to', description: 'Find chick #3', targetCharacterId: 'chick_3', completed: false },
  ], rewards: { stars: 12, medal: true } },
  dialogues: [
    { id: 'henrietta_help', speaker: 'Henrietta', speakerEmoji: '🐔', message: "My babies! Please find all three!", cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }], speakerCharacterId: 'henrietta_home' },
    { id: 'chick1_found', speaker: 'Chick', speakerEmoji: '🐥', message: "Peep peep! *follows you*", cells: [{ x: 7, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 2 }], speakerCharacterId: 'chick_1', questAction: { type: 'complete_objective', objectiveId: 'find_chick_1' } },
    { id: 'chick2_found', speaker: 'Chick', speakerEmoji: '🐥', message: "Peep! *happy to see you*", cells: [{ x: 11, y: 7 }, { x: 12, y: 7 }, { x: 12, y: 6 }], speakerCharacterId: 'chick_2', questAction: { type: 'complete_objective', objectiveId: 'find_chick_2' } },
    { id: 'chick3_found', speaker: 'Chick', speakerEmoji: '🐥', message: "PEEP! *runs in circles*", cells: [{ x: 4, y: 9 }, { x: 5, y: 9 }, { x: 5, y: 8 }], speakerCharacterId: 'chick_3', questAction: { type: 'complete_objective', objectiveId: 'find_chick_3' } },
  ],
  endConditions: { requiredDialogues: ['chick1_found', 'chick2_found', 'chick3_found'] },
  grid: createGrid([
    '################', '##SS      ######', '##    ##  ######', '####  ##      ##',
    '####      ##  ##', '##    ##  ##  ##', '##    ##      ##', '####      ######',
    '####  ##  ######', '##    ##    EE##', '################',
  ]),
};

// === ACT 1 LEVEL 13: Remy's Gamble ===
const chapter13RatGamble: StoryMaze = {
  id: 113, name: "Remy's Gamble", chapterId: 'rat_gamble', difficulty: 'medium',
  timeLimit: 200, timerDisabled: true, previewTime: 10, medalTimes: { gold: 40, silver: 65, bronze: 90 },
  characters: [
    { id: 'remy_gambler', name: 'Remy', emoji: '🐀', model: 'Rat.glb', animation: 'idle', position: { x: 2, y: 2 } },
    { id: 'gold_coins', name: 'Gold Coins', emoji: '🪙', model: 'Log.glb', animation: 'idle', position: { x: 12, y: 8 } },
  ],
  storyCharacters: [], quest: { id: 'quest_rat_gamble', title: "Remy's Gamble", description: "Win Remy's gold coins for the Porcupine offering!", objectives: [
    { id: 'talk_remy_gamble', type: 'talk_to', description: 'Talk to Remy', targetCharacterId: 'remy_gambler', completed: false },
    { id: 'get_coins', type: 'talk_to', description: 'Collect the gold coins', targetCharacterId: 'gold_coins', completed: false },
  ], rewards: { stars: 15, medal: true } },
  dialogues: [
    { id: 'remy_wager', speaker: 'Remy', speakerEmoji: '🐀', message: "My shiny gold coins for whoever reaches the end first! Go! 🏃", cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }], speakerCharacterId: 'remy_gambler', questAction: { type: 'complete_objective', objectiveId: 'talk_remy_gamble' } },
    { id: 'coins_collected', speaker: 'You', speakerEmoji: '🐷', message: "🪙 Got the gold coins! Perfect offering for Porcupine Boss!", cells: [{ x: 11, y: 8 }, { x: 12, y: 8 }, { x: 12, y: 7 }], speakerCharacterId: 'gold_coins', requires: ['remy_wager'], questAction: { type: 'complete_objective', objectiveId: 'get_coins' } },
  ],
  endConditions: { requiredDialogues: ['remy_wager', 'coins_collected'] },
  grid: createGrid([
    '################', '##SS      ######', '##    ######  ##', '####  ######  ##',
    '####        ####', '##    ####  ####', '##    ####    ##', '######    ##  ##',
    '######    ##  ##', '##          EE##', '################',
  ]),
};

// === ACT 1 LEVEL 14: Porcupine Barn (stealth, foxes) ===
const chapter14PorcupineBarn: StoryMaze = {
  id: 114, name: "The Barn", chapterId: 'porcupine_barn', difficulty: 'hard',
  timeLimit: 300, timerDisabled: true, previewTime: 10, medalTimes: { gold: 60, silver: 90, bronze: 120 },
  characters: [
    { id: 'porcupine_boss', name: 'Porcupine Boss', emoji: '🦔', model: 'Squirrel.glb', animation: 'idle', position: { x: 16, y: 10 } },
    { id: 'fox_guard_1', name: 'Fox', emoji: '🦊', model: 'Rat.glb', animation: 'idle', position: { x: 6, y: 4 }, visionDialogueId: 'fox_caught', coneVision: { range: 5, spreadPerCell: 1 }, patrol: { pattern: 'loop', waypoints: [{ x: 6, y: 4 }, { x: 6, y: 8 }], speedCellsPerSec: 1.0, pauseMs: 1000 } },
    { id: 'fox_guard_2', name: 'Fox', emoji: '🦊', model: 'Rat.glb', animation: 'idle', position: { x: 12, y: 6 }, visionDialogueId: 'fox_caught', coneVision: { range: 4, spreadPerCell: 1 }, turning: { pattern: 'ping-pong', directions: ['west', 'east'], intervalMs: 3000 } },
  ],
  storyCharacters: [], quest: { id: 'quest_porcupine_barn', title: 'The Barn', description: "Dodge fox patrols to reach Porcupine Boss!", objectives: [{ id: 'reach_porcupine', type: 'talk_to', description: 'Reach Porcupine Boss', targetCharacterId: 'porcupine_boss', completed: false }], rewards: { stars: 20, medal: true } },
  dialogues: [
    { id: 'fox_caught', speaker: 'Fox', speakerEmoji: '🦊', message: "HALT! No chickens allowed!", cells: [], speakerCharacterId: 'fox_guard_1', effect: 'game_over' },
    { id: 'porcupine_talk', speaker: 'Porcupine Boss', speakerEmoji: '🦔', message: "A little chicken made it past my guards!", messages: [{ speaker: 'Porcupine Boss', speakerEmoji: '🦔', message: "Ferrets, raccoon, sheep, skunk, goat — all were at the scene that night. But first — the lights!" }], cells: [{ x: 15, y: 10 }, { x: 16, y: 10 }, { x: 16, y: 9 }], speakerCharacterId: 'porcupine_boss', questAction: { type: 'complete_objective', objectiveId: 'reach_porcupine' } },
  ],
  endConditions: { requiredDialogues: ['porcupine_talk'] },
  grid: createGrid([
    '####################', '##SS        ##  ####', '##    ####  ##  ####', '####  ####      ####',
    '####          ##  ##', '##    ##  ##  ##  ##', '##    ##  ##      ##', '####          ######',
    '####  ####    ######', '##    ####  ##    ##', '##          ##    ##', '####################',
  ]),
};

// === ACT 1 LEVEL 15: Lights Out (stealth, limited vis) ===
const chapter15LightsOut: StoryMaze = {
  id: 115, name: "Lights Out", chapterId: 'porcupine_dark', difficulty: 'hard',
  timeLimit: 300, timerDisabled: true, previewTime: 10, medalTimes: { gold: 70, silver: 100, bronze: 140 },
  characters: [
    { id: 'porcupine_final', name: 'Porcupine Boss', emoji: '🦔', model: 'Squirrel.glb', animation: 'idle', position: { x: 16, y: 12 } },
    { id: 'fox_dark_1', name: 'Fox', emoji: '🦊', model: 'Rat.glb', animation: 'idle', position: { x: 8, y: 5 }, visionDialogueId: 'fox_caught_dark', coneVision: { range: 3, spreadPerCell: 1 }, patrol: { pattern: 'loop', waypoints: [{ x: 8, y: 3 }, { x: 8, y: 8 }], speedCellsPerSec: 0.8 } },
    { id: 'fox_dark_2', name: 'Fox', emoji: '🦊', model: 'Rat.glb', animation: 'idle', position: { x: 14, y: 8 }, visionDialogueId: 'fox_caught_dark', coneVision: { range: 3, spreadPerCell: 1 }, turning: { pattern: 'ping-pong', directions: ['north', 'west'], intervalMs: 2500 } },
  ],
  storyCharacters: [], quest: { id: 'quest_porcupine_dark', title: 'Lights Out', description: "Navigate through darkness past foxes to reach Porcupine Boss.", objectives: [{ id: 'reach_porcupine_dark', type: 'talk_to', description: 'Reach Porcupine Boss', targetCharacterId: 'porcupine_final', completed: false }], rewards: { stars: 25, medal: true } },
  dialogues: [
    { id: 'fox_caught_dark', speaker: 'Fox', speakerEmoji: '🦊', message: "I can see in the dark, little one!", cells: [], speakerCharacterId: 'fox_dark_1', effect: 'game_over' },
    { id: 'porcupine_final_talk', speaker: 'Porcupine Boss', speakerEmoji: '🦔', message: "Impressive! The suspects are ferrets, raccoon, sheep, skunk, and goat.", messages: [{ speaker: 'Porcupine Boss', speakerEmoji: '🦔', message: "Investigate them all. The truth is out there... somewhere in the fog." }], cells: [{ x: 15, y: 12 }, { x: 16, y: 12 }, { x: 16, y: 11 }], speakerCharacterId: 'porcupine_final', questAction: { type: 'complete_objective', objectiveId: 'reach_porcupine_dark' } },
  ],
  endConditions: { requiredDialogues: ['porcupine_final_talk'] },
  grid: createGrid([
    '####################', '##SS          ######', '##    ####    ######', '####  ####        ##',
    '####              ##', '##    ##    ####  ##', '##    ##    ####  ##', '####          ######',
    '####  ##      ######', '##    ##  ####    ##', '##        ####    ##', '####          ##  ##',
    '####          ##  ##', '####################',
  ]),
};

// All story mazes
export const storyMazes: StoryMaze[] = [
  chapter1Maze,
  chapter2Maze,
  chapter3Maze,
  chapter4BerryFetch,
  chapter5BerryGauntlet,
  chapter6PumpkinHunt,
  chapter7LlamaBlockade,
  chapter8RootbeerCellar,
  chapter9RatCity,
  chapter10Feast,
  chapter11FindChicken,
  chapter12HerdChicks,
  chapter13RatGamble,
  chapter14PorcupineBarn,
  chapter15LightsOut,
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
    timerDisabled: storyMaze.timerDisabled,
    characters: allCharacters,
    dialogues: storyMaze.dialogues,
    endConditions: storyMaze.endConditions,
    goalCharacterId: storyMaze.goalCharacterId,
    freeMapAccess: storyMaze.freeMapAccess ?? true,
    deletedSpineBranches: storyMaze.deletedSpineBranches,
    deletedSpineFineCells: storyMaze.deletedSpineFineCells,
    obstacles: storyMaze.obstacles,
  };
};

// Get characters that should be shown on preview (not hidden)
export const getPreviewCharacters = (storyMaze: StoryMaze): MazeCharacter[] => {
  return storyMaze.characters || [];
};
