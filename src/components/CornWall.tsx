import { useRef, useMemo, useEffect } from 'react';
import { InstancedMesh, CylinderGeometry, MeshStandardMaterial, Object3D, Color } from 'three';
import { useFrame } from '@react-three/fiber';

interface CornWallProps {
  position: [number, number, number];
  size?: [number, number, number];
}

// Seeded random for stable randomness
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Simple single wall for compatibility
export const CornWall = ({ position, size = [1, 3, 1] }: CornWallProps) => {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.05, 0.08, size[1], 6]} />
        <meshStandardMaterial color="#4a7c23" />
      </mesh>
    </group>
  );
};

// Instanced walls using native InstancedMesh for true GPU instancing
interface InstancedWallsProps {
  positions: { x: number; z: number }[];
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
  size?: [number, number, number];
}

// Density settings
const ROWS = 3;
const STALKS_PER_ROW = 3;
const STALK_SPACING = 0.28;
const MIN_HEIGHT = 2.0;
const MAX_HEIGHT = 3.0;

// Boundary walls
const BOUNDARY_ROWS = 6;
const BOUNDARY_STALKS_PER_ROW = 5;
const BOUNDARY_SPACING = 0.28;
const BOUNDARY_DEPTH = 2.0;

export const InstancedWalls = ({ positions, boundaryPositions = [], size = [0.6, 1, 0.6] }: InstancedWallsProps) => {
  const meshRef = useRef<InstancedMesh>(null);
  
  // Generate all stalk transforms
  const stalkData = useMemo(() => {
    const data: { x: number; y: number; z: number; rotation: number; height: number }[] = [];
    
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
            x: wallPos.x + 0.5 + offsetX + jitterX,
            y: height / 2,
            z: wallPos.z + 0.5 + offsetZ + jitterZ,
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
            x: posX,
            y: height / 2,
            z: posZ,
            rotation,
            height
          });
        }
      }
    });
    
    return data;
  }, [positions, boundaryPositions]);

  // Create geometry and material once
  const { geometry, material } = useMemo(() => {
    const geo = new CylinderGeometry(0.04, 0.06, 1, 5);
    const mat = new MeshStandardMaterial({ 
      color: new Color('#4a7c23'),
      roughness: 0.8,
      metalness: 0.0
    });
    return { geometry: geo, material: mat };
  }, []);

  // Update instance matrices
  useEffect(() => {
    if (!meshRef.current) return;
    
    const dummy = new Object3D();
    
    stalkData.forEach((stalk, i) => {
      dummy.position.set(stalk.x, stalk.y, stalk.z);
      dummy.rotation.set(0, stalk.rotation, 0);
      dummy.scale.set(1, stalk.height, 1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [stalkData]);

  if (stalkData.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, stalkData.length]}
      castShadow
      receiveShadow
    />
  );
};
