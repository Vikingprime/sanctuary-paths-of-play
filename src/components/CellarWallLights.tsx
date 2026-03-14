import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Color, Group, Material } from 'three';
import { Maze } from '@/types/game';

useGLTF.preload('/models/Sconce_light.glb');

interface CellarWallLightsProps {
  maze: Maze;
  roofHeight: number;
}

interface FixturePlacement {
  x: number;
  z: number;
  rotY: number;
}

const BULB_KEYWORDS = ['bulb', 'light', 'lamp', 'glass', 'flame', 'glow', 'candle', 'fire', 'emission'];

const isBulbMesh = (name: string) => {
  const lower = name.toLowerCase();
  return BULB_KEYWORDS.some((kw) => lower.includes(kw));
};

const makeBulbMaterial = (material: Material) => {
  const cloned = material.clone() as Material & {
    emissive?: Color;
    emissiveIntensity?: number;
    toneMapped?: boolean;
    needsUpdate?: boolean;
  };

  if ('emissive' in cloned) {
    cloned.emissive = new Color('#ffdd99');
    cloned.emissiveIntensity = 3.0;
  }
  if ('toneMapped' in cloned) cloned.toneMapped = false;
  cloned.needsUpdate = true;
  return cloned;
};

export const CellarWallLights = ({ maze, roofHeight }: CellarWallLightsProps) => {
  const { scene: sconceScene } = useGLTF('/models/Sconce_light.glb');

  const placements = useMemo(() => {
    const PAD = 4;
    const WALL_INSET = 0.45;
    const SPACING = 4;

    const gridH = maze.grid.length;
    const gridW = maze.grid[0]?.length ?? 0;
    const minX = -PAD;
    const minZ = -PAD;
    const maxX = gridW + PAD;
    const maxZ = gridH + PAD;

    const data: FixturePlacement[] = [];

    // North wall
    for (let x = minX + 2; x <= maxX - 2; x += SPACING) {
      data.push({ x: x + 0.5, z: minZ + WALL_INSET, rotY: 0 });
    }
    // South wall
    for (let x = minX + 2; x <= maxX - 2; x += SPACING) {
      data.push({ x: x + 0.5, z: maxZ - WALL_INSET, rotY: Math.PI });
    }
    // West wall
    for (let z = minZ + 2; z <= maxZ - 2; z += SPACING) {
      data.push({ x: minX + WALL_INSET, z: z + 0.5, rotY: Math.PI / 2 });
    }
    // East wall
    for (let z = minZ + 2; z <= maxZ - 2; z += SPACING) {
      data.push({ x: maxX - WALL_INSET, z: z + 0.5, rotY: -Math.PI / 2 });
    }

    return data;
  }, [maze]);

  const mountHeight = roofHeight * 0.55;

  const fixtures = useMemo(() => {
    return placements.map((p, i) => {
      const clone = sconceScene.clone(true) as Group;

      // Log mesh names once for debugging
      if (i === 0) {
        clone.traverse((child: any) => {
          if (child.isMesh) console.log('[Sconce] mesh name:', child.name);
        });
      }

      clone.traverse((child: any) => {
        if (!child.isMesh) return;
        child.visible = true;
        child.castShadow = true;
        child.receiveShadow = true;

        const applyGlow = isBulbMesh(child.name);

        if (applyGlow) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map((mat: Material) => makeBulbMaterial(mat));
          } else if (child.material) {
            child.material = makeBulbMaterial(child.material as Material);
          }
        }
      });

      clone.position.set(p.x, mountHeight, p.z);
      clone.rotation.order = 'YXZ';
      clone.rotation.set(0, p.rotY, 0);
      clone.scale.setScalar(1.5);
      clone.updateMatrixWorld(true);

      return { key: `sconce-${i}`, object: clone, placement: p };
    });
  }, [placements, mountHeight, sconceScene]);

  // Compute light offset direction (inward from wall) per fixture
  const lightOffsets = useMemo(() => {
    return placements.map((p) => {
      const dx = Math.sin(p.rotY) * 0.4;
      const dz = Math.cos(p.rotY) * 0.4;
      return { dx, dz };
    });
  }, [placements]);

  return (
    <group>
      {fixtures.map((fixture, i) => (
        <group key={fixture.key}>
          <primitive object={fixture.object} />
          <pointLight
            position={[
              fixture.placement.x + lightOffsets[i].dx,
              mountHeight + 0.3,
              fixture.placement.z + lightOffsets[i].dz,
            ]}
            color="#FFD080"
            intensity={12}
            distance={10}
            decay={1.5}
            castShadow={false}
          />
        </group>
      ))}
    </group>
  );
};
