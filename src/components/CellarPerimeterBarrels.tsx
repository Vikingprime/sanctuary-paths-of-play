import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, Group, InstancedMesh, Material, Object3D, Vector3 } from 'three';
import { Maze } from '@/types/game';

useGLTF.preload('/models/Barrel.glb');
useGLTF.preload('/models/Barrel_1.glb');
useGLTF.preload('/models/Beer_Keg.glb');
useGLTF.preload('/models/Keg.glb');

const BARREL_CONFIGS = [
  { model: '/models/Barrel.glb', baseScale: 120, rotationX: -Math.PI / 2 },
  { model: '/models/Barrel_1.glb', baseScale: 24, rotationX: -Math.PI / 2 },
  { model: '/models/Beer_Keg.glb', baseScale: 0.2, rotationX: 0 },
  { model: '/models/Keg.glb', baseScale: 22, rotationX: 0 },
];

const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

interface PerimeterBarrelPlacement {
  x: number;
  z: number;
  rotY: number;
  typeIndex: number;
  scale: number;
}

export const CellarPerimeterBarrels = ({ maze }: { maze: Maze }) => {
  const groupRef = useRef<Group>(null);
  const createdRef = useRef(false);

  const scenes = [
    useGLTF('/models/Barrel.glb').scene,
    useGLTF('/models/Barrel_1.glb').scene,
    useGLTF('/models/Beer_Keg.glb').scene,
    useGLTF('/models/Keg.glb').scene,
  ];

  // Get model metrics for grounding
  const typeMetrics = useMemo(() => {
    return scenes.map((scene, i) => {
      const box = new Box3();
      scene.traverse((child: any) => {
        if (child.isMesh && child.geometry) {
          child.geometry.computeBoundingBox();
          const bb = child.geometry.boundingBox;
          if (bb) { box.expandByPoint(bb.min); box.expandByPoint(bb.max); }
        }
      });
      const size = new Vector3();
      box.getSize(size);
      return { minY: box.min.y, minZ: box.min.z, size };
    });
  }, [scenes]);

  const placements = useMemo(() => {
    const PAD = 4;
    const SPACING = 1.8;
    const WALL_INSET = 0.8;

    const gridH = maze.grid.length;
    const gridW = maze.grid[0]?.length ?? 0;
    const minX = -PAD;
    const minZ = -PAD;
    const maxX = gridW + PAD;
    const maxZ = gridH + PAD;

    const data: PerimeterBarrelPlacement[] = [];
    let seed = 42;

    const addBarrel = (x: number, z: number, rotY: number) => {
      seed++;
      const typeIndex = Math.floor(seededRandom(seed * 7 + 3) * BARREL_CONFIGS.length);
      const scaleVariation = 0.8 + seededRandom(seed * 13 + 5) * 0.4; // 0.8-1.2
      const scale = BARREL_CONFIGS[typeIndex].baseScale * scaleVariation;
      const jitterX = (seededRandom(seed * 17 + 11) - 0.5) * 0.3;
      const jitterZ = (seededRandom(seed * 23 + 19) - 0.5) * 0.3;
      const rotJitter = seededRandom(seed * 29 + 7) * Math.PI * 2;
      data.push({ x: x + jitterX, z: z + jitterZ, rotY: rotY + rotJitter, typeIndex, scale });
    };

    // North wall
    for (let x = minX + 1; x <= maxX - 1; x += SPACING) {
      if (seededRandom(++seed) > 0.3) addBarrel(x + 0.5, minZ + WALL_INSET, 0);
    }
    // South wall
    for (let x = minX + 1; x <= maxX - 1; x += SPACING) {
      if (seededRandom(++seed) > 0.3) addBarrel(x + 0.5, maxZ - WALL_INSET, Math.PI);
    }
    // West wall
    for (let z = minZ + 1; z <= maxZ - 1; z += SPACING) {
      if (seededRandom(++seed) > 0.3) addBarrel(minX + WALL_INSET, z + 0.5, Math.PI / 2);
    }
    // East wall
    for (let z = minZ + 1; z <= maxZ - 1; z += SPACING) {
      if (seededRandom(++seed) > 0.3) addBarrel(maxX - WALL_INSET, z + 0.5, -Math.PI / 2);
    }

    return data;
  }, [maze]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || createdRef.current || placements.length === 0) return;
    createdRef.current = true;

    const allMeshes: InstancedMesh[] = [];

    // Group placements by type
    const byType: Map<number, PerimeterBarrelPlacement[]> = new Map();
    placements.forEach(p => {
      if (!byType.has(p.typeIndex)) byType.set(p.typeIndex, []);
      byType.get(p.typeIndex)!.push(p);
    });

    const dummy = new Object3D();
    const instanceColor = new Color();

    byType.forEach((typePlacements, typeIndex) => {
      const scene = scenes[typeIndex];
      const config = BARREL_CONFIGS[typeIndex];
      const metrics = typeMetrics[typeIndex];

      scene.traverse((child: any) => {
        if (!child.isMesh) return;

        const geom = child.geometry.clone();
        const mat = child.material.clone();

        // Vary material per-instance via instance color
        if ('roughness' in mat) mat.roughness = 0.75;
        mat.needsUpdate = true;

        const mesh = new InstancedMesh(geom, mat, typePlacements.length);

        typePlacements.forEach((p, i) => {
          const rotX = config.rotationX;
          const effectiveMinY = Math.abs(rotX) > 0.01 ? metrics.minZ : metrics.minY;
          const groundY = -effectiveMinY * p.scale;

          dummy.position.set(p.x, groundY, p.z);
          dummy.rotation.set(rotX, p.rotY, 0);
          dummy.scale.setScalar(p.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);

          // Subtle color variation
          const seed = p.x * 73 + p.z * 137 + i * 31;
          const hue = (seededRandom(seed) - 0.5) * 0.04;
          const light = (seededRandom(seed + 1) - 0.5) * 0.1;
          instanceColor.set('#9B8B75');
          instanceColor.offsetHSL(hue, 0, light);
          mesh.setColorAt(i, instanceColor);
        });

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        allMeshes.push(mesh);
      });
    });

    return () => {
      allMeshes.forEach(mesh => {
        group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
        mesh.dispose();
      });
      createdRef.current = false;
    };
  }, [placements, scenes, typeMetrics]);

  return <group ref={groupRef} />;
};
