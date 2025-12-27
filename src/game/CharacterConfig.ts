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

// Scale factors based on corn height of ~4 units
// Target heights: Chicken 0.76 (19%), Pig 1.52 (38%), Cow 2.52 (63%), Woman 2.72 (68%), Farmer 2.88 (72%)
export const CharacterConfig: Record<string, CharacterModelConfig> = {
  'Farmer.glb': {
    scale: 1.58,  // target 2.88 / raw ~1.82
    yOffset: -0.1,
  },
  'Animated_Woman.glb': {
    scale: 0.52,  // target 2.72 / raw ~5.21
    yOffset: -0.1,
  },
  
  // Animals - target heights relative to 4-unit corn
  'Cow.glb': {
    scale: 1.2,   // target ~2.52 units (63% of corn)
    yOffset: 0,
  },
  'Pig.glb': {
    scale: 0.8,   // target ~1.52 units (38% of corn)
    yOffset: 0,
  },
  'Hen.glb': {
    scale: 0.4,   // target ~0.76 units (19% of corn)
    yOffset: 0,
  },
  'Hen_idle.glb': {
    scale: 0.4,
    yOffset: 0,
  },
  'Hen_walk.glb': {
    scale: 0.4,
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
