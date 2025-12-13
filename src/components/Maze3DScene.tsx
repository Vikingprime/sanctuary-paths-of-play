import { useRef, useMemo, MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { Vector3, ShaderMaterial, Color, DataTexture, NearestFilter, RepeatWrapping } from 'three';
import { Maze, AnimalType } from '@/types/game';
import { InstancedWalls } from './CornWall';
import { PlayerCube } from './PlayerCube';
import { PlayerState, MovementInput, calculateMovement } from '@/game/GameLogic';

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

// Ground shader with wall texture for grass/path differentiation
const GroundMaterial = ({ maze }: { maze: Maze }) => {
  const { material, wallTexture } = useMemo(() => {
    const mazeWidth = maze.grid[0].length;
    const mazeHeight = maze.grid.length;
    
    // Create wall map texture - white = wall, black = path
    const data = new Uint8Array(mazeWidth * mazeHeight * 4);
    for (let y = 0; y < mazeHeight; y++) {
      for (let x = 0; x < mazeWidth; x++) {
        const idx = (y * mazeWidth + x) * 4;
        const isWall = maze.grid[y][x].isWall ? 255 : 0;
        data[idx] = isWall;     // R
        data[idx + 1] = isWall; // G
        data[idx + 2] = isWall; // B
        data[idx + 3] = 255;    // A
      }
    }
    
    const texture = new DataTexture(data, mazeWidth, mazeHeight);
    texture.needsUpdate = true;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    
    const mat = new ShaderMaterial({
      uniforms: {
        wallMap: { value: texture },
        mazeWidth: { value: mazeWidth },
        mazeHeight: { value: mazeHeight },
        // Dirt path colors
        pathBase: { value: new Color('#7A5240') },
        pathDark: { value: new Color('#5C3D2E') },
        pathLight: { value: new Color('#9B6B4A') },
        // Grass colors  
        grassBase: { value: new Color('#4A6B3A') },
        grassDark: { value: new Color('#3A5428') },
        grassLight: { value: new Color('#5A7D4A') },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D wallMap;
        uniform float mazeWidth;
        uniform float mazeHeight;
        uniform vec3 pathBase;
        uniform vec3 pathDark;
        uniform vec3 pathLight;
        uniform vec3 grassBase;
        uniform vec3 grassDark;
        uniform vec3 grassLight;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < 4; i++) {
            value += amplitude * noise(p);
            p *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }
        
        void main() {
          vec2 worldUV = vWorldPos.xz;
          
          // Sample wall map to determine if we're on grass or path
          vec2 mazeUV = worldUV / vec2(mazeWidth, mazeHeight);
          float isWall = texture2D(wallMap, mazeUV).r;
          
          // Soften edges with noise for organic transition
          float edgeNoise = noise(worldUV * 3.0) * 0.15;
          float wallMask = smoothstep(0.3, 0.7, isWall + edgeNoise);
          
          // Outside maze bounds = grass
          float inBounds = step(0.0, mazeUV.x) * step(mazeUV.x, 1.0) * 
                          step(0.0, mazeUV.y) * step(mazeUV.y, 1.0);
          wallMask = mix(1.0, wallMask, inBounds);
          
          // Organic noise variation
          float variation = fbm(worldUV * 1.5);
          float fineNoise = noise(worldUV * 8.0);
          
          // Path texture (trodden dirt)
          vec3 pathColor = mix(pathDark, pathBase, variation * 0.6 + 0.4);
          pathColor = mix(pathColor, pathLight, pow(noise(worldUV * 4.0), 2.0) * 0.3);
          float pebbles = step(0.88, noise(worldUV * 12.0));
          pathColor = mix(pathColor, pathDark * 0.6, pebbles * 0.4);
          float specks = step(0.92, noise(worldUV * 18.0 + 50.0));
          pathColor = mix(pathColor, pathLight, specks * 0.3);
          
          // Grass texture
          vec3 grassColor = mix(grassDark, grassBase, variation * 0.5 + 0.5);
          grassColor = mix(grassColor, grassLight, pow(fineNoise, 2.0) * 0.4);
          // Grass blade variation
          float blades = noise(worldUV * 25.0) * 0.25;
          grassColor = mix(grassColor, grassLight, blades);
          
          // Final blend: grass on walls, dirt on paths
          vec3 finalColor = mix(pathColor, grassColor, wallMask);
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
    
    return { material: mat, wallTexture: texture };
  }, [maze]);
  
  return <primitive object={material} attach="material" />;
};

// Ground with grass/path differentiation based on wall data
const Ground = ({ maze }: { maze: Maze }) => {
  const width = maze.grid[0].length;
  const height = maze.grid.length;
  const planeWidth = width + 10;
  const planeHeight = height + 10;
  const centerX = width / 2;
  const centerZ = height / 2;
  
  return (
    <mesh 
      rotation={[-Math.PI / 2, 0, 0]} 
      position={[centerX, 0.001, centerZ]}
      receiveShadow
    >
      <planeGeometry args={[planeWidth, planeHeight, 1, 1]} />
      <GroundMaterial maze={maze} />
    </mesh>
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
      <Ground maze={maze} />
      
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
