import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, Group, InstancedMesh, Material, Object3D, Vector3 } from 'three';
import { Maze } from '@/types/game';

useGLTF.preload('/models/Barrel.glb');
useGLTF.preload('/models/Barrel_1.glb');
useGLTF.preload('/models/Beer_Keg.glb');
useGLTF.preload('/models/Keg.glb');
useGLTF.preload('/models/Bags.glb');
useGLTF.preload('/models/Sack.glb');

// Scales matching BarrelWall BARREL_TYPES config, then scaled to ~0.5x for decorative perimeter size
const DECOR_CONFIGS = [
  { model: '/models/Barrel.glb', baseScale: 350 * 0.5, rotationX: -Math.PI / 2, weight: 3 },
  { model: '/models/Barrel_1.glb', baseScale: 70 * 0.5, rotationX: -Math.PI / 2, weight: 3 },
  { model: '/models/Beer_Keg.glb', baseScale: 0.56 * 0.5, rotationX: 0, weight: 2 },
  { model: '/models/Keg.glb', baseScale: 64 * 0.5, rotationX: 0, weight: 2 },
  { model: '/models/Bags.glb', baseScale: 1.0, rotationX: 0, weight: 3 },
  { model: '/models/Sack.glb', baseScale: 1.0, rotationX: 0, weight: 3 },
];

const TOTAL_WEIGHT = DECOR_CONFIGS.reduce((s, c) => s + c.weight, 0);

const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const pickType = (seed: number) => {
  const r = seededRandom(seed) * TOTAL_WEIGHT;
  let acc = 0;
  for (let i = 0; i < DECOR_CONFIGS.length; i++) {
    acc += DECOR_CONFIGS[i].weight;
    if (r < acc) return i;
  }
  return DECOR_CONFIGS.length - 1;
};

interface DecorPlacement {
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
    useGLTF('/models/Bags.glb').scene,
    useGLTF('/models/Sack.glb').scene,
  ];

  const typeMetrics = useMemo(() => {
    return scenes.map((scene) => {
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
      // Log size for sack/bag models to calibrate
      return { minY: box.min.y, minZ: box.min.z, size };
    });
  }, [scenes]);

  // Auto-calibrate sack/bag scales: target ~0.6 world units tall
  const calibratedConfigs = useMemo(() => {
    return DECOR_CONFIGS.map((config, i) => {
      if (i < 4) return config; // barrels already calibrated
      const metrics = typeMetrics[i];
      const rotX = config.rotationX;
      const modelHeight = Math.abs(rotX) > 0.01 ? metrics.size.z : metrics.size.y;
      if (modelHeight === 0) return config;
      const targetHeight = 0.6;
      const autoScale = targetHeight / modelHeight;
      console.log(`[Perimeter] ${config.model} modelHeight=${modelHeight.toFixed(3)} autoScale=${autoScale.toFixed(3)}`);
      return { ...config, baseScale: autoScale };
    });
  }, [typeMetrics]);

  const placements = useMemo(() => {
    const PAD = 4;
    const SPACING = 1.6;
    const WALL_INSET = 0.8;

    const gridH = maze.grid.length;
    const gridW = maze.grid[0]?.length ?? 0;
    const minX = -PAD;
    const minZ = -PAD;
    const maxX = gridW + PAD;
    const maxZ = gridH + PAD;

    const data: DecorPlacement[] = [];
    let seed = 42;

    const addItem = (x: number, z: number, rotY: number) => {
      seed++;
      const typeIndex = pickType(seed * 7 + 3);
      const scaleVariation = 0.85 + seededRandom(seed * 13 + 5) * 0.3;
      const scale = calibratedConfigs[typeIndex].baseScale * scaleVariation;
      const jitterX = (seededRandom(seed * 17 + 11) - 0.5) * 0.25;
      const jitterZ = (seededRandom(seed * 23 + 19) - 0.5) * 0.25;
      const rotJitter = seededRandom(seed * 29 + 7) * Math.PI * 2;
      data.push({ x: x + jitterX, z: z + jitterZ, rotY: rotY + rotJitter, typeIndex, scale });
    };

    // North wall
    for (let x = minX + 1; x <= maxX - 1; x += SPACING) {
      if (seededRandom(++seed) > 0.25) addItem(x + 0.5, minZ + WALL_INSET, 0);
    }
    // South wall
    for (let x = minX + 1; x <= maxX - 1; x += SPACING) {
      if (seededRandom(++seed) > 0.25) addItem(x + 0.5, maxZ - WALL_INSET, Math.PI);
    }
    // West wall
    for (let z = minZ + 1; z <= maxZ - 1; z += SPACING) {
      if (seededRandom(++seed) > 0.25) addItem(minX + WALL_INSET, z + 0.5, Math.PI / 2);
    }
    // East wall
    for (let z = minZ + 1; z <= maxZ - 1; z += SPACING) {
      if (seededRandom(++seed) > 0.25) addItem(maxX - WALL_INSET, z + 0.5, -Math.PI / 2);
    }

    return data;
  }, [maze, calibratedConfigs]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || createdRef.current || placements.length === 0) return;
    createdRef.current = true;

    const allMeshes: InstancedMesh[] = [];

    // Group placements by type
    const byType: Map<number, DecorPlacement[]> = new Map();
    placements.forEach(p => {
      if (!byType.has(p.typeIndex)) byType.set(p.typeIndex, []);
      byType.get(p.typeIndex)!.push(p);
    });

    const dummy = new Object3D();
    const instanceColor = new Color();

    byType.forEach((typePlacements, typeIndex) => {
      const scene = scenes[typeIndex];
      const config = calibratedConfigs[typeIndex];
      const metrics = typeMetrics[typeIndex];

      scene.traverse((child: any) => {
        if (!child.isMesh) return;

        const geom = child.geometry.clone();
        const mat = child.material.clone();
        if ('roughness' in mat) mat.roughness = 0.8;
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

          const sd = p.x * 73 + p.z * 137 + i * 31;
          const hue = (seededRandom(sd) - 0.5) * 0.04;
          const light = (seededRandom(sd + 1) - 0.5) * 0.1;
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
  }, [placements, scenes, typeMetrics, calibratedConfigs]);

  return <group ref={groupRef} />;
};
