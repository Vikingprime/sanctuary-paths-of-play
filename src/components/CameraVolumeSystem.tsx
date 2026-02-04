import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Euler, MathUtils, Raycaster, Object3D, Mesh, InstancedMesh } from 'three';

// Camera Volume Configuration
export interface CameraVolumeConfig {
  id: string;
  // Trigger box position and size
  position: [number, number, number];
  size: [number, number, number];
  // Camera settings
  cameraOffset: [number, number, number]; // Offset from player (x, y, z)
  lookAtOffset: [number, number, number]; // Where to look relative to player
  fov?: number;
  // Optional overrides
  heightOffset?: number;
  shoulderOffset?: number; // Horizontal offset for tight spaces
  // Priority for overlapping volumes (higher = takes precedence)
  priority?: number;
}

// Autopush configuration for foliage collision
export interface AutopushConfig {
  enabled: boolean;
  minDist: number;      // Minimum camera distance (never push closer than this)
  padding: number;      // Padding before obstacle
  pushLerp: number;     // Lerp speed when pushing in (faster)
  relaxLerp: number;    // Lerp speed when relaxing out (slower)
  headHeight: number;   // Height of target (animal head)
  rayCount: 3 | 1;      // 1 for single ray, 3 for left/center/right
  raySpread: number;    // Spread angle for side rays (radians)
}

export const DEFAULT_AUTOPUSH: AutopushConfig = {
  enabled: true,
  minDist: 0.8,         // Very close minimum
  padding: 0.3,         // Small padding before corn
  pushLerp: 0.35,       // Fast push-in
  relaxLerp: 0.08,      // Slow relax-out (prevents pumping)
  headHeight: 0.5,      // Animal head height
  rayCount: 3,          // Use 3 rays for stability
  raySpread: 0.15,      // ~8.5 degrees spread for side rays
};

// Default overhead camera settings (fallback)
const DEFAULT_CAMERA: Omit<CameraVolumeConfig, 'id' | 'position' | 'size'> = {
  cameraOffset: [0, 2.2, 0],
  lookAtOffset: [0, 0, 0],
  fov: 60,
  heightOffset: 0,
  shoulderOffset: 0,
  priority: 0,
};

interface CameraVolumeSystemProps {
  playerPos: { x: number; y: number };
  volumes: CameraVolumeConfig[];
  transitionSpeed?: number; // 0.15-0.4 recommended
  enabled?: boolean; // Easy toggle to disable and use overhead
  autopush?: AutopushConfig; // Autopush settings for foliage avoidance
  foliageGroupRef?: React.RefObject<Object3D>; // Reference to corn/foliage group for raycasting
  followDelay?: number; // Camera follow delay in ms (rail mode)
  isRailMode?: boolean; // Whether rail mode is active
}

// Check if player is inside a volume
const isInsideVolume = (
  playerX: number,
  playerZ: number,
  volume: CameraVolumeConfig
): boolean => {
  const [vx, vy, vz] = volume.position;
  const [sx, sy, sz] = volume.size;
  
  return (
    playerX >= vx - sx / 2 &&
    playerX <= vx + sx / 2 &&
    playerZ >= vz - sz / 2 &&
    playerZ <= vz + sz / 2
  );
};

// Get distance to volume center (for choosing between overlapping)
const distanceToVolume = (
  playerX: number,
  playerZ: number,
  volume: CameraVolumeConfig
): number => {
  const [vx, , vz] = volume.position;
  return Math.sqrt((playerX - vx) ** 2 + (playerZ - vz) ** 2);
};

// Position history entry for delayed camera follow
interface PositionHistoryEntry {
  x: number;
  z: number;
  time: number;
}

export const CameraVolumeController = ({
  playerPos,
  volumes,
  transitionSpeed = 0.25,
  enabled = true,
  autopush = DEFAULT_AUTOPUSH,
  foliageGroupRef,
  followDelay = 0,
  isRailMode = false,
}: CameraVolumeSystemProps) => {
  const { camera, scene } = useThree();
  
  // Position history for delayed follow (rail mode)
  const positionHistory = useRef<PositionHistoryEntry[]>([]);
  
  // Current interpolated values
  const currentPosition = useRef(new Vector3());
  const currentLookAt = useRef(new Vector3());
  const currentFov = useRef(60);
  const initialized = useRef(false);
  
  // Autopush state
  const currentAutopushDist = useRef<number | null>(null); // null = use full distance
  const raycaster = useRef(new Raycaster());
  
  // Reusable vectors for raycasting
  const rayOrigin = useRef(new Vector3());
  const rayDir = useRef(new Vector3());
  const tempVec = useRef(new Vector3());

  useFrame((state, delta) => {
    const now = performance.now();
    const rawPlayerX = playerPos.x + 0.5;
    const rawPlayerZ = playerPos.y + 0.5;
    
    // Handle delayed camera follow for rail mode
    let playerX = rawPlayerX;
    let playerZ = rawPlayerZ;
    
    if (isRailMode && followDelay > 0) {
      // Add current position to history
      positionHistory.current.push({ x: rawPlayerX, z: rawPlayerZ, time: now });
      
      // Find position from followDelay ms ago
      const targetTime = now - followDelay;
      
      // Remove old entries (keep some buffer)
      while (positionHistory.current.length > 2 && 
             positionHistory.current[0].time < targetTime - 100) {
        positionHistory.current.shift();
      }
      
      // Find the entry closest to targetTime
      if (positionHistory.current.length > 0) {
        let delayedPos = positionHistory.current[0];
        for (const entry of positionHistory.current) {
          if (entry.time <= targetTime) {
            delayedPos = entry;
          } else {
            break;
          }
        }
        playerX = delayedPos.x;
        playerZ = delayedPos.z;
      }
    } else {
      // Clear history when not in rail mode
      positionHistory.current = [];
    }

    let targetOffset = [...DEFAULT_CAMERA.cameraOffset] as [number, number, number];
    let targetLookAtOffset = [...DEFAULT_CAMERA.lookAtOffset] as [number, number, number];
    let targetFov = DEFAULT_CAMERA.fov!;
    let heightOffset = 0;
    let shoulderOffset = 0;

    if (enabled && volumes.length > 0) {
      // Find active volumes (player is inside)
      const activeVolumes = volumes.filter((v) =>
        isInsideVolume(playerX, playerZ, v)
      );

      if (activeVolumes.length > 0) {
        // Sort by priority (descending), then by distance (ascending)
        activeVolumes.sort((a, b) => {
          const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
          if (priorityDiff !== 0) return priorityDiff;
          return (
            distanceToVolume(playerX, playerZ, a) -
            distanceToVolume(playerX, playerZ, b)
          );
        });

        const activeVolume = activeVolumes[0];
        targetOffset = activeVolume.cameraOffset;
        targetLookAtOffset = activeVolume.lookAtOffset;
        targetFov = activeVolume.fov ?? 60;
        heightOffset = activeVolume.heightOffset ?? 0;
        shoulderOffset = activeVolume.shoulderOffset ?? 0;
      }
    }

    // Calculate base target camera position (desired position without autopush)
    const desiredCameraPos = new Vector3(
      playerX + targetOffset[0] + shoulderOffset,
      targetOffset[1] + heightOffset,
      playerZ + targetOffset[2]
    );

    // Calculate target (animal head position)
    const targetHead = new Vector3(
      playerX + targetLookAtOffset[0],
      autopush.headHeight,
      playerZ + targetLookAtOffset[2]
    );

    // Calculate target look-at position
    const targetLookAt = new Vector3(
      playerX + targetLookAtOffset[0],
      targetLookAtOffset[1],
      playerZ + targetLookAtOffset[2]
    );

    // === AUTOPUSH LOGIC ===
    let finalCameraPos = desiredCameraPos.clone();
    
    if (autopush.enabled && foliageGroupRef?.current) {
      const desiredDist = targetHead.distanceTo(desiredCameraPos);
      
      // Calculate direction from target to desired camera position
      rayDir.current.copy(desiredCameraPos).sub(targetHead).normalize();
      
      // Collect foliage meshes for raycasting (InstancedMesh + regular Mesh)
      const foliageMeshes: Object3D[] = [];
      foliageGroupRef.current.traverse((child) => {
        if ((child as Mesh).isMesh || (child as InstancedMesh).isInstancedMesh) {
          foliageMeshes.push(child);
        }
      });
      
      // Perform raycasts (1 or 3 rays)
      let closestHitDist = desiredDist;
      
      const performRaycast = (direction: Vector3) => {
        rayOrigin.current.copy(targetHead);
        raycaster.current.set(rayOrigin.current, direction);
        raycaster.current.far = desiredDist;
        
        const intersects = raycaster.current.intersectObjects(foliageMeshes, false);
        if (intersects.length > 0) {
          const hitDist = intersects[0].distance;
          if (hitDist < closestHitDist) {
            closestHitDist = hitDist;
          }
        }
      };
      
      // Center ray
      performRaycast(rayDir.current);
      
      // Side rays (if enabled)
      if (autopush.rayCount === 3) {
        // Calculate perpendicular direction in XZ plane
        const perpX = -rayDir.current.z;
        const perpZ = rayDir.current.x;
        
        // Left ray
        tempVec.current.set(
          rayDir.current.x + perpX * autopush.raySpread,
          rayDir.current.y,
          rayDir.current.z + perpZ * autopush.raySpread
        ).normalize();
        performRaycast(tempVec.current);
        
        // Right ray
        tempVec.current.set(
          rayDir.current.x - perpX * autopush.raySpread,
          rayDir.current.y,
          rayDir.current.z - perpZ * autopush.raySpread
        ).normalize();
        performRaycast(tempVec.current);
      }
      
      // Determine blocked distance
      let blockedDist = desiredDist;
      if (closestHitDist < desiredDist) {
        blockedDist = Math.max(
          closestHitDist - autopush.padding,
          autopush.minDist
        );
        blockedDist = Math.min(blockedDist, desiredDist);
      }
      
      // Initialize autopush distance on first frame
      if (currentAutopushDist.current === null) {
        currentAutopushDist.current = blockedDist;
      }
      
      // Asymmetric damping: fast push-in, slow relax-out
      const targetDist = blockedDist;
      const currentDist = currentAutopushDist.current;
      
      const lerpSpeed = targetDist < currentDist ? autopush.pushLerp : autopush.relaxLerp;
      currentAutopushDist.current = MathUtils.lerp(currentDist, targetDist, lerpSpeed);
      
      // Apply autopush: position camera at the smoothed distance
      finalCameraPos.copy(targetHead).add(
        rayDir.current.clone().multiplyScalar(currentAutopushDist.current)
      );
      
      // Preserve the Y height from the original target
      finalCameraPos.y = desiredCameraPos.y;
    }

    // Initialize on first frame
    if (!initialized.current) {
      currentPosition.current.copy(finalCameraPos);
      currentLookAt.current.copy(targetLookAt);
      currentFov.current = targetFov;
      initialized.current = true;
    }

    // Smooth interpolation (frame-rate independent)
    const lerpFactor = 1 - Math.pow(1 - transitionSpeed, delta * 60);
    
    currentPosition.current.lerp(finalCameraPos, lerpFactor);
    currentLookAt.current.lerp(targetLookAt, lerpFactor);
    currentFov.current = MathUtils.lerp(currentFov.current, targetFov, lerpFactor);

    // Apply to camera
    camera.position.copy(currentPosition.current);
    camera.lookAt(currentLookAt.current);
    
    // Update FOV if perspective camera
    if ('fov' in camera) {
      (camera as any).fov = currentFov.current;
      (camera as any).updateProjectionMatrix();
    }
  });

  return null;
};

// Debug visualization for camera volumes (optional, for editor-friendly setup)
export const CameraVolumeDebug = ({ 
  volumes, 
  visible = false 
}: { 
  volumes: CameraVolumeConfig[]; 
  visible?: boolean;
}) => {
  if (!visible) return null;

  return (
    <>
      {volumes.map((volume) => (
        <mesh
          key={volume.id}
          position={volume.position}
        >
          <boxGeometry args={volume.size} />
          <meshBasicMaterial
            color="#00ff00"
            transparent
            opacity={0.2}
            wireframe
          />
        </mesh>
      ))}
    </>
  );
};

// Helper to create common volume presets
export const createCameraVolume = (
  id: string,
  position: [number, number, number],
  size: [number, number, number],
  preset: 'overhead' | 'follow-behind' | 'side-scroll' | 'dramatic' | 'custom',
  customSettings?: Partial<CameraVolumeConfig>
): CameraVolumeConfig => {
  const presets: Record<string, Partial<CameraVolumeConfig>> = {
    'overhead': {
      cameraOffset: [0, 2.2, 0],
      lookAtOffset: [0, 0, 0],
      fov: 60,
    },
    'follow-behind': {
      cameraOffset: [0, 1.8, 2.5],
      lookAtOffset: [0, 0.5, -1],
      fov: 65,
    },
    'side-scroll': {
      cameraOffset: [3, 1.5, 0],
      lookAtOffset: [0, 0.5, 0],
      fov: 55,
    },
    'dramatic': {
      cameraOffset: [1, 1.2, 1.5],
      lookAtOffset: [0, 0.3, -0.5],
      fov: 70,
    },
    'custom': {},
  };

  return {
    id,
    position,
    size,
    cameraOffset: [0, 2.2, 0],
    lookAtOffset: [0, 0, 0],
    fov: 60,
    priority: 1,
    ...presets[preset],
    ...customSettings,
  };
};
