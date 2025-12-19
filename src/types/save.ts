// Save schema v1 - Unity must use same structure
export interface SaveDataV1 {
  version: 1;
  lastUpdated: string; // ISO timestamp
  
  // Player progress
  player: {
    totalScore: number;
    totalMealsUnlocked: number;
    unlockedAnimals: string[]; // Animal IDs
    currentAnimal: string | null;
  };
  
  // Level progress - keyed by maze ID for fast lookup
  levels: {
    [mazeId: number]: {
      completed: boolean;
      bestTime: number | null; // seconds
      stars: number; // 0-3
      powerUpsCollected: string[];
    };
  };
  
  // Achievements/unlocks for future expansion
  achievements: string[];
  
  // Settings
  settings: {
    musicVolume: number;
    sfxVolume: number;
    sensitivity: number;
    debugMode: boolean;
  };
}

export type SaveData = SaveDataV1;

// Default save state
export const DEFAULT_SAVE: SaveData = {
  version: 1,
  lastUpdated: new Date().toISOString(),
  player: {
    totalScore: 0,
    totalMealsUnlocked: 0,
    unlockedAnimals: ['pig', 'cow', 'bird'],
    currentAnimal: null,
  },
  levels: {},
  achievements: [],
  settings: {
    musicVolume: 0.7,
    sfxVolume: 1.0,
    sensitivity: 1.0,
    debugMode: false,
  },
};
