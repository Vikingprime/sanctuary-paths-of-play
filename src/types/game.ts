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

export interface DialogueTrigger {
  id: string;
  speaker: string;
  speakerEmoji: string;
  message: string;
  position: { x: number; y: number }; // Cell coordinates
  triggerRadius?: number; // Default 0.5 (touch only - meters)
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
  dialogues?: DialogueTrigger[]; // optional dialogue triggers
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
