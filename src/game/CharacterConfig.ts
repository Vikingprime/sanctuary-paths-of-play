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
  tintColor?: string; // Optional material tint applied to the rendered model
  animations?: string[]; // Available animation names for this model
}

export const CharacterConfig: Record<string, CharacterModelConfig> = {
  // Main characters - yOffset adjusts vertical position so feet touch ground
  // rotationOffset corrects model's default facing direction to match raycast expectations
  'Farmer.glb': {
    scale: 0.66,
    yOffset: 0,
    height: 1.8,
    rotationOffset: Math.PI,
    debugPlaneColor: '#00ff00',
    animations: ['idle', 'walk', 'talk', 'wave', 'point', 'celebrate'],
  },
  'Animated_Woman.glb': {
    scale: 0.24,
    yOffset: 0,
    height: 1.7,
    rotationOffset: Math.PI,
    debugPlaneColor: '#ff00ff',
    animations: ['idle', 'walk', 'talk', 'wave', 'point', 'celebrate'],
  },
  
  // Animals (player-controlled) - these offsets are applied in PlayerCube.tsx
  'Cow.glb': {
    scale: 0.2,
    yOffset: 0.03, // Effective offset: was 0.18 (group) + -0.15 (primitive) in PlayerCube
    height: 1.4,
    rotationOffset: Math.PI,
    debugPlaneColor: '#0088ff',
    animations: ['idle', 'walk', 'gallop'],
  },
  'Pig.glb': {
    scale: 0.0064,
    yOffset: 0.20,
    height: 0.5,
    debugPlaneColor: '#ff8800',
    animations: ['idle', 'walk'],
  },
  'Hen.glb': {
    scale: 0.005,
    yOffset: 0.20,
    height: 0.35,
    debugPlaneColor: '#ffff00',
    animations: ['idle'],
  },
  'Hen_idle.glb': {
    scale: 0.005,
    yOffset: 0.20,
    height: 0.35,
    debugPlaneColor: '#ffff00',
    animations: ['idle'],
  },
  'Hen_walk.glb': {
    scale: 0.005,
    yOffset: 0.20,
    height: 0.35,
    debugPlaneColor: '#ffff00',
    animations: ['walk'],
  },
  'Rat.glb': {
    scale: 0.005,
    yOffset: 0.20,
    height: 0.3,
    debugPlaneColor: '#888888',
    animations: ['idle', 'walk'],
  },
  
  // Chapter 2 cousin models
  'Hamster.glb': {
    scale: 0.00225,
    yOffset: -0.02,
    height: 0.085,
    debugPlaneColor: '#cc8844',
    animations: ['idle', 'walk'],
  },
  'Kangaroo_rat.glb': {
    scale: 0.0945,
    yOffset: -0.03,
    height: 0.1125,
    debugPlaneColor: '#aa6633',
    animations: ['idle', 'walk'],
  },
  'Squirrel.glb': {
    scale: 0.089,
    yOffset: -0.02,
    height: 0.3,
    debugPlaneColor: '#996622',
    animations: ['idle', 'walk'],
  },
  'Rat-2.glb': {
    scale: 0.0587,
    yOffset: -0.03,
    height: 0.507,
    debugPlaneColor: '#777777',
    animations: ['idle', 'walk'],
  },
  'Spiny_mouse.glb': {
    scale: 0.074,
    yOffset: -0.02,
    height: 0.075,
    debugPlaneColor: '#999999',
    animations: ['idle', 'walk'],
  },
  'Sparrow.glb': {
    scale: 0.005,
    yOffset: 0.15,
    height: 0.25,
    rotationOffset: Math.PI,
    debugPlaneColor: '#dd8844',
    animations: ['idle'],
  },
  'Bush_with_Berries.glb': {
    scale: 0.4,
    yOffset: 0.0,
    height: 0.6,
    debugPlaneColor: '#22aa44',
    animations: [],
  },
  'Beer_Mug.glb': {
    scale: 0.4,
    yOffset: 0.0,
    height: 0.8,
    debugPlaneColor: '#cc8800',
    animations: [],
  },
  
  // Obstacle models (logs) - used for LOS blocking
  'Log.glb': {
    scale: 0.4,
    yOffset: 0.0,
    height: 0.3, // Low obstacle - blocks small creatures like sparrows
    debugPlaneColor: '#8B4513',
    animations: [],
  },
  'Log_with_Fungus.glb': {
    scale: 0.4,
    yOffset: 0.0,
    height: 0.35,
    debugPlaneColor: '#6B8E23',
    animations: [],
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

export function getCharacterTintColor(modelFile: string): string | undefined {
  return CharacterConfig[modelFile]?.tintColor;
}

/**
 * Get available animations for a character model.
 * Falls back to ['idle'] if not specified.
 */
export function getCharacterAnimations(modelFile: string): string[] {
  return CharacterConfig[modelFile]?.animations ?? ['idle'];
}
