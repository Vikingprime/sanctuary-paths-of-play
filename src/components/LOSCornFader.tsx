/**
 * Line-of-Sight Corn Fader
 * 
 * When camera colliders are hit by LOS raycasts, directly fades
 * the corresponding corn instances by updating their per-instance opacity.
 */

import { useRef, MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Raycaster, Object3D, Group, Mesh } from 'three';
import { PlayerState } from '@/game/GameLogic';
import { getCharacterHeight } from '@/game/CharacterConfig';
import { AnimalType, Maze } from '@/types/game';
import { setCellOpacity, getCellRegistryStats } from './CornWall';

// LOS fade configuration
const LOS_CONFIG = {
  rayCount: 5,                    // More rays for better coverage
  raySpread: 0.35,                // Horizontal spread for side rays
  verticalSpread: 0.2,            // Vertical spread for upper rays
  occlusionThreshold: 2,          // Number of rays that must hit to trigger fade
  fadeInDuration: 100,            // ms to fade to transparent
  fadeOutDuration: 400,           // ms to fade back to opaque
  holdDuration: 200,              // ms to hold fade before starting fade out
  fadedOpacity: 0.15,             // Target opacity when faded
};

// Track fade state for each occluding cell
interface CellFadeState {
  cellKey: string;
  x: number;
  z: number;
  opacity: number;
  targetOpacity: number;
  lastHitTime: number;
}

// Cell fade states
const cellFadeStates = new Map<string, CellFadeState>();

interface LOSCornFaderProps {
  playerStateRef: MutableRefObject<PlayerState>;
  foliageGroupRef: React.RefObject<Group>;
  animalType: AnimalType;
  maze: Maze;
  enabled?: boolean;
}

export const LOSCornFader = ({
  playerStateRef,
  foliageGroupRef,
  animalType,
  maze,
  enabled = true,
}: LOSCornFaderProps) => {
  const { camera } = useThree();
  
  // Raycaster for LOS checks
  const raycaster = useRef(new Raycaster());
  const rayOrigin = useRef(new Vector3());
  const rightVec = useRef(new Vector3());
  
  // Reusable vector for world position
  const worldPos = useRef(new Vector3());
  
  // Get character height for focus point calculation
  const animalModel = animalType === 'pig' ? 'Pig.glb' : animalType === 'cow' ? 'Cow.glb' : animalType === 'bird' ? 'Hen.glb' : 'Cow.glb';
  const animalHeight = getCharacterHeight(animalModel);
  const targetHeight = Math.max(0.25, Math.min(1.2, 0.6 * animalHeight));
  
  // Reusable vectors
  const focusPoint = useRef(new Vector3());
  const camPos = useRef(new Vector3());
  const rayDir = useRef(new Vector3());
  
  useFrame(() => {
    if (!enabled || !foliageGroupRef?.current) return;
    
    const now = performance.now();
    const playerX = playerStateRef.current.x;
    const playerZ = playerStateRef.current.y;
    
    // Calculate focus point (character center at targetHeight)
    focusPoint.current.set(playerX, targetHeight, playerZ);
    camPos.current.copy(camera.position);
    
    // Collect camera blocker meshes (the invisible collision boxes)
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
    
    // Debug: log blocker count and registry stats periodically
    if (Math.random() < 0.01) {
      const stats = getCellRegistryStats();
      console.log('[LOS_CORN_FADER] Camera blockers:', cameraBlockers.length, 'Registry cells:', stats.cellCount, 'Sample:', stats.sampleCells);
    }
    
    // Cast multiple rays - center, left, right, and upper variants
    const rayConfigs = [
      { h: 0, v: 0 },                               // Center
      { h: -LOS_CONFIG.raySpread, v: 0 },           // Left
      { h: LOS_CONFIG.raySpread, v: 0 },            // Right
      { h: 0, v: LOS_CONFIG.verticalSpread },       // Upper center
      { h: -LOS_CONFIG.raySpread * 0.5, v: LOS_CONFIG.verticalSpread * 0.5 }, // Upper left
    ];
    
    for (let i = 0; i < rayConfigs.length; i++) {
      const config = rayConfigs[i];
      
      // Calculate ray target (focus point with horizontal and vertical offset)
      const target = focusPoint.current.clone()
        .add(rightVec.current.clone().multiplyScalar(config.h))
        .add(new Vector3(0, config.v, 0));
      
      // Set up ray from camera to target
      rayOrigin.current.copy(camPos.current);
      const direction = target.clone().sub(camPos.current).normalize();
      
      raycaster.current.set(rayOrigin.current, direction);
      raycaster.current.far = distToFocus;
      
      // Check for intersections with camera colliders
      const intersects = raycaster.current.intersectObjects(cameraBlockers, true);
      
      if (intersects.length > 0) {
        raysHit++;
        
        // Mark hit cells - extract cell position from the camera collider's WORLD position
        for (const hit of intersects) {
          // Get world position of the hit object (camera colliders are positioned at cellX+0.5, 1.25, cellZ+0.5)
          hit.object.getWorldPosition(worldPos.current);
          const cellX = Math.floor(worldPos.current.x);
          const cellZ = Math.floor(worldPos.current.z);
          const cellKey = `${cellX},${cellZ}`;
          
          // Debug: log hit info
          if (Math.random() < 0.02) {
            console.log('[LOS_CORN_FADER] Ray hit!', {
              cellKey,
              worldPos: { x: worldPos.current.x.toFixed(2), z: worldPos.current.z.toFixed(2) },
              objectName: hit.object.name,
              objectType: hit.object.type,
            });
          }
          
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
            };
            cellFadeStates.set(cellKey, state);
          }
          
          state.lastHitTime = now;
        }
      }
    }
    
    // Determine if we're occluded (enough rays hit)
    const isOccluded = raysHit >= LOS_CONFIG.occlusionThreshold;
    
    // Debug: log ray hit stats
    if (raysHit > 0 && Math.random() < 0.05) {
      console.log('[LOS_CORN_FADER] Rays hit:', raysHit, '/', rayConfigs.length, 'isOccluded:', isOccluded, 'hitCells:', Array.from(hitCellsThisFrame));
    }
    
    // Update fade states and directly set instance opacity
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
      
      // Animate opacity toward target
      const prevOpacity = state.opacity;
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
      
      // Update instance opacity if it changed
      if (Math.abs(state.opacity - prevOpacity) > 0.001) {
        setCellOpacity(state.x, state.z, state.opacity);
      }
      
      // Clean up fully opaque cells that haven't been hit recently
      if (state.opacity >= 0.99 && timeSinceHit > 1000) {
        // Reset cell to full opacity before removing
        setCellOpacity(state.x, state.z, 1.0);
        cellFadeStates.delete(key);
      }
    });
  });
  
  return null;
};

export default LOSCornFader;
