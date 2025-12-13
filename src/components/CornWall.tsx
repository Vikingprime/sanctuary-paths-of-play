import { useRef, useMemo, useEffect } from 'react';
import { Group, MeshStandardMaterial, Color, Mesh } from 'three';
import { useGLTF } from '@react-three/drei';

interface CornWallProps {
  position: [number, number, number];
  size?: [number, number, number];
}

// Preload models
useGLTF.preload('/models/Corn.glb');
useGLTF.preload('/models/Soil_mount.glb');

// Dark green material for boundary blocks
const boundaryMaterial = new MeshStandardMaterial({
  color: new Color(0.08, 0.15, 0.05),
  roughness: 1,
  metalness: 0,
});

// Brown material for soil mounds
const soilMaterial = new MeshStandardMaterial({
  color: new Color(0.35, 0.22, 0.1),
  roughness: 1,
  metalness: 0,
});

// Seeded random for stable randomness - avoids jitter from regenerating random values
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
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[]; // Outer boundary walls with offset
  size?: [number, number, number];
}

// Density settings - reduced for performance
const ROWS = 3;
const STALKS_PER_ROW = 3;
const STALK_SPACING = 0.28;
const MIN_HEIGHT = 2.0;
const MAX_HEIGHT = 3.0;

// Boundary walls - more layers of corn before the green block
const BOUNDARY_ROWS = 6;
const BOUNDARY_STALKS_PER_ROW = 6;
const BOUNDARY_SPACING = 0.25;
const BOUNDARY_DEPTH = 1.2; // How far the corn extends outward

export const InstancedWalls = ({ positions, boundaryPositions = [], size = [0.6, 1, 0.6] }: InstancedWallsProps) => {
  const { scene } = useGLTF('/models/Corn.glb');
  const { scene: soilScene } = useGLTF('/models/Soil_mount.glb');
  const groupRef = useRef<Group>(null);
  
  // Apply brown material to soil model
  useEffect(() => {
    soilScene.traverse((child) => {
      if (child instanceof Mesh) {
        child.material = soilMaterial;
      }
    });
  }, [soilScene]);
  
  // Generate stalk data for walls - using seeded random for stable positions
  const stalkData = useMemo(() => {
    const data: { pos: [number, number, number]; rotation: number; height: number }[] = [];
    let seedCounter = 0;
    
    // Regular interior walls
    positions.forEach((wallPos) => {
      const baseSeed = wallPos.x * 1000 + wallPos.z; // Unique seed per wall position
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
          seedCounter++;
        }
      }
    });
    
    // Boundary walls - multiple layers extending outward
    boundaryPositions.forEach((wallPos) => {
      const baseSeed = wallPos.x * 1000 + wallPos.z + 50000; // Different seed space for boundaries
      // Determine outward direction
      const dirX = wallPos.offsetX !== 0 ? Math.sign(wallPos.offsetX) : 0;
      const dirZ = wallPos.offsetZ !== 0 ? Math.sign(wallPos.offsetZ) : 0;
      
      for (let row = 0; row < BOUNDARY_ROWS; row++) {
        const rowOffset = (row % 2) * (BOUNDARY_SPACING / 2);
        // Extend corn outward in the offset direction
        const depthOffset = (row / (BOUNDARY_ROWS - 1)) * BOUNDARY_DEPTH;
        
        for (let col = 0; col < BOUNDARY_STALKS_PER_ROW; col++) {
          const stalkSeed = baseSeed + row * 100 + col;
          const offsetX = (col - (BOUNDARY_STALKS_PER_ROW - 1) / 2) * BOUNDARY_SPACING + rowOffset;
          const offsetZ = (col - (BOUNDARY_STALKS_PER_ROW - 1) / 2) * BOUNDARY_SPACING + rowOffset;
          const jitterX = (seededRandom(stalkSeed) - 0.5) * 0.03;
          const jitterZ = (seededRandom(stalkSeed + 1) - 0.5) * 0.03;
          const rotation = seededRandom(stalkSeed + 2) * Math.PI * 2;
          const height = MIN_HEIGHT + seededRandom(stalkSeed + 3) * (MAX_HEIGHT - MIN_HEIGHT);
          
          // Position corn: spread perpendicular to boundary, extend outward
          let posX = wallPos.x + 0.5 + jitterX;
          let posZ = wallPos.z + 0.5 + jitterZ;
          
          if (dirX !== 0) {
            // Left/right boundary - spread in Z, extend in X
            posX += dirX * depthOffset;
            posZ += offsetZ;
          } else {
            // Top/bottom boundary - spread in X, extend in Z
            posX += offsetX;
            posZ += dirZ * depthOffset;
          }
          
          data.push({
            pos: [posX, 0, posZ],
            rotation,
            height
          });
          seedCounter++;
        }
      }
    });
    
    return data;
  }, [positions, boundaryPositions]);

  // Clone the scene for each stalk - only regenerate when stalk count changes
  const clones = useMemo(() => {
    return stalkData.map(() => scene.clone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stalkData.length]);

  // Clone soil model for each stalk
  const soilClones = useMemo(() => {
    return stalkData.map(() => soilScene.clone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stalkData.length]);

  if (positions.length === 0 && boundaryPositions.length === 0) return null;

  return (
    <group ref={groupRef}>
      {/* Solid dark green blocks BEHIND boundary walls (offset outward) */}
      {boundaryPositions.map((pos, i) => (
        <mesh 
          key={`block-${i}`}
          position={[pos.x + 0.5 + pos.offsetX, 1.5, pos.z + 0.5 + pos.offsetZ]}
          material={boundaryMaterial}
        >
          <boxGeometry args={[1.2, 4, 1.2]} />
        </mesh>
      ))}
      {/* Soil mounds under each stalk */}
      {stalkData.map((stalk, i) => (
        <primitive 
          key={`soil-${i}`}
          object={soilClones[i]} 
          position={stalk.pos}
          rotation={[0, stalk.rotation, 0]}
          scale={[0.4, 0.3, 0.4]}
        />
      ))}
      {/* Corn stalks */}
      {stalkData.map((stalk, i) => (
        <primitive 
          key={`corn-${i}`}
          object={clones[i]} 
          position={stalk.pos}
          rotation={[0, stalk.rotation, 0]}
          scale={[size[0], stalk.height, size[2]]}
        />
      ))}
    </group>
  );
};
