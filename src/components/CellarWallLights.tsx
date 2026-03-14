import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Color, Group, Material } from 'three';
import { Maze } from '@/types/game';

useGLTF.preload('/models/Sconce_light.glb');
useGLTF.preload('/models/Lantern.glb');

interface CellarWallLightsProps {
  maze: Maze;
  roofHeight: number;
}

type FixtureType = 'sconce' | 'lamp';

interface FixturePlacement {
  x: number;
  z: number;
  rotY: number;
  type: FixtureType;
}

const enhanceMaterial = (material: Material, type: FixtureType) => {
  const cloned = material.clone() as Material & {
    emissive?: Color;
    emissiveIntensity?: number;
    toneMapped?: boolean;
    needsUpdate?: boolean;
  };

  if ('emissive' in cloned && cloned.emissive) {
    cloned.emissive = new Color(type === 'lamp' ? '#ffe2a6' : '#ffd89a');
    cloned.emissiveIntensity = type === 'lamp' ? 1.05 : 0.85;
  }

  if ('toneMapped' in cloned) cloned.toneMapped = true;
  cloned.needsUpdate = true;
  return cloned;
};

export const CellarWallLights = ({ maze, roofHeight }: CellarWallLightsProps) => {
  const { scene: sconceScene } = useGLTF('/models/Sconce_light.glb');
  const { scene: lampScene } = useGLTF('/models/Lantern.glb');

  const placements = useMemo(() => {
    const PAD = 4;
    const WALL_INSET = 0.62; // pull fixtures inward so they are visible from inside the cellar
    const SPACING = 3;

    const gridH = maze.grid.length;
    const gridW = maze.grid[0]?.length ?? 0;
    const minX = -PAD;
    const minZ = -PAD;
    const maxX = gridW + PAD;
    const maxZ = gridH + PAD;

    const data: FixturePlacement[] = [];
    let index = 0;

    const pickType = () => {
      const type: FixtureType = index % 2 === 0 ? 'sconce' : 'lamp';
      index += 1;
      return type;
    };

    for (let x = minX + 2; x <= maxX - 2; x += SPACING) {
      data.push({ x: x + 0.5, z: minZ + WALL_INSET, rotY: 0, type: pickType() });
    }
    for (let x = minX + 2; x <= maxX - 2; x += SPACING) {
      data.push({ x: x + 0.5, z: maxZ - WALL_INSET, rotY: Math.PI, type: pickType() });
    }
    for (let z = minZ + 2; z <= maxZ - 2; z += SPACING) {
      data.push({ x: minX + WALL_INSET, z: z + 0.5, rotY: Math.PI / 2, type: pickType() });
    }
    for (let z = minZ + 2; z <= maxZ - 2; z += SPACING) {
      data.push({ x: maxX - WALL_INSET, z: z + 0.5, rotY: -Math.PI / 2, type: pickType() });
    }

    return data;
  }, [maze]);

  const fixtures = useMemo(() => {
    const mountHeight = roofHeight * 0.62;

    return placements.map((placement, i) => {
      const source = placement.type === 'sconce' ? sconceScene : lampScene;
      const clone = source.clone(true) as Group;

      clone.traverse((child: any) => {
        if (!child.isMesh) return;
        child.visible = true;
        child.castShadow = true;
        child.receiveShadow = true;

        if (Array.isArray(child.material)) {
          child.material = child.material.map((mat: Material) => enhanceMaterial(mat, placement.type));
        } else if (child.material) {
          child.material = enhanceMaterial(child.material as Material, placement.type);
        }
      });

      clone.position.set(placement.x, mountHeight, placement.z);
      clone.rotation.order = 'YXZ';

      if (placement.type === 'sconce') {
        clone.rotation.set(-Math.PI / 2, placement.rotY, 0);
        clone.scale.setScalar(5.4);
      } else {
        clone.rotation.set(0, placement.rotY, 0);
        clone.scale.setScalar(2.25);
      }

      clone.updateMatrixWorld(true);
      return { key: `${placement.type}-${i}`, object: clone };
    });
  }, [placements, roofHeight, sconceScene, lampScene]);

  return (
    <group>
      {fixtures.map((fixture) => (
        <primitive key={fixture.key} object={fixture.object} />
      ))}
    </group>
  );
};
