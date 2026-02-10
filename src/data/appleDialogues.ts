// Apple feeding dialogues for each NPC character
// These are triggered when feeding apples to NPC characters during gameplay

import { AnimalAppleDialogues, AppleDialogueMessage, AppleDialogue } from '@/types/appleDialogue';

// Re-export for editor use
export type { AnimalAppleDialogues, AppleDialogue };

export const animalAppleDialogues: AnimalAppleDialogues[] = [
  {
    animalId: 'pig',
    dialogues: [
      {
        id: 'pig-apple-1',
        appleNumber: 1,
        messages: [
          { speaker: 'Penny the Pig', speakerEmoji: '🐷', message: "Oink! An apple? For me? You're so kind!" },
        ],
      },
      {
        id: 'pig-apple-2',
        appleNumber: 2,
        messages: [
          { speaker: 'Penny the Pig', speakerEmoji: '🐷', message: "Another apple! I knew you were a good friend." },
          { speaker: 'Penny the Pig', speakerEmoji: '🐷', message: "Did you know I can sniff out treats from a mile away?" },
        ],
      },
      {
        id: 'pig-apple-3',
        appleNumber: 3,
        messages: [
          { speaker: 'Penny the Pig', speakerEmoji: '🐷', message: "Mmmm, these apples are delicious! I'm starting to really trust you." },
        ],
      },
      {
        id: 'pig-apple-4',
        appleNumber: 4,
        messages: [
          { speaker: 'Penny the Pig', speakerEmoji: '🐷', message: "You know, not everyone understands pigs. But you... you're different." },
        ],
      },
      {
        id: 'pig-apple-5',
        appleNumber: 5,
        messages: [
          { speaker: 'Penny the Pig', speakerEmoji: '🐷', message: "We're becoming such good friends! I'll share a secret with you soon..." },
        ],
      },
    ],
  },
  {
    animalId: 'cow',
    dialogues: [
      {
        id: 'cow-apple-1',
        appleNumber: 1,
        messages: [
          { speaker: 'Clara the Cow', speakerEmoji: '🐮', message: "Moo! How thoughtful of you to bring me a treat!" },
        ],
      },
      {
        id: 'cow-apple-2',
        appleNumber: 2,
        messages: [
          { speaker: 'Clara the Cow', speakerEmoji: '🐮', message: "Another apple! You really know the way to a cow's heart." },
          { speaker: 'Clara the Cow', speakerEmoji: '🐮', message: "The farm feels less lonely with friends like you around." },
        ],
      },
      {
        id: 'cow-apple-3',
        appleNumber: 3,
        messages: [
          { speaker: 'Clara the Cow', speakerEmoji: '🐮', message: "You're very generous! I'm warming up to you more and more." },
        ],
      },
      {
        id: 'cow-apple-4',
        appleNumber: 4,
        messages: [
          { speaker: 'Clara the Cow', speakerEmoji: '🐮', message: "I feel like I can tell you things I don't tell other animals..." },
        ],
      },
      {
        id: 'cow-apple-5',
        appleNumber: 5,
        messages: [
          { speaker: 'Clara the Cow', speakerEmoji: '🐮', message: "Best friends forever? I think so! 💕" },
        ],
      },
    ],
  },
  {
    animalId: 'bird',
    dialogues: [
      {
        id: 'bird-apple-1',
        appleNumber: 1,
        messages: [
          { speaker: 'Bella the Bird', speakerEmoji: '🐔', message: "Bawk! An apple? Well, aren't you a sweetheart!" },
        ],
      },
      {
        id: 'bird-apple-2',
        appleNumber: 2,
        messages: [
          { speaker: 'Bella the Bird', speakerEmoji: '🐔', message: "Cluck cluck! You remembered I like apples!" },
          { speaker: 'Bella the Bird', speakerEmoji: '🐔', message: "I've been practicing my flutter technique. Want to see sometime?" },
        ],
      },
      {
        id: 'bird-apple-3',
        appleNumber: 3,
        messages: [
          { speaker: 'Bella the Bird', speakerEmoji: '🐔', message: "Three apples! You're really spoiling me now." },
        ],
      },
      {
        id: 'bird-apple-4',
        appleNumber: 4,
        messages: [
          { speaker: 'Bella the Bird', speakerEmoji: '🐔', message: "I don't usually get this close to people, but you're special." },
        ],
      },
      {
        id: 'bird-apple-5',
        appleNumber: 5,
        messages: [
          { speaker: 'Bella the Bird', speakerEmoji: '🐔', message: "We're the best of friends now! I'll teach you all my shortcuts!" },
        ],
      },
    ],
  },
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
