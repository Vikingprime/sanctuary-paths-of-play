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

// === CHAPTER 2: The Cousin Riddle (Talk to rats in correct order) ===
const chapter2Maze: StoryMaze = {
  id: 102,
  name: "The Cousin Riddle",
  chapterId: 'chapter_2',
  difficulty: 'medium',
  timeLimit: 240,
  previewTime: 12,
  medalTimes: {
    gold: 80,
    silver: 120,
    bronze: 180,
  },
  characters: [],
  storyCharacters: [
    {
      id: 'cousin_tall',
      name: 'Lanky',
      emoji: '🐀',
      model: 'Rat.glb',
      animation: 'idle',
      position: { x: 3, y: 12 },
      hiddenFromPreview: true,
      questRelevant: 'talk_tall',
    },
    {
      id: 'cousin_tiny',
      name: 'Whisper',
      emoji: '🐀',
      model: 'Rat.glb',
      animation: 'idle',
      position: { x: 14, y: 4 },
      hiddenFromPreview: true,
      questRelevant: 'talk_tiny',
    },
    {
      id: 'cousin_short',
      name: 'Stubby',
      emoji: '🐀',
      model: 'Rat.glb',
      animation: 'idle',
      position: { x: 8, y: 8 },
      hiddenFromPreview: true,
      questRelevant: 'talk_short',
    },
    {
      id: 'cousin_round',
      name: 'Pudge',
      emoji: '🐀',
      model: 'Rat.glb',
      animation: 'idle',
      position: { x: 14, y: 13 },
      hiddenFromPreview: true,
      questRelevant: 'talk_round',
    },
  ],
  quest: {
    id: 'quest_ch2_cousin_riddle',
    title: 'The Cousin Riddle',
    description: "Talk to Remy's four cousins in the correct order based on the riddle.",
    objectives: [
      {
        id: 'talk_tall',
        type: 'talk_to',
        description: '1st: Find the one who\'s TALL and keen (Lanky)',
        targetCharacterId: 'cousin_tall',
        completed: false,
        hidden: true,
      },
      {
        id: 'talk_tiny',
        type: 'talk_to',
        description: '2nd: Seek the one who\'s barely seen (Whisper)',
        targetCharacterId: 'cousin_tiny',
        completed: false,
        hidden: true,
      },
      {
        id: 'talk_short',
        type: 'talk_to',
        description: '3rd: The SHORT one comes halfway through (Stubby)',
        targetCharacterId: 'cousin_short',
        completed: false,
        hidden: true,
      },
      {
        id: 'talk_round',
        type: 'talk_to',
        description: '4th: ROUND completes the clues (Pudge)',
        targetCharacterId: 'cousin_round',
        completed: false,
        hidden: true,
      },
    ],
    rewards: { stars: 15, medal: true },
    nextQuestId: 'quest_ch3_skunk_trail',
    // Riddle hint shown in quest log
    riddleHint: "\"First find the one who's TALL and keen,\nThen seek the one who's barely seen,\nThe SHORT one comes when you're halfway through,\nAnd ROUND completes the clues for you.\"",
  },
  dialogues: [
    // Wrong order dialogues (these trigger if player talks out of order)
    {
      id: 'cousin_tiny_wrong',
      speaker: 'Whisper',
      speakerEmoji: '🐀',
      message: "*barely audible* ...you need to talk to my tall cousin first...",
      cells: [{ x: 13, y: 4 }, { x: 14, y: 4 }, { x: 14, y: 5 }, { x: 15, y: 4 }],
      speakerCharacterId: 'cousin_tiny',
      // No questAction - wrong order doesn't complete objective
    },
    {
      id: 'cousin_short_wrong',
      speaker: 'Stubby',
      speakerEmoji: '🐀',
      message: "Nope! Not my turn yet. Follow the riddle, friend!",
      cells: [{ x: 7, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 9 }, { x: 9, y: 8 }],
      speakerCharacterId: 'cousin_short',
    },
    {
      id: 'cousin_round_wrong',
      speaker: 'Pudge',
      speakerEmoji: '🐀',
      message: "*munching* I'm the LAST one you should talk to! *munch munch*",
      cells: [{ x: 13, y: 13 }, { x: 14, y: 13 }, { x: 14, y: 14 }, { x: 15, y: 13 }],
      speakerCharacterId: 'cousin_round',
    },
    // Correct order dialogues
    {
      id: 'cousin_tall_correct',
      speaker: 'Lanky',
      speakerEmoji: '🐀',
      message: "Ah yes! You figured it out - I'm the TALL one! *stretches up proudly*",
      messages: [
        {
          speaker: 'Lanky',
          speakerEmoji: '🐀',
          message: "I saw something suspicious that night... a black and white figure sneaking around!",
        },
        {
          speaker: 'Lanky',
          speakerEmoji: '🐀',
          message: "Now go find Whisper - she's the one who's 'barely seen'. She hides in the northeast corner.",
        },
      ],
      cells: [{ x: 2, y: 12 }, { x: 3, y: 12 }, { x: 3, y: 13 }, { x: 4, y: 12 }],
      speakerCharacterId: 'cousin_tall',
      questAction: { type: 'complete_objective', objectiveId: 'talk_tall' },
    },
    {
      id: 'cousin_tiny_correct',
      speaker: 'Whisper',
      speakerEmoji: '🐀',
      message: "*very quietly* You found me... most don't notice I'm here...",
      messages: [
        {
          speaker: 'Whisper',
          speakerEmoji: '🐀',
          message: "*whispers* That black and white creature... it was digging near the farmhouse...",
        },
        {
          speaker: 'Whisper',
          speakerEmoji: '🐀',
          message: "*barely audible* Stubby is next. He's in the middle of the maze. The SHORT one.",
        },
      ],
      cells: [{ x: 13, y: 4 }, { x: 14, y: 4 }, { x: 14, y: 5 }, { x: 15, y: 4 }],
      speakerCharacterId: 'cousin_tiny',
      requires: ['cousin_tall_correct'],
      questAction: { type: 'complete_objective', objectiveId: 'talk_tiny' },
    },
    {
      id: 'cousin_short_correct',
      speaker: 'Stubby',
      speakerEmoji: '🐀',
      message: "Ha! You got the order right! I'm SHORT but I know a lot!",
      messages: [
        {
          speaker: 'Stubby',
          speakerEmoji: '🐀',
          message: "That black and white critter? Smelled AWFUL. Definitely a skunk!",
        },
        {
          speaker: 'Stubby',
          speakerEmoji: '🐀',
          message: "Pudge is last - he's ROUND and in the southeast. He knows where the skunk went!",
        },
      ],
      cells: [{ x: 7, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 9 }, { x: 9, y: 8 }],
      speakerCharacterId: 'cousin_short',
      requires: ['cousin_tiny_correct'],
      questAction: { type: 'complete_objective', objectiveId: 'talk_short' },
    },
    {
      id: 'cousin_round_correct',
      speaker: 'Pudge',
      speakerEmoji: '🐀',
      message: "*finishing a snack* You made it! In the right order too!",
      messages: [
        {
          speaker: 'Pudge',
          speakerEmoji: '🐀',
          message: "*burp* I know exactly who you're looking for. It's definitely a SKUNK.",
        },
        {
          speaker: 'Pudge',
          speakerEmoji: '🐀',
          message: "The skunk lives beyond the old barn. Follow the smell... you can't miss it!",
        },
        {
          speaker: 'Pudge',
          speakerEmoji: '👀',
          message: "They saw something BLACK AND WHITE sneaking around the night before the ring went missing!",
        },
      ],
      cells: [{ x: 13, y: 13 }, { x: 14, y: 13 }, { x: 14, y: 14 }, { x: 15, y: 13 }],
      speakerCharacterId: 'cousin_round',
      requires: ['cousin_short_correct'],
      questAction: { type: 'complete_objective', objectiveId: 'talk_round' },
    },
  ],
  endConditions: {
    requiredDialogues: ['cousin_tall_correct', 'cousin_tiny_correct', 'cousin_short_correct', 'cousin_round_correct'],
  },
  grid: createGrid([
    '####################',
    '####################',
    '##SS        ########',
    '##          ########',
    '##    ####      ####',
    '##    ####      ####',
    '####        ####  ##',
    '####        ####  ##',
    '##      ##        ##',
    '##      ##        ##',
    '####  ####    ######',
    '####  ####    ######',
    '##                ##',
    '##            ##EE##',
    '##            ##EE##',
    '####################',
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
