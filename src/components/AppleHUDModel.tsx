import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Center, Box } from '@react-three/drei';
import { Suspense, memo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';

interface AppleHUDModelProps {
  size?: number;
}

// Debug: Simple red box to verify Canvas renders
const DebugBox = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });
  
  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
};

// Memoized Apple mesh component with auto-rotation
const AppleMesh = memo(() => {
  const { scene } = useGLTF('/models/Apple_Red.glb');
  const groupRef = useRef<THREE.Group>(null);
  
  useEffect(() => {
    // Debug: Log the model bounds
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    console.log('[AppleHUD] Model bounds:', { 
      width: size.x, 
      height: size.y, 
      depth: size.z,
      min: box.min,
      max: box.max
    });
  }, [scene]);
  
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
          scale={500}
        />
      </Center>
    </group>
  );
});

AppleMesh.displayName = 'AppleMesh';

// Preload the model
useGLTF.preload('/models/Apple_Red.glb');

export const AppleHUDModel = memo(({ size = 80 }: AppleHUDModelProps) => {
  const [showDebug, setShowDebug] = useState(false);
  
  return (
    <div 
      style={{ 
        width: size, 
        height: size,
        display: 'block',
        border: '1px solid red', // Debug: show container bounds
      }} 
      className="pointer-events-none"
      onClick={() => setShowDebug(prev => !prev)}
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
        onCreated={() => console.log('[AppleHUD] Canvas created successfully')}
      >
        <ambientLight intensity={3} />
        <directionalLight position={[5, 5, 5]} intensity={3} />
        <directionalLight position={[-3, 2, 4]} intensity={2} />
        <Suspense fallback={null}>
          {showDebug ? <DebugBox /> : <AppleMesh />}
        </Suspense>
      </Canvas>
    </div>
  );
});

AppleHUDModel.displayName = 'AppleHUDModel';
