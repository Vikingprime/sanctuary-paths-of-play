import { useRef, useMemo, useEffect, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Clone } from '@react-three/drei';
import { AnimationMixer, LoopRepeat, LoopOnce, Box3, Vector3 } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimalType } from '@/types/game';

// Target heights relative to corn stalk (1.0 unit = corn height)
// From user specs: Chicken 0.19, Pig 0.38, Cow 0.63, Woman 0.68, Man/Farmer 0.72, Cornstalk 1.00
const TARGET_HEIGHTS = {
  chicken: 0.19,
  pig: 0.38,
  cow: 0.63,
} as const;

// Helper to measure actual model height at scale 1.0
const measureModelHeight = (scene: any, name: string): number => {
  const box = new Box3().setFromObject(scene);
  const size = new Vector3();
  box.getSize(size);
  console.log(`[MODEL MEASURE] ${name}: raw height = ${size.y.toFixed(4)}, width = ${size.x.toFixed(4)}, depth = ${size.z.toFixed(4)}`);
  return size.y;
};

// Scale factors - visually tuned for target ratios relative to corn
// Target: Cow 0.63, Pig 0.38, Chicken 0.19 relative to corn
const ANIMAL_SCALES = {
  chicken: 0.003,   // Smallest - 0.19 relative
  pig: 0.012,       // Medium - 0.38 relative  
  cow: 0.08,        // Largest animal - 0.63 relative (must be shorter than woman 0.68)
} as const;

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
  showCollisionDebug?: boolean; // Whether to show collision debug spheres
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

export const PlayerCube = ({ animalType, position, rotation = 0, isMovingRef, enableSound = true, showCollisionDebug = true }: PlayerCubeProps) => {
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
  
  // Measure raw model heights once on mount
  useEffect(() => {
    const pigHeight = measureModelHeight(pigScene, 'Pig');
    const cowHeight = measureModelHeight(cowScene, 'Cow');
    const henHeight = measureModelHeight(henWalkScene, 'Hen');
    
    // Calculate required scales to achieve target heights
    const pigScale = TARGET_HEIGHTS.pig / pigHeight;
    const cowScale = TARGET_HEIGHTS.cow / cowHeight;
    const chickenScale = TARGET_HEIGHTS.chicken / henHeight;
    
    console.log(`[CALCULATED SCALES] pig: ${pigScale.toFixed(6)}, cow: ${cowScale.toFixed(6)}, chicken: ${chickenScale.toFixed(6)}`);
  }, [pigScene, cowScene, henWalkScene]);
  
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
    // Debug capsule collider - matches GameLogic.ts getAnimalCapsule (scaled 2x for new model size)
    const CAPSULE_START = -0.60;  // Extended back for rear/tail
    const CAPSULE_END = 1.10;     // Extended far forward for snout
    const CAPSULE_RADIUS = 0.30;  // Larger radius
    const DEBUG_Y = 0.5;
    
    // FIX: Raise pig model so feet touch ground at y=0
    const PIG_Y_OFFSET = 0.05;
    
    // Use the pig scale from our constants
    const pigScale = ANIMAL_SCALES.pig;
    
    return (
      <group position={position}>
        <group ref={innerGroupRef}>
          <primitive object={clonedPigScene} scale={[pigScale, pigScale, pigScale]} position={[0, PIG_Y_OFFSET, 0]} />
        </group>
        
        {/* Debug capsule collider */}
        {showCollisionDebug && (
          <group rotation={[0, rotation, 0]}>
            {/* Tail sphere (red) */}
            <mesh position={[0, DEBUG_Y, CAPSULE_START]} renderOrder={999}>
              <sphereGeometry args={[CAPSULE_RADIUS, 12, 12]} />
              <meshBasicMaterial color="#ff0000" transparent opacity={0.5} depthTest={false} depthWrite={false} />
            </mesh>
            {/* Body cylinder (orange) */}
            <mesh position={[0, DEBUG_Y, (CAPSULE_START + CAPSULE_END) / 2]} rotation={[Math.PI / 2, 0, 0]} renderOrder={998}>
              <cylinderGeometry args={[CAPSULE_RADIUS, CAPSULE_RADIUS, CAPSULE_END - CAPSULE_START, 12]} />
              <meshBasicMaterial color="#ff8800" transparent opacity={0.3} depthTest={false} depthWrite={false} />
            </mesh>
            {/* Head sphere (yellow) */}
            <mesh position={[0, DEBUG_Y, CAPSULE_END]} renderOrder={999}>
              <sphereGeometry args={[CAPSULE_RADIUS, 12, 12]} />
              <meshBasicMaterial color="#ffff00" transparent opacity={0.5} depthTest={false} depthWrite={false} />
            </mesh>
          </group>
        )}
      </group>
    );
  }

  // Cow uses GLB model with animation
  if (animalType === 'cow') {
    // Debug capsule collider - matches GameLogic.ts getAnimalCapsule (increased for larger cow)
    const CAPSULE_START = -0.80;  // Tail end offset (increased)
    const CAPSULE_END = 1.60;     // Head/neck end offset (increased)
    const CAPSULE_RADIUS = 0.38;  // Body radius (increased)
    const HEAD_OFFSET = 1.80;     // Extra head sphere (increased)
    const HEAD_RADIUS = 0.32;     // Head radius (increased)
    const DEBUG_Y = 0.65;
    
    // Use the cow scale from our constants
    const cowScale = ANIMAL_SCALES.cow;
    
    return (
      <group position={position}>
        <group ref={cowGroupRef} position={[0, 0.15, 0]}>
          <primitive object={clonedCowScene} scale={[cowScale, cowScale, cowScale]} position={[0, -0.3, 0]} />
        </group>
        
        {/* Debug capsule collider - rotate with cow using rotation prop */}
        {showCollisionDebug && (
          <group rotation={[0, rotation, 0]}>
            {/* Capsule body - represented as cylinder with spherical ends */}
            {/* Tail sphere (red) */}
            <mesh position={[0, DEBUG_Y, CAPSULE_START]} renderOrder={999}>
              <sphereGeometry args={[CAPSULE_RADIUS, 12, 12]} />
              <meshBasicMaterial color="#ff0000" transparent opacity={0.5} depthTest={false} depthWrite={false} />
            </mesh>
            {/* Body cylinder (orange, transparent) */}
            <mesh position={[0, DEBUG_Y, (CAPSULE_START + CAPSULE_END) / 2]} rotation={[Math.PI / 2, 0, 0]} renderOrder={998}>
              <cylinderGeometry args={[CAPSULE_RADIUS, CAPSULE_RADIUS, CAPSULE_END - CAPSULE_START, 12]} />
              <meshBasicMaterial color="#ff8800" transparent opacity={0.3} depthTest={false} depthWrite={false} />
            </mesh>
            {/* Neck/body end sphere (yellow) */}
            <mesh position={[0, DEBUG_Y, CAPSULE_END]} renderOrder={999}>
              <sphereGeometry args={[CAPSULE_RADIUS, 12, 12]} />
              <meshBasicMaterial color="#ffff00" transparent opacity={0.5} depthTest={false} depthWrite={false} />
            </mesh>
            {/* Head sphere (green) */}
            <mesh position={[0, DEBUG_Y, HEAD_OFFSET]} renderOrder={999}>
              <sphereGeometry args={[HEAD_RADIUS, 12, 12]} />
              <meshBasicMaterial color="#00ff00" transparent opacity={0.5} depthTest={false} depthWrite={false} />
            </mesh>
          </group>
        )}
      </group>
    );
  }

  // Bird/Chicken uses GLB model
  // Debug capsule collider - matches GameLogic.ts getAnimalCapsule (scaled 0.475x for new model size)
  const CAPSULE_START = -0.024;
  const CAPSULE_END = 0.085;
  const CAPSULE_RADIUS = 0.038;
  const DEBUG_Y = 0.1;
  
  // FIX: The chicken model's origin is at its body center, not feet.
  // We need a positive Y offset to raise the model so feet touch ground.
  // At scale 0.008, the model's visual half-height is roughly 0.15-0.2 units.
  const CHICKEN_Y_OFFSET = 0.15;
  
  // Use the chicken scale from our constants
  const chickenScale = ANIMAL_SCALES.chicken;
  
  return (
    <group position={position}>
      <group ref={innerGroupRef}>
        <primitive object={clonedHenScene} scale={[chickenScale, chickenScale, chickenScale]} position={[0, CHICKEN_Y_OFFSET, 0]} />
      </group>
      
      {/* Debug grounding visualization */}
      {showCollisionDebug && (
        <>
          {/* Y=0 ground plane reference (green) */}
          <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1000}>
            <planeGeometry args={[0.5, 0.5]} />
            <meshBasicMaterial color="#00ff00" transparent opacity={0.4} depthTest={false} depthWrite={false} side={2} />
          </mesh>
          
          {/* Capsule collider visualization */}
          <group rotation={[0, rotation, 0]}>
            {/* Tail sphere (red) */}
            <mesh position={[0, DEBUG_Y, CAPSULE_START]} renderOrder={999}>
              <sphereGeometry args={[CAPSULE_RADIUS, 12, 12]} />
              <meshBasicMaterial color="#ff0000" transparent opacity={0.5} depthTest={false} depthWrite={false} />
            </mesh>
            {/* Body cylinder (orange) */}
            <mesh position={[0, DEBUG_Y, (CAPSULE_START + CAPSULE_END) / 2]} rotation={[Math.PI / 2, 0, 0]} renderOrder={998}>
              <cylinderGeometry args={[CAPSULE_RADIUS, CAPSULE_RADIUS, CAPSULE_END - CAPSULE_START, 12]} />
              <meshBasicMaterial color="#ff8800" transparent opacity={0.3} depthTest={false} depthWrite={false} />
            </mesh>
            {/* Head sphere (yellow) */}
            <mesh position={[0, DEBUG_Y, CAPSULE_END]} renderOrder={999}>
              <sphereGeometry args={[CAPSULE_RADIUS, 12, 12]} />
              <meshBasicMaterial color="#ffff00" transparent opacity={0.5} depthTest={false} depthWrite={false} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
};