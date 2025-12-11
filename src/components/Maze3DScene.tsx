import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, PerspectiveCamera } from '@react-three/drei';
import { Vector3 } from 'three';
import { Maze, AnimalType } from '@/types/game';
import { CornWall } from './CornWall';
import { PlayerCube } from './PlayerCube';

interface Maze3DSceneProps {
  maze: Maze;
  animalType: AnimalType;
  playerPos: { x: number; y: number };
  playerRotation: number;
  cameraRotation: number;
  onCameraRotationChange: (rotation: number) => void;
}

const Ground = ({ width, height }: { width: number; height: number }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, height / 2]}>
    <planeGeometry args={[width + 10, height + 10]} />
    <meshStandardMaterial color="#8B7355" />
  </mesh>
);

const MazeWalls = ({ maze }: { maze: Maze }) => {
  const walls = useMemo(() => {
    const wallPositions: { x: number; z: number }[] = [];
    
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isWall) {
          wallPositions.push({ x, z: y });
        }
      });
    });
    
    return wallPositions;
  }, [maze]);

  return (
    <>
      {walls.map((wall, index) => (
        <CornWall
          key={index}
          position={[wall.x + 0.5, 0, wall.z + 0.5]}
          size={[1.2, 3, 1.2]}
        />
      ))}
    </>
  );
};

const PowerUp = ({ position }: { position: [number, number, number] }) => {
  const meshRef = useRef<any>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.02;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.1;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <octahedronGeometry args={[0.2]} />
      <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.5} />
    </mesh>
  );
};

const MapStation = ({ position }: { position: [number, number, number] }) => {
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 1, 8]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.05]} />
        <meshStandardMaterial color="#DEB887" />
      </mesh>
    </group>
  );
};

const GoalMarker = ({ position }: { position: [number, number, number] }) => {
  const meshRef = useRef<any>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 3) * 0.15 + 0.3;
    }
  });

  return (
    <group position={position}>
      {/* Flag pole */}
      <mesh position={[0.3, 1, 0.3]}>
        <cylinderGeometry args={[0.03, 0.03, 2, 8]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      {/* Flag */}
      <mesh ref={meshRef} position={[0.5, 1.7, 0.3]}>
        <boxGeometry args={[0.4, 0.25, 0.02]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      {/* Ground glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, 0.01, 0.5]}>
        <circleGeometry args={[0.5, 16]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.3} />
      </mesh>
    </group>
  );
};

const CameraController = ({ 
  playerPos, 
  cameraRotation,
  maze
}: { 
  playerPos: { x: number; y: number }; 
  cameraRotation: number;
  maze: Maze;
}) => {
  const { camera } = useThree();
  const currentPosition = useRef(new Vector3());
  const currentLookAt = useRef(new Vector3());
  
  // Check if a position is inside a wall
  const isInWall = (x: number, z: number): boolean => {
    const gridX = Math.floor(x);
    const gridZ = Math.floor(z);
    
    if (gridX < 0 || gridZ < 0 || gridZ >= maze.grid.length || gridX >= maze.grid[0].length) {
      return true;
    }
    
    return maze.grid[gridZ]?.[gridX]?.isWall ?? false;
  };
  
  useFrame(() => {
    const playerX = playerPos.x + 0.5;
    const playerZ = playerPos.y + 0.5;
    const height = 2.2;
    
    // Find valid camera position at desired distance
    const maxDistance = 4;
    const minDistance = 1.5;
    
    let bestDistance = minDistance;
    
    // Check from max to min distance to find the furthest valid position
    for (let dist = maxDistance; dist >= minDistance; dist -= 0.3) {
      const testX = playerX - Math.sin(cameraRotation) * dist;
      const testZ = playerZ - Math.cos(cameraRotation) * dist;
      
      // Check if this position and path to it is clear
      let pathClear = true;
      for (let t = 0.3; t <= 1; t += 0.15) {
        const checkX = playerX + (testX - playerX) * t;
        const checkZ = playerZ + (testZ - playerZ) * t;
        if (isInWall(checkX, checkZ)) {
          pathClear = false;
          break;
        }
      }
      
      if (pathClear) {
        bestDistance = dist;
        break;
      }
    }
    
    const camX = playerX - Math.sin(cameraRotation) * bestDistance;
    const camZ = playerZ - Math.cos(cameraRotation) * bestDistance;
    
    const targetPosition = new Vector3(camX, height, camZ);
    const targetLookAt = new Vector3(playerX, 0.6, playerZ);
    
    // Smooth camera movement
    currentPosition.current.lerp(targetPosition, 0.08);
    currentLookAt.current.lerp(targetLookAt, 0.12);
    
    camera.position.copy(currentPosition.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
};

const Scene = ({ maze, animalType, playerPos, playerRotation, cameraRotation, onCameraRotationChange }: Maze3DSceneProps) => {
  const items = useMemo(() => {
    const powerUps: [number, number, number][] = [];
    const stations: [number, number, number][] = [];
    let goalPos: [number, number, number] = [0, 0, 0];

    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isPowerUp) {
          powerUps.push([x + 0.5, 0.5, y + 0.5]);
        }
        if (cell.isStation) {
          stations.push([x + 0.5, 0, y + 0.5]);
        }
        if (cell.isEnd) {
          goalPos = [x, 0, y];
        }
      });
    });

    return { powerUps, stations, goalPos };
  }, [maze]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      
      {/* Sky */}
      <Sky sunPosition={[100, 20, 100]} />
      
      {/* Ground */}
      <Ground width={maze.grid[0].length} height={maze.grid.length} />
      
      {/* Maze Walls */}
      <MazeWalls maze={maze} />
      
      {/* Power-ups */}
      {items.powerUps.map((pos, i) => (
        <PowerUp key={`powerup-${i}`} position={pos} />
      ))}
      
      {/* Map Stations */}
      {items.stations.map((pos, i) => (
        <MapStation key={`station-${i}`} position={pos} />
      ))}
      
      {/* Goal */}
      <GoalMarker position={items.goalPos} />
      
      {/* Player */}
      <PlayerCube
        animalType={animalType}
        position={[playerPos.x + 0.5, 0, playerPos.y + 0.5]}
      />
      
      {/* Camera */}
      <CameraController playerPos={playerPos} cameraRotation={cameraRotation} maze={maze} />
    </>
  );
};

export const Maze3DCanvas = (props: Maze3DSceneProps) => {
  return (
    <div className="w-full h-full">
      <Canvas shadows>
        <PerspectiveCamera makeDefault fov={60} near={0.1} far={100} />
        <Scene {...props} />
      </Canvas>
    </div>
  );
};
