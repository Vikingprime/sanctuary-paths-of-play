import { useState, useCallback, useEffect } from 'react';
import { 
  AppleInventory, 
  AnimalFriendship, 
  POINTS_PER_APPLE,
  getFriendshipTier,
  getNextFriendshipTier,
} from '@/types/items';
import { AnimalType } from '@/types/game';

const APPLE_STORAGE_KEY = 'foggy-farm-apples';
const FRIENDSHIP_STORAGE_KEY = 'foggy-farm-friendships';

interface AppleSystemState {
  inventory: AppleInventory;
  friendships: Record<string, AnimalFriendship>;
}

// Load state from localStorage
const loadState = (): AppleSystemState => {
  try {
    const appleData = localStorage.getItem(APPLE_STORAGE_KEY);
    const friendshipData = localStorage.getItem(FRIENDSHIP_STORAGE_KEY);
    
    return {
      inventory: appleData ? JSON.parse(appleData) : { count: 0, totalCollected: 0 },
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
const saveState = (state: AppleSystemState) => {
  try {
    localStorage.setItem(APPLE_STORAGE_KEY, JSON.stringify(state.inventory));
    localStorage.setItem(FRIENDSHIP_STORAGE_KEY, JSON.stringify(state.friendships));
  } catch {
    // Storage full or unavailable
  }
};

export function useAppleSystem() {
  const [state, setState] = useState<AppleSystemState>(loadState);
  
  // Persist changes
  useEffect(() => {
    saveState(state);
  }, [state]);
  
  // Collect an apple (from maze or reward ad)
  const collectApple = useCallback((count = 1) => {
    setState(prev => ({
      ...prev,
      inventory: {
        count: prev.inventory.count + count,
        totalCollected: prev.inventory.totalCollected + count,
      },
    }));
  }, []);
  
  // Feed an apple to an animal
  const feedApple = useCallback((animalId: AnimalType) => {
    setState(prev => {
      if (prev.inventory.count <= 0) return prev;
      
      const currentFriendship = prev.friendships[animalId] || {
        animalId,
        friendPoints: 0,
        applesGiven: 0,
        unlockedDialogues: [],
      };
      
      const newPoints = currentFriendship.friendPoints + POINTS_PER_APPLE;
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
            applesGiven: currentFriendship.applesGiven + 1,
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
      applesGiven: 0,
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
  const resetAppleSystem = useCallback(() => {
    setState({
      inventory: { count: 0, totalCollected: 0 },
      friendships: {},
    });
  }, []);
  
  // Add apples for testing
  const addTestApples = useCallback((count: number) => {
    collectApple(count);
  }, [collectApple]);
  
  return {
    appleCount: state.inventory.count,
    totalApplesCollected: state.inventory.totalCollected,
    friendships: state.friendships,
    collectApple,
    feedApple,
    getFriendship,
    isDialogueUnlocked,
    getProgress,
    resetAppleSystem,
    addTestApples,
  };
}
