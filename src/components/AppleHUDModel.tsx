import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Center } from '@react-three/drei';
import { Suspense, memo, useRef } from 'react';
import * as THREE from 'three';

interface AppleHUDModelProps {
  size?: number;
}

// Memoized Apple mesh component with auto-rotation
const AppleMesh = memo(() => {
  const { scene } = useGLTF('/models/Apple_Red.glb');
  const groupRef = useRef<THREE.Group>(null);
  
  // Slow rotation for visual interest
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });
  
  return (
    <group ref={groupRef}>
      <Center>
        <primitive 
          object={scene.clone()} 
          scale={100}
        />
      </Center>
    </group>
  );
});

AppleMesh.displayName = 'AppleMesh';

// Preload the model
useGLTF.preload('/models/Apple_Red.glb');

export const AppleHUDModel = memo(({ size = 80 }: AppleHUDModelProps) => {
  return (
    <div 
      style={{ 
        width: size, 
        height: size,
        display: 'block',
      }} 
      className="pointer-events-none"
    >
      <Canvas
        orthographic
        camera={{ 
          zoom: 20,
          position: [0, 0, 100],
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
          background: 'transparent',
        }}
      >
        <ambientLight intensity={3} />
        <directionalLight position={[5, 5, 5]} intensity={3} />
        <directionalLight position={[-3, 2, 4]} intensity={2} />
        <Suspense fallback={null}>
          <AppleMesh />
        </Suspense>
      </Canvas>
    </div>
  );
});

AppleHUDModel.displayName = 'AppleHUDModel';
