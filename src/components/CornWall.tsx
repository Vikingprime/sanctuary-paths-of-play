import { useEffect, useRef, useMemo } from 'react';
import { InstancedMesh, Object3D, MeshStandardMaterial, Color } from 'three';

interface CornWallProps {
  position: [number, number, number];
  size?: [number, number, number];
}

// Simple solid green material
const cornMaterial = new MeshStandardMaterial({
  color: new Color(0.25, 0.45, 0.18),
  roughness: 0.9,
  metalness: 0,
});

// Single wall component for simple cases
export const CornWall = ({ position, size = [1, 3, 1] }: CornWallProps) => {
  return (
    <group position={position}>
      <mesh position={[0, size[1] / 2, 0]} material={cornMaterial}>
        <boxGeometry args={size} />
      </mesh>
    </group>
  );
};

// Optimized instanced walls for rendering many walls efficiently
interface InstancedWallsProps {
  positions: { x: number; z: number }[];
  size?: [number, number, number];
}

export const InstancedWalls = ({ positions, size = [1.2, 3, 1.2] }: InstancedWallsProps) => {
  const meshRef = useRef<InstancedMesh>(null);
  
  useEffect(() => {
    if (!meshRef.current || positions.length === 0) return;
    
    const dummy = new Object3D();
    
    positions.forEach((pos, i) => {
      dummy.position.set(pos.x + 0.5, size[1] / 2, pos.z + 0.5);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, size]);

  if (positions.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, positions.length]}
      frustumCulled={true}
      material={cornMaterial}
    >
      <boxGeometry args={size} />
    </instancedMesh>
  );
};
