import { useMemo } from 'react';
import { DoubleSide } from 'three';
import { useGLTF } from '@react-three/drei';
import { Maze } from '@/types/game';

// Preload models
useGLTF.preload('/models/Roof_Flat_Center.glb');
useGLTF.preload('/models/Ceiling_Light.glb');

interface CellarEnvironmentProps {
  maze: Maze;
}

// Dark room enclosure with roof and ceiling lights
export const CellarEnvironment = ({ maze }: CellarEnvironmentProps) => {
  const gridHeight = maze.grid.length;
  const gridWidth = maze.grid[0]?.length ?? 0;
  
  const PAD = 1;
  const WALL_HEIGHT = 4;
  const ROOF_HEIGHT = 2.8; // Lower ceiling so it's visible from player POV
  
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
      
      {/* Roof tiles (decorative) */}
      <RoofTiles gridWidth={gridWidth} gridHeight={gridHeight} roofHeight={ROOF_HEIGHT} />
      
      {/* Ceiling lights */}
      <CellarLights maze={maze} roofHeight={ROOF_HEIGHT} />
    </group>
  );
};

// Roof tiles using the Roof_Flat_Center model
const RoofTiles = ({ gridWidth, gridHeight, roofHeight }: { gridWidth: number; gridHeight: number; roofHeight: number }) => {
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

  return (
    <group>
      {tiles.map((tile, i) => {
        const cloned = scene.clone(true);
        return (
          <primitive
            key={`roof-${i}`}
            object={cloned}
            position={[tile.x, roofHeight + 0.01, tile.z]}
            scale={[0.5, 0.5, 0.5]}
          />
        );
      })}
    </group>
  );
};

// Ceiling lights placed at open corridor intersections
const CellarLights = ({ maze, roofHeight }: { maze: Maze; roofHeight: number }) => {
  const { scene } = useGLTF('/models/Ceiling_Light.glb');
  
  const lightPositions = useMemo(() => {
    const positions: { x: number; z: number }[] = [];
    const grid = maze.grid;
    
    // Place a light every 2 cells in open spaces for good coverage
    for (let y = 1; y < grid.length - 1; y += 2) {
      for (let x = 1; x < grid[0].length - 1; x += 2) {
        if (!grid[y][x].isWall) {
          positions.push({ x: x + 0.5, z: y + 0.5 });
        }
      }
    }
    
    return positions;
  }, [maze]);

  return (
    <group>
      {lightPositions.map((pos, i) => {
        const cloned = scene.clone(true);
        return (
          <group key={`light-${i}`} position={[pos.x, roofHeight - 0.05, pos.z]}>
            <primitive object={cloned} scale={[0.45, 0.45, 0.45]} />
            {/* Point light for each ceiling light */}
            <pointLight
              position={[0, -0.2, 0]}
              color="#FFE0A0"
              intensity={4}
              distance={6}
              decay={1}
              castShadow={false}
            />
          </group>
        );
      })}
    </group>
  );
};
