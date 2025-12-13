import { useRef, useMemo } from 'react';
import { Group, MeshStandardMaterial, Color } from 'three';
import { useGLTF } from '@react-three/drei';

interface CornWallProps {
  position: [number, number, number];
  size?: [number, number, number];
}

// Preload the corn model
useGLTF.preload('/models/Corn.glb');

// Dark green material for boundary blocks
const boundaryMaterial = new MeshStandardMaterial({
  color: new Color(0.08, 0.15, 0.05),
  roughness: 1,
  metalness: 0,
});

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
  boundaryPositions?: { x: number; z: number }[]; // Outer boundary walls
  size?: [number, number, number];
}

// Density settings - reduced for performance
const ROWS = 3;
const STALKS_PER_ROW = 3;
const STALK_SPACING = 0.28;
const MIN_HEIGHT = 2.0;
const MAX_HEIGHT = 3.0;

// Boundary walls - moderate density + solid block behind
const BOUNDARY_ROWS = 4;
const BOUNDARY_STALKS_PER_ROW = 4;
const BOUNDARY_SPACING = 0.22;

export const InstancedWalls = ({ positions, boundaryPositions = [], size = [0.6, 1, 0.6] }: InstancedWallsProps) => {
  const { scene } = useGLTF('/models/Corn.glb');
  const groupRef = useRef<Group>(null);
  
  // Generate stalk data for walls
  const stalkData = useMemo(() => {
    const data: { pos: [number, number, number]; rotation: number; height: number }[] = [];
    
    // Regular interior walls
    positions.forEach((wallPos) => {
      for (let row = 0; row < ROWS; row++) {
        const rowOffset = (row % 2) * (STALK_SPACING / 2);
        for (let col = 0; col < STALKS_PER_ROW; col++) {
          const offsetX = (col - (STALKS_PER_ROW - 1) / 2) * STALK_SPACING + rowOffset;
          const offsetZ = (row - (ROWS - 1) / 2) * STALK_SPACING;
          const jitterX = (Math.random() - 0.5) * 0.03;
          const jitterZ = (Math.random() - 0.5) * 0.03;
          const rotation = Math.random() * Math.PI * 2;
          const height = MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
          
          data.push({
            pos: [wallPos.x + 0.5 + offsetX + jitterX, 0, wallPos.z + 0.5 + offsetZ + jitterZ],
            rotation,
            height
          });
        }
      }
    });
    
    // Boundary walls - with corn stalks
    boundaryPositions.forEach((wallPos) => {
      for (let row = 0; row < BOUNDARY_ROWS; row++) {
        const rowOffset = (row % 2) * (BOUNDARY_SPACING / 2);
        for (let col = 0; col < BOUNDARY_STALKS_PER_ROW; col++) {
          const offsetX = (col - (BOUNDARY_STALKS_PER_ROW - 1) / 2) * BOUNDARY_SPACING + rowOffset;
          const offsetZ = (row - (BOUNDARY_ROWS - 1) / 2) * BOUNDARY_SPACING;
          const jitterX = (Math.random() - 0.5) * 0.03;
          const jitterZ = (Math.random() - 0.5) * 0.03;
          const rotation = Math.random() * Math.PI * 2;
          const height = MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
          
          data.push({
            pos: [wallPos.x + 0.5 + offsetX + jitterX, 0, wallPos.z + 0.5 + offsetZ + jitterZ],
            rotation,
            height
          });
        }
      }
    });
    
    return data;
  }, [positions, boundaryPositions]);

  // Clone the scene for each stalk
  const clones = useMemo(() => {
    return stalkData.map(() => scene.clone());
  }, [scene, stalkData]);

  if (positions.length === 0 && boundaryPositions.length === 0) return null;

  return (
    <group ref={groupRef}>
      {/* Solid dark green blocks behind boundary walls */}
      {boundaryPositions.map((pos, i) => (
        <mesh 
          key={`block-${i}`}
          position={[pos.x + 0.5, 1.5, pos.z + 0.5]}
          material={boundaryMaterial}
        >
          <boxGeometry args={[1.1, 3.5, 1.1]} />
        </mesh>
      ))}
      {/* Corn stalks */}
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
