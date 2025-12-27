/**
 * Line-of-Sight Corn Fader
 * 
 * After camera autopush, casts rays to the character to detect blocking corn.
 * Fades only the corn chunks that actually occlude the character.
 */

import { useRef, useMemo, MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Raycaster, Object3D, Group, Mesh } from 'three';
import { PlayerState } from '@/game/GameLogic';
import { getCharacterHeight } from '@/game/CharacterConfig';
import { AnimalType } from '@/types/game';

// LOS fade configuration
const LOS_CONFIG = {
  rayCount: 3,                    // Center + 2 side rays
  raySpread: 0.25,                // Horizontal spread for side rays (world units)
  occlusionThreshold: 2,          // Number of rays that must hit to trigger fade (2 of 3)
  maxOccluders: 8,                // Max number of cells to fade at once
  fadeInDuration: 100,            // ms to fade to transparent
  fadeOutDuration: 400,           // ms to fade back to opaque
  holdDuration: 200,              // ms to hold fade before starting fade out
  fadedOpacity: 0.15,             // Target opacity when faded (not fully invisible)
};

// Track fade state for each occluding cell
interface CellFadeState {
  cellKey: string;
  x: number;
  z: number;
  opacity: number;              // Current opacity (1 = fully visible, 0 = fully transparent)
  targetOpacity: number;        // Target opacity
  lastHitTime: number;          // Timestamp of last ray hit
  fadeStartTime: number;        // When current fade started
}

// Global fade state map - shared across frames
const cellFadeStates = new Map<string, CellFadeState>();

// Export the fade states so CornWall can read them
export function getCellFadeOpacity(cellX: number, cellZ: number): number {
  const key = `${cellX},${cellZ}`;
  const state = cellFadeStates.get(key);
  return state?.opacity ?? 1.0;
}

// Get all faded cells for shader uniform updates
export function getFadedCells(): Map<string, number> {
  const result = new Map<string, number>();
  cellFadeStates.forEach((state, key) => {
    if (state.opacity < 0.99) {
      result.set(key, state.opacity);
    }
  });
  return result;
}

interface LOSCornFaderProps {
  playerStateRef: MutableRefObject<PlayerState>;
  foliageGroupRef: React.RefObject<Group>;
  animalType: AnimalType;
  enabled?: boolean;
}

export const LOSCornFader = ({
  playerStateRef,
  foliageGroupRef,
  animalType,
  enabled = true,
}: LOSCornFaderProps) => {
  const { camera } = useThree();
  
  // Raycaster for LOS checks
  const raycaster = useRef(new Raycaster());
  const rayOrigin = useRef(new Vector3());
  const rayDir = useRef(new Vector3());
  const rightVec = useRef(new Vector3());
  
  // Get character height for focus point calculation
  const animalModel = animalType === 'pig' ? 'Pig.glb' : animalType === 'cow' ? 'Cow.glb' : animalType === 'bird' ? 'Hen.glb' : 'Cow.glb';
  const animalHeight = getCharacterHeight(animalModel);
  const targetHeight = Math.max(0.25, Math.min(1.2, 0.6 * animalHeight));
  
  // Reusable vectors
  const focusPoint = useRef(new Vector3());
  const camPos = useRef(new Vector3());
  
  useFrame(() => {
    if (!enabled || !foliageGroupRef?.current) return;
    
    const now = performance.now();
    const playerX = playerStateRef.current.x;
    const playerZ = playerStateRef.current.y;
    
    // Calculate focus point (character center at targetHeight)
    focusPoint.current.set(playerX, targetHeight, playerZ);
    camPos.current.copy(camera.position);
    
    // Collect camera blocker meshes
    const cameraBlockers: Object3D[] = [];
    foliageGroupRef.current.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) {
        cameraBlockers.push(child);
      }
    });
    
    if (cameraBlockers.length === 0) return;
    
    // Calculate direction from camera to focus
    rayDir.current.copy(focusPoint.current).sub(camPos.current);
    const distToFocus = rayDir.current.length();
    rayDir.current.normalize();
    
    // Calculate right vector (perpendicular in XZ plane)
    rightVec.current.set(-rayDir.current.z, 0, rayDir.current.x).normalize();
    
    // Track cells hit by rays this frame
    const hitCellsThisFrame = new Set<string>();
    let raysHit = 0;
    
    // Cast multiple rays
    const rayOffsets = [0, -LOS_CONFIG.raySpread, LOS_CONFIG.raySpread];
    
    for (let i = 0; i < LOS_CONFIG.rayCount; i++) {
      // Calculate ray target (focus point with horizontal offset)
      const offset = rayOffsets[i];
      const target = focusPoint.current.clone().add(
        rightVec.current.clone().multiplyScalar(offset)
      );
      
      // Set up ray from camera to target
      rayOrigin.current.copy(camPos.current);
      const direction = target.clone().sub(camPos.current).normalize();
      
      raycaster.current.set(rayOrigin.current, direction);
      raycaster.current.far = distToFocus;
      
      // Check for intersections
      const intersects = raycaster.current.intersectObjects(cameraBlockers, true);
      
      if (intersects.length > 0) {
        raysHit++;
        
        // Mark hit cells
        for (const hit of intersects) {
          // Extract cell position from mesh position
          const meshPos = hit.object.position;
          // Camera colliders are positioned at (cellX + 0.5, 1.25, cellZ + 0.5)
          const cellX = Math.floor(meshPos.x);
          const cellZ = Math.floor(meshPos.z);
          const cellKey = `${cellX},${cellZ}`;
          
          hitCellsThisFrame.add(cellKey);
          
          // Update or create fade state for this cell
          let state = cellFadeStates.get(cellKey);
          if (!state) {
            state = {
              cellKey,
              x: cellX,
              z: cellZ,
              opacity: 1.0,
              targetOpacity: 1.0,
              lastHitTime: now,
              fadeStartTime: now,
            };
            cellFadeStates.set(cellKey, state);
          }
          
          state.lastHitTime = now;
        }
      }
    }
    
    // Determine if we're occluded (enough rays hit)
    const isOccluded = raysHit >= LOS_CONFIG.occlusionThreshold;
    
    // Update fade states
    cellFadeStates.forEach((state, key) => {
      const wasHitThisFrame = hitCellsThisFrame.has(key);
      const timeSinceHit = now - state.lastHitTime;
      
      // Determine target opacity
      if (wasHitThisFrame && isOccluded) {
        // Currently blocking - fade to transparent
        state.targetOpacity = LOS_CONFIG.fadedOpacity;
      } else if (timeSinceHit > LOS_CONFIG.holdDuration) {
        // No longer blocking and hold expired - fade back to opaque
        state.targetOpacity = 1.0;
      }
      // else: in hold period, keep current target
      
      // Animate opacity toward target
      if (Math.abs(state.opacity - state.targetOpacity) > 0.001) {
        const duration = state.targetOpacity < state.opacity 
          ? LOS_CONFIG.fadeInDuration 
          : LOS_CONFIG.fadeOutDuration;
        const delta = (1 / duration) * 16.67; // Approximate frame time
        
        if (state.targetOpacity < state.opacity) {
          state.opacity = Math.max(state.targetOpacity, state.opacity - delta);
        } else {
          state.opacity = Math.min(state.targetOpacity, state.opacity + delta);
        }
      }
      
      // Clean up fully opaque cells that haven't been hit recently
      if (state.opacity >= 0.99 && timeSinceHit > 1000) {
        cellFadeStates.delete(key);
      }
    });
    
    // Cap number of tracked occluders
    if (cellFadeStates.size > LOS_CONFIG.maxOccluders * 2) {
      // Remove oldest entries
      const entries = Array.from(cellFadeStates.entries())
        .sort((a, b) => a[1].lastHitTime - b[1].lastHitTime);
      
      while (cellFadeStates.size > LOS_CONFIG.maxOccluders) {
        const oldest = entries.shift();
        if (oldest && oldest[1].opacity >= 0.99) {
          cellFadeStates.delete(oldest[0]);
        } else {
          break; // Don't remove cells that are still fading
        }
      }
    }
  });
  
  return null;
};

export default LOSCornFader;
