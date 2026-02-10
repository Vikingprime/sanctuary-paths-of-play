// Apple feeding dialogues for each NPC character
// These are triggered when feeding apples to NPC characters during gameplay

import { AnimalAppleDialogues, AppleDialogueMessage, AppleDialogue } from '@/types/appleDialogue';

// Re-export for editor use
export type { AnimalAppleDialogues, AppleDialogue };

export const animalAppleDialogues: AnimalAppleDialogues[] = [
  // Add NPC-specific apple dialogues here, e.g.:
  // {
  //   animalId: 'remy_rat',
  //   dialogues: [
  //     { id: 'remy-apple-1', appleNumber: 1, messages: [{ speaker: 'Remy the Rat', speakerEmoji: '🐀', message: 'A apple? For me?' }] },
  //   ],
  // },
];

// Get dialogues for a specific animal
export const getAnimalDialogues = (animalId: string): AnimalAppleDialogues | undefined => {
  return animalAppleDialogues.find(a => a.animalId === animalId);
};

// Get total number of apple dialogues for an animal
export const getAppleDialogueCount = (animalId: string): number => {
  const animalData = getAnimalDialogues(animalId);
  return animalData?.dialogues.length ?? 0;
};

// Get the next untriggered apple dialogue for an animal
// appleIndex is 0-based (0 = first apple dialogue, 1 = second, etc.)
export const getNextAppleDialogue = (
  animalId: string, 
  appleIndex: number
): { dialogue: AppleDialogueMessage[]; dialogueId: string } | null => {
  const animalData = getAnimalDialogues(animalId);
  if (!animalData) return null;
  
  // Find dialogue for the next apple (appleIndex + 1 since appleNumber is 1-based)
  const nextAppleNumber = appleIndex + 1;
  const dialogue = animalData.dialogues.find(d => d.appleNumber === nextAppleNumber);
  
  if (!dialogue) return null;
  
  return {
    dialogue: dialogue.messages,
    dialogueId: dialogue.id,
  };
};
