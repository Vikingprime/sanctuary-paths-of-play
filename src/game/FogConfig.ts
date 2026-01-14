/**
 * Fog & Atmosphere Configuration
 * 
 * Single source of truth for all fog-related settings.
 * Changes here automatically propagate to:
 * - Scene FogExp2
 * - Sky shader (fog band)
 * - Ground shader (fog tint)
 * - Corn materials (fog blending)
 * 
 * UNITY PORTABLE: Copy these values directly to Unity C#
 */

import { Color } from 'three';

export const FogConfig = {
  // ============= FOG COLOR =============
  // The unified atmosphere/fog color used everywhere
  // This is THE ONLY place to change the fog color
  COLOR_HEX: '#B0A898',  // Warm gray-beige fog
  
  // ============= FOG DENSITY =============
  // Controls how quickly objects fade into fog with distance
  // Higher = denser fog, objects disappear sooner
  DENSITY: 0.14,
  
  // ============= SKY FOG BAND =============
  // Controls where solid fog appears in the horizon image
  // Values are percentages of the horizon image height (0.0 to 1.0)
  
  // Height where fog becomes 100% solid (from bottom of image)
  SKY_BAND_SOLID_HEIGHT: 0.35,
  
  // Height where fog transition ends (image becomes fully visible above this)
  SKY_BAND_TRANSITION_TOP: 0.40,
} as const;

// Pre-computed Color object for Three.js usage
export const FOG_COLOR = new Color(FogConfig.COLOR_HEX);

// Linear RGB values for shader uniforms (pre-gamma corrected)
// Three.js Color stores values in linear space when created from hex
export const FOG_COLOR_LINEAR = {
  r: FOG_COLOR.r,
  g: FOG_COLOR.g,
  b: FOG_COLOR.b,
};

/**
 * Helper to get fog color as vec3 string for GLSL shaders
 * Note: Shaders should apply gamma correction (pow(color, 1/2.2)) 
 * when outputting to screen with toneMapped: false
 */
export function getFogColorGLSL(): string {
  return `vec3(${FOG_COLOR.r.toFixed(4)}, ${FOG_COLOR.g.toFixed(4)}, ${FOG_COLOR.b.toFixed(4)})`;
}

/**
 * C# equivalent for Unity:
 * 
 * public static class FogConfig
 * {
 *     public static readonly Color COLOR = new Color(0.69f, 0.66f, 0.60f); // #B0A898
 *     public const float DENSITY = 0.14f;
 *     public const float SKY_BAND_SOLID_HEIGHT = 0.40f;
 *     public const float SKY_BAND_TRANSITION_TOP = 0.51f;
 * }
 */
