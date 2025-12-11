import { Animal } from '@/types/game';

export const animals: Animal[] = [
  {
    id: 'pig',
    name: 'Penny the Pig',
    emoji: '🐷',
    color: 'pig',
    ability: {
      name: 'Super Sniffer',
      description: 'Can smell nearby power-ups and reveal them on the map',
      icon: '👃',
    },
    mealProgress: 0,
    mealsUnlocked: 0,
  },
  {
    id: 'cow',
    name: 'Clara the Cow',
    emoji: '🐮',
    color: 'cow',
    ability: {
      name: 'Call a Friend',
      description: 'Summon a helper to explore one path ahead',
      icon: '📞',
    },
    mealProgress: 0,
    mealsUnlocked: 0,
  },
  {
    id: 'bird',
    name: 'Bella the Bird',
    emoji: '🐔',
    color: 'bird',
    ability: {
      name: 'Quick Flutter',
      description: 'Fly over one wall to find a shortcut',
      icon: '🪶',
    },
    mealProgress: 0,
    mealsUnlocked: 0,
  },
];
