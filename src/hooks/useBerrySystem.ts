import { useState, useCallback, useEffect } from 'react';
import { 
  BerryInventory, 
  AnimalFriendship, 
  POINTS_PER_BERRY,
  getFriendshipTier,
  getNextFriendshipTier,
} from '@/types/items';
import { AnimalType } from '@/types/game';

const BERRY_STORAGE_KEY = 'foggy-farm-berries';
const FRIENDSHIP_STORAGE_KEY = 'foggy-farm-friendships';

interface BerrySystemState {
  inventory: BerryInventory;
  friendships: Record<string, AnimalFriendship>;
}

// Load state from localStorage
const loadState = (): BerrySystemState => {
  try {
    const berryData = localStorage.getItem(BERRY_STORAGE_KEY);
    const friendshipData = localStorage.getItem(FRIENDSHIP_STORAGE_KEY);
    
    return {
      inventory: berryData ? JSON.parse(berryData) : { count: 0, totalCollected: 0 },
      friendships: friendshipData ? JSON.parse(friendshipData) : {},
    };
  } catch {
    return {
      inventory: { count: 0, totalCollected: 0 },
      friendships: {},
    };
  }
};

// Save state to localStorage
const saveState = (state: BerrySystemState) => {
  try {
    localStorage.setItem(BERRY_STORAGE_KEY, JSON.stringify(state.inventory));
    localStorage.setItem(FRIENDSHIP_STORAGE_KEY, JSON.stringify(state.friendships));
  } catch {
    // Storage full or unavailable
  }
};

export function useBerrySystem() {
  const [state, setState] = useState<BerrySystemState>(loadState);
  
  // Persist changes
  useEffect(() => {
    saveState(state);
  }, [state]);
  
  // Collect a berry (from maze or reward ad)
  const collectBerry = useCallback((count = 1) => {
    setState(prev => ({
      ...prev,
      inventory: {
        count: prev.inventory.count + count,
        totalCollected: prev.inventory.totalCollected + count,
      },
    }));
  }, []);
  
  // Feed a berry to an animal
  const feedBerry = useCallback((animalId: AnimalType) => {
    setState(prev => {
      if (prev.inventory.count <= 0) return prev;
      
      const currentFriendship = prev.friendships[animalId] || {
        animalId,
        friendPoints: 0,
        berriesGiven: 0,
        unlockedDialogues: [],
      };
      
      const newPoints = currentFriendship.friendPoints + POINTS_PER_BERRY;
      const newTier = getFriendshipTier(newPoints);
      const oldTier = getFriendshipTier(currentFriendship.friendPoints);
      
      // Check if new tier unlocked
      const unlockedDialogues = [...currentFriendship.unlockedDialogues];
      if (newTier.id !== oldTier.id && !unlockedDialogues.includes(newTier.dialogueId)) {
        unlockedDialogues.push(newTier.dialogueId);
      }
      
      return {
        ...prev,
        inventory: {
          ...prev.inventory,
          count: prev.inventory.count - 1,
        },
        friendships: {
          ...prev.friendships,
          [animalId]: {
            animalId,
            friendPoints: newPoints,
            berriesGiven: currentFriendship.berriesGiven + 1,
            unlockedDialogues,
          },
        },
      };
    });
  }, []);
  
  // Get friendship for a specific animal
  const getFriendship = useCallback((animalId: AnimalType): AnimalFriendship => {
    return state.friendships[animalId] || {
      animalId,
      friendPoints: 0,
      berriesGiven: 0,
      unlockedDialogues: [],
    };
  }, [state.friendships]);
  
  // Check if a specific dialogue tier is unlocked
  const isDialogueUnlocked = useCallback((animalId: AnimalType, dialogueId: string): boolean => {
    const friendship = state.friendships[animalId];
    if (!friendship) return dialogueId === 'greeting'; // Base dialogue always available
    return friendship.unlockedDialogues.includes(dialogueId) || dialogueId === 'greeting';
  }, [state.friendships]);
  
  // Get progress to next tier
  const getProgress = useCallback((animalId: AnimalType): { 
    currentTier: ReturnType<typeof getFriendshipTier>;
    nextTier: ReturnType<typeof getNextFriendshipTier>;
    progress: number; // 0-1
  } => {
    const friendship = getFriendship(animalId);
    const currentTier = getFriendshipTier(friendship.friendPoints);
    const nextTier = getNextFriendshipTier(friendship.friendPoints);
    
    if (!nextTier) {
      return { currentTier, nextTier: null, progress: 1 };
    }
    
    const pointsIntoTier = friendship.friendPoints - currentTier.pointsRequired;
    const pointsNeeded = nextTier.pointsRequired - currentTier.pointsRequired;
    
    return {
      currentTier,
      nextTier,
      progress: pointsIntoTier / pointsNeeded,
    };
  }, [getFriendship]);
  
  // Reset for testing
  const resetBerrySystem = useCallback(() => {
    setState({
      inventory: { count: 0, totalCollected: 0 },
      friendships: {},
    });
  }, []);
  
  // Add berries for testing
  const addTestBerries = useCallback((count: number) => {
    collectBerry(count);
  }, [collectBerry]);
  
  return {
    berryCount: state.inventory.count,
    totalBerriesCollected: state.inventory.totalCollected,
    friendships: state.friendships,
    collectBerry,
    feedBerry,
    getFriendship,
    isDialogueUnlocked,
    getProgress,
    resetBerrySystem,
    addTestBerries,
  };
}
