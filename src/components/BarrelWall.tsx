import { useRef, useMemo, useEffect } from 'react';
import { Object3D, Matrix4, InstancedMesh as ThreeInstancedMesh, Color, MeshStandardMaterial, BufferGeometry, Material } from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

// Preload all barrel models
useGLTF.preload('/models/Barrel.glb');
useGLTF.preload('/models/Barrel_1.glb');
useGLTF.preload('/models/Beer_Keg.glb');
useGLTF.preload('/models/Keg.glb');

// Seeded random for stable placement
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Barrel type config - kegs are less frequent
const BARREL_TYPES = [
  { model: '/models/Barrel.glb', weight: 3, scale: 0.4 },
  { model: '/models/Barrel_1.glb', weight: 3, scale: 0.4 },
  { model: '/models/Beer_Keg.glb', weight: 1, scale: 0.35 },
  { model: '/models/Keg.glb', weight: 1, scale: 0.35 },
];

const TOTAL_WEIGHT = BARREL_TYPES.reduce((sum, b) => sum + b.weight, 0);

function pickBarrelType(seed: number): number {
  const r = seededRandom(seed) * TOTAL_WEIGHT;
  let cumulative = 0;
  for (let i = 0; i < BARREL_TYPES.length; i++) {
    cumulative += BARREL_TYPES[i].weight;
    if (r < cumulative) return i;
  }
  return 0;
}

interface BarrelTransform {
  x: number;
  z: number;
  rotation: number;
  scale: number;
  typeIndex: number;
}

interface InstancedBarrelWallsProps {
  wallPositions: { x: number; z: number }[];
}

export const InstancedBarrelWalls = ({ wallPositions }: InstancedBarrelWallsProps) => {
  // Load all barrel models
  const barrel0 = useGLTF(BARREL_TYPES[0].model);
  const barrel1 = useGLTF(BARREL_TYPES[1].model);
  const barrel2 = useGLTF(BARREL_TYPES[2].model);
  const barrel3 = useGLTF(BARREL_TYPES[3].model);
  const models = [barrel0, barrel1, barrel2, barrel3];

  // Generate transforms: 1-2 barrels per wall cell
  const transforms = useMemo(() => {
    const result: BarrelTransform[] = [];
    
    wallPositions.forEach((pos) => {
      const baseSeed = pos.x * 1000 + pos.z;
      const count = seededRandom(baseSeed + 99) > 0.4 ? 2 : 1;
      
      for (let i = 0; i < count; i++) {
        const seed = baseSeed + i * 7;
        const typeIndex = pickBarrelType(seed);
        const baseScale = BARREL_TYPES[typeIndex].scale;
        const scaleVariation = 0.85 + seededRandom(seed + 3) * 0.3;
        
        // Position within the cell - spread out if 2 barrels
        let offsetX = 0;
        let offsetZ = 0;
        if (count === 2) {
          offsetX = (i === 0 ? -0.2 : 0.2) + (seededRandom(seed + 4) - 0.5) * 0.1;
          offsetZ = (i === 0 ? -0.15 : 0.15) + (seededRandom(seed + 5) - 0.5) * 0.1;
        } else {
          offsetX = (seededRandom(seed + 4) - 0.5) * 0.15;
          offsetZ = (seededRandom(seed + 5) - 0.5) * 0.15;
        }
        
        result.push({
          x: pos.x + 0.5 + offsetX,
          z: pos.z + 0.5 + offsetZ,
          rotation: seededRandom(seed + 2) * Math.PI * 2,
          scale: baseScale * scaleVariation,
          typeIndex,
        });
      }
    });
    
    return result;
  }, [wallPositions]);

  // Group transforms by barrel type for instanced rendering
  const groupedTransforms = useMemo(() => {
    const groups: BarrelTransform[][] = BARREL_TYPES.map(() => []);
    transforms.forEach(t => groups[t.typeIndex].push(t));
    return groups;
  }, [transforms]);

  // Extract mesh data from each model
  const meshDataPerType = useMemo(() => {
    return models.map((model) => {
      let geometry: BufferGeometry | null = null;
      let material: Material | Material[] | null = null;
      
      model.scene.traverse((child: any) => {
        if (child.isMesh && !geometry) {
          geometry = child.geometry;
          material = child.material;
        }
      });
      
      return { geometry, material };
    });
  }, [models]);

  return (
    <group>
      {groupedTransforms.map((group, typeIndex) => {
        if (group.length === 0) return null;
        const meshData = meshDataPerType[typeIndex];
        if (!meshData.geometry || !meshData.material) return null;
        
        return (
          <BarrelInstances
            key={`barrel-type-${typeIndex}`}
            geometry={meshData.geometry}
            material={meshData.material}
            transforms={group}
          />
        );
      })}
    </group>
  );
};

interface BarrelInstancesProps {
  geometry: BufferGeometry;
  material: Material | Material[];
  transforms: BarrelTransform[];
}

const BarrelInstances = ({ geometry, material, transforms }: BarrelInstancesProps) => {
  const meshRef = useRef<ThreeInstancedMesh>(null);
  
  useEffect(() => {
    if (!meshRef.current) return;
    
    const dummy = new Object3D();
    transforms.forEach((t, i) => {
      dummy.position.set(t.x, 0, t.z);
      dummy.rotation.set(0, t.rotation, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [transforms]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, transforms.length]}
      castShadow
      receiveShadow
    >
      {Array.isArray(material) ? (
        material.map((mat, i) => <primitive key={i} object={mat} attach={`material-${i}`} />)
      ) : (
        <primitive object={material} attach="material" />
      )}
    </instancedMesh>
  );
};
