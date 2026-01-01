/**
 * Character Model Configuration
 * 
 * Centralized configuration for character model sizes and settings.
 * Use this to ensure consistent character sizing across the game.
 * 
 * DEBUG: Enable debug mode to see colored ground planes under each character.
 * Use this to fine-tune yOffset values so models' feet touch the ground.
 */

export interface CharacterModelConfig {
  scale: number;
  yOffset?: number; // Vertical offset - adjust so feet touch ground (y=0)
  height?: number; // Approximate world-space height of the character (for camera framing)
  rotationOffset?: number; // Rotation offset in radians to correct model's default facing direction
  debugPlaneColor?: string; // Color for debug ground plane (HSL format preferred)
}

export const CharacterConfig: Record<string, CharacterModelConfig> = {
  // Main characters - yOffset adjusts vertical position so feet touch ground
  // rotationOffset corrects model's default facing direction to match raycast expectations
  'Farmer.glb': {
    scale: 0.55,
    yOffset: 0.15, // Raised from -0.05 to align feet with ground
    height: 1.8, // Tall human
    rotationOffset: Math.PI, // Farmer model faces opposite direction, rotate 180°
    debugPlaneColor: '#00ff00', // Green - goal character
  },
  'Animated_Woman.glb': {
    scale: 0.20,
    yOffset: 0.15, // Raised from -0.15 to align feet with ground
    height: 1.7, // Tall human
    rotationOffset: Math.PI, // Same correction as Farmer
    debugPlaneColor: '#ff00ff', // Magenta - female NPC
  },
  
  // Animals (player-controlled) - these offsets are applied in PlayerCube.tsx
  'Cow.glb': {
    scale: 0.4,
    yOffset: 0.05, // Raised from 0 to align hooves with ground
    height: 1.4, // Large animal
    debugPlaneColor: '#0088ff', // Blue - cow player
  },
  'Pig.glb': {
    scale: 0.35,
    yOffset: 0.40, // Raised significantly from 0 - pig was half under ground
    height: 0.5, // Small animal - needs close camera framing
    debugPlaneColor: '#ff8800', // Orange - pig player
  },
  'Hen.glb': {
    scale: 0.25,
    yOffset: 0.25, // Raised from 0 - chicken feet were under ground
    height: 0.35, // Very small - needs very close camera framing
    debugPlaneColor: '#ffff00', // Yellow - chicken player
  },
  'Hen_idle.glb': {
    scale: 0.25,
    yOffset: 0.25,
    height: 0.35,
    debugPlaneColor: '#ffff00',
  },
  'Hen_walk.glb': {
    scale: 0.25,
    yOffset: 0.25,
    height: 0.35,
    debugPlaneColor: '#ffff00',
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

/**
 * Get the rotation offset for a character model.
 * This corrects for models that face a different direction than expected.
 * Falls back to 0 if not specified.
 */
export function getCharacterRotationOffset(modelFile: string): number {
  return CharacterConfig[modelFile]?.rotationOffset ?? 0;
}

/**
 * Get the debug plane color for a character model.
 * Falls back to white if not specified.
 */
export function getCharacterDebugPlaneColor(modelFile: string): string {
  return CharacterConfig[modelFile]?.debugPlaneColor ?? '#ffffff';
}
