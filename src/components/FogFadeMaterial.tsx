/**
 * FogFadeMaterial - Utilities for distance-based fading that matches fog
 * 
 * Provides smooth fade-in/fade-out for objects near the visibility edge
 * instead of abrupt pop-in/pop-out.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { 
  Color,
  Material,
  Object3D,
  Mesh,
  Matrix4,
  Vector3
} from 'three';

// Fog configuration - matches Maze3DScene.tsx fogExp2
const FOG_COLOR = new Color('#B8B0A0');
const FOG_DENSITY = 0.14;

// Distance thresholds for fading
const FADE_START = 10;  // Start fading at 10m
const FADE_END = 14;    // Fully hidden at 14m (matches cull distance)

/**
 * Calculate fade factor (1 = fully visible, 0 = hidden)
 * Uses smooth step for natural transition
 */
export const calculateFadeFactor = (distance: number): number => {
  if (distance <= FADE_START) return 1;
  if (distance >= FADE_END) return 0;
  const t = (distance - FADE_START) / (FADE_END - FADE_START);
  // Smooth step: 3t² - 2t³
  return 1 - (t * t * (3 - 2 * t));
};

/**
 * Calculate fade factor for squared distance (avoids sqrt for performance)
 */
export const calculateFadeFactorSq = (distanceSq: number): number => {
  const fadeStartSq = FADE_START * FADE_START;
  const fadeEndSq = FADE_END * FADE_END;
  
  if (distanceSq <= fadeStartSq) return 1;
  if (distanceSq >= fadeEndSq) return 0;
  
  // Linear interpolation in squared space then smooth step
  const t = (distanceSq - fadeStartSq) / (fadeEndSq - fadeStartSq);
  return 1 - (t * t * (3 - 2 * t));
};

/**
 * Apply scale-based fade to an instanced mesh transform matrix
 * This is the most efficient approach for instanced meshes
 */
export const applyFadeToMatrix = (
  matrix: Matrix4,
  fadeFactor: number,
  targetMatrix: Matrix4
): void => {
  if (fadeFactor >= 0.99) {
    targetMatrix.copy(matrix);
    return;
  }
  
  // Extract position, quaternion, scale from source matrix
  const pos = new Vector3();
  const scale = new Vector3();
  matrix.decompose(pos, undefined as any, scale);
  
  // Apply fade to scale
  scale.multiplyScalar(fadeFactor);
  
  // Reconstruct matrix with faded scale
  targetMatrix.copy(matrix);
  targetMatrix.scale(new Vector3(fadeFactor, fadeFactor, fadeFactor));
};

/**
 * Hook to apply fog-based opacity fading to a Three.js object
 * For individual (non-instanced) objects like characters
 */
export const useFogFade = (
  objectRef: React.RefObject<Object3D | null>,
  playerPositionRef: React.MutableRefObject<{ x: number; y: number }>,
  getObjectPosition: () => { x: number; z: number }
) => {
  const materialsRef = useRef<Map<string, { material: Material; originalOpacity: number; wasTransparent: boolean }>>(new Map());
  
  useFrame(() => {
    if (!objectRef.current) return;
    
    const objPos = getObjectPosition();
    const dx = objPos.x - playerPositionRef.current.x;
    const dz = objPos.z - playerPositionRef.current.y;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    const fadeFactor = calculateFadeFactor(distance);
    
    objectRef.current.traverse((child: Object3D) => {
      if (child instanceof Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((mat, idx) => {
          const key = `${child.uuid}-${idx}`;
          
          // Store original state on first encounter
          if (!materialsRef.current.has(key)) {
            materialsRef.current.set(key, { 
              material: mat, 
              originalOpacity: (mat as any).opacity ?? 1,
              wasTransparent: mat.transparent
            });
          }
          
          const stored = materialsRef.current.get(key)!;
          
          // Enable transparency for fading (only when needed)
          if (fadeFactor < 1 && !mat.transparent) {
            mat.transparent = true;
            mat.needsUpdate = true;
          } else if (fadeFactor >= 1 && mat.transparent && !stored.wasTransparent) {
            mat.transparent = false;
            mat.needsUpdate = true;
          }
          
          // Apply faded opacity
          (mat as any).opacity = stored.originalOpacity * fadeFactor;
          
          // Optimize: disable depth write for very transparent objects
          (mat as any).depthWrite = fadeFactor > 0.5;
        });
      }
    });
    
    // Hide completely when fully faded
    objectRef.current.visible = fadeFactor > 0.01;
  });
};

// Export constants for consistency
export const FOG_FADE_CONSTANTS = {
  FOG_COLOR,
  FOG_DENSITY,
  FADE_START,
  FADE_END,
} as const;
