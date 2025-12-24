import { useRef, useMemo, useEffect, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Clone } from '@react-three/drei';
import { AnimationMixer, LoopRepeat, LoopOnce } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimalType } from '@/types/game';

// Play chicken sound on spawn
const playChickenSound = () => {
  const audio = new Audio('/sounds/chicken.mp3');
  audio.volume = 0.5;
  audio.play().catch(() => {}); // Ignore autoplay errors
};

interface PlayerCubeProps {
  animalType: AnimalType;
  position: [number, number, number];
  rotation?: number; // Y-axis rotation in radians
  isMovingRef?: MutableRefObject<boolean>; // Ref for real-time movement state
  enableSound?: boolean; // Whether to play spawn sounds (false during preview)
}

// Preload models
useGLTF.preload('/models/Pig.glb');
useGLTF.preload('/models/Cow.glb');
useGLTF.preload('/models/Hen_walk.glb');
useGLTF.preload('/models/Hen_idle.glb');

const animalColors: Record<AnimalType, string | string[]> = {
  pig: '#FFB6C1', // Pink (fallback)
  cow: '#f5f5f5', // White (fallback)
  bird: '#FFD700', // Yellow/Gold
};

export const PlayerCube = ({ animalType, position, rotation = 0, isMovingRef, enableSound = true }: PlayerCubeProps) => {
  const innerGroupRef = useRef<any>(null);
  const bobOffset = useRef(0);
  const cowGroupRef = useRef<any>(null);
  const hasPlayedSoundRef = useRef(false); // Track if chicken sound has played
  
  // Load models
  const { scene: pigScene } = useGLTF('/models/Pig.glb');
  const { scene: cowScene, animations: cowAnimations } = useGLTF('/models/Cow.glb');
  const { scene: henWalkScene, animations: henWalkAnimations } = useGLTF('/models/Hen_walk.glb');
  const { animations: henIdleAnimations } = useGLTF('/models/Hen_idle.glb');
  
  const clonedPigScene = useMemo(() => {
    const clone = pigScene.clone();
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [pigScene]);
  
  const clonedHenScene = useMemo(() => {
    const clone = SkeletonUtils.clone(henWalkScene);
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [henWalkScene]);
  
  // Use SkeletonUtils.clone for skinned meshes (cow has bones/skeleton)
  const clonedCowScene = useMemo(() => {
    const clone = SkeletonUtils.clone(cowScene);
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [cowScene]);
  
  // Set up animation mixers and actions
  const cowMixerRef = useRef<AnimationMixer | null>(null);
  const gallopActionRef = useRef<any>(null);
  const cowIdle1ActionRef = useRef<any>(null);
  const cowIdle2ActionRef = useRef<any>(null);
  const cowIdleCountRef = useRef(0);
  
  const henMixerRef = useRef<AnimationMixer | null>(null);
  const henWalkActionRef = useRef<any>(null);
  const henIdle1ActionRef = useRef<any>(null);
  const henIdle2ActionRef = useRef<any>(null);
  const henIdleCountRef = useRef(0);
  
  // Play chicken sound when game starts (enableSound becomes true)
  useEffect(() => {
    if (animalType === 'bird' && enableSound && !hasPlayedSoundRef.current) {
      playChickenSound();
      hasPlayedSoundRef.current = true;
    }
  }, [animalType, enableSound]);

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
      
      // Find specific idle animations: 'Idle' and 'Idle_2' only
      const idle1Anim = cowAnimations.find(a => a.name === 'Idle');
      const idle2Anim = cowAnimations.find(a => a.name === 'Idle_2');
      
      if (idle1Anim) {
        cowIdle1ActionRef.current = cowMixerRef.current.clipAction(idle1Anim);
        cowIdle1ActionRef.current.setLoop(LoopRepeat, Infinity);
      }
      
      if (idle2Anim) {
        cowIdle2ActionRef.current = cowMixerRef.current.clipAction(idle2Anim);
        cowIdle2ActionRef.current.setLoop(LoopOnce, 1);
        cowIdle2ActionRef.current.clampWhenFinished = true;
      }
      
      // Start with idle animation
      if (cowIdle1ActionRef.current) {
        cowIdle1ActionRef.current.play();
      }
    }
    
    // Set up hen animations
    if (animalType === 'bird' && clonedHenScene) {
      henMixerRef.current = new AnimationMixer(clonedHenScene);
      
      // Walk animation
      if (henWalkAnimations.length > 0) {
        const walkAnim = henWalkAnimations.find(a => 
          a.name.toLowerCase().includes('walk')
        ) || henWalkAnimations[0];
        
        if (walkAnim) {
          henWalkActionRef.current = henMixerRef.current.clipAction(walkAnim);
          henWalkActionRef.current.setLoop(LoopRepeat, Infinity);
        }
      }
      
      // Idle animations from Hen_idle.glb
      if (henIdleAnimations.length > 0) {
        const idle1Anim = henIdleAnimations.find(a => 
          a.name.toLowerCase() === 'idle1' || a.name.toLowerCase() === 'idle_1'
        ) || henIdleAnimations[0];
        
        const idle2Anim = henIdleAnimations.find(a => 
          a.name.toLowerCase() === 'idle2' || a.name.toLowerCase() === 'idle_2'
        ) || (henIdleAnimations.length > 1 ? henIdleAnimations[1] : null);
        
        if (idle1Anim) {
          henIdle1ActionRef.current = henMixerRef.current.clipAction(idle1Anim);
          henIdle1ActionRef.current.setLoop(LoopRepeat, Infinity);
        }
        
        if (idle2Anim) {
          henIdle2ActionRef.current = henMixerRef.current.clipAction(idle2Anim);
          henIdle2ActionRef.current.setLoop(LoopOnce, 1);
          henIdle2ActionRef.current.clampWhenFinished = true;
        }
      }
      
      // Start with idle animation
      if (henIdle1ActionRef.current) {
        henIdle1ActionRef.current.play();
      }
    }
    
    return () => {
      if (cowMixerRef.current) {
        cowMixerRef.current.stopAllAction();
      }
      if (henMixerRef.current) {
        henMixerRef.current.stopAllAction();
      }
    };
  }, [animalType, cowAnimations, clonedCowScene, henWalkAnimations, henIdleAnimations, clonedHenScene]);
  
  // Track previous moving state to detect changes
  const wasMovingRef = useRef(false);

  // Animation frame update - animations + movement state
  useFrame((state, delta) => {
    // Update cow animation mixer
    if (cowMixerRef.current && animalType === 'cow') {
      cowMixerRef.current.update(delta);
    }
    
    // Update hen animation mixer
    if (henMixerRef.current && animalType === 'bird') {
      henMixerRef.current.update(delta);
    }
    
    const isMoving = isMovingRef?.current ?? false;
    
    // Cow animation handling
    if (animalType === 'cow') {
      if (isMoving !== wasMovingRef.current) {
        if (isMoving) {
          // Fade out idle animations
          if (cowIdle1ActionRef.current) cowIdle1ActionRef.current.fadeOut(0.2);
          if (cowIdle2ActionRef.current) cowIdle2ActionRef.current.fadeOut(0.2);
          
          // Fade in gallop
          if (gallopActionRef.current) {
            gallopActionRef.current.enabled = true;
            gallopActionRef.current.setEffectiveTimeScale(1);
            gallopActionRef.current.setEffectiveWeight(1);
            gallopActionRef.current.fadeIn(0.2).play();
          }
        } else {
          // Fade out gallop
          if (gallopActionRef.current) gallopActionRef.current.fadeOut(0.3);
          
          // Increment idle count and choose animation
          cowIdleCountRef.current++;
          const useIdle2 = cowIdleCountRef.current % 3 === 0 && cowIdle2ActionRef.current;
          
          if (useIdle2 && cowIdle2ActionRef.current) {
            cowIdle2ActionRef.current.reset();
            cowIdle2ActionRef.current.setEffectiveWeight(1);
            cowIdle2ActionRef.current.fadeIn(0.3).play();
            
            // When idle2 finishes, switch back to idle1
            const onFinished = () => {
              if (cowIdle1ActionRef.current && !isMovingRef?.current) {
                cowIdle1ActionRef.current.reset();
                cowIdle1ActionRef.current.fadeIn(0.2).play();
              }
              cowMixerRef.current?.removeEventListener('finished', onFinished);
            };
            cowMixerRef.current?.addEventListener('finished', onFinished);
          } else if (cowIdle1ActionRef.current) {
            cowIdle1ActionRef.current.reset();
            cowIdle1ActionRef.current.setEffectiveWeight(1);
            cowIdle1ActionRef.current.fadeIn(0.3).play();
          }
        }
        wasMovingRef.current = isMoving;
      }
    }
    
    // Hen animation handling
    if (animalType === 'bird') {
      if (isMoving !== wasMovingRef.current) {
        if (isMoving) {
          // Fade out idle animations
          if (henIdle1ActionRef.current) henIdle1ActionRef.current.fadeOut(0.2);
          if (henIdle2ActionRef.current) henIdle2ActionRef.current.fadeOut(0.2);
          
          // Fade in walk
          if (henWalkActionRef.current) {
            henWalkActionRef.current.enabled = true;
            henWalkActionRef.current.setEffectiveTimeScale(3.5);
            henWalkActionRef.current.setEffectiveWeight(1);
            henWalkActionRef.current.fadeIn(0.2).play();
          }
        } else {
          // Fade out walk
          if (henWalkActionRef.current) henWalkActionRef.current.fadeOut(0.3);
          
          // Increment idle count and choose animation
          henIdleCountRef.current++;
          const useIdle2 = henIdleCountRef.current % 3 === 0 && henIdle2ActionRef.current;
          
          if (useIdle2 && henIdle2ActionRef.current) {
            henIdle2ActionRef.current.reset();
            henIdle2ActionRef.current.setEffectiveWeight(1);
            henIdle2ActionRef.current.fadeIn(0.3).play();
            
            // When idle2 finishes, switch back to idle1
            const onFinished = () => {
              if (henIdle1ActionRef.current && !isMovingRef?.current) {
                henIdle1ActionRef.current.reset();
                henIdle1ActionRef.current.fadeIn(0.2).play();
              }
              henMixerRef.current?.removeEventListener('finished', onFinished);
            };
            henMixerRef.current?.addEventListener('finished', onFinished);
          } else if (henIdle1ActionRef.current) {
            henIdle1ActionRef.current.reset();
            henIdle1ActionRef.current.setEffectiveWeight(1);
            henIdle1ActionRef.current.fadeIn(0.3).play();
          }
        }
        wasMovingRef.current = isMoving;
      }
    }
    
    // Bobbing for pig only (cow and bird have their own animations)
    if (innerGroupRef.current && animalType === 'pig') {
      const baseHeight = 0.15;
      innerGroupRef.current.position.y = baseHeight + Math.sin(state.clock.elapsedTime * 3) * 0.03;
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
    // Debug collision points - must match GameLogic.ts getAnimalCollisionOffsets
    const HEAD_OFFSET = 0.95;
    const TAIL_OFFSET = 0.45;
    const NECK_OFFSET = 0.50;
    const BODY_WIDTH = 0.14;
    const HORN_WIDTH = 0.08; // Tiny horns
    const DEBUG_Y = 0.5;
    
    return (
      <group position={position}>
        <group ref={cowGroupRef} position={[0, 0.15, 0]}>
          <primitive object={clonedCowScene} scale={[0.2, 0.2, 0.2]} position={[0, -0.3, 0]} />
        </group>
        
        {/* Debug collision points - rotate with cow using rotation prop */}
        <group rotation={[0, rotation, 0]}>
          {/* Head (green) - snout tip */}
          <mesh position={[0, DEBUG_Y, HEAD_OFFSET]} renderOrder={999}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshBasicMaterial color="#00ff00" depthTest={false} depthWrite={false} />
          </mesh>
          {/* Center (blue) */}
          <mesh position={[0, DEBUG_Y, 0]} renderOrder={999}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshBasicMaterial color="#0000ff" depthTest={false} depthWrite={false} />
          </mesh>
          {/* Tail (red) */}
          <mesh position={[0, DEBUG_Y, -TAIL_OFFSET]} renderOrder={999}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshBasicMaterial color="#ff0000" depthTest={false} depthWrite={false} />
          </mesh>
          {/* Neck (yellow) */}
          <mesh position={[0, DEBUG_Y, NECK_OFFSET]} renderOrder={999}>
            <sphereGeometry args={[0.10, 8, 8]} />
            <meshBasicMaterial color="#ffff00" depthTest={false} depthWrite={false} />
          </mesh>
          {/* Left body side (cyan) */}
          <mesh position={[-BODY_WIDTH, DEBUG_Y, 0]} renderOrder={999}>
            <sphereGeometry args={[0.10, 8, 8]} />
            <meshBasicMaterial color="#00ffff" depthTest={false} depthWrite={false} />
          </mesh>
          {/* Right body side (magenta) */}
          <mesh position={[BODY_WIDTH, DEBUG_Y, 0]} renderOrder={999}>
            <sphereGeometry args={[0.10, 8, 8]} />
            <meshBasicMaterial color="#ff00ff" depthTest={false} depthWrite={false} />
          </mesh>
          {/* Left horn (orange) */}
          <mesh position={[-HORN_WIDTH, DEBUG_Y, HEAD_OFFSET]} renderOrder={999}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshBasicMaterial color="#ff8800" depthTest={false} depthWrite={false} />
          </mesh>
          {/* Right horn (pink) */}
          <mesh position={[HORN_WIDTH, DEBUG_Y, HEAD_OFFSET]} renderOrder={999}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshBasicMaterial color="#ff88ff" depthTest={false} depthWrite={false} />
          </mesh>
        </group>
      </group>
    );
  }

  // Bird/Chicken uses GLB model
  return (
    <group position={position}>
      <group ref={innerGroupRef}>
        <primitive object={clonedHenScene} scale={[0.008, 0.008, 0.008]} position={[0, -0.32, 0]} />
      </group>
    </group>
  );
};