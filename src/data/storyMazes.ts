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
}

// Chapter 1: The Missing Ring
export const storyMazes: StoryMaze[] = [
  {
    id: 101, // Story mazes use 100+ IDs
    name: "The Missing Ring",
    difficulty: 'easy',
    timeLimit: 120, // More time for exploration
    previewTime: 10,
    medalTimes: {
      gold: 60,
      silver: 90,
      bronze: 110,
    },
    // Regular characters (visible on preview)
    characters: [
      {
        id: 'sanctuary_sam_start',
        name: 'Sanctuary Sam',
        emoji: '🧑‍🌾',
        model: 'Farmer.glb',
        animation: 'idle',
        position: { x: 2, y: 2 }, // Near start
        alwaysFacePlayer: true,
      }
    ],
    // Story characters (hidden from preview) - these NPCs are quest-relevant
    storyCharacters: [
      {
        id: 'remy_rat',
        name: 'Remy',
        emoji: '🐀',
        model: 'Pig.glb', // Using Pig as placeholder until we have a Rat model
        animation: 'idle',
        position: { x: 12, y: 10 }, // Hidden deep in the maze
        hiddenFromPreview: true,
        questRelevant: 'find_rat',
      }
    ],
    // Quest definition
    quest: {
      id: 'quest_missing_ring',
      title: 'The Missing Wedding Ring',
      description: "Sanctuary Sam lost his wedding ring somewhere in the corn maze. Help him find it!",
      objectives: [
        {
          id: 'talk_sam_start',
          type: 'talk_to',
          description: 'Talk to Sanctuary Sam',
          targetCharacterId: 'sanctuary_sam_start',
          completed: false,
          hidden: false,
        },
        {
          id: 'find_rat',
          type: 'talk_to',
          description: 'Find someone who might know something',
          targetCharacterId: 'remy_rat',
          completed: false,
          hidden: true, // Don't show on map
        },
        {
          id: 'report_back',
          type: 'report_back',
          description: 'Report back to Sanctuary Sam',
          targetCharacterId: 'sanctuary_sam_start',
          completed: false,
          hidden: false,
        },
      ],
      rewards: {
        stars: 10,
        medal: true,
      },
      nextQuestId: 'quest_farmhouse_clue',
    },
    // Dialogues with quest actions
    dialogues: [
      {
        id: 'sam_intro',
        speaker: 'Sanctuary Sam',
        speakerEmoji: '👨‍🌾',
        message: "Oh no, oh no! I've lost my wedding ring somewhere in this corn maze!",
        messages: [
          {
            speaker: 'Sanctuary Sam',
            speakerEmoji: '😰',
            message: "Stella is going to be so upset! Can you help me find it?",
          },
          {
            speaker: 'Sanctuary Sam',
            speakerEmoji: '🤔',
            message: "Maybe someone in the maze saw something. There's a rat who lives deeper in the corn...",
          },
        ],
        cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }],
        speakerCharacterId: 'sanctuary_sam_start',
        questAction: {
          type: 'complete_objective',
          objectiveId: 'talk_sam_start',
        },
      },
      {
        id: 'rat_encounter',
        speaker: 'Remy the Rat',
        speakerEmoji: '🐀',
        message: "Squeak! A visitor! You're looking for a ring, you say?",
        messages: [
          {
            speaker: 'Remy the Rat',
            speakerEmoji: '🐀',
            message: "Hmm... I haven't seen any ring around here...",
          },
          {
            speaker: 'Remy the Rat',
            speakerEmoji: '👀',
            message: "But I DID notice someone sneaking around near the farmhouse last night. Very suspicious!",
          },
          {
            speaker: 'Remy the Rat',
            speakerEmoji: '🐀',
            message: "You should tell Sam. Maybe it's connected!",
          },
        ],
        cells: [{ x: 11, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 11 }, { x: 11, y: 11 }],
        speakerCharacterId: 'remy_rat',
        requires: ['sam_intro'],
        questAction: {
          type: 'complete_objective',
          objectiveId: 'find_rat',
        },
      },
      {
        id: 'sam_report',
        speaker: 'Sanctuary Sam',
        speakerEmoji: '👨‍🌾',
        message: "You found Remy? What did she say?",
        messages: [
          {
            speaker: 'You',
            speakerEmoji: '🐄',
            message: "She saw someone sneaking near the farmhouse last night!",
          },
          {
            speaker: 'Sanctuary Sam',
            speakerEmoji: '😮',
            message: "The farmhouse? Oh my! We need to investigate this!",
          },
          {
            speaker: 'Sanctuary Sam',
            speakerEmoji: '🧑‍🌾',
            message: "Thank you for your help, friend. This is a great clue!",
          },
        ],
        cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 3, y: 2 }, { x: 3, y: 3 }],
        speakerCharacterId: 'sanctuary_sam_start',
        requires: ['rat_encounter'],
        questAction: {
          type: 'complete_objective',
          objectiveId: 'report_back',
        },
      },
    ],
    endConditions: {
      requiredDialogues: ['sam_intro', 'rat_encounter', 'sam_report'],
    },
    // Simple maze layout
    grid: createGrid([
      '##################',
      '##################',
      '##SS          ####',
      '##            ####',
      '######  ##      ##',
      '######  ##      ##',
      '##      ##  ######',
      '##      ##  ######',
      '##  ##########  ##',
      '##  ##########  ##',
      '##          ##  ##',
      '##          ##  ##',
      '######  ##      ##',
      '######  ##    EE##',
      '##            EE##',
      '##################',
    ]),
  },
];

// Story chapters
export const storyChapters: StoryChapter[] = [
  {
    id: 'chapter_1',
    title: 'Chapter 1: The Mystery Begins',
    description: "Help Sanctuary Sam solve the mystery of his missing wedding ring.",
    quests: [storyMazes[0].quest],
    mazeId: 101,
  },
];

// Helper to get a story maze by ID
export const getStoryMaze = (id: number): StoryMaze | undefined => {
  return storyMazes.find(m => m.id === id);
};

// Helper to get all story mazes for a chapter
export const getChapterMazes = (chapterId: string): StoryMaze[] => {
  const chapter = storyChapters.find(c => c.id === chapterId);
  if (!chapter) return [];
  return storyMazes.filter(m => m.id === chapter.mazeId);
};

// Convert StoryMaze to regular Maze for game engine
// Combines regular characters with visible story characters
export const storyMazeToMaze = (storyMaze: StoryMaze): Maze => {
  // Combine all characters (story characters are placed in the world but hidden from preview)
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
    dialogues: storyMaze.dialogues, // StoryDialogue extends DialogueTrigger
    endConditions: storyMaze.endConditions,
  };
};

// Get characters that should be shown on preview (not hidden)
export const getPreviewCharacters = (storyMaze: StoryMaze): MazeCharacter[] => {
  return storyMaze.characters || [];
  // Story characters are explicitly NOT included
};
