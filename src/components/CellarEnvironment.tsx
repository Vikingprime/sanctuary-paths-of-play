import { useRef, useMemo, useEffect } from 'react';
import { DoubleSide, Object3D, InstancedMesh as ThreeInstancedMesh, BufferGeometry, Material, Group, Box3, Vector3 } from 'three';
import { useGLTF } from '@react-three/drei';
import { Maze } from '@/types/game';

// Preload models
useGLTF.preload('/models/Roof_Flat_Center.glb');
useGLTF.preload('/models/Ceiling_Light.glb');

interface CellarEnvironmentProps {
  maze: Maze;
  lightsEnabled?: boolean;
  roofEnabled?: boolean;
}

// Dark room enclosure with roof and ceiling lights
export const CellarEnvironment = ({ maze, lightsEnabled = true, roofEnabled = true }: CellarEnvironmentProps) => {
  const gridHeight = maze.grid.length;
  const gridWidth = maze.grid[0]?.length ?? 0;
  
  const PAD = 1;
  const WALL_HEIGHT = 3;
  const ROOF_HEIGHT = 2.0;
  
  const minX = -PAD;
  const minZ = -PAD;
  const maxX = gridWidth + PAD;
  const maxZ = gridHeight + PAD;
  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const wallColor = '#2a2018';
  const floorColor = '#3a2e22';

  return (
    <group>
      {/* Dark floor */}
      <mesh position={[centerX, -0.01, centerZ]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[sizeX, sizeZ]} />
        <meshStandardMaterial color={floorColor} roughness={0.9} />
      </mesh>
      
      {/* Back wall (north) */}
      <mesh position={[centerX, WALL_HEIGHT / 2, minZ]} receiveShadow>
        <planeGeometry args={[sizeX, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.95} />
      </mesh>
      
      {/* Front wall (south) */}
      <mesh position={[centerX, WALL_HEIGHT / 2, maxZ]} rotation-y={Math.PI} receiveShadow>
        <planeGeometry args={[sizeX, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.95} />
      </mesh>
      
      {/* Left wall (west) */}
      <mesh position={[minX, WALL_HEIGHT / 2, centerZ]} rotation-y={Math.PI / 2} receiveShadow>
        <planeGeometry args={[sizeZ, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.95} />
      </mesh>
      
      {/* Right wall (east) */}
      <mesh position={[maxX, WALL_HEIGHT / 2, centerZ]} rotation-y={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[sizeZ, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.95} />
      </mesh>
      
      {/* Ceiling slab */}
      <mesh position={[centerX, ROOF_HEIGHT, centerZ]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[sizeX, sizeZ]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.9} />
      </mesh>
      
      {/* Roof tiles (instanced) */}
      {roofEnabled && <InstancedRoofTiles gridWidth={gridWidth} gridHeight={gridHeight} roofHeight={ROOF_HEIGHT} />}
      
      {/* Ceiling lights (instanced) */}
      {lightsEnabled && <InstancedCellarLights maze={maze} roofHeight={ROOF_HEIGHT} />}
    </group>
  );
};

// Instanced roof tiles using imperative THREE.js
const InstancedRoofTiles = ({ gridWidth, gridHeight, roofHeight }: { gridWidth: number; gridHeight: number; roofHeight: number }) => {
  const groupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene } = useGLTF('/models/Roof_Flat_Center.glb');

  const tiles = useMemo(() => {
    const result: { x: number; z: number }[] = [];
    for (let x = -1; x < gridWidth + 1; x += 2) {
      for (let z = -1; z < gridHeight + 1; z += 2) {
        result.push({ x: x + 1, z: z + 1 });
      }
    }
    return result;
  }, [gridWidth, gridHeight]);

  // Extract mesh parts
  const meshParts = useMemo(() => {
    const parts: { geometry: BufferGeometry; material: Material }[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh) {
        parts.push({
          geometry: child.geometry.clone(),
          material: child.material.clone(),
        });
      }
    });
    console.log('[CELLAR] Roof tile mesh parts:', parts.length);
    return parts;
  }, [scene]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || createdRef.current || tiles.length === 0 || meshParts.length === 0) return;
    createdRef.current = true;

    const allMeshes: ThreeInstancedMesh[] = [];
    const dummy = new Object3D();

    meshParts.forEach((part) => {
      const mesh = new ThreeInstancedMesh(part.geometry, part.material, tiles.length);

      tiles.forEach((tile, i) => {
        dummy.position.set(tile.x, roofHeight + 0.01, tile.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.5);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      allMeshes.push(mesh);
    });

    console.log('[CELLAR] Created', allMeshes.length, 'roof tile instanced meshes for', tiles.length, 'tiles');

    return () => {
      allMeshes.forEach(mesh => {
        group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
        mesh.dispose();
      });
      createdRef.current = false;
    };
  }, [tiles, meshParts, roofHeight]);

  return <group ref={groupRef} />;
};

// Instanced ceiling lights using imperative THREE.js + point lights
const InstancedCellarLights = ({ maze, roofHeight }: { maze: Maze; roofHeight: number }) => {
  const groupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene } = useGLTF('/models/Ceiling_Light.glb');

  const lightPositions = useMemo(() => {
    const positions: { x: number; z: number }[] = [];
    const grid = maze.grid;
    
    // Place a light every 4 cells in open spaces (sparse for performance)
    for (let y = 2; y < grid.length - 1; y += 4) {
      for (let x = 2; x < grid[0].length - 1; x += 4) {
        if (!grid[y][x].isWall) {
          positions.push({ x: x + 0.5, z: y + 0.5 });
        }
      }
    }
    
    console.log('[CELLAR] Ceiling light positions:', positions.length);
    return positions;
  }, [maze]);

  // Extract mesh parts from the ceiling light GLB
  const meshParts = useMemo(() => {
    const parts: { geometry: BufferGeometry; material: Material }[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh) {
        parts.push({
          geometry: child.geometry.clone(),
          material: child.material.clone(),
        });
      }
    });
    
    // Log bounding box to understand model size
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
    console.log('[CELLAR] Ceiling light model size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2), '| parts:', parts.length);
    
    return parts;
  }, [scene]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || createdRef.current || lightPositions.length === 0 || meshParts.length === 0) return;
    createdRef.current = true;

    const allMeshes: ThreeInstancedMesh[] = [];
    const dummy = new Object3D();
    const lightScale = 1.0;

    meshParts.forEach((part) => {
      const mesh = new ThreeInstancedMesh(part.geometry, part.material, lightPositions.length);

      lightPositions.forEach((pos, i) => {
        dummy.position.set(pos.x, roofHeight - 0.05, pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(lightScale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      allMeshes.push(mesh);
    });

    console.log('[CELLAR] Created', allMeshes.length, 'ceiling light instanced meshes for', lightPositions.length, 'lights');

    return () => {
      allMeshes.forEach(mesh => {
        group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
        mesh.dispose();
      });
      createdRef.current = false;
    };
  }, [lightPositions, meshParts, roofHeight]);

  // Point lights for illumination (these must be declarative R3F elements)
  return (
    <group ref={groupRef}>
      {lightPositions.map((pos, i) => (
        <pointLight
          key={`cellar-light-${i}`}
          position={[pos.x, roofHeight - 0.25, pos.z]}
          color="#FFE0A0"
          intensity={5}
          distance={8}
          decay={1.2}
          castShadow={false}
        />
      ))}
    </group>
  );
};
