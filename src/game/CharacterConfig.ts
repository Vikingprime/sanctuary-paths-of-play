/**
 * Character Model Configuration
 * 
 * Centralized configuration for character model sizes and settings.
 * Use this to ensure consistent character sizing across the game.
 */

export interface CharacterModelConfig {
  scale: number;
  yOffset?: number; // Optional vertical offset
}

export const CharacterConfig: Record<string, CharacterModelConfig> = {
  // Main characters - yOffset adjusts vertical position so feet touch ground
  'Farmer.glb': {
    scale: 0.55,
    yOffset: -0.05, // Slight adjustment to ground feet
  },
  'Animated_Woman.glb': {
    scale: 0.20, // Model is much larger than Farmer
    yOffset: -0.08, // Adjust to ground feet
  },
  
  // Animals
  'Cow.glb': {
    scale: 0.4,
    yOffset: 0,
  },
  'Pig.glb': {
    scale: 0.35,
    yOffset: 0,
  },
  'Hen.glb': {
    scale: 0.25,
    yOffset: 0,
  },
  'Hen_idle.glb': {
    scale: 0.25,
    yOffset: 0,
  },
  'Hen_walk.glb': {
    scale: 0.25,
    yOffset: 0,
  },
} as const;

/**
 * Get the scale for a character model.
 * Falls back to 0.5 if model not found in config.
 */
export function getCharacterScale(modelFile: string): number {
  return CharacterConfig[modelFile]?.scale ?? 0.5;
}

/**
 * Get the Y offset for a character model.
 * Falls back to 0 if not specified.
 */
export function getCharacterYOffset(modelFile: string): number {
  return CharacterConfig[modelFile]?.yOffset ?? 0;
}
