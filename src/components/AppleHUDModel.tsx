import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Suspense, memo } from 'react';
import * as THREE from 'three';

interface AppleHUDModelProps {
  size?: number;
}

// Memoized Apple mesh component
const AppleMesh = memo(() => {
  const { scene } = useGLTF('/models/Apple_Red.glb');
  
  // Clone and position the scene
  const clonedScene = scene.clone();
  clonedScene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = child.material.clone();
    }
  });
  
  return (
    <primitive 
      object={clonedScene} 
      scale={2.5}
      rotation={[0, Math.PI * 0.25, 0]}
      position={[0, 0, 0]}
    />
  );
});

AppleMesh.displayName = 'AppleMesh';

// Preload the model
useGLTF.preload('/models/Apple_Red.glb');

export const AppleHUDModel = memo(({ size = 80 }: AppleHUDModelProps) => {
  return (
    <div 
      style={{ width: size, height: size }} 
      className="pointer-events-none"
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 35 }}
        gl={{ 
          alpha: true, 
          antialias: true,
          powerPreference: 'high-performance',
        }}
        frameloop="demand"
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 5, 5]} intensity={2} />
        <directionalLight position={[-3, 2, 4]} intensity={1} />
        <Suspense fallback={null}>
          <AppleMesh />
        </Suspense>
      </Canvas>
    </div>
  );
});

AppleHUDModel.displayName = 'AppleHUDModel';
