import { useRef, useMemo, useEffect, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Clone } from '@react-three/drei';
import { AnimationMixer, LoopRepeat } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimalType } from '@/types/game';

interface PlayerCubeProps {
  animalType: AnimalType;
  position: [number, number, number];
  rotation?: number; // Y-axis rotation in radians
  isMovingRef?: MutableRefObject<boolean>; // Ref for real-time movement state
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

export const PlayerCube = ({ animalType, position, rotation = 0, isMovingRef }: PlayerCubeProps) => {
  const innerGroupRef = useRef<any>(null);
  const bobOffset = useRef(0);
  const cowGroupRef = useRef<any>(null);
  
  // Load models
  const { scene: pigScene } = useGLTF('/models/Pig.glb');
  const { scene: cowScene, animations: cowAnimations } = useGLTF('/models/Cow.glb');
  const { scene: henScene } = useGLTF('/models/Hen.glb');
  
  const clonedPigScene = useMemo(() => {
    const clone = pigScene.clone();
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = false; // Disable to prevent self-shadowing
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [pigScene]);
  
  const clonedHenScene = useMemo(() => {
    const clone = henScene.clone();
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = false; // Disable to prevent self-shadowing
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [henScene]);
  
  // Use SkeletonUtils.clone for skinned meshes (cow has bones/skeleton)
  const clonedCowScene = useMemo(() => {
    const clone = SkeletonUtils.clone(cowScene);
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = false; // Disable to prevent self-shadowing
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [cowScene]);
  
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
  
  // Track previous moving state to detect changes
  const wasMovingRef = useRef(false);

  // Animation frame update - bobbing + cow animation + movement state
  useFrame((state, delta) => {
    // Update cow animation mixer first
    if (cowMixerRef.current && animalType === 'cow') {
      cowMixerRef.current.update(delta);
    }
    
    // Check movement state from ref each frame (only for cow)
    if (gallopActionRef.current && animalType === 'cow') {
      const isMoving = isMovingRef?.current ?? false;
      
      // Only trigger animation change when state changes
      if (isMoving !== wasMovingRef.current) {
        if (isMoving) {
          // Reset and enable the action before fading in
          gallopActionRef.current.enabled = true;
          gallopActionRef.current.setEffectiveTimeScale(1);
          gallopActionRef.current.setEffectiveWeight(1);
          gallopActionRef.current.fadeIn(0.2).play();
        } else {
          gallopActionRef.current.fadeOut(0.3);
        }
        wasMovingRef.current = isMoving;
      }
    }
    
    // Bobbing for non-cow animals (cow has its own animation)
    if (innerGroupRef.current && animalType !== 'cow') {
      bobOffset.current += delta * 3;
      const baseHeight = 0.15;
      innerGroupRef.current.position.y = baseHeight + Math.sin(bobOffset.current) * 0.03;
    }
  });

  // Pig uses GLB model
  if (animalType === 'pig') {
    return (
      <group position={position}>
        <group ref={innerGroupRef}>
          <primitive object={clonedPigScene} scale={[0.008, 0.008, 0.008]} position={[0, -0.25, 0]} />
        </group>
      </group>
    );
  }

  // Cow uses GLB model with animation
  if (animalType === 'cow') {
    return (
      <group position={position}>
        <group ref={cowGroupRef} position={[0, 0.15, 0]}>
          <primitive object={clonedCowScene} scale={[0.2, 0.2, 0.2]} position={[0, -0.3, 0]} />
        </group>
      </group>
    );
  }

  // Bird/Chicken uses GLB model
  return (
    <group position={position}>
      <group ref={innerGroupRef}>
        <primitive object={clonedHenScene} scale={[0.008, 0.008, 0.008]} position={[0, -0.25, 0]} />
      </group>
    </group>
  );
};