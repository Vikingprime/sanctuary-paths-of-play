// Item system types

export type ItemType = 'berry' | 'temporary_boost';

export interface BaseItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  icon: string; // emoji
}

// Berry - permanent collectible that can be fed to animals
export interface Berry extends BaseItem {
  type: 'berry';
}

// Player's inventory of berries
export interface BerryInventory {
  count: number;
  totalCollected: number; // Lifetime count
}

// Friend points per animal
export interface AnimalFriendship {
  animalId: string;
  friendPoints: number;
  berriesGiven: number;
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

// Points per berry fed
export const POINTS_PER_BERRY = 1;

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
