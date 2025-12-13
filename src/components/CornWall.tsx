import { useRef, useMemo } from 'react';
import { Group } from 'three';
import { useGLTF } from '@react-three/drei';

interface CornWallProps {
  position: [number, number, number];
  size?: [number, number, number];
}

// Preload the corn model
useGLTF.preload('/models/Corn.glb');

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
  size?: [number, number, number];
}

// Number of corn stalks per wall cell for density
const STALKS_PER_CELL = 9; // 3x3 grid
const STALK_SPACING = 0.3;

export const InstancedWalls = ({ positions, size = [0.8, 2.5, 0.8] }: InstancedWallsProps) => {
  const { scene } = useGLTF('/models/Corn.glb');
  const groupRef = useRef<Group>(null);
  
  // Generate all stalk positions with slight randomization
  const stalkData = useMemo(() => {
    const data: { pos: [number, number, number]; rotation: number }[] = [];
    const gridSize = Math.sqrt(STALKS_PER_CELL);
    
    positions.forEach((wallPos) => {
      for (let gx = 0; gx < gridSize; gx++) {
        for (let gz = 0; gz < gridSize; gz++) {
          const offsetX = (gx - (gridSize - 1) / 2) * STALK_SPACING + (Math.random() - 0.5) * 0.1;
          const offsetZ = (gz - (gridSize - 1) / 2) * STALK_SPACING + (Math.random() - 0.5) * 0.1;
          const rotation = Math.random() * Math.PI * 2;
          
          data.push({
            pos: [wallPos.x + 0.5 + offsetX, 0, wallPos.z + 0.5 + offsetZ],
            rotation
          });
        }
      }
    });
    
    return data;
  }, [positions]);

  // Clone the scene for each stalk
  const clones = useMemo(() => {
    return stalkData.map(() => scene.clone());
  }, [scene, stalkData]);

  if (positions.length === 0) return null;

  return (
    <group ref={groupRef}>
      {stalkData.map((stalk, i) => (
        <primitive 
          key={i}
          object={clones[i]} 
          position={stalk.pos}
          rotation={[0, stalk.rotation, 0]}
          scale={[size[0], size[1], size[2]]}
        />
      ))}
    </group>
  );
};
