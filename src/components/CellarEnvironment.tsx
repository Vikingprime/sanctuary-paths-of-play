import { useMemo, useRef } from 'react';
import { Object3D, Color, DoubleSide } from 'three';
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
  
  // Add padding around the maze
  const PAD = 1;
  const WALL_HEIGHT = 4;
  const ROOF_HEIGHT = 3.5;
  
  const minX = -PAD;
  const minZ = -PAD;
  const maxX = gridWidth + PAD;
  const maxZ = gridHeight + PAD;
  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  // Dark wall color
  const wallColor = '#1a1410';
  const floorColor = '#2a2018';

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
      
      {/* Ceiling - dark slab */}
      <mesh position={[centerX, ROOF_HEIGHT, centerZ]} rotation-x={Math.PI / 2} receiveShadow>
        <planeGeometry args={[sizeX, sizeZ]} />
        <meshStandardMaterial color={wallColor} side={DoubleSide} roughness={0.9} />
      </mesh>
      
      {/* Roof tiles (decorative, on top of ceiling) */}
      <RoofTiles
        gridWidth={gridWidth}
        gridHeight={gridHeight}
        roofHeight={ROOF_HEIGHT}
      />
      
      {/* Ceiling lights - placed every ~3 cells in the corridor space */}
      <CellarLights
        maze={maze}
        roofHeight={ROOF_HEIGHT}
      />
    </group>
  );
};

// Roof tiles using the Roof_Flat_Center model
const RoofTiles = ({ gridWidth, gridHeight, roofHeight }: { gridWidth: number; gridHeight: number; roofHeight: number }) => {
  const { scene } = useGLTF('/models/Roof_Flat_Center.glb');
  
  const tiles = useMemo(() => {
    const result: { x: number; z: number }[] = [];
    // Tile every 2 cells for coverage
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
        const cloned = scene.clone();
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
    
    // Place a light every ~3 cells in open spaces
    for (let y = 1; y < grid.length - 1; y += 3) {
      for (let x = 1; x < grid[0].length - 1; x += 3) {
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
        const cloned = scene.clone();
        return (
          <group key={`light-${i}`} position={[pos.x, roofHeight - 0.1, pos.z]}>
            <primitive object={cloned} scale={[0.3, 0.3, 0.3]} />
            {/* Point light for each ceiling light */}
            <pointLight
              position={[0, -0.3, 0]}
              color="#FFE0A0"
              intensity={5}
              distance={10}
              decay={1.2}
              castShadow={false}
            />
          </group>
        );
      })}
    </group>
  );
};
