import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { AnimationMixer } from 'three';
import { AnimalType } from '@/types/game';

interface PlayerCubeProps {
  animalType: AnimalType;
  position: [number, number, number];
  rotation?: number; // Y-axis rotation in radians
  isMoving?: boolean; // Whether the player is currently moving
}

// Preload models
useGLTF.preload('/models/Pig.glb');
useGLTF.preload('/models/Cow.glb');

const animalColors: Record<AnimalType, string | string[]> = {
  pig: '#FFB6C1', // Pink (fallback)
  cow: '#f5f5f5', // White (fallback)
  bird: '#FFD700', // Yellow/Gold
};

export const PlayerCube = ({ animalType, position, rotation = 0, isMoving = false }: PlayerCubeProps) => {
  const innerGroupRef = useRef<any>(null);
  const bobOffset = useRef(0);
  const cowGroupRef = useRef<any>(null);
  
  // Load models
  const { scene: pigScene } = useGLTF('/models/Pig.glb');
  const { scene: cowScene, animations: cowAnimations } = useGLTF('/models/Cow.glb');
  
  const clonedPigScene = useMemo(() => pigScene.clone(), [pigScene]);
  const clonedCowScene = useMemo(() => cowScene.clone(), [cowScene]);
  
  // Set up cow animation mixer
  const cowMixerRef = useRef<AnimationMixer | null>(null);
  const gallopActionRef = useRef<any>(null);
  
  useEffect(() => {
    if (animalType === 'cow' && cowAnimations.length > 0) {
      console.log('Cow animations available:', cowAnimations.map(a => a.name));
      
      // Create mixer for the cloned scene
      cowMixerRef.current = new AnimationMixer(clonedCowScene);
      
      // Find gallop animation (try common names)
      const gallopAnim = cowAnimations.find(a => 
        a.name.toLowerCase().includes('gallop') || 
        a.name.toLowerCase().includes('run') ||
        a.name.toLowerCase().includes('walk')
      ) || cowAnimations[0]; // Fallback to first animation
      
      if (gallopAnim) {
        console.log('Using animation:', gallopAnim.name);
        gallopActionRef.current = cowMixerRef.current.clipAction(gallopAnim);
        gallopActionRef.current.setLoop(2200); // LoopRepeat
      }
    }
    
    return () => {
      if (cowMixerRef.current) {
        cowMixerRef.current.stopAllAction();
      }
    };
  }, [animalType, cowAnimations, clonedCowScene]);
  
  // Control animation based on movement
  useEffect(() => {
    if (gallopActionRef.current) {
      if (isMoving) {
        gallopActionRef.current.play();
      } else {
        gallopActionRef.current.stop();
      }
    }
  }, [isMoving]);

  // Animation frame update
  useFrame((state, delta) => {
    // Update cow animation mixer
    if (cowMixerRef.current && animalType === 'cow') {
      cowMixerRef.current.update(delta);
    }
    
    // Bobbing for non-cow animals (cow has its own animation)
    if (innerGroupRef.current && animalType !== 'cow') {
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

  // Cow uses GLB model with animation
  if (animalType === 'cow') {
    return (
      <group position={position} rotation={[0, visualRotation, 0]}>
        <group ref={cowGroupRef} position={[0, 0.4, 0]}>
          {/* Debug cube */}
          <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color="#f5f5f5" />
          </mesh>
          <primitive object={clonedCowScene} scale={[0.5, 0.5, 0.5]} position={[0, 0, 0]} />
        </group>
      </group>
    );
  }

  // Bird (default) - placeholder cube
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