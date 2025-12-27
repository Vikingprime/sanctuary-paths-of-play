/**
 * Line-of-Sight Corn Fader
 * 
 * After camera autopush, casts rays to the character to detect blocking corn.
 * Fades only the corn chunks that actually occlude the character.
 * 
 * Uses a DataTexture to communicate per-cell opacity to the corn shader.
 */

import { useRef, useMemo, MutableRefObject, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Raycaster, Object3D, Group, Mesh, DataTexture, RGBAFormat, UnsignedByteType, NearestFilter, ClampToEdgeWrapping } from 'three';
import { PlayerState } from '@/game/GameLogic';
import { getCharacterHeight } from '@/game/CharacterConfig';
import { AnimalType, Maze } from '@/types/game';

// LOS fade configuration
const LOS_CONFIG = {
  rayCount: 3,                    // Center + 2 side rays
  raySpread: 0.25,                // Horizontal spread for side rays (world units)
  occlusionThreshold: 2,          // Number of rays that must hit to trigger fade (2 of 3)
  maxOccluders: 8,                // Max number of cells to fade at once
  fadeInDuration: 120,            // ms to fade to transparent
  fadeOutDuration: 350,           // ms to fade back to opaque
  holdDuration: 200,              // ms to hold fade before starting fade out
  fadedOpacity: 0.12,             // Target opacity when faded (nearly invisible but not zero)
};

// Track fade state for each occluding cell
interface CellFadeState {
  cellKey: string;
  x: number;
  z: number;
  opacity: number;              // Current opacity (1 = fully visible, 0 = fully transparent)
  targetOpacity: number;        // Target opacity
  lastHitTime: number;          // Timestamp of last ray hit
}

// Global opacity texture - shared with corn shader
let opacityTexture: DataTexture | null = null;
let opacityData: Uint8Array | null = null;
let textureWidth = 0;
let textureHeight = 0;

// Cell fade states
const cellFadeStates = new Map<string, CellFadeState>();

// Get the opacity texture for use in corn shader
export function getLOSOpacityTexture(): DataTexture | null {
  return opacityTexture;
}

// Get texture dimensions
export function getLOSTextureDimensions(): { width: number; height: number } {
  return { width: textureWidth, height: textureHeight };
}

// Initialize the opacity texture for a given maze size
export function initLOSTexture(mazeWidth: number, mazeHeight: number): DataTexture {
  // Only recreate if size changed
  if (opacityTexture && textureWidth === mazeWidth && textureHeight === mazeHeight) {
    return opacityTexture;
  }
  
  textureWidth = mazeWidth;
  textureHeight = mazeHeight;
  
  // Create RGBA data array - 4 bytes per pixel, but we only use R channel for opacity
  opacityData = new Uint8Array(mazeWidth * mazeHeight * 4);
  
  // Initialize all cells to fully opaque (255)
  for (let i = 0; i < mazeWidth * mazeHeight; i++) {
    opacityData[i * 4] = 255;     // R = opacity
    opacityData[i * 4 + 1] = 255; // G (unused)
    opacityData[i * 4 + 2] = 255; // B (unused)
    opacityData[i * 4 + 3] = 255; // A (unused)
  }
  
  opacityTexture = new DataTexture(opacityData, mazeWidth, mazeHeight, RGBAFormat, UnsignedByteType);
  opacityTexture.minFilter = NearestFilter;
  opacityTexture.magFilter = NearestFilter;
  opacityTexture.wrapS = ClampToEdgeWrapping;
  opacityTexture.wrapT = ClampToEdgeWrapping;
  opacityTexture.needsUpdate = true;
  
  return opacityTexture;
}

// Update a cell's opacity in the texture
function updateCellOpacity(cellX: number, cellZ: number, opacity: number) {
  if (!opacityData || cellX < 0 || cellX >= textureWidth || cellZ < 0 || cellZ >= textureHeight) {
    return;
  }
  
  const idx = (cellZ * textureWidth + cellX) * 4;
  opacityData[idx] = Math.round(opacity * 255); // Store opacity in R channel
}

// Mark texture as needing update
function markTextureNeedsUpdate() {
  if (opacityTexture) {
    opacityTexture.needsUpdate = true;
  }
}

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
  
  // Initialize texture on mount/maze change
  useEffect(() => {
    const mazeWidth = maze.grid[0]?.length ?? 1;
    const mazeHeight = maze.grid.length ?? 1;
    initLOSTexture(mazeWidth, mazeHeight);
  }, [maze]);
  
  // Raycaster for LOS checks
  const raycaster = useRef(new Raycaster());
  const rayOrigin = useRef(new Vector3());
  const rightVec = useRef(new Vector3());
  
  // Get character height for focus point calculation
  const animalModel = animalType === 'pig' ? 'Pig.glb' : animalType === 'cow' ? 'Cow.glb' : animalType === 'bird' ? 'Hen.glb' : 'Cow.glb';
  const animalHeight = getCharacterHeight(animalModel);
  const targetHeight = Math.max(0.25, Math.min(1.2, 0.6 * animalHeight));
  
  // Reusable vectors
  const focusPoint = useRef(new Vector3());
  const camPos = useRef(new Vector3());
  const rayDir = useRef(new Vector3());
  
  useFrame(() => {
    if (!enabled || !foliageGroupRef?.current || !opacityTexture) return;
    
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
            };
            cellFadeStates.set(cellKey, state);
          }
          
          state.lastHitTime = now;
        }
      }
    }
    
    // Determine if we're occluded (enough rays hit)
    const isOccluded = raysHit >= LOS_CONFIG.occlusionThreshold;
    
    // Track if any opacity changed
    let textureChanged = false;
    
    // Update fade states and texture
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
      
      // Update texture if opacity changed
      if (Math.abs(state.opacity - prevOpacity) > 0.001) {
        updateCellOpacity(state.x, state.z, state.opacity);
        textureChanged = true;
      }
      
      // Clean up fully opaque cells that haven't been hit recently
      if (state.opacity >= 0.99 && timeSinceHit > 1000) {
        // Reset texture cell to full opacity before removing
        updateCellOpacity(state.x, state.z, 1.0);
        textureChanged = true;
        cellFadeStates.delete(key);
      }
    });
    
    // Only mark texture for GPU upload if something changed
    if (textureChanged) {
      markTextureNeedsUpdate();
    }
  });
  
  return null;
};

export default LOSCornFader;
