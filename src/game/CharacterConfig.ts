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

// Scale factors relative to corn stalk (1.0 unit):
// Chicken 0.19, Pig 0.38, Cow 0.63, Woman 0.68, Man/Farmer 0.72, Cornstalk 1.00
export const CharacterConfig: Record<string, CharacterModelConfig> = {
  // Main characters - yOffset adjusts vertical position so feet touch ground
  'Farmer.glb': {
    scale: 0.50,   // Farmer should be tallest (0.72 relative to corn)
    yOffset: -0.1,
  },
  'Animated_Woman.glb': {
    scale: 0.47,   // Woman should be 0.68 relative to corn (slightly shorter than farmer)
    yOffset: -0.1,
  },
  
  // Animals - scales relative to corn stalk height (1.0)
  'Cow.glb': {
    scale: 0.63,
    yOffset: 0,
  },
  'Pig.glb': {
    scale: 0.38,
    yOffset: 0,
  },
  'Hen.glb': {
    scale: 0.19,
    yOffset: 0,
  },
  'Hen_idle.glb': {
    scale: 0.19,
    yOffset: 0,
  },
  'Hen_walk.glb': {
    scale: 0.19,
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
