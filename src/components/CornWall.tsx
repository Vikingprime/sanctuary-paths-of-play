import { useRef, useMemo } from 'react';
import { Group, Mesh } from 'three';
import { useGLTF } from '@react-three/drei';

interface CornWallProps {
  position: [number, number, number];
  size?: [number, number, number];
}

// Preload models
useGLTF.preload('/models/Corn.glb');

// Seeded random for stable randomness
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Single wall component for simple cases
export const CornWall = ({ position, size = [1, 3, 1] }: CornWallProps) => {
  const { scene } = useGLTF('/models/Corn.glb');
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  
  return (
    <group position={position}>
      <primitive object={clonedScene} scale={[size[0], size[1], size[2]]} />
    </group>
  );
};

// Optimized instanced walls using the corn model
interface InstancedWallsProps {
  positions: { x: number; z: number }[];
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
  size?: [number, number, number];
}

// Reduced density for performance
const ROWS = 2;
const STALKS_PER_ROW = 2;
const STALK_SPACING = 0.35;
const MIN_HEIGHT = 2.0;
const MAX_HEIGHT = 3.0;

// Boundary walls
const BOUNDARY_ROWS = 5;
const BOUNDARY_STALKS_PER_ROW = 4;
const BOUNDARY_SPACING = 0.30;
const BOUNDARY_DEPTH = 2.0;

export const InstancedWalls = ({ positions, boundaryPositions = [], size = [0.6, 1, 0.6] }: InstancedWallsProps) => {
  const { scene } = useGLTF('/models/Corn.glb');
  const groupRef = useRef<Group>(null);
  
  // Generate stalk data and pre-clone scenes ONCE
  const { stalkData, clones } = useMemo(() => {
    const data: { pos: [number, number, number]; rotation: number; height: number }[] = [];
    
    // Regular interior walls
    positions.forEach((wallPos) => {
      const baseSeed = wallPos.x * 1000 + wallPos.z;
      for (let row = 0; row < ROWS; row++) {
        const rowOffset = (row % 2) * (STALK_SPACING / 2);
        for (let col = 0; col < STALKS_PER_ROW; col++) {
          const stalkSeed = baseSeed + row * 100 + col;
          const offsetX = (col - (STALKS_PER_ROW - 1) / 2) * STALK_SPACING + rowOffset;
          const offsetZ = (row - (ROWS - 1) / 2) * STALK_SPACING;
          const jitterX = (seededRandom(stalkSeed) - 0.5) * 0.03;
          const jitterZ = (seededRandom(stalkSeed + 1) - 0.5) * 0.03;
          const rotation = seededRandom(stalkSeed + 2) * Math.PI * 2;
          const height = MIN_HEIGHT + seededRandom(stalkSeed + 3) * (MAX_HEIGHT - MIN_HEIGHT);
          
          data.push({
            pos: [wallPos.x + 0.5 + offsetX + jitterX, 0, wallPos.z + 0.5 + offsetZ + jitterZ],
            rotation,
            height
          });
        }
      }
    });
    
    // Boundary walls
    boundaryPositions.forEach((wallPos) => {
      const baseSeed = wallPos.x * 1000 + wallPos.z + 50000;
      const dirX = wallPos.offsetX !== 0 ? Math.sign(wallPos.offsetX) : 0;
      const dirZ = wallPos.offsetZ !== 0 ? Math.sign(wallPos.offsetZ) : 0;
      
      for (let row = 0; row < BOUNDARY_ROWS; row++) {
        const rowOffset = (row % 2) * (BOUNDARY_SPACING / 2);
        const depthOffset = (row / (BOUNDARY_ROWS - 1)) * BOUNDARY_DEPTH;
        
        for (let col = 0; col < BOUNDARY_STALKS_PER_ROW; col++) {
          const stalkSeed = baseSeed + row * 100 + col;
          const offsetX = (col - (BOUNDARY_STALKS_PER_ROW - 1) / 2) * BOUNDARY_SPACING + rowOffset;
          const offsetZ = (col - (BOUNDARY_STALKS_PER_ROW - 1) / 2) * BOUNDARY_SPACING + rowOffset;
          const jitterX = (seededRandom(stalkSeed) - 0.5) * 0.03;
          const jitterZ = (seededRandom(stalkSeed + 1) - 0.5) * 0.03;
          const rotation = seededRandom(stalkSeed + 2) * Math.PI * 2;
          const height = MIN_HEIGHT + seededRandom(stalkSeed + 3) * (MAX_HEIGHT - MIN_HEIGHT);
          
          let posX = wallPos.x + 0.5 + jitterX;
          let posZ = wallPos.z + 0.5 + jitterZ;
          
          if (dirX !== 0) {
            posX += dirX * depthOffset;
            posZ += offsetZ;
          } else {
            posX += offsetX;
            posZ += dirZ * depthOffset;
          }
          
          data.push({
            pos: [posX, 0, posZ],
            rotation,
            height
          });
        }
      }
    });
    
    // Pre-clone all scenes once and enable shadows
    const clonedScenes = data.map(() => {
      const clone = scene.clone();
      clone.traverse((child) => {
        if ((child as Mesh).isMesh) {
          child.castShadow = true;
        }
      });
      return clone;
    });
    
    return { stalkData: data, clones: clonedScenes };
  }, [positions, boundaryPositions, scene]);

  if (positions.length === 0 && boundaryPositions.length === 0) return null;

  return (
    <group ref={groupRef}>
      {stalkData.map((stalk, i) => (
        <primitive 
          key={i}
          object={clones[i]} 
          position={stalk.pos}
          rotation={[0, stalk.rotation, 0]}
          scale={[size[0], stalk.height, size[2]]}
        />
      ))}
    </group>
  );
};
