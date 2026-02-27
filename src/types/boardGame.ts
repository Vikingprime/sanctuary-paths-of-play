// Board Game / Dice Roll Mode types

export type BoardSquareType = 'feed' | 'stars' | 'extra_roll' | 'unlock_animal' | 'empty';

export interface BoardSquare {
  id: number;
  type: BoardSquareType;
  // Feed: percentage added to bag (1-4%)
  // Stars: number of stars earned
  // Extra roll: number of bonus rolls
  value: number;
  label: string;
  emoji: string;
}

export interface FeedBag {
  progress: number; // 0-100%
  totalSent: number; // how many bags sent
}

export interface BoardGameState {
  playerPosition: number; // index on the board (0-29)
  rollsRemaining: number;
  feedBag: FeedBag;
  starsEarned: number;
  lastRoll: number | null; // 1-6
  isRolling: boolean;
  isMoving: boolean; // animal is traversing
  rewardMessage: string | null;
  animalsUnlocked: string[]; // newly unlocked animal IDs this session
}

// Generate the 30-square board layout
export function generateBoard(): BoardSquare[] {
  const squares: BoardSquare[] = [];
  
  for (let i = 0; i < 30; i++) {
    squares.push(assignSquareType(i));
  }
  
  return squares;
}

function assignSquareType(index: number): BoardSquare {
  // Distribution across 30 squares:
  // Feed: ~18 squares (common)
  // Stars: ~6 squares (medium rare)
  // Extra roll: ~3 squares (rare)
  // Unlock animal: ~1 square (rare)
  // Empty: ~2 squares
  
  const feedPositions = [0, 1, 3, 4, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 28];
  const starPositions = [2, 7, 12, 17, 22, 27];
  const extraRollPositions = [5, 15, 25];
  const unlockPositions = [10];
  
  if (feedPositions.includes(index)) {
    const feedAmount = 1 + Math.floor(Math.random() * 4); // 1-4%
    return {
      id: index,
      type: 'feed',
      value: feedAmount,
      label: `+${feedAmount}% Feed`,
      emoji: '🥣',
    };
  }
  
  if (starPositions.includes(index)) {
    const starAmount = 1 + Math.floor(Math.random() * 3); // 1-3 stars
    return {
      id: index,
      type: 'stars',
      value: starAmount,
      label: `+${starAmount} ⭐`,
      emoji: '⭐',
    };
  }
  
  if (extraRollPositions.includes(index)) {
    return {
      id: index,
      type: 'extra_roll',
      value: 1,
      label: '+1 Roll',
      emoji: '🎲',
    };
  }
  
  if (unlockPositions.includes(index)) {
    return {
      id: index,
      type: 'unlock_animal',
      value: 1,
      label: 'New Friend!',
      emoji: '🐾',
    };
  }
  
  return {
    id: index,
    type: 'empty',
    value: 0,
    label: 'Safe',
    emoji: '🌿',
  };
}

// Calculate rolls allotted: base + gold medals bonus
export function calculateRolls(goldMedals: number, adsWatched: number = 0): number {
  const BASE_ROLLS = 3;
  const ROLLS_PER_GOLD = 1; // 1 extra roll per gold medal
  const ROLLS_PER_AD = 2;
  
  return BASE_ROLLS + (goldMedals * ROLLS_PER_GOLD) + (adsWatched * ROLLS_PER_AD);
}
