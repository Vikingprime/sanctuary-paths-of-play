import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Center } from '@react-three/drei';
import { Suspense, memo, useRef, useEffect } from 'react';
import * as THREE from 'three';

interface AppleHUDModelProps {
  size?: number;
}

// Simple fallback sphere that's always visible
const FallbackSphere = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });
  
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial color="#ff4444" />
    </mesh>
  );
};

// Simple apple shape using basic geometry (fallback while GLB issues are debugged)
const AppleMesh = () => {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });
  
  return (
    <group ref={groupRef}>
      {/* Apple body */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#e74c3c" />
      </mesh>
      {/* Apple stem */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.4, 8]} />
        <meshStandardMaterial color="#5d4037" />
      </mesh>
      {/* Apple leaf */}
      <mesh position={[0.2, 1.2, 0]} rotation={[0, 0, 0.3]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial color="#27ae60" />
      </mesh>
    </group>
  );
};

export const AppleHUDModel = memo(({ size = 80 }: AppleHUDModelProps) => {
  return (
    <div 
      style={{ 
        width: `${size}px`, 
        height: `${size}px`,
        position: 'relative',
      }} 
      className="pointer-events-none"
    >
      <Canvas
        orthographic
        camera={{ 
          zoom: 40,
          position: [0, 0, 10],
          near: 0.1,
          far: 1000,
        }}
        gl={{ 
          alpha: true, 
          antialias: true,
          powerPreference: 'high-performance',
        }}
        frameloop="always"
        style={{ 
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
        onCreated={() => console.log('[AppleHUD] Canvas created')}
      >
        <ambientLight intensity={3} />
        <directionalLight position={[5, 5, 5]} intensity={3} />
        <directionalLight position={[-3, 2, 4]} intensity={2} />
        <Suspense fallback={<FallbackSphere />}>
          <AppleMesh />
        </Suspense>
      </Canvas>
    </div>
  );
});

AppleHUDModel.displayName = 'AppleHUDModel';
