import { useRef, useMemo, useEffect } from 'react';
import { Object3D, InstancedMesh as ThreeInstancedMesh, BufferGeometry, Material } from 'three';
import { useGLTF } from '@react-three/drei';

// Preload all barrel models
useGLTF.preload('/models/Barrel.glb');
useGLTF.preload('/models/Barrel_1.glb');
useGLTF.preload('/models/Beer_Keg.glb');
useGLTF.preload('/models/Keg.glb');

// Better seeded random to avoid clustering
const seededRandom = (seed: number): number => {
  let s = Math.imul(seed | 0, 0x45d9f3b);
  s = Math.imul((s >>> 16) ^ s, 0x45d9f3b);
  s = (s >>> 16) ^ s;
  return (s >>> 0) / 0xffffffff;
};

// Barrel type config - all 4 types
const BARREL_TYPES = [
  { model: '/models/Barrel.glb', weight: 3, baseScale: 0.38 },
  { model: '/models/Barrel_1.glb', weight: 3, baseScale: 0.38 },
  { model: '/models/Beer_Keg.glb', weight: 2, baseScale: 0.32 },
  { model: '/models/Keg.glb', weight: 2, baseScale: 0.32 },
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
  y: number;
  z: number;
  rotation: number;
  scale: number;
  typeIndex: number;
}

interface InstancedBarrelWallsProps {
  wallPositions: { x: number; z: number }[];
}

export const InstancedBarrelWalls = ({ wallPositions }: InstancedBarrelWallsProps) => {
  const barrel0 = useGLTF(BARREL_TYPES[0].model);
  const barrel1 = useGLTF(BARREL_TYPES[1].model);
  const barrel2 = useGLTF(BARREL_TYPES[2].model);
  const barrel3 = useGLTF(BARREL_TYPES[3].model);
  const models = [barrel0, barrel1, barrel2, barrel3];

  // Compute per-type bounding info for correct ground placement
  const typeInfo = useMemo(() => {
    return models.map((model) => {
      let minY = Infinity;
      let maxY = -Infinity;
      model.scene.traverse((child: any) => {
        if (child.isMesh && child.geometry) {
          child.geometry.computeBoundingBox();
          const bb = child.geometry.boundingBox;
          if (bb) {
            minY = Math.min(minY, bb.min.y);
            maxY = Math.max(maxY, bb.max.y);
          }
        }
      });
      return { minY: isFinite(minY) ? minY : 0, height: isFinite(maxY - minY) ? maxY - minY : 1 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barrel0, barrel1, barrel2, barrel3]);

  // Generate transforms
  const transforms = useMemo(() => {
    const result: BarrelTransform[] = [];

    wallPositions.forEach((pos, wallIdx) => {
      const baseSeed = wallIdx * 997 + pos.x * 131 + pos.z * 37 + 12345;

      const groundCount = seededRandom(baseSeed + 99) > 0.3 ? 3 : 2;

      const groundOffsets = [
        { dx: -0.15, dz: -0.15 },
        { dx: 0.18, dz: 0.12 },
        { dx: -0.05, dz: 0.2 },
      ];

      for (let i = 0; i < groundCount; i++) {
        const seed = baseSeed + i * 131 + 7;
        const typeIndex = pickBarrelType(seed);
        const baseScale = BARREL_TYPES[typeIndex].baseScale;
        const scaleVariation = 0.85 + seededRandom(seed + 3) * 0.3;
        const scale = baseScale * scaleVariation;

        const offset = groundOffsets[i];
        const jitterX = (seededRandom(seed + 41) - 0.5) * 0.08;
        const jitterZ = (seededRandom(seed + 53) - 0.5) * 0.08;

        // Place bottom of model at ground level (y=0)
        const groundY = -typeInfo[typeIndex].minY * scale;

        result.push({
          x: pos.x + 0.5 + offset.dx + jitterX,
          y: groundY,
          z: pos.z + 0.5 + offset.dz + jitterZ,
          rotation: seededRandom(seed + 2) * Math.PI * 2,
          scale,
          typeIndex,
        });
      }

      // Stacked layer
      const stackCount = seededRandom(baseSeed + 200) > 0.25 ? 2 : 1;

      for (let i = 0; i < stackCount; i++) {
        const seed = baseSeed + (groundCount + i) * 131 + 300;
        const typeIndex = pickBarrelType(seed);
        const baseScale = BARREL_TYPES[typeIndex].baseScale;
        const scaleVariation = 0.8 + seededRandom(seed + 3) * 0.25;
        const scale = baseScale * scaleVariation;

        const offsetX = (seededRandom(seed + 41) - 0.5) * 0.2;
        const offsetZ = (seededRandom(seed + 53) - 0.5) * 0.2;

        // Stack height: ground barrel height + this barrel's bottom offset
        const groundBarrelHeight = typeInfo[0].height * BARREL_TYPES[0].baseScale * 0.95;
        const stackY = groundBarrelHeight + (-typeInfo[typeIndex].minY * scale);

        result.push({
          x: pos.x + 0.5 + offsetX,
          y: stackY,
          z: pos.z + 0.5 + offsetZ,
          rotation: seededRandom(seed + 2) * Math.PI * 2,
          scale,
          typeIndex,
        });
      }
    });

    return result;
  }, [wallPositions, typeInfo]);

  // Group transforms by barrel type for instanced rendering
  const groupedTransforms = useMemo(() => {
    const groups: BarrelTransform[][] = BARREL_TYPES.map(() => []);
    transforms.forEach(t => groups[t.typeIndex].push(t));
    return groups;
  }, [transforms]);

  // Extract mesh data from each model
  const meshDataPerType = useMemo(() => {
    return models.map((model) => {
      const meshes: { geometry: BufferGeometry; material: Material | Material[] }[] = [];
      model.scene.traverse((child: any) => {
        if (child.isMesh) {
          meshes.push({ geometry: child.geometry, material: child.material });
        }
      });
      return meshes;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barrel0, barrel1, barrel2, barrel3]);

  return (
    <group>
      {groupedTransforms.map((group, typeIndex) => {
        if (group.length === 0) return null;
        const meshes = meshDataPerType[typeIndex];
        if (meshes.length === 0) return null;

        return meshes.map((meshData, meshIdx) => (
          <BarrelInstances
            key={`barrel-type-${typeIndex}-mesh-${meshIdx}`}
            geometry={meshData.geometry}
            material={meshData.material}
            transforms={group}
          />
        ));
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
      dummy.position.set(t.x, t.y, t.z);
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
