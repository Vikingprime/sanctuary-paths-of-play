import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface AppleCollectibleProps {
  position: [number, number, number];
  onCollect: () => void;
  playerPosition: { x: number; z: number };
  collected?: boolean;
}

// 3D apple that can be collected in the maze
export const AppleCollectible = ({
  position,
  onCollect,
  playerPosition,
  collected = false,
}: AppleCollectibleProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const [isCollected, setIsCollected] = useState(collected);
  const [collectAnimation, setCollectAnimation] = useState(0);
  
  const COLLECT_RADIUS = 0.8; // Distance to collect apple
  
  // Load the apple model
  const { scene } = useGLTF('/models/Apple.glb');
  
  useFrame((_, delta) => {
    if (!groupRef.current || isCollected) return;
    
    // Floating animation
    groupRef.current.position.y = position[1] + Math.sin(Date.now() * 0.003) * 0.1;
    groupRef.current.rotation.y += delta * 1.5;
    
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
    if (!groupRef.current || !isCollected) return;
    
    setCollectAnimation(prev => {
      const next = prev + delta * 3;
      if (next >= 1) {
        groupRef.current!.visible = false;
      }
      const scale = 1 + next * 0.5;
      groupRef.current!.scale.setScalar(scale * 0.3); // Base scale is 0.3
      return next;
    });
  });
  
  if (collected) return null;
  
  return (
    <group ref={groupRef} position={position}>
      {/* Apple 3D model */}
      <primitive 
        object={scene.clone()} 
        scale={0.3}
        castShadow
      />
      
      {/* Glow effect */}
      {!isCollected && (
        <pointLight color="#ef4444" intensity={0.4} distance={2} />
      )}
    </group>
  );
};

// Preload the model
useGLTF.preload('/models/Apple.glb');
