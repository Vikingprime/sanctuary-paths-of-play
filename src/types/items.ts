// Item system types

export type ItemType = 'apple' | 'temporary_boost';

export interface BaseItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  icon: string; // emoji
}

// Apple - permanent collectible that can be fed to animals
export interface Apple extends BaseItem {
  type: 'apple';
}

// Player's inventory of apples
export interface AppleInventory {
  count: number;
  totalCollected: number; // Lifetime count
}

// Friend points per animal
export interface AnimalFriendship {
  animalId: string;
  friendPoints: number;
  applesGiven: number;
  unlockedDialogues: string[]; // IDs of unlocked dialogue tiers
}

// Friendship tiers and their point thresholds
export interface FriendshipTier {
  id: string;
  name: string;
  pointsRequired: number;
  dialogueId: string; // Which dialogue unlocks at this tier
  reward?: string; // Optional reward description
}

// Default friendship tiers
export const FRIENDSHIP_TIERS: FriendshipTier[] = [
  { id: 'stranger', name: 'Stranger', pointsRequired: 0, dialogueId: 'greeting' },
  { id: 'acquaintance', name: 'Acquaintance', pointsRequired: 3, dialogueId: 'friendly' },
  { id: 'friend', name: 'Friend', pointsRequired: 10, dialogueId: 'trusting' },
  { id: 'bestFriend', name: 'Best Friend', pointsRequired: 25, dialogueId: 'bestfriend' },
  { id: 'soulmate', name: 'Soulmate', pointsRequired: 50, dialogueId: 'soulmate' },
];

// Points per apple fed
export const POINTS_PER_APPLE = 1;

// Get current friendship tier for an animal
export const getFriendshipTier = (points: number): FriendshipTier => {
  // Return highest tier that player has reached
  for (let i = FRIENDSHIP_TIERS.length - 1; i >= 0; i--) {
    if (points >= FRIENDSHIP_TIERS[i].pointsRequired) {
      return FRIENDSHIP_TIERS[i];
    }
  }
  return FRIENDSHIP_TIERS[0];
};

// Get next friendship tier (for progress display)
export const getNextFriendshipTier = (points: number): FriendshipTier | null => {
  for (const tier of FRIENDSHIP_TIERS) {
    if (points < tier.pointsRequired) {
      return tier;
    }
  }
  return null; // Max tier reached
};
