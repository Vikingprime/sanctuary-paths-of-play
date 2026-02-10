import { useState, useCallback, useEffect } from 'react';
import { 
  AppleInventory, 
  AnimalFriendship, 
  POINTS_PER_APPLE,
  getFriendshipTier,
  getNextFriendshipTier,
} from '@/types/items';
import { AppleDialogueMessage, canBeFedApples } from '@/types/appleDialogue';
import { getNextAppleDialogue, getAppleDialogueCount } from '@/data/appleDialogues';
import { animals } from '@/data/animals';

const APPLE_STORAGE_KEY = 'foggy-farm-apples';
const FRIENDSHIP_STORAGE_KEY = 'foggy-farm-friendships';
const PENDING_DIALOGUE_KEY = 'foggy-farm-pending-apple-dialogue';

interface AppleSystemState {
  inventory: AppleInventory;
  friendships: Record<string, AnimalFriendship>;
  // Track pending apple dialogue that must be shown before feeding more
  pendingAppleDialogue: {
    animalId: string; // NPC character ID
    messages: AppleDialogueMessage[];
    dialogueId: string;
  } | null;
}

// Default starting apples for new players
const DEFAULT_APPLE_COUNT = 100;

// Load state from localStorage
const loadState = (): AppleSystemState => {
  try {
    const appleData = localStorage.getItem(APPLE_STORAGE_KEY);
    const friendshipData = localStorage.getItem(FRIENDSHIP_STORAGE_KEY);
    const pendingDialogueData = localStorage.getItem(PENDING_DIALOGUE_KEY);
    
    const defaultInventory = { count: DEFAULT_APPLE_COUNT, totalCollected: DEFAULT_APPLE_COUNT };
    const savedInventory = appleData ? JSON.parse(appleData) : null;
    
    // Use default if no saved data, or if saved count is 0 and totalCollected <= DEFAULT
    // (ensures players always have apples for testing during development)
    const inventory = savedInventory && savedInventory.count > 0 
      ? savedInventory 
      : defaultInventory;
    
    return {
      inventory,
      friendships: friendshipData ? JSON.parse(friendshipData) : {},
      pendingAppleDialogue: pendingDialogueData ? JSON.parse(pendingDialogueData) : null,
    };
  } catch {
    return {
      inventory: { count: DEFAULT_APPLE_COUNT, totalCollected: DEFAULT_APPLE_COUNT },
      friendships: {},
      pendingAppleDialogue: null,
    };
  }
};

// Save state to localStorage
const saveState = (state: AppleSystemState) => {
  try {
    localStorage.setItem(APPLE_STORAGE_KEY, JSON.stringify(state.inventory));
    localStorage.setItem(FRIENDSHIP_STORAGE_KEY, JSON.stringify(state.friendships));
    if (state.pendingAppleDialogue) {
      localStorage.setItem(PENDING_DIALOGUE_KEY, JSON.stringify(state.pendingAppleDialogue));
    } else {
      localStorage.removeItem(PENDING_DIALOGUE_KEY);
    }
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
  
  // Check if an animal can be fed (must be feedable animal type and no pending dialogue)
  const canFeedApple = useCallback((animalId: string): { canFeed: boolean; reason?: string } => {
    // Check if this is a feedable animal type
    if (!canBeFedApples(animalId)) {
      return { canFeed: false, reason: 'This character cannot be fed apples' };
    }
    
    // Check if there's a pending dialogue that needs to be shown first
    if (state.pendingAppleDialogue) {
      if (state.pendingAppleDialogue.animalId === animalId) {
        return { canFeed: false, reason: 'You must talk to this animal first' };
      } else {
        // Different animal - can't feed while another has pending dialogue
        return { canFeed: false, reason: 'Another animal wants to talk to you first' };
      }
    }
    
    // Check if player has apples
    if (state.inventory.count <= 0) {
      return { canFeed: false, reason: 'No apples to feed' };
    }
    
    return { canFeed: true };
  }, [state.pendingAppleDialogue, state.inventory.count]);
  
  // Feed an apple to an animal - returns the dialogue to show (if any)
  // appleDialogueIndex is the 0-based index of which apple dialogue to trigger (based on interleaved ordering)
  const feedApple = useCallback((animalId: string, appleDialogueIndex?: number): {
    success: boolean;
    dialogue?: AppleDialogueMessage[];
    dialogueId?: string;
    reason?: string;
    noDialogueLeft?: boolean;
  } => {
    const canFeedResult = canFeedApple(animalId);
    if (!canFeedResult.canFeed) {
      return { success: false, reason: canFeedResult.reason };
    }
    
    // Get current friendship state
    const currentFriendship = state.friendships[animalId] || {
      animalId,
      friendPoints: 0,
      applesGiven: 0,
      unlockedDialogues: [],
    };
    
    // Determine which apple dialogue to trigger
    // If appleDialogueIndex is provided, use that (for interleaved ordering)
    // Otherwise use the applesGiven count (legacy behavior)
    const effectiveAppleNumber = appleDialogueIndex !== undefined 
      ? appleDialogueIndex 
      : currentFriendship.applesGiven;
    
    // Check if there are any remaining apple dialogues
    const totalAppleDialogues = getAppleDialogueCount(animalId);
    if (effectiveAppleNumber >= totalAppleDialogues) {
      // No more apple dialogue left - reject the transaction
      const animalData = animals.find(a => a.id === animalId);
      const animalName = animalData?.name || animalId;
      return { 
        success: false, 
        reason: `${animalName} doesn't want any more apples`,
        noDialogueLeft: true,
      };
    }
    
    // Get the next apple dialogue for this animal
    const nextDialogue = getNextAppleDialogue(animalId, effectiveAppleNumber);
    
    // Calculate new friendship values
    const newPoints = currentFriendship.friendPoints + POINTS_PER_APPLE;
    const newTier = getFriendshipTier(newPoints);
    const oldTier = getFriendshipTier(currentFriendship.friendPoints);
    
    // Check if new tier unlocked
    const unlockedDialogues = [...currentFriendship.unlockedDialogues];
    if (newTier.id !== oldTier.id && !unlockedDialogues.includes(newTier.dialogueId)) {
      unlockedDialogues.push(newTier.dialogueId);
    }
    
    // Update state
    setState(prev => ({
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
      // Set pending dialogue if there is one
      pendingAppleDialogue: nextDialogue ? {
        animalId,
        messages: nextDialogue.dialogue,
        dialogueId: nextDialogue.dialogueId,
      } : null,
    }));
    
    if (nextDialogue) {
      return {
        success: true,
        dialogue: nextDialogue.dialogue,
        dialogueId: nextDialogue.dialogueId,
      };
    }
    
    return { success: true };
  }, [state.friendships, canFeedApple]);
  
  // Mark the pending apple dialogue as completed
  const completePendingDialogue = useCallback(() => {
    setState(prev => ({
      ...prev,
      pendingAppleDialogue: null,
    }));
  }, []);
  
  // Get the pending apple dialogue (if any)
  const getPendingDialogue = useCallback(() => {
    return state.pendingAppleDialogue;
  }, [state.pendingAppleDialogue]);
  
  // Get friendship for a specific animal
  const getFriendship = useCallback((animalId: string): AnimalFriendship => {
    return state.friendships[animalId] || {
      animalId,
      friendPoints: 0,
      applesGiven: 0,
      unlockedDialogues: [],
    };
  }, [state.friendships]);
  
  // Get the number of apples already given to a specific animal
  const getApplesGivenCount = useCallback((animalId: string): number => {
    return state.friendships[animalId]?.applesGiven ?? 0;
  }, [state.friendships]);
  // Check if a specific dialogue tier is unlocked
  const isDialogueUnlocked = useCallback((animalId: string, dialogueId: string): boolean => {
    const friendship = state.friendships[animalId];
    if (!friendship) return dialogueId === 'greeting'; // Base dialogue always available
    return friendship.unlockedDialogues.includes(dialogueId) || dialogueId === 'greeting';
  }, [state.friendships]);
  
  // Get progress to next tier
  const getProgress = useCallback((animalId: string): { 
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
      pendingAppleDialogue: null,
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
    pendingAppleDialogue: state.pendingAppleDialogue,
    collectApple,
    feedApple,
    canFeedApple,
    completePendingDialogue,
    getPendingDialogue,
    getFriendship,
    getApplesGivenCount,
    isDialogueUnlocked,
    getProgress,
    resetAppleSystem,
    addTestApples,
  };
}
