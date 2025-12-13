import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { Vector3 } from 'three';
import { Maze, AnimalType } from '@/types/game';
import { InstancedWalls } from './CornWall';
import { PlayerCube } from './PlayerCube';
import { 
  CameraVolumeController, 
  CameraVolumeDebug, 
  CameraVolumeConfig,
  createCameraVolume 
} from './CameraVolumeSystem';

interface Maze3DSceneProps {
  maze: Maze;
  animalType: AnimalType;
  playerPos: { x: number; y: number };
  playerRotation?: number; // radians, 0 = facing -Z
  collectedPowerUps?: Set<string>;
}

const Ground = ({ width, height }: { width: number; height: number }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, height / 2]}>
    <planeGeometry args={[width + 10, height + 10]} />
    <meshStandardMaterial color="#8B7355" />
  </mesh>
);

const MazeWalls = ({ maze }: { maze: Maze }) => {
  const { interiorWalls, boundaryWalls } = useMemo(() => {
    const interior: { x: number; z: number }[] = [];
    const boundary: { x: number; z: number; offsetX: number; offsetZ: number }[] = [];
    
    const maxX = maze.grid[0].length - 1;
    const maxZ = maze.grid.length - 1;
    
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isWall) {
          // Check if this is a boundary wall (on the edge of the maze)
          if (x === 0 || x === maxX || y === 0 || y === maxZ) {
            // Calculate offset direction to push block OUTSIDE the maze
            let offsetX = 0;
            let offsetZ = 0;
            if (x === 0) offsetX = -0.6;
            if (x === maxX) offsetX = 0.6;
            if (y === 0) offsetZ = -0.6;
            if (y === maxZ) offsetZ = 0.6;
            boundary.push({ x, z: y, offsetX, offsetZ });
          } else {
            interior.push({ x, z: y });
          }
        }
      });
    });
    
    return { interiorWalls: interior, boundaryWalls: boundary };
  }, [maze]);

  return <InstancedWalls positions={interiorWalls} boundaryPositions={boundaryWalls} />;
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

// Over-the-shoulder camera with wall collision avoidance and smooth interpolation
const OverShoulderCameraController = ({ 
  playerPos,
  playerRotation,
  maze,
}: { 
  playerPos: { x: number; y: number };
  playerRotation: number;
  maze: Maze;
}) => {
  const { camera } = useThree();
  
  // Smooth interpolation refs
  const currentPosition = useRef(new Vector3());
  const currentLookAt = useRef(new Vector3());
  const initialized = useRef(false);
  
  // Camera settings
  const CAMERA_DISTANCE = 2.5; // How far behind the player
  const CAMERA_HEIGHT = 1.8; // Height above ground
  const LOOK_AHEAD = 1.5; // How far ahead of player to look
  const LOOK_HEIGHT = 0.8; // Height of look target
  const SMOOTHING = 0.08; // Lower = smoother but laggier

  // Check if a world position is inside a wall
  const isInWall = (x: number, z: number): boolean => {
    const gridX = Math.floor(x);
    const gridZ = Math.floor(z);
    
    if (gridZ < 0 || gridZ >= maze.grid.length) return true;
    if (gridX < 0 || gridX >= maze.grid[0].length) return true;
    
    return maze.grid[gridZ][gridX].isWall;
  };

  // Find safe camera position by moving closer to player if blocked
  const getSafeCameraPosition = (
    playerX: number,
    playerZ: number,
    idealX: number,
    idealZ: number,
    height: number
  ): Vector3 => {
    const steps = 10;
    let safeX = playerX;
    let safeZ = playerZ;
    
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const testX = playerX + (idealX - playerX) * t;
      const testZ = playerZ + (idealZ - playerZ) * t;
      
      if (isInWall(testX, testZ)) {
        break;
      }
      safeX = testX;
      safeZ = testZ;
    }
    
    return new Vector3(safeX, height, safeZ);
  };
  
  useFrame(() => {
    const playerX = playerPos.x;
    const playerZ = playerPos.y;
    
    // Calculate ideal camera position behind player based on rotation
    const behindX = playerX - Math.sin(playerRotation) * CAMERA_DISTANCE;
    const behindZ = playerZ + Math.cos(playerRotation) * CAMERA_DISTANCE;
    
    // Get safe target position that doesn't clip through walls
    const targetPos = getSafeCameraPosition(playerX, playerZ, behindX, behindZ, CAMERA_HEIGHT);
    
    // Calculate look target
    const targetLookAt = new Vector3(
      playerX + Math.sin(playerRotation) * LOOK_AHEAD,
      LOOK_HEIGHT,
      playerZ - Math.cos(playerRotation) * LOOK_AHEAD
    );
    
    // Initialize on first frame
    if (!initialized.current) {
      currentPosition.current.copy(targetPos);
      currentLookAt.current.copy(targetLookAt);
      initialized.current = true;
    }
    
    // Smooth interpolation
    currentPosition.current.lerp(targetPos, SMOOTHING);
    currentLookAt.current.lerp(targetLookAt, SMOOTHING);
    
    // Apply to camera
    camera.position.copy(currentPosition.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
};

const Scene = ({ maze, animalType, playerPos, playerRotation = 0, collectedPowerUps = new Set() }: Maze3DSceneProps) => {
  // Generate camera volumes based on maze layout
  // You can customize these or add more volumes for specific areas
  const cameraVolumes = useMemo<CameraVolumeConfig[]>(() => {
    const mazeWidth = maze.grid[0].length;
    const mazeHeight = maze.grid.length;
    
    // Main volume - pure overhead to avoid wall collisions
    return [
      createCameraVolume(
        'main-area',
        [mazeWidth / 2, 1.5, mazeHeight / 2],
        [mazeWidth + 2, 3, mazeHeight + 2],
        'custom',
        {
          cameraOffset: [0, 2.4, 0], // Directly above player
          lookAtOffset: [0, 0, 0], // Look straight down at player
          fov: 60,
          priority: 1,
        }
      ),
    ];
  }, [maze]);

  const items = useMemo(() => {
    const powerUps: { pos: [number, number, number]; key: string }[] = [];
    const stations: [number, number, number][] = [];
    let goalPos: [number, number, number] = [0, 0, 0];

    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isPowerUp) {
          powerUps.push({ pos: [x + 0.5, 0.5, y + 0.5], key: `${x},${y}` });
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

  // Filter out collected powerups
  const visiblePowerUps = items.powerUps.filter(p => !collectedPowerUps.has(p.key));

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
      
      {/* Dark green background */}
      <color attach="background" args={['#1a3d1a']} />
      
      {/* Ground */}
      <Ground width={maze.grid[0].length} height={maze.grid.length} />
      
      {/* Maze Walls */}
      <MazeWalls maze={maze} />
      
      {/* Power-ups */}
      {visiblePowerUps.map((p, i) => (
        <PowerUp key={`powerup-${p.key}`} position={p.pos} />
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
        position={[playerPos.x, 0, playerPos.y]}
        rotation={playerRotation}
      />
      
      {/* Camera - over-the-shoulder with wall collision avoidance */}
      <OverShoulderCameraController 
        playerPos={playerPos} 
        playerRotation={playerRotation}
        maze={maze}
      />
    </>
  );
};

export const Maze3DCanvas = (props: Maze3DSceneProps) => {
  return (
    <div className="w-full h-full">
      <Canvas shadows gl={{ logarithmicDepthBuffer: true, antialias: true }}>
        <PerspectiveCamera makeDefault fov={60} near={0.5} far={100} />
        <Scene {...props} />
      </Canvas>
    </div>
  );
};
