import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh } from 'three';
import { AnimalType } from '@/types/game';

interface PlayerCubeProps {
  animalType: AnimalType;
  position: [number, number, number];
  rotation?: number; // Y-axis rotation in radians
}

const animalColors: Record<AnimalType, string | string[]> = {
  pig: '#FFB6C1', // Pink
  cow: '#1a1a1a', // Will have spots
  bird: '#FFD700', // Yellow/Gold
};

export const PlayerCube = ({ animalType, position, rotation = 0 }: PlayerCubeProps) => {
  const innerGroupRef = useRef<any>(null);
  const bobOffset = useRef(0);

  // Only use useFrame for bobbing animation, not rotation
  useFrame((state, delta) => {
    if (innerGroupRef.current) {
      bobOffset.current += delta * 3;
      innerGroupRef.current.position.y = 0.4 + Math.sin(bobOffset.current) * 0.05;
    }
  });

  // Visual rotation: negate and offset so model faces movement direction
  // Movement uses sin(θ),-cos(θ) which rotates clockwise from -Z
  // Three.js rotation.y rotates counterclockwise from +Z
  // So we need: visualRotation = -rotation (to reverse direction) + π (to offset from +Z to -Z)
  const visualRotation = -rotation + Math.PI;

  if (animalType === 'cow') {
    return (
      <group position={position} rotation={[0, visualRotation, 0]}>
        <group ref={innerGroupRef}>
          <mesh>
            <boxGeometry args={[0.6, 0.6, 0.6]} />
            <meshStandardMaterial color="#f5f5f5" />
          </mesh>
          {/* Spots */}
          <mesh position={[0.15, 0.1, 0.31]}>
            <boxGeometry args={[0.2, 0.2, 0.02]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[-0.1, -0.05, 0.31]}>
            <boxGeometry args={[0.15, 0.15, 0.02]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          {/* Eyes */}
          <mesh position={[0.12, 0.15, 0.31]}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
            <meshStandardMaterial color="#000" />
          </mesh>
          <mesh position={[-0.12, 0.15, 0.31]}>
            <boxGeometry args={[0.08, 0.08, 0.02]} />
            <meshStandardMaterial color="#000" />
          </mesh>
        </group>
      </group>
    );
  }

  return (
    <group position={position} rotation={[0, visualRotation, 0]}>
      <group ref={innerGroupRef}>
        <mesh>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshStandardMaterial color={animalColors[animalType] as string} />
        </mesh>
        {/* Eyes */}
        <mesh position={[0.12, 0.15, 0.31]}>
          <boxGeometry args={[0.1, 0.1, 0.02]} />
          <meshStandardMaterial color="#000" />
        </mesh>
        <mesh position={[-0.12, 0.15, 0.31]}>
          <boxGeometry args={[0.1, 0.1, 0.02]} />
          <meshStandardMaterial color="#000" />
        </mesh>
        {/* Pig snout or bird beak */}
        {animalType === 'pig' && (
          <mesh position={[0, 0, 0.35]}>
            <boxGeometry args={[0.2, 0.15, 0.1]} />
            <meshStandardMaterial color="#FF9999" />
          </mesh>
        )}
        {animalType === 'bird' && (
          <mesh position={[0, 0, 0.4]}>
            <boxGeometry args={[0.1, 0.08, 0.15]} />
            <meshStandardMaterial color="#FF6600" />
          </mesh>
        )}
      </group>
    </group>
  );
};
