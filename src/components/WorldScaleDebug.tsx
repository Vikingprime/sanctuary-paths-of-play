/**
 * WorldScaleDebug Component
 * 
 * Measures actual world-space heights of corn and character models
 * after all transforms are applied. Logs the true visual heights
 * and calculates the correct scale factors needed.
 */
import { useEffect, useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Box3, Vector3, Object3D, Quaternion, Euler, Group } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Target ratios relative to corn (from user specs)
const TARGET_RATIOS = {
  chicken: 0.19,
  pig: 0.38,
  cow: 0.63,
  woman: 0.68,
  farmer: 0.72,
};

interface WorldScaleDebugProps {
  onMeasurementsComplete?: (measurements: ScaleMeasurements) => void;
}

export interface ScaleMeasurements {
  cornWorldHeight: number;
  animals: {
    chicken: { rawHeight: number; neededScale: number };
    pig: { rawHeight: number; neededScale: number };
    cow: { rawHeight: number; neededScale: number };
  };
  characters: {
    farmer: { rawHeight: number; neededScale: number };
    woman: { rawHeight: number; neededScale: number };
  };
}

export const WorldScaleDebug = ({ onMeasurementsComplete }: WorldScaleDebugProps) => {
  const { scene: cornScene } = useGLTF('/models/Corn.glb');
  const { scene: pigScene } = useGLTF('/models/Pig.glb');
  const { scene: cowScene } = useGLTF('/models/Cow.glb');
  const { scene: henScene } = useGLTF('/models/Hen_walk.glb');
  const { scene: farmerScene } = useGLTF('/models/Farmer.glb');
  const { scene: womanScene } = useGLTF('/models/Animated_Woman.glb');
  
  const cornRef = useRef<Group>(null);
  const pigRef = useRef<Group>(null);
  const cowRef = useRef<Group>(null);
  const henRef = useRef<Group>(null);
  const farmerRef = useRef<Group>(null);
  const womanRef = useRef<Group>(null);
  
  const hasMeasured = useRef(false);
  
  // Clone scenes for measurement
  const clonedCorn = useMemo(() => cornScene.clone(), [cornScene]);
  const clonedPig = useMemo(() => pigScene.clone(), [pigScene]);
  const clonedCow = useMemo(() => SkeletonUtils.clone(cowScene), [cowScene]);
  const clonedHen = useMemo(() => SkeletonUtils.clone(henScene), [henScene]);
  const clonedFarmer = useMemo(() => SkeletonUtils.clone(farmerScene), [farmerScene]);
  const clonedWoman = useMemo(() => SkeletonUtils.clone(womanScene), [womanScene]);
  
  // Corn transform values (from CornWall.tsx)
  const baseScale = 100;
  const heightMultiplier = 1.8;
  const widthMultiplier = 0.7;
  const heightVariation = 1.0; // Use average (no random)
  const widthScale = baseScale * heightVariation * widthMultiplier; // 70
  const heightScale = baseScale * heightVariation * heightMultiplier; // 180
  
  useFrame(() => {
    if (hasMeasured.current) return;
    
    // Wait for refs to be available
    if (!cornRef.current || !pigRef.current || !cowRef.current || 
        !henRef.current || !farmerRef.current || !womanRef.current) {
      return;
    }
    
    hasMeasured.current = true;
    
    // Measure world-space bounding boxes
    const measureWorldHeight = (group: Group, name: string): number => {
      // Force update world matrix
      group.updateWorldMatrix(true, true);
      
      const box = new Box3().setFromObject(group);
      const min = new Vector3();
      const max = new Vector3();
      box.getSize(max); // This gets the size
      box.min.clone(); // min point
      
      // World height is max.y - min.y
      const worldHeight = box.max.y - box.min.y;
      
      console.log(`[WORLD MEASURE] ${name}: world height = ${worldHeight.toFixed(4)} units, Y range: [${box.min.y.toFixed(2)}, ${box.max.y.toFixed(2)}]`);
      return worldHeight;
    };
    
    // Measure corn with game transforms applied
    const cornHeight = measureWorldHeight(cornRef.current, 'Corn (with game transforms)');
    
    // Measure animals at scale 1.0
    const pigHeight = measureWorldHeight(pigRef.current, 'Pig (scale 1.0)');
    const cowHeight = measureWorldHeight(cowRef.current, 'Cow (scale 1.0)');
    const henHeight = measureWorldHeight(henRef.current, 'Hen (scale 1.0)');
    
    // Measure characters at scale 1.0
    const farmerHeight = measureWorldHeight(farmerRef.current, 'Farmer (scale 1.0)');
    const womanHeight = measureWorldHeight(womanRef.current, 'Woman (scale 1.0)');
    
    // Calculate needed scales
    const targetChicken = cornHeight * TARGET_RATIOS.chicken;
    const targetPig = cornHeight * TARGET_RATIOS.pig;
    const targetCow = cornHeight * TARGET_RATIOS.cow;
    const targetFarmer = cornHeight * TARGET_RATIOS.farmer;
    const targetWoman = cornHeight * TARGET_RATIOS.woman;
    
    const neededChickenScale = targetChicken / henHeight;
    const neededPigScale = targetPig / pigHeight;
    const neededCowScale = targetCow / cowHeight;
    const neededFarmerScale = targetFarmer / farmerHeight;
    const neededWomanScale = targetWoman / womanHeight;
    
    console.log('%c=== WORLD-SPACE SCALE CALCULATIONS ===', 'color: #00ff00; font-weight: bold; font-size: 14px');
    console.log(`Corn world height: ${cornHeight.toFixed(4)} units`);
    console.log('');
    console.log('%cRequired ANIMAL_SCALES for PlayerCube.tsx:', 'color: #ffff00; font-weight: bold');
    console.log(`  chicken: ${neededChickenScale.toFixed(6)},  // target ${targetChicken.toFixed(4)} / raw ${henHeight.toFixed(4)}`);
    console.log(`  pig: ${neededPigScale.toFixed(6)},  // target ${targetPig.toFixed(4)} / raw ${pigHeight.toFixed(4)}`);
    console.log(`  cow: ${neededCowScale.toFixed(6)},  // target ${targetCow.toFixed(4)} / raw ${cowHeight.toFixed(4)}`);
    console.log('');
    console.log('%cRequired CharacterConfig scales:', 'color: #ffff00; font-weight: bold');
    console.log(`  'Farmer.glb': { scale: ${neededFarmerScale.toFixed(6)} },  // target ${targetFarmer.toFixed(4)} / raw ${farmerHeight.toFixed(4)}`);
    console.log(`  'Animated_Woman.glb': { scale: ${neededWomanScale.toFixed(6)} },  // target ${targetWoman.toFixed(4)} / raw ${womanHeight.toFixed(4)}`);
    
    // Store in window for other components
    (window as any).__SCALE_MEASUREMENTS__ = {
      cornWorldHeight: cornHeight,
      animals: {
        chicken: { rawHeight: henHeight, neededScale: neededChickenScale },
        pig: { rawHeight: pigHeight, neededScale: neededPigScale },
        cow: { rawHeight: cowHeight, neededScale: neededCowScale },
      },
      characters: {
        farmer: { rawHeight: farmerHeight, neededScale: neededFarmerScale },
        woman: { rawHeight: womanHeight, neededScale: neededWomanScale },
      },
    };
    
    onMeasurementsComplete?.((window as any).__SCALE_MEASUREMENTS__);
  });
  
  return (
    <group position={[-100, 0, -100]} visible={false}>
      {/* Corn with actual game transforms */}
      <group 
        ref={cornRef}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[widthScale, widthScale, heightScale]}
      >
        <primitive object={clonedCorn} />
      </group>
      
      {/* Animals at scale 1.0 for raw measurement */}
      <group ref={pigRef} position={[5, 0, 0]}>
        <primitive object={clonedPig} scale={1} />
      </group>
      
      <group ref={cowRef} position={[10, 0, 0]}>
        <primitive object={clonedCow} scale={1} />
      </group>
      
      <group ref={henRef} position={[15, 0, 0]}>
        <primitive object={clonedHen} scale={1} />
      </group>
      
      {/* Characters at scale 1.0 for raw measurement */}
      <group ref={farmerRef} position={[20, 0, 0]}>
        <primitive object={clonedFarmer} scale={1} />
      </group>
      
      <group ref={womanRef} position={[25, 0, 0]}>
        <primitive object={clonedWoman} scale={1} />
      </group>
    </group>
  );
};

// Preload all models
useGLTF.preload('/models/Corn.glb');
useGLTF.preload('/models/Pig.glb');
useGLTF.preload('/models/Cow.glb');
useGLTF.preload('/models/Hen_walk.glb');
useGLTF.preload('/models/Farmer.glb');
useGLTF.preload('/models/Animated_Woman.glb');
