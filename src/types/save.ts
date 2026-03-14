import { MedalType } from './game';

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
    currency: number; // for unlocking special mazes
  };
  
  // Level progress - keyed by maze ID for fast lookup
  levels: {
    [mazeId: number]: {
      completed: boolean;
      bestTime: number | null; // seconds
      medal: MedalType; // best medal earned
      attempts: number; // total attempts (gold only possible on attempt 1)
      powerUpsCollected: string[];
    };
  };
  
  // Achievements/unlocks for future expansion
  achievements: string[];
  
  // Unlocked special mazes (paid with currency)
  unlockedMazes: number[];
  
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
    currency: 0,
  },
  levels: {},
  achievements: [],
  unlockedMazes: [],
  settings: {
    musicVolume: 0.7,
    sfxVolume: 1.0,
    sensitivity: 1.0,
    debugMode: false,
  },
};
