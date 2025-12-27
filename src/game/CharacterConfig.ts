/**
 * Character Model Configuration
 * 
 * Centralized configuration for character model sizes and settings.
 * Use this to ensure consistent character sizing across the game.
 */

export interface CharacterModelConfig {
  scale: number;
  yOffset?: number; // Optional vertical offset
  height?: number; // Approximate world-space height of the character (for camera framing)
}

export const CharacterConfig: Record<string, CharacterModelConfig> = {
  // Main characters - yOffset adjusts vertical position so feet touch ground
  'Farmer.glb': {
    scale: 0.55,
    yOffset: -0.05,
    height: 1.8, // Tall human
  },
  'Animated_Woman.glb': {
    scale: 0.20,
    yOffset: -0.15,
    height: 1.7, // Tall human
  },
  
  // Animals
  'Cow.glb': {
    scale: 0.4,
    yOffset: 0,
    height: 1.4, // Large animal
  },
  'Pig.glb': {
    scale: 0.35,
    yOffset: 0,
    height: 0.5, // Small animal - needs close camera framing
  },
  'Hen.glb': {
    scale: 0.25,
    yOffset: 0,
    height: 0.35, // Very small - needs very close camera framing
  },
  'Hen_idle.glb': {
    scale: 0.25,
    yOffset: 0,
    height: 0.35,
  },
  'Hen_walk.glb': {
    scale: 0.25,
    yOffset: 0,
    height: 0.35,
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

/**
 * Get the approximate world-space height of a character.
 * Falls back to 1.0 if not specified.
 */
export function getCharacterHeight(modelFile: string): number {
  return CharacterConfig[modelFile]?.height ?? 1.0;
}
