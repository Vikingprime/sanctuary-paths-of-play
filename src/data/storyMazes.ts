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
    gold: 80,
    silver: 120,
    bronze: 180,
  },
  characters: [],
  storyCharacters: [
    {
      id: 'cousin_hamster',
      name: 'Nugget',
      emoji: '🐹',
      model: 'Hamster.glb',
      animation: 'idle',
      position: { x: 4, y: 14 },
      hiddenFromPreview: true,
      questRelevant: 'talk_hamster',
    },
    {
      id: 'cousin_kangaroo',
      name: 'Bounce',
      emoji: '🐀',
      model: 'Kangaroo_rat.glb',
      animation: 'idle',
      position: { x: 16, y: 4 },
      hiddenFromPreview: true,
      questRelevant: 'talk_kangaroo',
    },
    {
      id: 'cousin_squirrel',
      name: 'Stash',
      emoji: '🐿️',
      model: 'Squirrel.glb',
      animation: 'idle',
      position: { x: 16, y: 14 },
      hiddenFromPreview: true,
      questRelevant: 'talk_squirrel',
    },
    {
      id: 'cousin_rat2',
      name: 'Scuttle',
      emoji: '🐀',
      model: 'Rat-2.glb',
      animation: 'idle',
      position: { x: 10, y: 4 },
      hiddenFromPreview: true,
    },
    {
      id: 'cousin_spiny',
      name: 'Bristle',
      emoji: '🐁',
      model: 'Spiny_mouse.glb',
      animation: 'idle',
      position: { x: 10, y: 10 },
      hiddenFromPreview: true,
    },
  ],
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
    // --- DECOY DIALOGUES (always available, give flavor but no quest progress) ---
    {
      id: 'scuttle_chat',
      speaker: 'Scuttle',
      speakerEmoji: '🐀',
      message: "Hey there! I'm Scuttle. I'm not part of any riddle, but I saw something shiny earlier...",
      messages: [
        {
          speaker: 'Scuttle',
          speakerEmoji: '🐀',
          message: "It was near the south side of the maze. Maybe one of my cousins knows more?",
        },
      ],
      cells: [{ x: 9, y: 4 }, { x: 10, y: 4 }, { x: 11, y: 4 }, { x: 10, y: 5 }],
      speakerCharacterId: 'cousin_rat2',
    },
    {
      id: 'bristle_chat',
      speaker: 'Bristle',
      speakerEmoji: '🐁',
      message: "*prickles up* Oh! You startled me! I'm Bristle, the spiny mouse.",
      messages: [
        {
          speaker: 'Bristle',
          speakerEmoji: '🐁',
          message: "I don't know much about riddles, but I heard there's a hamster around here who used to be someone's pet!",
        },
        {
          speaker: 'Bristle',
          speakerEmoji: '🐁',
          message: "Check the southwest part of the maze. That little guy loves hiding in corners.",
        },
      ],
      cells: [{ x: 9, y: 10 }, { x: 10, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 11 }],
      speakerCharacterId: 'cousin_spiny',
    },

    // --- WRONG ORDER DIALOGUES ---
    // Kangaroo rat before hamster
    {
      id: 'kangaroo_wrong',
      speaker: 'Bounce',
      speakerEmoji: '🐀',
      message: "*bouncing in place* Whoa there! You need to find the LEGEND first! The pet-turned-escapee!",
      cells: [{ x: 15, y: 4 }, { x: 16, y: 4 }, { x: 17, y: 4 }, { x: 16, y: 5 }],
      speakerCharacterId: 'cousin_kangaroo',
    },
    // Squirrel before completing hamster + kangaroo
    {
      id: 'squirrel_wrong',
      speaker: 'Stash',
      speakerEmoji: '🐿️',
      message: "*busy sorting acorns* Not yet! You haven't solved the first two parts of the riddle!",
      cells: [{ x: 15, y: 14 }, { x: 16, y: 14 }, { x: 17, y: 14 }, { x: 16, y: 15 }],
      speakerCharacterId: 'cousin_squirrel',
    },

    // --- CORRECT ORDER DIALOGUES ---
    // 1st: Hamster (The Legend)
    {
      id: 'hamster_correct',
      speaker: 'Nugget',
      speakerEmoji: '🐹',
      message: "*squeaks excitedly* You found me! I'm Nugget — the LEGEND!",
      messages: [
        {
          speaker: 'Nugget',
          speakerEmoji: '🐹',
          message: "I used to live in a cozy cage with a running wheel and everything. But one day, the cage door was left open...",
        },
        {
          speaker: 'Nugget',
          speakerEmoji: '🐹',
          message: "I made my great escape! Now I'm the most famous rodent at the sanctuary!",
        },
        {
          speaker: 'Nugget',
          speakerEmoji: '🐹',
          message: "That night the ring went missing, I heard a lot of commotion near the barn. Something was digging...",
        },
        {
          speaker: 'Nugget',
          speakerEmoji: '🐹',
          message: "Now go find the ATHLETE — the jumper! He's in the northeast. You can't miss him, he never sits still!",
        },
      ],
      cells: [{ x: 3, y: 14 }, { x: 4, y: 14 }, { x: 5, y: 14 }, { x: 4, y: 15 }],
      speakerCharacterId: 'cousin_hamster',
      questAction: { type: 'complete_objective', objectiveId: 'talk_hamster' },
    },
    // 2nd: Kangaroo Rat (The Athlete)
    {
      id: 'kangaroo_correct',
      speaker: 'Bounce',
      speakerEmoji: '🐀',
      message: "*lands from a huge leap* Woah! You solved the first clue! I'm Bounce, the ATHLETE!",
      messages: [
        {
          speaker: 'Bounce',
          speakerEmoji: '🐀',
          message: "I can jump 9 feet in a single bound! That's like 45 times my body length!",
        },
        {
          speaker: 'Bounce',
          speakerEmoji: '🐀',
          message: "I was out jumping that night and I saw something black and white sneaking around the barn...",
        },
        {
          speaker: 'Bounce',
          speakerEmoji: '🐀',
          message: "It was definitely digging for something. And it smelled TERRIBLE!",
        },
        {
          speaker: 'Bounce',
          speakerEmoji: '🐀',
          message: "One more cousin to go — find the COLLECTOR! The one who stores their treasures. She's in the southeast!",
        },
      ],
      cells: [{ x: 15, y: 4 }, { x: 16, y: 4 }, { x: 17, y: 4 }, { x: 16, y: 5 }],
      speakerCharacterId: 'cousin_kangaroo',
      requires: ['hamster_correct'],
      questAction: { type: 'complete_objective', objectiveId: 'talk_kangaroo' },
    },
    // 3rd: Squirrel (The Collector)
    {
      id: 'squirrel_correct',
      speaker: 'Stash',
      speakerEmoji: '🐿️',
      message: "*surrounded by acorn piles* You made it! And in the right order too! I'm Stash!",
      messages: [
        {
          speaker: 'Stash',
          speakerEmoji: '🐿️',
          message: "I collect EVERYTHING. Acorns, berries, shiny things... if it fits in my cheeks, it's mine!",
        },
        {
          speaker: 'Stash',
          speakerEmoji: '🐿️',
          message: "In fact... *looks around nervously* ...I found something very interesting near the barn that night.",
        },
        {
          speaker: 'Stash',
          speakerEmoji: '🐿️',
          message: "A shiny gold ring! But before I could grab it, a SKUNK snatched it up and ran off!",
        },
        {
          speaker: 'Stash',
          speakerEmoji: '🐿️',
          message: "The skunk went toward the old oak tree on the far side of the farm. That's your next lead!",
        },
        {
          speaker: 'Stash',
          speakerEmoji: '👀',
          message: "Be careful though — skunks don't like being followed. You might want to sneak up on this one!",
        },
      ],
      cells: [{ x: 15, y: 14 }, { x: 16, y: 14 }, { x: 17, y: 14 }, { x: 16, y: 15 }],
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
    '##    ####        ####',
    '##    ####        ####',
    '####          ########',
    '####          ########',
    '######    ####    ####',
    '######    ####    ####',
    '##            ##    ##',
    '##            ##    ##',
    '####    ####        ##',
    '####    ####        ##',
    '##        ##      EE##',
    '##        ##      EE##',
    '######################',
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

// All story mazes
export const storyMazes: StoryMaze[] = [
  chapter1Maze,
  chapter2Maze,
  chapter3Maze,
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
  };
};

// Get characters that should be shown on preview (not hidden)
export const getPreviewCharacters = (storyMaze: StoryMaze): MazeCharacter[] => {
  return storyMaze.characters || [];
};
