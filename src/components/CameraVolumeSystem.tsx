import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Euler, MathUtils } from 'three';

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

export const CameraVolumeController = ({
  playerPos,
  volumes,
  transitionSpeed = 0.25,
  enabled = true,
}: CameraVolumeSystemProps) => {
  const { camera } = useThree();
  
  // Current interpolated values
  const currentPosition = useRef(new Vector3());
  const currentLookAt = useRef(new Vector3());
  const currentFov = useRef(60);
  const initialized = useRef(false);

  useFrame((state, delta) => {
    const playerX = playerPos.x + 0.5;
    const playerZ = playerPos.y + 0.5;

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

    // Calculate target camera position
    const targetPosition = new Vector3(
      playerX + targetOffset[0] + shoulderOffset,
      targetOffset[1] + heightOffset,
      playerZ + targetOffset[2]
    );

    // Calculate target look-at position
    const targetLookAt = new Vector3(
      playerX + targetLookAtOffset[0],
      targetLookAtOffset[1],
      playerZ + targetLookAtOffset[2]
    );

    // Initialize on first frame
    if (!initialized.current) {
      currentPosition.current.copy(targetPosition);
      currentLookAt.current.copy(targetLookAt);
      currentFov.current = targetFov;
      initialized.current = true;
    }

    // Smooth interpolation (frame-rate independent)
    const lerpFactor = 1 - Math.pow(1 - transitionSpeed, delta * 60);
    
    currentPosition.current.lerp(targetPosition, lerpFactor);
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
