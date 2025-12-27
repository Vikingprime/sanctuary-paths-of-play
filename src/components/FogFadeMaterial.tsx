/**
 * Distance-based opacity fading utilities
 * Provides smooth fade-in/fade-out for objects near the fog edge
 */

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Material, Vector3, Object3D, Mesh, ShaderMaterial } from 'three';

// Fog fade configuration
const FADE_START = 10;  // Start fading at 10m
const FADE_END = 14;    // Fully transparent at 14m

/**
 * Calculate fade factor (1 = fully visible, 0 = hidden)
 */
export const calculateFadeFactor = (distance: number): number => {
  if (distance <= FADE_START) return 1;
  if (distance >= FADE_END) return 0;
  const t = (distance - FADE_START) / (FADE_END - FADE_START);
  // Smooth step for natural transition
  return 1 - (t * t * (3 - 2 * t));
};

/**
 * Inject distance-based opacity fading into a material using onBeforeCompile
 * This modifies the fragment shader to fade objects based on distance from player
 */
export const injectDistanceFade = (
  material: Material,
  playerPositionRef: React.MutableRefObject<{ x: number; y: number }>
) => {
  const mat = material as any;
  
  // Store original onBeforeCompile
  const originalOnBeforeCompile = mat.onBeforeCompile;
  
  // Create uniform for player position
  mat.userData.playerPos = { value: new Vector3() };
  
  mat.onBeforeCompile = (shader: any) => {
    // Call original if exists
    if (originalOnBeforeCompile) {
      originalOnBeforeCompile(shader);
    }
    
    // Add player position uniform
    shader.uniforms.playerPos = mat.userData.playerPos;
    
    // Inject uniform declaration into fragment shader
    shader.fragmentShader = `
      uniform vec3 playerPos;
      ${shader.fragmentShader}
    `;
    
    // Replace the final output to apply distance-based opacity
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      
      // Distance-based fade
      float distToPlayer = distance(vWorldPosition.xz, playerPos.xz);
      float fadeStart = 10.0;
      float fadeEnd = 14.0;
      float fadeFactor = 1.0 - smoothstep(fadeStart, fadeEnd, distToPlayer);
      gl_FragColor.a *= fadeFactor;
      `
    );
    
    // Ensure world position is available
    if (!shader.vertexShader.includes('vWorldPosition')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `
        #include <common>
        varying vec3 vWorldPosition;
        `
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `
        #include <worldpos_vertex>
        vWorldPosition = worldPosition.xyz;
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'uniform vec3 playerPos;',
        `
        uniform vec3 playerPos;
        varying vec3 vWorldPosition;
        `
      );
    }
  };
  
  // Enable transparency
  mat.transparent = true;
  mat.depthWrite = true;
  mat.needsUpdate = true;
  
  return mat;
};

/**
 * Hook to apply opacity-based fading to an object based on distance from player
 * Works with any Three.js object with materials
 */
export const useOpacityFade = (
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
            // Enable transparency
            mat.transparent = true;
          }
          
          const stored = materialsRef.current.get(key)!;
          
          // Apply faded opacity
          (mat as any).opacity = stored.originalOpacity * fadeFactor;
          
          // Optimize depth writing
          (mat as any).depthWrite = fadeFactor > 0.5;
        });
      }
    });
    
    // Hide completely when fully faded
    objectRef.current.visible = fadeFactor > 0.01;
  });
};

export const FOG_FADE_CONSTANTS = {
  FADE_START,
  FADE_END,
} as const;
