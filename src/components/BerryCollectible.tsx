import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface BerryCollectibleProps {
  position: [number, number, number];
  onCollect: () => void;
  playerPosition: { x: number; z: number };
  collected?: boolean;
}

// 3D berry that can be collected in the maze
export const BerryCollectible = ({
  position,
  onCollect,
  playerPosition,
  collected = false,
}: BerryCollectibleProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isCollected, setIsCollected] = useState(collected);
  const [collectAnimation, setCollectAnimation] = useState(0);
  
  const COLLECT_RADIUS = 0.8; // Distance to collect berry
  
  useFrame((_, delta) => {
    if (!meshRef.current || isCollected) return;
    
    // Floating animation
    meshRef.current.position.y = position[1] + Math.sin(Date.now() * 0.003) * 0.1;
    meshRef.current.rotation.y += delta * 1.5;
    
    // Check collection distance
    const dx = playerPosition.x - position[0];
    const dz = playerPosition.z - position[2];
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < COLLECT_RADIUS) {
      setIsCollected(true);
      setCollectAnimation(1);
      onCollect();
    }
  });
  
  // Collect animation (scale up and fade)
  useFrame((_, delta) => {
    if (!meshRef.current || !isCollected) return;
    
    setCollectAnimation(prev => {
      const next = prev + delta * 3;
      if (next >= 1) {
        meshRef.current!.visible = false;
      }
      meshRef.current!.scale.setScalar(1 + next * 0.5);
      return next;
    });
  });
  
  if (collected) return null;
  
  return (
    <group position={position}>
      {/* Berry body */}
      <mesh ref={meshRef} castShadow>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial 
          color="#dc2626" 
          roughness={0.3}
          metalness={0.1}
          transparent={isCollected}
          opacity={isCollected ? Math.max(0, 1 - collectAnimation) : 1}
        />
      </mesh>
      
      {/* Berry highlight */}
      <mesh position={[0.05, 0.08, 0.05]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial 
          color="#fca5a5" 
          roughness={0.2}
          transparent={isCollected}
          opacity={isCollected ? Math.max(0, 1 - collectAnimation) : 1}
        />
      </mesh>
      
      {/* Berry stem */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.08, 8]} />
        <meshStandardMaterial 
          color="#15803d" 
          transparent={isCollected}
          opacity={isCollected ? Math.max(0, 1 - collectAnimation) : 1}
        />
      </mesh>
      
      {/* Leaf */}
      <mesh position={[0.05, 0.2, 0]} rotation={[0, 0, -0.5]}>
        <planeGeometry args={[0.1, 0.06]} />
        <meshStandardMaterial 
          color="#22c55e" 
          side={THREE.DoubleSide}
          transparent={isCollected}
          opacity={isCollected ? Math.max(0, 1 - collectAnimation) : 1}
        />
      </mesh>
      
      {/* Glow effect */}
      {!isCollected && (
        <pointLight color="#ef4444" intensity={0.3} distance={1.5} />
      )}
    </group>
  );
};
