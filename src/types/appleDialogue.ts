// Apple feeding dialogue system
// Dialogues triggered when feeding apples to NPC characters

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
  animalId: string; // NPC character ID (e.g. 'remy_rat'), not player animal type
  dialogues: AppleDialogue[];
}

// Characters that should NEVER be feedable (humans, non-animal NPCs)
const NON_FEEDABLE_CHARACTERS: string[] = [
  'sanctuary_sam', 'sanctuary_sam_ch1', 'char_stella',
  // Player animal types are also not feedable
  'pig', 'cow', 'bird',
];

// Check if a character can be fed apples (any character not in the exclusion list)
export const canBeFedApples = (characterId: string): boolean => {
  return !NON_FEEDABLE_CHARACTERS.includes(characterId);
};
