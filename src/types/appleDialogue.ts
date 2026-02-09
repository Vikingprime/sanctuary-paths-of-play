// Apple feeding dialogue system
// Dialogues triggered when feeding apples to animals

import { AnimalType } from './game';

export interface AppleDialogueMessage {
  speaker: string;
  speakerEmoji: string;
  message: string;
}

export interface AppleDialogue {
  id: string;
  appleNumber: number; // Which apple triggers this (1st, 2nd, 3rd, etc.)
  messages: AppleDialogueMessage[];
}

export interface AnimalAppleDialogues {
  animalId: AnimalType;
  dialogues: AppleDialogue[];
}

// Check if an animal type can be fed apples (only actual animals, not humans/NPCs)
export const canBeFedApples = (characterType: string): boolean => {
  const feedableAnimals: string[] = ['pig', 'cow', 'bird'];
  return feedableAnimals.includes(characterType);
};
