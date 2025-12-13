import { useRef, useMemo } from 'react';
import { Group, MeshStandardMaterial, Color } from 'three';
import { useGLTF } from '@react-three/drei';

// Dark green backing material to block visibility through corn
const backingMaterial = new MeshStandardMaterial({
  color: new Color(0.1, 0.2, 0.08),
  roughness: 1,
  metalness: 0,
});

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

// Density settings for opaque walls
const ROWS = 5;
const STALKS_PER_ROW = 5;
const STALK_SPACING = 0.2;
const BASE_HEIGHT = 2.2;
const HEIGHT_VARIATION = 0.8; // Random height between 2.2 and 3.0

export const InstancedWalls = ({ positions, size = [0.6, 1, 0.6] }: InstancedWallsProps) => {
  const { scene } = useGLTF('/models/Corn.glb');
  const groupRef = useRef<Group>(null);
  
  // Generate all stalk positions with staggered offset pattern and height variation
  const stalkData = useMemo(() => {
    const data: { pos: [number, number, number]; rotation: number; height: number }[] = [];
    
    positions.forEach((wallPos) => {
      for (let row = 0; row < ROWS; row++) {
        // Offset every other row by half spacing for staggered pattern
        const rowOffset = (row % 2) * (STALK_SPACING / 2);
        
        for (let col = 0; col < STALKS_PER_ROW; col++) {
          const offsetX = (col - (STALKS_PER_ROW - 1) / 2) * STALK_SPACING + rowOffset;
          const offsetZ = (row - (ROWS - 1) / 2) * STALK_SPACING;
          // Add small random jitter for natural look
          const jitterX = (Math.random() - 0.5) * 0.04;
          const jitterZ = (Math.random() - 0.5) * 0.04;
          const rotation = Math.random() * Math.PI * 2;
          const height = BASE_HEIGHT + Math.random() * HEIGHT_VARIATION;
          
          data.push({
            pos: [wallPos.x + 0.5 + offsetX + jitterX, 0, wallPos.z + 0.5 + offsetZ + jitterZ],
            rotation,
            height
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
      {/* Solid dark green backing boxes to block visibility */}
      {positions.map((pos, i) => (
        <mesh 
          key={`backing-${i}`}
          position={[pos.x + 0.5, 1.5, pos.z + 0.5]}
          material={backingMaterial}
        >
          <boxGeometry args={[0.9, 3, 0.9]} />
        </mesh>
      ))}
      {/* Corn stalks on top */}
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
