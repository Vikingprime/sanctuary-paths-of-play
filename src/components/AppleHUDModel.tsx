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
      scale={3.5}
      rotation={[0, Math.PI * 0.25, 0]}
      position={[0, -0.3, 0]}
    />
  );
});

AppleMesh.displayName = 'AppleMesh';

// Preload the model
useGLTF.preload('/models/Apple_Red.glb');

export const AppleHUDModel = memo(({ size = 80 }: AppleHUDModelProps) => {
  return (
    <div 
      style={{ width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px` }} 
      className="pointer-events-none relative"
    >
      <Canvas
        camera={{ position: [0, 0, 4], fov: 40 }}
        gl={{ 
          alpha: true, 
          antialias: true,
          powerPreference: 'high-performance',
        }}
        frameloop="always"
        style={{ 
          background: 'transparent',
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        <ambientLight intensity={2} />
        <directionalLight position={[5, 5, 5]} intensity={2.5} />
        <directionalLight position={[-3, 2, 4]} intensity={1.5} />
        <Suspense fallback={null}>
          <AppleMesh />
        </Suspense>
      </Canvas>
    </div>
  );
});

AppleHUDModel.displayName = 'AppleHUDModel';
