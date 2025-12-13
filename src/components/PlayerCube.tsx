import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimalType } from '@/types/game';

interface PlayerCubeProps {
  animalType: AnimalType;
  position: [number, number, number];
  rotation?: number; // Y-axis rotation in radians
}

// Preload the pig model
useGLTF.preload('/models/Pig.glb');

const animalColors: Record<AnimalType, string | string[]> = {
  pig: '#FFB6C1', // Pink (fallback)
  cow: '#1a1a1a', // Will have spots
  bird: '#FFD700', // Yellow/Gold
};

export const PlayerCube = ({ animalType, position, rotation = 0 }: PlayerCubeProps) => {
  const innerGroupRef = useRef<any>(null);
  const bobOffset = useRef(0);
  
  // Load pig model
  const { scene: pigScene } = useGLTF('/models/Pig.glb');
  
  // Debug: log the pig scene structure
  useEffect(() => {
    if (animalType === 'pig') {
      console.log('Pig scene loaded:', pigScene);
      console.log('Pig children count:', pigScene.children.length);
      pigScene.traverse((child: any) => {
        console.log('Child:', child.type, child.name);
        if (child.isMesh) {
          console.log('Mesh material:', child.material);
        }
      });
    }
  }, [pigScene, animalType]);
  
  const clonedPigScene = useMemo(() => pigScene.clone(), [pigScene]);

  // Only use useFrame for bobbing animation
  useFrame((state, delta) => {
    if (innerGroupRef.current) {
      bobOffset.current += delta * 3;
      const baseHeight = 0.4;
      innerGroupRef.current.position.y = baseHeight + Math.sin(bobOffset.current) * 0.05;
    }
  });

  // Visual rotation
  const visualRotation = -rotation + Math.PI;

  // Pig uses GLB model
  if (animalType === 'pig') {
    return (
      <group position={position} rotation={[0, visualRotation, 0]}>
        <group ref={innerGroupRef}>
          <primitive object={clonedPigScene} scale={[0.008, 0.008, 0.008]} position={[0, -0.1, 0]} />
        </group>
      </group>
    );
  }

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

  // Bird (default)
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
        {/* Beak */}
        <mesh position={[0, 0, 0.4]}>
          <boxGeometry args={[0.1, 0.08, 0.15]} />
          <meshStandardMaterial color="#FF6600" />
        </mesh>
      </group>
    </group>
  );
};