export type AnimalType = 'pig' | 'cow' | 'bird';

export interface Animal {
  id: AnimalType;
  name: string;
  emoji: string;
  color: string;
  ability: {
    name: string;
    description: string;
    icon: string;
  };
  mealProgress: number;
  mealsUnlocked: number;
}

export interface MazeCell {
  x: number;
  y: number;
  isWall: boolean;
  isPowerUp?: boolean;
  isStation?: boolean;
  isStart?: boolean;
  isEnd?: boolean;
  powerUpType?: 'speed' | 'time' | 'key';
  brand?: string;
}

export type MedalType = 'bronze' | 'silver' | 'gold' | null;

export interface MedalTimes {
  gold: number;    // seconds - only achievable on first completion
  silver: number;  // seconds
  bronze: number;  // seconds
}

export interface UnlockCondition {
  mazeId: number;
  requiredMedal: 'bronze' | 'silver'; // gold never required
}

export interface DialogueMessage {
  speaker: string;
  speakerEmoji: string;
  message: string;
}

export interface MazeCharacter {
  id: string;
  name: string;
  emoji: string;
  model: string; // GLB file name (e.g., 'Farmer.glb')
  animation: string;
  position: { x: number; y: number };
  alwaysFacePlayer?: boolean; // If true, character always rotates to face player (default: false, only faces during dialogue)
}

export interface DialogueTrigger {
  id: string;
  speaker: string;
  speakerEmoji: string;
  message: string;
  messages?: DialogueMessage[]; // Optional array of sequential messages (after the initial message)
  cells: { x: number; y: number }[]; // All cells that trigger this dialogue
  speakerPosition?: { x: number; y: number }; // Where the speaker model appears (defaults to first cell center)
  requires?: string[]; // IDs of dialogues that must be completed before this one can trigger
  characterModel?: string; // GLB model file name - used if speakerCharacterId not set
  characterAnimation?: string; // Animation to play during dialogue
  speakerCharacterId?: string; // ID of placed character to zoom camera to
}

export interface IntroDialogue {
  characterId?: string; // ID of a placed character to focus on
  speaker: string;
  speakerEmoji: string;
  message: string;
  characterPosition?: { x: number; y: number }; // Manual position if no characterId
  characterModel?: string; // Manual model if no characterId
}

export interface Maze {
  id: number;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  grid: MazeCell[][];
  timeLimit: number;
  previewTime: number;
  medalTimes: MedalTimes;
  unlockConditions?: UnlockCondition[]; // undefined = always unlocked
  currencyCost?: number; // optional currency cost to unlock special mazes
  characters?: MazeCharacter[]; // placed characters in the maze
  dialogues?: DialogueTrigger[]; // optional dialogue triggers
  introDialogues?: IntroDialogue[]; // optional intro sequence before maze starts
  endConditions?: {
    requiredDialogues?: string[]; // Dialogues that must be completed before end cell triggers level complete
  };
}

export interface GameState {
  currentAnimal: AnimalType | null;
  currentLevel: number;
  score: number;
  timeRemaining: number;
  isPlaying: boolean;
  isPreviewing: boolean;
  showMaze: boolean;
  playerPosition: { x: number; y: number };
  unlockedAnimals: AnimalType[];
  totalMealsUnlocked: number;
}

export interface PowerUp {
  id: string;
  type: 'speed' | 'time' | 'key';
  brand?: string;
  value: number;
}
