import { useRef } from 'react';
import { Mesh } from 'three';

interface CornWallProps {
  position: [number, number, number];
  size?: [number, number, number];
}

export const CornWall = ({ position, size = [1, 3, 1] }: CornWallProps) => {
  const meshRef = useRef<Mesh>(null);

  return (
    <group position={position}>
      {/* Main corn stalk body */}
      <mesh position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>
      
      {/* Corn texture overlay - darker green stripes */}
      <mesh position={[0, size[1] / 2, 0.01]}>
        <boxGeometry args={[size[0] * 0.9, size[1], size[2] * 0.1]} />
        <meshStandardMaterial color="#1e4620" />
      </mesh>
      
      {/* Top leaves */}
      <mesh position={[0.2, size[1] + 0.3, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.1, 0.8, 0.3]} />
        <meshStandardMaterial color="#4a7c45" />
      </mesh>
      <mesh position={[-0.2, size[1] + 0.2, 0]} rotation={[0, 0, -0.4]}>
        <boxGeometry args={[0.1, 0.6, 0.25]} />
        <meshStandardMaterial color="#3d6b38" />
      </mesh>
    </group>
  );
};
