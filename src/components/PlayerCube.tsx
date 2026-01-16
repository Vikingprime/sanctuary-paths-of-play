import { useRef, useMemo, useEffect, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Clone } from '@react-three/drei';
import { AnimationMixer, LoopRepeat, LoopOnce, DoubleSide, Material, MeshStandardMaterial, MeshLambertMaterial } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimalType } from '@/types/game';
import { getCharacterDebugPlaneColor, getCharacterYOffset, getCharacterScale } from '@/game/CharacterConfig';

// Rim light configuration for animals (defaults, can be overridden by props)
const RIM_LIGHT_COLOR = 'vec3(1.0, 0.85, 0.6)'; // Warm sunset orange
const RIM_LIGHT_POWER = '2.5'; // Fresnel falloff power
const DEFAULT_RIM_LIGHT_STRENGTH = 0.5; // Default intensity

// Add rim lighting shader injection to a material
const addRimLighting = (material: Material, rimStrength: number = DEFAULT_RIM_LIGHT_STRENGTH): void => {
  const mat = material as any;
  
  const originalOnBeforeCompile = mat.onBeforeCompile;
  
  mat.onBeforeCompile = (shader: any) => {
    if (originalOnBeforeCompile) {
      originalOnBeforeCompile(shader);
    }
    
    // Add rim strength uniform
    shader.uniforms.rimStrength = { value: rimStrength };
    
    // Store shader reference for dynamic updates
    mat.userData.shader = shader;
    
    // Inject varyings for rim light in vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;`
    );
    
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vViewDir = normalize(cameraPosition - vWorldPos);`
    );
    
    // Inject varying declarations in fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform float rimStrength;
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;`
    );
    
    // Apply rim lighting at the end of fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      // Rim lighting - warm backlight effect
      float rimFactor = 1.0 - max(0.0, dot(normalize(vWorldNormal), normalize(vViewDir)));
      rimFactor = pow(rimFactor, ${RIM_LIGHT_POWER}) * rimStrength;
      gl_FragColor.rgb += ${RIM_LIGHT_COLOR} * rimFactor;`
    );
  };
  
  mat.needsUpdate = true;
};
// Play chicken sound on spawn
const playChickenSound = () => {
  const audio = new Audio('/sounds/chicken.mp3');
  audio.volume = 0.5;
  audio.play().catch(() => {}); // Ignore autoplay errors
};

// Per-animal rim light defaults
const ANIMAL_RIM_LIGHT_DEFAULTS: Record<AnimalType, number> = {
  pig: 0.8,  // Temporarily high to verify effect works
  cow: 0.8,  // Temporarily high to verify effect works
  bird: 0, // No rim light for chicken
};

interface PlayerCubeProps {
  animalType: AnimalType;
  position: [number, number, number];
  rotation?: number; // Y-axis rotation in radians
  isMovingRef?: MutableRefObject<boolean>; // Ref for real-time movement state
  enableSound?: boolean; // Whether to play spawn sounds (false during preview)
  showCollisionDebug?: boolean; // Whether to show collision debug spheres
  rimLightStrength?: number; // Rim light intensity override (0-1), uses per-animal defaults if not provided
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

export const PlayerCube = ({ animalType, position, rotation = 0, isMovingRef, enableSound = true, showCollisionDebug = true, rimLightStrength }: PlayerCubeProps) => {
  const innerGroupRef = useRef<any>(null);
  const bobOffset = useRef(0);
  const cowGroupRef = useRef<any>(null);
  const hasPlayedSoundRef = useRef(false); // Track if chicken sound has played
  
  // Load models
  const { scene: pigScene } = useGLTF('/models/Pig.glb');
  const { scene: cowScene, animations: cowAnimations } = useGLTF('/models/Cow.glb');
  const { scene: henWalkScene, animations: henWalkAnimations } = useGLTF('/models/Hen_walk.glb');
  const { animations: henIdleAnimations } = useGLTF('/models/Hen_idle.glb');
  
  // Use per-animal default if no override provided
  const effectiveRimLight = rimLightStrength ?? ANIMAL_RIM_LIGHT_DEFAULTS[animalType];

  const clonedPigScene = useMemo(() => {
    const clone = pigScene.clone();
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Clone material to avoid modifying shared materials and add rim lighting
        if (child.material && effectiveRimLight > 0) {
          child.material = child.material.clone();
          addRimLighting(child.material, effectiveRimLight);
        } else if (child.material) {
          child.material = child.material.clone();
        }
      }
    });
    return clone;
  }, [pigScene, effectiveRimLight]);
  
  const clonedHenScene = useMemo(() => {
    const clone = SkeletonUtils.clone(henWalkScene);
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Clone material to avoid modifying shared materials and add rim lighting
        if (child.material && effectiveRimLight > 0) {
          child.material = child.material.clone();
          addRimLighting(child.material, effectiveRimLight);
        } else if (child.material) {
          child.material = child.material.clone();
        }
      }
    });
    return clone;
  }, [henWalkScene, effectiveRimLight]);
  
  // Use SkeletonUtils.clone for skinned meshes (cow has bones/skeleton)
  const clonedCowScene = useMemo(() => {
    const clone = SkeletonUtils.clone(cowScene);
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Clone material to avoid modifying shared materials and add rim lighting
        if (child.material && effectiveRimLight > 0) {
          child.material = child.material.clone();
          addRimLighting(child.material, effectiveRimLight);
        } else if (child.material) {
          child.material = child.material.clone();
        }
      }
    });
    return clone;
  }, [cowScene, effectiveRimLight]);
  
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
    // Debug capsule collider - matches GameLogic.ts getAnimalCapsule
    // Adjusted: shorter length, larger radius, lower Y
    const CAPSULE_START = -0.32;  // Extended back a bit more
    const CAPSULE_END = 0.45;     // Shortened from 0.55
    const CAPSULE_RADIUS = 0.18;  // Increased from 0.15
    const DEBUG_Y = 0.35;  // Lowered from 0.45
    
    // Use centralized yOffset and scale from CharacterConfig
    const pigYOffset = getCharacterYOffset('Pig.glb');
    const pigScale = getCharacterScale('Pig.glb');
    
    return (
      <group position={position}>
        <group ref={innerGroupRef}>
          <primitive object={clonedPigScene} scale={[pigScale, pigScale, pigScale]} position={[0, pigYOffset, 0]} />
        </group>
        
        {/* Debug ground plane - shows y=0 level to help adjust yOffset */}
        {showCollisionDebug && (
          <>
            <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1000}>
              <planeGeometry args={[0.6, 0.6]} />
              <meshBasicMaterial color={getCharacterDebugPlaneColor('Pig.glb')} transparent opacity={0.5} depthTest={false} depthWrite={false} side={DoubleSide} />
            </mesh>
            
            {/* Debug capsule collider */}
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
  }

  // Cow uses GLB model with animation
  if (animalType === 'cow') {
    // Debug capsule collider - matches GameLogic.ts getAnimalCapsule
    const CAPSULE_START = -0.40;  // Tail end offset
    const CAPSULE_END = 0.85;     // Head/neck end offset
    const CAPSULE_RADIUS = 0.18;  // Body radius
    const HEAD_OFFSET = 0.95;     // Extra head sphere
    const HEAD_RADIUS = 0.15;
    const DEBUG_Y = 0.65;  // Raised more to overlap with head
    
    // Use centralized yOffset from CharacterConfig
    const cowYOffset = getCharacterYOffset('Cow.glb');
    
    return (
      <group position={position}>
        <group ref={cowGroupRef} position={[0, cowYOffset, 0]}>
          <primitive object={clonedCowScene} scale={[0.2, 0.2, 0.2]} position={[0, -0.15, 0]} />
        </group>
        
        {/* Debug ground plane - shows y=0 level to help adjust yOffset */}
        {showCollisionDebug && (
          <>
            <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1000}>
              <planeGeometry args={[0.6, 0.6]} />
              <meshBasicMaterial color={getCharacterDebugPlaneColor('Cow.glb')} transparent opacity={0.5} depthTest={false} depthWrite={false} side={DoubleSide} />
            </mesh>
            
            {/* Debug capsule collider - rotate with cow using rotation prop */}
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
          </>
        )}
      </group>
    );
  }

  // Bird/Chicken uses GLB model
  // Debug capsule collider - matches GameLogic.ts getAnimalCapsule
  const CAPSULE_START = -0.05;
  const CAPSULE_END = 0.18;  // Extended forward to match GameLogic.ts
  const CAPSULE_RADIUS = 0.08;
  const DEBUG_Y = 0.25;  // Raised to match model offset
  
  // Use centralized yOffset and scale from CharacterConfig
  const chickenYOffset = getCharacterYOffset('Hen.glb');
  const chickenScale = getCharacterScale('Hen.glb');
  
  return (
    <group position={position}>
      <group ref={innerGroupRef}>
        <primitive object={clonedHenScene} scale={[chickenScale, chickenScale, chickenScale]} position={[0, chickenYOffset, 0]} />
      </group>
      
      {/* Debug grounding visualization */}
      {showCollisionDebug && (
        <>
          {/* Y=0 ground plane reference - color from CharacterConfig */}
          <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1000}>
            <planeGeometry args={[0.5, 0.5]} />
            <meshBasicMaterial color={getCharacterDebugPlaneColor('Hen.glb')} transparent opacity={0.5} depthTest={false} depthWrite={false} side={DoubleSide} />
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