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

export const InstancedWalls = ({ positions, size = [1.2, 3, 1.2] }: InstancedWallsProps) => {
  const { scene } = useGLTF('/models/Corn.glb');
  const groupRef = useRef<Group>(null);
  
  // Clone the scene for each position
  const clones = useMemo(() => {
    return positions.map(() => scene.clone());
  }, [scene, positions]);

  if (positions.length === 0) return null;

  return (
    <group ref={groupRef}>
      {positions.map((pos, i) => (
        <primitive 
          key={i}
          object={clones[i]} 
          position={[pos.x + 0.5, 0, pos.z + 0.5]}
          scale={[size[0], size[1], size[2]]}
        />
      ))}
    </group>
  );
};
