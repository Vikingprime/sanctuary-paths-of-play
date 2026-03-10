import { useRef, useMemo, useEffect } from 'react';
import { Object3D, InstancedMesh as ThreeInstancedMesh, BufferGeometry, Material, Box3, Vector3, Group } from 'three';
import { useGLTF } from '@react-three/drei';

// Preload all barrel models
useGLTF.preload('/models/Barrel.glb');
useGLTF.preload('/models/Barrel_1.glb');
useGLTF.preload('/models/Beer_Keg.glb');
useGLTF.preload('/models/Keg.glb');

// Integer hash for variety
const seededRandom = (seed: number): number => {
  let s = Math.imul(seed | 0, 2654435761) >>> 0;
  s = Math.imul((s >>> 16) ^ s, 0x45d9f3b) >>> 0;
  s = ((s >>> 16) ^ s) >>> 0;
  return s / 4294967295;
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

interface MeshParts {
  geometry: BufferGeometry;
  material: Material;
}

interface InstancedBarrelWallsProps {
  edgePositions: { x: number; z: number; edges: ('left' | 'right' | 'top' | 'bottom')[] }[];
  noShadowPositions?: { x: number; z: number; avoidEdges?: ('left' | 'right' | 'top' | 'bottom')[] }[];
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
}

export const InstancedBarrelWalls = ({
  edgePositions,
  noShadowPositions = [],
  boundaryPositions = [],
}: InstancedBarrelWallsProps) => {
  const groupRef = useRef<Group>(null);
  const createdRef = useRef(false);

  const barrel0 = useGLTF(BARREL_TYPES[0].model);
  const barrel1 = useGLTF(BARREL_TYPES[1].model);
  const barrel2 = useGLTF(BARREL_TYPES[2].model);
  const barrel3 = useGLTF(BARREL_TYPES[3].model);
  const models = [barrel0, barrel1, barrel2, barrel3];

  // Compute bounding boxes per type for ground placement
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
        minY: isFinite(box.min.y) ? box.min.y : 0,
        height: isFinite(size.y) ? size.y : 1,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barrel0, barrel1, barrel2, barrel3]);

  // Extract cloned mesh parts per type (clone to avoid shared material issues)
  const meshPartsPerType = useMemo(() => {
    return models.map((model) => {
      const parts: MeshParts[] = [];
      model.scene.traverse((child: any) => {
        if (child.isMesh) {
          parts.push({
            geometry: child.geometry.clone(),
            material: child.material.clone(),
          });
        }
      });
      return parts;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barrel0, barrel1, barrel2, barrel3]);

  // Generate barrel transforms mirroring corn stalk placement
  const transforms = useMemo(() => {
    const result: BarrelTransform[] = [];

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
          const offsetX = (col - (stalksInRow - 1) / 2) * STALK_SPACING + rowOffset;
          const offsetZ = (row - (ROWS - 1) / 2) * STALK_SPACING;
          const jitterX = (seededRandom(stalkSeed + 1) - 0.5) * 0.1;
          const jitterZ = (seededRandom(stalkSeed + 2) - 0.5) * 0.1;

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
          const scale = baseScale * (0.85 + seededRandom(stalkSeed + 3) * 0.3);
          const groundY = -typeMetrics[typeIndex].minY * scale;

          result.push({
            x: centerX + offsetX + jitterX,
            y: groundY,
            z: centerZ + offsetZ + jitterZ,
            rotation: seededRandom(stalkSeed + 4) * Math.PI * 2,
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
          const stalkSeed = baseSeed + edgeIdx * 1000 + col * 13;
          let offsetX = 0, offsetZ = 0;
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
          const scale = baseScale * (0.85 + seededRandom(stalkSeed + 3) * 0.3);
          const groundY = -typeMetrics[typeIndex].minY * scale;

          result.push({
            x: centerX + offsetX + jitterX,
            y: groundY,
            z: centerZ + offsetZ + jitterZ,
            rotation: seededRandom(stalkSeed + 4) * Math.PI * 2,
            scale,
            typeIndex,
          });
        }
      });
    };

    // Edge positions
    edgePositions.forEach((pos) => {
      placeEdgeBarrels(pos.x + 0.5, pos.z + 0.5, pos.edges, pos.x * 1000 + pos.z);
    });

    // Interior/depth walls
    noShadowPositions.forEach((pos) => {
      placeBarrelsInCell(pos.x + 0.5, pos.z + 0.5, pos.x * 1000 + pos.z + 10000, pos.avoidEdges);
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
          const jX = (seededRandom(stalkSeed + 1) - 0.5) * 0.03;
          const jZ = (seededRandom(stalkSeed + 2) - 0.5) * 0.03;

          let posX = pos.x + 0.5 + jX;
          let posZ = pos.z + 0.5 + jZ;

          if (dirX !== 0) { posX += dirX * depthOffset; posZ += colOffset; }
          else { posX += colOffset; posZ += dirZ * depthOffset; }

          const typeIndex = pickBarrelType(stalkSeed + 7);
          const baseScale = BARREL_TYPES[typeIndex].baseScale;
          const scale = baseScale * (0.85 + seededRandom(stalkSeed + 3) * 0.3);
          const groundY = -typeMetrics[typeIndex].minY * scale;

          result.push({ x: posX, y: groundY, z: posZ, rotation: seededRandom(stalkSeed + 4) * Math.PI * 2, scale, typeIndex });
        }
      }
    });

    console.log('[BARREL_WALL] Generated transforms:', result.length, 
      'edge:', edgePositions.length, 'depth:', noShadowPositions.length, 'boundary:', boundaryPositions.length);
    return result;
  }, [edgePositions, noShadowPositions, boundaryPositions, typeMetrics]);

  // Group by type
  const groupedTransforms = useMemo(() => {
    const groups: BarrelTransform[][] = BARREL_TYPES.map(() => []);
    transforms.forEach(t => groups[t.typeIndex].push(t));
    console.log('[BARREL_WALL] Per-type counts:', groups.map((g, i) => `type${i}:${g.length}`).join(', '));
    return groups;
  }, [transforms]);

  // Imperatively create InstancedMesh objects (avoids R3F primitive/material attachment issues)
  useEffect(() => {
    const group = groupRef.current;
    if (!group || createdRef.current) return;
    createdRef.current = true;

    const allMeshes: ThreeInstancedMesh[] = [];
    const dummy = new Object3D();

    groupedTransforms.forEach((typeTransforms, typeIndex) => {
      if (typeTransforms.length === 0) return;
      const parts = meshPartsPerType[typeIndex];
      if (parts.length === 0) return;

      parts.forEach((part) => {
        const mesh = new ThreeInstancedMesh(part.geometry, part.material, typeTransforms.length);

        typeTransforms.forEach((t, i) => {
          dummy.position.set(t.x, t.y, t.z);
          dummy.rotation.set(0, t.rotation, 0);
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
      });
    });

    console.log('[BARREL_WALL] Created', allMeshes.length, 'instanced meshes');

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
      createdRef.current = false;
    };
  }, [groupedTransforms, meshPartsPerType]);

  return <group ref={groupRef} />;
};
