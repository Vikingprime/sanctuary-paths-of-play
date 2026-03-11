import { useRef, useMemo, useEffect } from 'react';
import { Object3D, InstancedMesh as ThreeInstancedMesh, BufferGeometry, Material, Box3, Vector3, Group } from 'three';
import { useGLTF } from '@react-three/drei';

// Preload all barrel models
useGLTF.preload('/models/Barrel.glb');
useGLTF.preload('/models/Barrel_1.glb');
useGLTF.preload('/models/Beer_Keg.glb');
useGLTF.preload('/models/Keg.glb');

// Integer hash - tested to produce good distribution across 0-1
const seededRandom = (seed: number): number => {
  let s = seed | 0;
  s = Math.imul(s ^ 0x5bd1e995, 0x5bd1e995) >>> 0;
  s = Math.imul(s ^ (s >>> 15), 0x27d4eb2d) >>> 0;
  s = (s ^ (s >>> 13)) >>> 0;
  return s / 4294967295;
};

// Barrel type config - scales normalized so all barrels are ~1.4 world units tall
// Raw model heights: Barrel=0.002, Barrel_1=0.010, Beer_Keg=1.272, Keg=0.011
// rotationX corrects models that are oriented sideways in their GLB
const BARREL_TYPES = [
  { model: '/models/Barrel.glb', weight: 3, baseScale: 350, rotationX: -Math.PI / 2 },
  { model: '/models/Barrel_1.glb', weight: 3, baseScale: 70, rotationX: -Math.PI / 2 },
  { model: '/models/Beer_Keg.glb', weight: 2, baseScale: 0.56, rotationX: 0 },
  { model: '/models/Keg.glb', weight: 2, baseScale: 64, rotationX: 0 },
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

// Placement density — minimal: 1 barrel per cell
const ROWS = 1;
const STALKS_PER_ROW = 1;
const STALK_SPACING = 0.55;

interface BarrelTransform {
  x: number;
  y: number;
  z: number;
  rotation: number;
  rotationX: number;
  scale: number;
  typeIndex: number;
}

interface MeshParts {
  geometry: BufferGeometry;
  material: Material;
}

export const BARREL_TYPE_NAMES = ['Barrel', 'Barrel_1', 'Beer_Keg', 'Keg'] as const;

interface InstancedBarrelWallsProps {
  edgePositions: { x: number; z: number; edges: ('left' | 'right' | 'top' | 'bottom')[] }[];
  noShadowPositions?: { x: number; z: number; avoidEdges?: ('left' | 'right' | 'top' | 'bottom')[] }[];
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
  enabledTypes?: boolean[];
  skipEdgeBarrels?: boolean;
}

export const InstancedBarrelWalls = ({
  edgePositions,
  noShadowPositions = [],
  boundaryPositions = [],
  enabledTypes = [true, true, true, true],
  skipEdgeBarrels = false,
}: InstancedBarrelWallsProps) => {
  const groupRef = useRef<Group>(null);

  const barrel0 = useGLTF(BARREL_TYPES[0].model);
  const barrel1 = useGLTF(BARREL_TYPES[1].model);
  const barrel2 = useGLTF(BARREL_TYPES[2].model);
  const barrel3 = useGLTF(BARREL_TYPES[3].model);
  const models = [barrel0, barrel1, barrel2, barrel3];

  // Compute bounding boxes per type for ground placement
  const typeMetrics = useMemo(() => {
    return models.map((model, idx) => {
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
      
      const rx = BARREL_TYPES[idx].rotationX;
      // When rotated PI/2 on X, the model's Z becomes Y and Y becomes -Z
      let effectiveMinY = box.min.y;
      if (Math.abs(rx) > 0.01) {
        // After X rotation, the lowest point comes from the Z extent
        effectiveMinY = box.min.z;
      }
      
      console.log(`[BARREL] Type ${idx} (${BARREL_TYPES[idx].model}): minY=${box.min.y.toFixed(3)}, minZ=${box.min.z.toFixed(3)}, height=${size.y.toFixed(3)}, rotX=${rx.toFixed(2)}, effectiveMinY=${effectiveMinY.toFixed(3)}`);
      return {
        minY: isFinite(effectiveMinY) ? effectiveMinY : 0,
        height: isFinite(size.y) ? size.y : 1,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barrel0, barrel1, barrel2, barrel3]);

  // Extract cloned mesh parts per type
  const meshPartsPerType = useMemo(() => {
    return models.map((model, idx) => {
      const parts: MeshParts[] = [];
      model.scene.traverse((child: any) => {
        if (child.isMesh) {
          parts.push({
            geometry: child.geometry.clone(),
            material: child.material.clone(),
          });
        }
      });
      console.log(`[BARREL] Type ${idx}: ${parts.length} mesh parts`);
      return parts;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barrel0, barrel1, barrel2, barrel3]);

  // Generate barrel transforms
  const transforms = useMemo(() => {
    const result: BarrelTransform[] = [];

    // Verify hash distribution
    const typeCounts = [0, 0, 0, 0];
    for (let i = 0; i < 100; i++) {
      typeCounts[pickBarrelType(i * 37 + 7)]++;
    }
    console.log('[BARREL] Hash distribution test (100 samples):', typeCounts);

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
          const stalkSeed = baseSeed + row * 137 + col * 51;
          const offsetX = (col - (stalksInRow - 1) / 2) * STALK_SPACING + rowOffset;
          const offsetZ = (row - (ROWS - 1) / 2) * STALK_SPACING;
          const jitterX = (seededRandom(stalkSeed + 11) - 0.5) * 0.08;
          const jitterZ = (seededRandom(stalkSeed + 23) - 0.5) * 0.08;

          if (skipEdges) {
            const fx = offsetX + jitterX;
            const fz = offsetZ + jitterZ;
            if (skipEdges.includes('left') && fx < -edgeZone + 0.1) continue;
            if (skipEdges.includes('right') && fx > edgeZone - 0.1) continue;
            if (skipEdges.includes('top') && fz < -edgeZone + 0.1) continue;
            if (skipEdges.includes('bottom') && fz > edgeZone - 0.1) continue;
          }

          const typeIndex = pickBarrelType(stalkSeed * 31 + 7);
          const baseScale = BARREL_TYPES[typeIndex].baseScale;
          const scale = baseScale;
          const groundY = -typeMetrics[typeIndex].minY * scale;

          result.push({
            x: centerX + offsetX + jitterX,
            y: groundY,
            z: centerZ + offsetZ + jitterZ,
            rotation: seededRandom(stalkSeed + 43) * Math.PI * 2,
            rotationX: BARREL_TYPES[typeIndex].rotationX,
            scale,
            typeIndex,
          });
        }
      }
    };

    const placeEdgeBarrels = (
      centerX: number, centerZ: number,
      edges: ('left' | 'right' | 'top' | 'bottom')[],
      baseSeed: number
    ) => {
      edges.forEach((edge, edgeIdx) => {
        for (let col = 0; col < STALKS_PER_ROW; col++) {
          const stalkSeed = baseSeed + edgeIdx * 997 + col * 51;
          let offsetX = 0, offsetZ = 0;
          const edgeOffset = 0.40;
          const colOffset = (col - (STALKS_PER_ROW - 1) / 2) * STALK_SPACING;

          switch (edge) {
            case 'left':   offsetX = -edgeOffset; offsetZ = colOffset; break;
            case 'right':  offsetX = edgeOffset;  offsetZ = colOffset; break;
            case 'top':    offsetX = colOffset;   offsetZ = -edgeOffset; break;
            case 'bottom': offsetX = colOffset;   offsetZ = edgeOffset; break;
          }

          const jitterX = (seededRandom(stalkSeed + 11) - 0.5) * 0.08;
          const jitterZ = (seededRandom(stalkSeed + 23) - 0.5) * 0.08;
          const typeIndex = pickBarrelType(stalkSeed * 31 + 7);
          const baseScale = BARREL_TYPES[typeIndex].baseScale;
          const scale = baseScale;
          const groundY = -typeMetrics[typeIndex].minY * scale;

          result.push({
            x: centerX + offsetX + jitterX,
            y: groundY,
            z: centerZ + offsetZ + jitterZ,
            rotation: seededRandom(stalkSeed + 43) * Math.PI * 2,
            rotationX: BARREL_TYPES[typeIndex].rotationX,
            scale,
            typeIndex,
          });
        }
      });
    };

    edgePositions.forEach((pos) => {
      placeEdgeBarrels(pos.x + 0.5, pos.z + 0.5, pos.edges, pos.x * 997 + pos.z * 31);
    });

    noShadowPositions.forEach((pos) => {
      placeBarrelsInCell(pos.x + 0.5, pos.z + 0.5, pos.x * 997 + pos.z * 31 + 10000, pos.avoidEdges);
    });

    boundaryPositions.forEach((pos) => {
      const baseSeed = pos.x * 997 + pos.z * 31 + 50000;
      const dirX = pos.offsetX !== 0 ? Math.sign(pos.offsetX) : 0;
      const dirZ = pos.offsetZ !== 0 ? Math.sign(pos.offsetZ) : 0;

      for (let row = 0; row < 2; row++) {
        const depthOffset = row * 0.8;
        for (let col = 0; col < 2; col++) {
          const stalkSeed = baseSeed + row * 137 + col * 51;
          const colOffset = (col - 0.5) * 0.4;
          const jX = (seededRandom(stalkSeed + 11) - 0.5) * 0.03;
          const jZ = (seededRandom(stalkSeed + 23) - 0.5) * 0.03;

          let posX = pos.x + 0.5 + jX;
          let posZ = pos.z + 0.5 + jZ;
          if (dirX !== 0) { posX += dirX * depthOffset; posZ += colOffset; }
          else { posX += colOffset; posZ += dirZ * depthOffset; }

          const typeIndex = pickBarrelType(stalkSeed * 31 + 7);
          const baseScale = BARREL_TYPES[typeIndex].baseScale;
          const scale = baseScale;
          const groundY = -typeMetrics[typeIndex].minY * scale;

          result.push({ x: posX, y: groundY, z: posZ, rotation: seededRandom(stalkSeed + 43) * Math.PI * 2, rotationX: BARREL_TYPES[typeIndex].rotationX, scale, typeIndex });
        }
      }
    });

    // Overlap rejection pass — remove barrels whose XZ centers are too close
    const MIN_SEPARATION = 0.45; // world units between barrel centers
    const MIN_SEP_SQ = MIN_SEPARATION * MIN_SEPARATION;
    const accepted: BarrelTransform[] = [];
    for (const t of result) {
      let overlaps = false;
      for (const a of accepted) {
        const dx = t.x - a.x;
        const dz = t.z - a.z;
        if (dx * dx + dz * dz < MIN_SEP_SQ) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) accepted.push(t);
    }

    console.log('[BARREL_WALL] Total before dedup:', result.length, '| after:', accepted.length,
      '| removed:', result.length - accepted.length,
      '| edge cells:', edgePositions.length, '| depth cells:', noShadowPositions.length, '| boundary cells:', boundaryPositions.length);
    
    // Log type distribution
    const dist = [0, 0, 0, 0];
    accepted.forEach(t => dist[t.typeIndex]++);
    console.log('[BARREL_WALL] Type distribution:', dist);

    return accepted;
  }, [edgePositions, noShadowPositions, boundaryPositions, typeMetrics]);

  // Group by type
  const groupedTransforms = useMemo(() => {
    const groups: BarrelTransform[][] = BARREL_TYPES.map(() => []);
    transforms.forEach(t => {
      if (enabledTypes[t.typeIndex]) {
        groups[t.typeIndex].push(t);
      }
    });
    return groups;
  }, [transforms, enabledTypes]);

  // Imperatively create InstancedMesh objects
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    // Clear previous meshes
    const prevChildren = [...group.children];
    prevChildren.forEach(child => {
      group.remove(child);
      if ((child as any).dispose) (child as any).dispose();
    });

    const allMeshes: ThreeInstancedMesh[] = [];
    const dummy = new Object3D();

    groupedTransforms.forEach((typeTransforms, typeIndex) => {
      if (typeTransforms.length === 0) {
        console.log(`[BARREL] Skipping type ${typeIndex}: 0 transforms`);
        return;
      }
      const parts = meshPartsPerType[typeIndex];
      if (parts.length === 0) {
        console.log(`[BARREL] Skipping type ${typeIndex}: 0 mesh parts`);
        return;
      }

      parts.forEach((part, partIdx) => {
        const mesh = new ThreeInstancedMesh(part.geometry, part.material, typeTransforms.length);

        typeTransforms.forEach((t, i) => {
          dummy.position.set(t.x, t.y, t.z);
          dummy.rotation.order = 'YXZ';
          dummy.rotation.set(t.rotationX, t.rotation, 0);
          dummy.scale.setScalar(t.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });

        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        group.add(mesh);
        allMeshes.push(mesh);
        console.log(`[BARREL] Created instanced mesh: type=${typeIndex} part=${partIdx} count=${typeTransforms.length}`);
      });
    });

    console.log('[BARREL_WALL] Total instanced meshes created:', allMeshes.length);

    return () => {
      allMeshes.forEach(mesh => {
        group.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
        mesh.dispose();
      });
      
    };
  }, [groupedTransforms, meshPartsPerType]);

  return <group ref={groupRef} />;
};
