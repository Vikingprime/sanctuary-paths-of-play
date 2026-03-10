import { useRef, useMemo, useEffect } from 'react';
import { Object3D, InstancedMesh as ThreeInstancedMesh, BufferGeometry, Material, Box3, Vector3 } from 'three';
import { useGLTF } from '@react-three/drei';

// Preload all barrel models
useGLTF.preload('/models/Barrel.glb');
useGLTF.preload('/models/Barrel_1.glb');
useGLTF.preload('/models/Beer_Keg.glb');
useGLTF.preload('/models/Keg.glb');

// Better seeded random (integer hash) to ensure variety
const seededRandom = (seed: number): number => {
  let s = (seed * 2654435761) >>> 0;
  s = ((s >> 16) ^ s) * 0x45d9f3b >>> 0;
  s = ((s >> 16) ^ s) >>> 0;
  return s / 0xffffffff;
};

// Barrel type config
const BARREL_TYPES = [
  { model: '/models/Barrel.glb', weight: 3, baseScale: 0.35 },
  { model: '/models/Barrel_1.glb', weight: 3, baseScale: 0.35 },
  { model: '/models/Beer_Keg.glb', weight: 2, baseScale: 0.30 },
  { model: '/models/Keg.glb', weight: 2, baseScale: 0.30 },
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

// Placement density - mirrors corn stalk layout
const ROWS = 3;
const STALKS_PER_ROW = 2;
const STALK_SPACING = 0.42;

interface BarrelTransform {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  typeIndex: number;
}

interface InstancedBarrelWallsProps {
  edgePositions: { x: number; z: number; edges: ('left' | 'right' | 'top' | 'bottom')[] }[];
  noShadowPositions?: { x: number; z: number; avoidEdges?: ('left' | 'right' | 'top' | 'bottom')[] }[];
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
}

export const InstancedBarrelWalls = ({ 
  edgePositions, 
  noShadowPositions = [], 
  boundaryPositions = [] 
}: InstancedBarrelWallsProps) => {
  const barrel0 = useGLTF(BARREL_TYPES[0].model);
  const barrel1 = useGLTF(BARREL_TYPES[1].model);
  const barrel2 = useGLTF(BARREL_TYPES[2].model);
  const barrel3 = useGLTF(BARREL_TYPES[3].model);
  const models = [barrel0, barrel1, barrel2, barrel3];

  // Compute bounding boxes per type for correct ground placement
  const typeMetrics = useMemo(() => {
    return models.map((model) => {
      const box = new Box3();
      model.scene.traverse((child: any) => {
        if (child.isMesh && child.geometry) {
          child.geometry.computeBoundingBox();
          const bb = child.geometry.boundingBox;
          if (bb) {
            box.expandByPoint(bb.min);
            box.expandByPoint(bb.max);
          }
        }
      });
      const size = new Vector3();
      box.getSize(size);
      return { 
        minY: box.min.y, 
        height: size.y,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barrel0, barrel1, barrel2, barrel3]);

  // Generate barrel positions mirroring corn stalk placement
  const transforms = useMemo(() => {
    const result: BarrelTransform[] = [];

    // Helper: place barrels in a grid pattern within a cell (like corn stalks)
    const placeBarrelsInCell = (
      centerX: number, centerZ: number, 
      baseSeed: number,
      skipEdges?: ('left' | 'right' | 'top' | 'bottom')[]
    ) => {
      const edgeZone = 0.35;
      
      for (let row = 0; row < ROWS; row++) {
        const stalksInRow = STALKS_PER_ROW + (row % 2);
        const rowOffset = (row % 2) * (STALK_SPACING / 2);

        for (let col = 0; col < stalksInRow; col++) {
          const stalkSeed = baseSeed + row * 100 + col * 13;
          let offsetX = (col - (stalksInRow - 1) / 2) * STALK_SPACING + rowOffset;
          let offsetZ = (row - (ROWS - 1) / 2) * STALK_SPACING;
          const jitterX = (seededRandom(stalkSeed + 1) - 0.5) * 0.1;
          const jitterZ = (seededRandom(stalkSeed + 2) - 0.5) * 0.1;

          // Skip barrels that are too close to avoided edges
          if (skipEdges) {
            const fx = offsetX + jitterX;
            const fz = offsetZ + jitterZ;
            if (skipEdges.includes('left') && fx < -edgeZone + 0.1) continue;
            if (skipEdges.includes('right') && fx > edgeZone - 0.1) continue;
            if (skipEdges.includes('top') && fz < -edgeZone + 0.1) continue;
            if (skipEdges.includes('bottom') && fz > edgeZone - 0.1) continue;
          }

          const typeIndex = pickBarrelType(stalkSeed + 7);
          const baseScale = BARREL_TYPES[typeIndex].baseScale;
          const scaleVar = 0.85 + seededRandom(stalkSeed + 3) * 0.3;
          const scale = baseScale * scaleVar;
          const groundY = -typeMetrics[typeIndex].minY * scale;
          const rotation = seededRandom(stalkSeed + 4) * Math.PI * 2;

          result.push({
            x: centerX + offsetX + jitterX,
            y: groundY,
            z: centerZ + offsetZ + jitterZ,
            rotation,
            scale,
            typeIndex,
          });
        }
      }
    };

    // Helper: place edge barrels (only along specific edges of a cell)
    const placeEdgeBarrels = (
      centerX: number, centerZ: number,
      edges: ('left' | 'right' | 'top' | 'bottom')[],
      baseSeed: number
    ) => {
      edges.forEach((edge, edgeIdx) => {
        for (let col = 0; col < STALKS_PER_ROW; col++) {
          const stalkSeed = baseSeed + edgeIdx * 1000 + col * 13;
          
          let offsetX = 0;
          let offsetZ = 0;
          const edgeOffset = 0.42;
          const colOffset = (col - (STALKS_PER_ROW - 1) / 2) * STALK_SPACING;

          switch (edge) {
            case 'left':   offsetX = -edgeOffset; offsetZ = colOffset; break;
            case 'right':  offsetX = edgeOffset;  offsetZ = colOffset; break;
            case 'top':    offsetX = colOffset;   offsetZ = -edgeOffset; break;
            case 'bottom': offsetX = colOffset;   offsetZ = edgeOffset; break;
          }

          const jitterX = (seededRandom(stalkSeed + 1) - 0.5) * 0.1;
          const jitterZ = (seededRandom(stalkSeed + 2) - 0.5) * 0.1;

          const typeIndex = pickBarrelType(stalkSeed + 7);
          const baseScale = BARREL_TYPES[typeIndex].baseScale;
          const scaleVar = 0.85 + seededRandom(stalkSeed + 3) * 0.3;
          const scale = baseScale * scaleVar;
          const groundY = -typeMetrics[typeIndex].minY * scale;
          const rotation = seededRandom(stalkSeed + 4) * Math.PI * 2;

          result.push({
            x: centerX + offsetX + jitterX,
            y: groundY,
            z: centerZ + offsetZ + jitterZ,
            rotation,
            scale,
            typeIndex,
          });
        }
      });
    };

    // Edge positions: barrels along path-facing edges
    edgePositions.forEach((pos) => {
      const baseSeed = pos.x * 1000 + pos.z;
      placeEdgeBarrels(pos.x + 0.5, pos.z + 0.5, pos.edges, baseSeed);
    });

    // Interior/depth walls: fill entire cell, avoiding certain edges
    noShadowPositions.forEach((pos) => {
      const baseSeed = pos.x * 1000 + pos.z + 10000;
      placeBarrelsInCell(pos.x + 0.5, pos.z + 0.5, baseSeed, pos.avoidEdges);
    });

    // Boundary walls
    boundaryPositions.forEach((pos) => {
      const baseSeed = pos.x * 1000 + pos.z + 50000;
      const dirX = pos.offsetX !== 0 ? Math.sign(pos.offsetX) : 0;
      const dirZ = pos.offsetZ !== 0 ? Math.sign(pos.offsetZ) : 0;

      for (let row = 0; row < 2; row++) {
        const depthOffset = row * 0.8;
        for (let col = 0; col < 2; col++) {
          const stalkSeed = baseSeed + row * 100 + col * 13;
          const colOffset = (col - 0.5) * 0.4;
          const jitterX = (seededRandom(stalkSeed + 1) - 0.5) * 0.03;
          const jitterZ = (seededRandom(stalkSeed + 2) - 0.5) * 0.03;

          let posX = pos.x + 0.5 + jitterX;
          let posZ = pos.z + 0.5 + jitterZ;

          if (dirX !== 0) {
            posX += dirX * depthOffset;
            posZ += colOffset;
          } else {
            posX += colOffset;
            posZ += dirZ * depthOffset;
          }

          const typeIndex = pickBarrelType(stalkSeed + 7);
          const baseScale = BARREL_TYPES[typeIndex].baseScale;
          const scaleVar = 0.85 + seededRandom(stalkSeed + 3) * 0.3;
          const scale = baseScale * scaleVar;
          const groundY = -typeMetrics[typeIndex].minY * scale;
          const rotation = seededRandom(stalkSeed + 4) * Math.PI * 2;

          result.push({
            x: posX,
            y: groundY,
            z: posZ,
            rotation,
            scale,
            typeIndex,
          });
        }
      }
    });

    return result;
  }, [edgePositions, noShadowPositions, boundaryPositions, typeMetrics]);

  // Group by barrel type for instanced rendering
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
      frustumCulled={false}
    >
      {Array.isArray(material) ? (
        material.map((mat, i) => <primitive key={i} object={mat} attach={`material-${i}`} />)
      ) : (
        <primitive object={material} attach="material" />
      )}
    </instancedMesh>
  );
};
