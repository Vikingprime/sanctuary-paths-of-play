import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Clone } from '@react-three/drei';
import { AnimationMixer, LoopRepeat } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
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
useGLTF.preload('/models/Hen.glb');

const animalColors: Record<AnimalType, string | string[]> = {
  pig: '#FFB6C1', // Pink (fallback)
  cow: '#f5f5f5', // White (fallback)
  bird: '#FFD700', // Yellow/Gold
};

export const PlayerCube = ({ animalType, position, rotation = 0, isMoving = false }: PlayerCubeProps) => {
  const innerGroupRef = useRef<any>(null);
  const bobOffset = useRef(0);
  const cowGroupRef = useRef<any>(null);
  const lastPosition = useRef<[number, number, number]>([0, 0, 0]);
  const renderCount = useRef(0);
  
  // Debug: Log when position changes significantly
  useEffect(() => {
    renderCount.current++;
    const [x, y, z] = position;
    const [lx, ly, lz] = lastPosition.current;
    const moved = Math.abs(x - lx) > 0.001 || Math.abs(y - ly) > 0.001 || Math.abs(z - lz) > 0.001;
    
    if (renderCount.current % 30 === 0 || moved) {
      console.log('PlayerCube render #', renderCount.current, 'pos:', position, 'rot:', rotation.toFixed(3), 'moved:', moved);
    }
    lastPosition.current = position;
  });
  
  // Load models
  const { scene: pigScene } = useGLTF('/models/Pig.glb');
  const { scene: cowScene, animations: cowAnimations } = useGLTF('/models/Cow.glb');
  const { scene: henScene } = useGLTF('/models/Hen.glb');
  
  // Debug: Check if scenes are stable
  const pigSceneId = useRef(pigScene.uuid);
  const cowSceneId = useRef(cowScene.uuid);
  const henSceneId = useRef(henScene.uuid);
  
  useEffect(() => {
    if (pigScene.uuid !== pigSceneId.current) {
      console.log('WARNING: pigScene changed!', pigSceneId.current, '->', pigScene.uuid);
      pigSceneId.current = pigScene.uuid;
    }
    if (cowScene.uuid !== cowSceneId.current) {
      console.log('WARNING: cowScene changed!', cowSceneId.current, '->', cowScene.uuid);
      cowSceneId.current = cowScene.uuid;
    }
    if (henScene.uuid !== henSceneId.current) {
      console.log('WARNING: henScene changed!', henSceneId.current, '->', henScene.uuid);
      henSceneId.current = henScene.uuid;
    }
  }, [pigScene, cowScene, henScene]);
  
  const clonedPigScene = useMemo(() => pigScene.clone(), [pigScene]);
  const clonedHenScene = useMemo(() => henScene.clone(), [henScene]);
  
  // Use SkeletonUtils.clone for skinned meshes (cow has bones/skeleton)
  const clonedCowScene = useMemo(() => SkeletonUtils.clone(cowScene), [cowScene]);
  
  // Set up cow animation mixer
  const cowMixerRef = useRef<AnimationMixer | null>(null);
  const gallopActionRef = useRef<any>(null);
  
  useEffect(() => {
    if (animalType === 'cow' && cowAnimations.length > 0 && clonedCowScene) {
      // Create mixer for the cloned scene
      cowMixerRef.current = new AnimationMixer(clonedCowScene);
      
      // Find gallop animation
      const gallopAnim = cowAnimations.find(a => 
        a.name.toLowerCase() === 'gallop'
      ) || cowAnimations.find(a => 
        a.name.toLowerCase().includes('gallop')
      ) || cowAnimations[0];
      
      if (gallopAnim) {
        gallopActionRef.current = cowMixerRef.current.clipAction(gallopAnim);
        gallopActionRef.current.setLoop(LoopRepeat, Infinity);
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

  // Cow uses GLB model with animation (SkeletonUtils.clone for proper skinned mesh cloning)
  if (animalType === 'cow') {
    return (
      <group position={position} rotation={[0, visualRotation, 0]}>
        <group ref={cowGroupRef} position={[0, 0.4, 0]}>
          <primitive object={clonedCowScene} scale={[0.2, 0.2, 0.2]} position={[0, -0.15, 0]} />
        </group>
      </group>
    );
  }

  // Bird/Chicken uses GLB model
  return (
    <group position={position} rotation={[0, visualRotation, 0]}>
      <group ref={innerGroupRef}>
        <primitive object={clonedHenScene} scale={[0.008, 0.008, 0.008]} position={[0, -0.1, 0]} />
      </group>
    </group>
  );
};