import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';

interface AppleHUDModelProps {
  size?: number;
}

const AppleModel = () => {
  const { scene } = useGLTF('/models/Apple_Red.glb');
  
  return (
    <primitive 
      object={scene.clone()} 
      scale={[2.5, 2.5, 2.5]}
      rotation={[0, Math.PI * 0.25, 0]}
    />
  );
};

// Preload the model
useGLTF.preload('/models/Apple_Red.glb');

export const AppleHUDModel = ({ size = 80 }: AppleHUDModelProps) => {
  return (
    <div style={{ width: size, height: size }} className="pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 35 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 5, 5]} intensity={1.5} />
        <directionalLight position={[-3, 2, 4]} intensity={0.8} />
        <Suspense fallback={null}>
          <AppleModel />
        </Suspense>
      </Canvas>
    </div>
  );
};
