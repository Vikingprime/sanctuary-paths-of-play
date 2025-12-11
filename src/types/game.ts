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

export interface Maze {
  id: number;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  grid: MazeCell[][];
  timeLimit: number;
  previewTime: number;
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
