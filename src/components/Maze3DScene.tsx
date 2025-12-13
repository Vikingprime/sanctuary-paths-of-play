import { useRef, useMemo, MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, useGLTF } from '@react-three/drei';
import { Vector3 } from 'three';
import { Maze, AnimalType } from '@/types/game';
import { InstancedWalls } from './CornWall';
import { PlayerCube } from './PlayerCube';
import { PlayerState, MovementInput, calculateMovement } from '@/game/GameLogic';

// Preload the soil model
useGLTF.preload('/models/Fertile_soil.glb');

interface Maze3DSceneProps {
  maze: Maze;
  animalType: AnimalType;
  playerStateRef: MutableRefObject<PlayerState>;
  isMovingRef: MutableRefObject<boolean>;
  collectedPowerUps?: Set<string>;
  keysPressed: MutableRefObject<Set<string>>;
  speedBoostActive: boolean;
  onCellInteraction: (x: number, y: number) => void;
  isPaused: boolean;
  onSceneReady?: () => void;
}

// Ground made of tiled Fertile_soil models
const Ground = ({ width, height }: { width: number; height: number }) => {
  const { scene } = useGLTF('/models/Fertile_soil.glb');
  
  // Generate grid of soil tiles with random rotation for variety
  const tiles = useMemo(() => {
    const result: { x: number; z: number; rotY: number; clone: any }[] = [];
    for (let x = -2; x < width + 2; x++) {
      for (let z = -2; z < height + 2; z++) {
        // Random 90-degree rotation to break up pattern
        const rotY = Math.floor((x * 7 + z * 13) % 4) * (Math.PI / 2);
        result.push({ x, z, rotY, clone: scene.clone() });
      }
    }
    return result;
  }, [width, height, scene]);
  
  return (
    <group>
      {/* Base dirt plane underneath to hide any remaining seams */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, -0.02, height / 2]}>
        <planeGeometry args={[width + 10, height + 10]} />
        <meshStandardMaterial color="#7A5A4A" roughness={1} />
      </mesh>
      {/* Soil tiles on top with overlap */}
      {tiles.map((tile, i) => (
        <primitive
          key={`soil-tile-${i}`}
          object={tile.clone}
          position={[tile.x + 0.5, 0, tile.z + 0.5]}
          rotation={[0, tile.rotY, 0]}
          scale={[1.15, 0.5, 1.15]}
        />
      ))}
    </group>
  );
};

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
            // Calculate offset direction to push block far OUTSIDE the maze
            let offsetX = 0;
            let offsetZ = 0;
            if (x === 0) offsetX = -1.5;
            if (x === maxX) offsetX = 1.5;
            if (y === 0) offsetZ = -1.5;
            if (y === maxZ) offsetZ = 1.5;
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

// Player wrapper that handles movement + rendering in sync
const RefBasedPlayer = ({ 
  animalType, 
  playerStateRef, 
  isMovingRef,
  maze,
  keysPressed,
  speedBoostActive,
  onCellInteraction,
  isPaused,
}: { 
  animalType: AnimalType;
  playerStateRef: MutableRefObject<PlayerState>;
  isMovingRef: MutableRefObject<boolean>;
  maze: Maze;
  keysPressed: MutableRefObject<Set<string>>;
  speedBoostActive: boolean;
  onCellInteraction: (x: number, y: number) => void;
  isPaused: boolean;
}) => {
  const groupRef = useRef<any>(null);
  const smoothRotation = useRef(0);
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Handle movement (synced with render)
    if (!isPaused) {
      // Clamp delta to prevent jumps
      const clampedDelta = Math.min(delta, 0.033);
      
      // Build input from pressed keys
      const input: MovementInput = {
        forward: keysPressed.current.has('w') || keysPressed.current.has('arrowup'),
        backward: keysPressed.current.has('s') || keysPressed.current.has('arrowdown'),
        rotateLeft: keysPressed.current.has('a') || keysPressed.current.has('arrowleft'),
        rotateRight: keysPressed.current.has('d') || keysPressed.current.has('arrowright'),
      };
      
      // Update isMoving ref
      isMovingRef.current = input.forward || input.backward;
      
      // Calculate new position
      const prev = playerStateRef.current;
      const newState = calculateMovement(maze, prev, input, clampedDelta, speedBoostActive);
      playerStateRef.current = newState;
      
      // Check interactions if position changed
      if (newState.x !== prev.x || newState.y !== prev.y) {
        onCellInteraction(newState.x, newState.y);
      }
    }
    
    const { x, y, rotation } = playerStateRef.current;
    
    // Update position directly
    groupRef.current.position.x = x;
    groupRef.current.position.z = y;
    
    // Smooth rotation
    const targetRotation = -rotation + Math.PI;
    let rotDiff = targetRotation - smoothRotation.current;
    if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    smoothRotation.current += rotDiff * 0.4;
    while (smoothRotation.current > Math.PI * 2) smoothRotation.current -= Math.PI * 2;
    while (smoothRotation.current < 0) smoothRotation.current += Math.PI * 2;
    
    groupRef.current.rotation.y = smoothRotation.current;
  });
  
  return (
    <group ref={groupRef}>
      <PlayerCube
        animalType={animalType}
        position={[0, 0, 0]}
        rotation={0}
        isMovingRef={isMovingRef}
      />
    </group>
  );
};

// Simple over-the-shoulder camera with smooth follow - reads from ref each frame
const OverShoulderCameraController = ({ 
  playerStateRef,
}: { 
  playerStateRef: MutableRefObject<PlayerState>;
}) => {
  const { camera } = useThree();
  
  // Store smoothed rotation to prevent discontinuities
  const smoothRotation = useRef(0);
  const currentPosition = useRef(new Vector3());
  const currentLookAt = useRef(new Vector3());
  const initialized = useRef(false);
  
  // Camera settings
  const CAMERA_DISTANCE = 2.5;
  const CAMERA_HEIGHT = 2.2;
  const LOOK_AHEAD = 1.5;
  const LOOK_HEIGHT = 0.6;
  const POSITION_SMOOTHING = 0.15;
  const ROTATION_SMOOTHING = 0.12;
  
  useFrame(() => {
    const { x: playerX, y: playerZ, rotation: playerRotation } = playerStateRef.current;
    // Smoothly interpolate rotation using shortest path
    let rotDiff = playerRotation - smoothRotation.current;
    // Handle wrap-around (shortest path)
    if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    smoothRotation.current += rotDiff * ROTATION_SMOOTHING;
    // Keep in 0-2π range
    smoothRotation.current = ((smoothRotation.current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    
    const rot = smoothRotation.current;
    
    // Calculate camera position behind player using smoothed rotation
    const targetPos = new Vector3(
      playerX - Math.sin(rot) * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      playerZ + Math.cos(rot) * CAMERA_DISTANCE
    );
    
    // Calculate look target ahead of player
    const targetLookAt = new Vector3(
      playerX + Math.sin(rot) * LOOK_AHEAD,
      LOOK_HEIGHT,
      playerZ - Math.cos(rot) * LOOK_AHEAD
    );
    
    // Initialize on first frame
    if (!initialized.current) {
      smoothRotation.current = playerRotation;
      currentPosition.current.copy(targetPos);
      currentLookAt.current.copy(targetLookAt);
      initialized.current = true;
    }
    
    // Smooth position interpolation
    currentPosition.current.lerp(targetPos, POSITION_SMOOTHING);
    currentLookAt.current.lerp(targetLookAt, POSITION_SMOOTHING);
    
    // Apply to camera
    camera.position.copy(currentPosition.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
};

const Scene = ({ maze, animalType, playerStateRef, isMovingRef, collectedPowerUps = new Set(), keysPressed, speedBoostActive, onCellInteraction, isPaused, onSceneReady }: Maze3DSceneProps) => {
  // Signal scene is ready after first render
  const hasSignaled = useRef(false);
  
  useFrame(() => {
    if (!hasSignaled.current && onSceneReady) {
      hasSignaled.current = true;
      onSceneReady();
    }
  });

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
      {/* Lighting - bright daylight scene */}
      <ambientLight intensity={1.2} />
      <directionalLight
        position={[10, 30, 10]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {/* Fill light from opposite side */}
      <directionalLight
        position={[-10, 20, -10]}
        intensity={0.8}
      />
      {/* Top-down light for even illumination */}
      <pointLight position={[0, 15, 0]} intensity={1} distance={50} />
      
      {/* Bright sky blue background */}
      <color attach="background" args={['#87CEEB']} />
      
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
      
      {/* Player - handles movement + rendering in sync */}
      <RefBasedPlayer 
        animalType={animalType}
        playerStateRef={playerStateRef}
        isMovingRef={isMovingRef}
        maze={maze}
        keysPressed={keysPressed}
        speedBoostActive={speedBoostActive}
        onCellInteraction={onCellInteraction}
        isPaused={isPaused}
      />
      
      {/* Camera - smooth over-the-shoulder follow */}
      <OverShoulderCameraController 
        playerStateRef={playerStateRef}
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
