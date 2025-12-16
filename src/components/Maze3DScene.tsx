import { useRef, useMemo, useEffect, MutableRefObject, useState } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { PerspectiveCamera, ContactShadows, useGLTF, Html } from '@react-three/drei';
import { Vector3, ShaderMaterial, Color, DataTexture, LinearFilter, Object3D, InstancedMesh, MeshStandardMaterial, DodecahedronGeometry } from 'three';
import { Maze, AnimalType } from '@/types/game';
import { InstancedWalls, CornOptimizationSettings, DEFAULT_CORN_SETTINGS } from './CornWall';
import { PlayerCube } from './PlayerCube';
import { PlayerState, MovementInput, calculateMovement, generateRockPositions, RockPosition } from '@/game/GameLogic';

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
  cornOptimizationSettings?: CornOptimizationSettings;
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
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    
const mat = new ShaderMaterial({
      uniforms: {
        wallMap: { value: texture },
        mazeWidth: { value: mazeWidth },
        mazeHeight: { value: mazeHeight },
        // Dirt path colors - warm terracotta tones
        pathWorn: { value: new Color('#C49A7A') },
        pathBase: { value: new Color('#8B5A42') },
        pathDark: { value: new Color('#5C3D2E') },
        pathRich: { value: new Color('#7A4A3A') },
        // Grass colors - rich greens
        grassBase: { value: new Color('#4A6B3A') },
        grassDark: { value: new Color('#2E4420') },
        grassMoss: { value: new Color('#3D5830') },
        // Rock/stone colors
        rockLight: { value: new Color('#C4B090') },
        rockMid: { value: new Color('#A08060') },
        rockDark: { value: new Color('#705540') },
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
        uniform vec3 pathWorn;
        uniform vec3 pathBase;
        uniform vec3 pathDark;
        uniform vec3 pathRich;
        uniform vec3 grassBase;
        uniform vec3 grassDark;
        uniform vec3 grassMoss;
        uniform vec3 rockLight;
        uniform vec3 rockMid;
        uniform vec3 rockDark;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        
        float hash2(vec2 p) {
          return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453);
        }
        
        float hash3(vec2 p) {
          return fract(sin(dot(p, vec2(419.2, 371.9))) * 43758.5453);
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
          for (int i = 0; i < 5; i++) {
            value += amplitude * noise(p);
            p *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }
        
        void main() {
          vec2 worldUV = vWorldPos.xz;
          
          // Sample wall map with linear filtering for smooth edges
          vec2 mazeUV = worldUV / vec2(mazeWidth, mazeHeight);
          float isWall = texture2D(wallMap, mazeUV).r;
          
          // Organic edge distortion for natural grass patches
          float edgeWarp = fbm(worldUV * 1.5 + 10.0) * 0.35;
          float edgeDetail = noise(worldUV * 4.0) * 0.15;
          float wallMask = smoothstep(0.15, 0.85, isWall + edgeWarp - edgeDetail);
          
          // Extra softening pass
          wallMask = smoothstep(0.0, 1.0, wallMask);
          
          // Outside maze = grass
          float inBounds = step(0.0, mazeUV.x) * step(mazeUV.x, 1.0) * 
                          step(0.0, mazeUV.y) * step(mazeUV.y, 1.0);
          wallMask = mix(1.0, wallMask, inBounds);
          
          // === PATH TEXTURE ===
          float largeVar = fbm(worldUV * 0.6);
          float medVar = fbm(worldUV * 1.8 + 50.0);
          float fineVar = fbm(worldUV * 4.0 + 100.0);
          
          // Worn center effect
          float wornPattern = fbm(worldUV * 0.9 + 150.0);
          float wornCenter = pow(1.0 - wallMask, 0.4) * wornPattern;
          
          // Build path color with organic layers
          vec3 pathColor = pathBase;
          pathColor = mix(pathColor, pathRich, largeVar * 0.5);
          pathColor = mix(pathColor, pathWorn, wornCenter * 0.6 + medVar * 0.25);
          
          // Shadow patches
          float shadows = pow(fbm(worldUV * 2.0 + 200.0), 1.3);
          pathColor = mix(pathColor, pathDark, shadows * 0.4);
          
          // Fine texture
          pathColor = mix(pathColor, pathDark * 0.85, (1.0 - fineVar) * 0.12);
          
          // === ROCKS - Varied sizes and shapes ===
          // Large rocks (sparse)
          float largeRockNoise = hash(floor(worldUV * 1.8));
          float largeRockShape = length((fract(worldUV * 1.8) - 0.5) * vec2(1.0 + hash2(floor(worldUV * 1.8)) * 0.5, 1.0));
          float largeRocks = smoothstep(0.18, 0.12, largeRockShape) * step(0.92, largeRockNoise);
          
          // Medium rocks
          float medRockNoise = hash(floor(worldUV * 3.5 + 20.0));
          float medRockShape = length((fract(worldUV * 3.5 + 20.0) - 0.5) * vec2(1.0, 1.0 + hash3(floor(worldUV * 3.5 + 20.0)) * 0.4));
          float medRocks = smoothstep(0.15, 0.08, medRockShape) * step(0.88, medRockNoise);
          
          // Small pebbles (more common)
          float smallNoise = hash(floor(worldUV * 8.0 + 40.0));
          float smallShape = length(fract(worldUV * 8.0 + 40.0) - 0.5);
          float smallRocks = smoothstep(0.12, 0.06, smallShape) * step(0.82, smallNoise);
          
          // Tiny specks
          float tinyNoise = hash(floor(worldUV * 15.0 + 60.0));
          float tinyRocks = step(0.94, tinyNoise) * 0.5;
          
          // Combine rocks with varied colors
          float rockMask = max(max(largeRocks, medRocks * 0.9), max(smallRocks * 0.7, tinyRocks));
          float rockShade = noise(worldUV * 12.0);
          vec3 rockColor = mix(rockDark, rockMid, rockShade * 0.5 + largeVar * 0.3);
          rockColor = mix(rockColor, rockLight, noise(worldUV * 25.0) * 0.4);
          
          pathColor = mix(pathColor, rockColor, rockMask * 0.85);
          
// === GRASS AREA - Patchy with dirt showing through ===
          // Base is actually dirt/soil, with grass clumps on top
          vec3 grassAreaBase = mix(pathDark * 0.9, pathRich * 0.8, noise(worldUV * 2.0) * 0.5 + 0.3);
          
          // Grass clump pattern - scattered patches, not solid
          float grassClump1 = pow(fbm(worldUV * 3.0 + 300.0), 1.2);
          float grassClump2 = pow(noise(worldUV * 5.0 + 350.0), 0.8);
          float grassClump3 = pow(fbm(worldUV * 8.0 + 400.0), 1.5);
          
          // Combine for patchy grass coverage (not 100%)
          float grassCoverage = grassClump1 * 0.5 + grassClump2 * 0.3 + grassClump3 * 0.2;
          grassCoverage = smoothstep(0.25, 0.6, grassCoverage); // Threshold for patches
          
          // Grass colors with variation
          float grassVar = fbm(worldUV * 1.5 + 500.0);
          vec3 grassTuftColor = mix(grassDark, grassBase, grassVar * 0.6 + 0.4);
          grassTuftColor = mix(grassTuftColor, grassMoss, noise(worldUV * 4.0) * 0.4);
          
          // Lighter grass highlights on some tufts
          float highlights = pow(noise(worldUV * 12.0 + 600.0), 2.0);
          grassTuftColor = mix(grassTuftColor, grassBase * 1.3, highlights * 0.3);
          
          // Edge grass tufts (small clumps at path edges)
          float edgeTufts = pow(noise(worldUV * 6.0 + 450.0), 1.5);
          float edgeZone = smoothstep(0.3, 0.6, wallMask) * (1.0 - smoothstep(0.6, 0.85, wallMask));
          float edgeGrass = edgeTufts * edgeZone;
          
          // Combine: dirt base with grass patches on top
          vec3 grassAreaColor = mix(grassAreaBase, grassTuftColor, grassCoverage * 0.85);
          
          // Add scattered small tufts
          float smallTufts = step(0.75, noise(worldUV * 10.0 + 700.0));
          grassAreaColor = mix(grassAreaColor, grassBase * 1.1, smallTufts * 0.3 * grassCoverage);
          
          // Rocks in grass area
          float grassRockNoise = hash(floor(worldUV * 2.5 + 80.0));
          float grassRockShape = length(fract(worldUV * 2.5 + 80.0) - 0.5);
          float grassRockMask = smoothstep(0.18, 0.08, grassRockShape) * step(0.88, grassRockNoise);
          grassAreaColor = mix(grassAreaColor, rockMid * 0.9, grassRockMask * 0.8);
          
// === FINAL BLEND ===
          // Path to grass transition with edge grass tufts
          vec3 finalColor = mix(pathColor, grassAreaColor, wallMask);
          
          // Add extra grass tufts at edges
          finalColor = mix(finalColor, grassTuftColor, edgeGrass * 0.5);
          
          // Soft muddy transition
          float transition = smoothstep(0.35, 0.5, wallMask) * (1.0 - smoothstep(0.5, 0.65, wallMask));
          vec3 mudColor = mix(pathDark, grassAreaBase, 0.5);
finalColor = mix(finalColor, mudColor, transition * 0.2);
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
    
    return { material: mat, wallTexture: texture };
  }, [maze]);
  
  return <primitive object={material} attach="material" />;
};

// 3D Rocks using InstancedMesh for performance
const ScatteredRocks = ({ rocks }: { rocks: RockPosition[] }) => {
  const meshRef = useRef<InstancedMesh>(null);
  
  const { geometry, material } = useMemo(() => {
    const geo = new DodecahedronGeometry(1, 0);
    const mat = new MeshStandardMaterial({ color: "#7A6350", roughness: 0.9 });
    return { geometry: geo, material: mat };
  }, []);
  
  // Set up instances after mount
  useEffect(() => {
    if (!meshRef.current || rocks.length === 0) return;
    
    const tempObject = new Object3D();
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    
    rocks.forEach((rock, i) => {
      const scale = rock.radius * 2;
      const seed = Math.floor(rock.x * 1000 + rock.z);
      const rotation = seededRandom(seed + 4) * Math.PI * 2;
      
      tempObject.position.set(rock.x, scale * 0.3, rock.z);
      tempObject.rotation.set(0, rotation, 0);
      tempObject.scale.set(scale * 1.2, scale * 0.6, scale);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [rocks]);
  
  if (rocks.length === 0) return null;
  
  return (
    <instancedMesh 
      ref={meshRef} 
      args={[geometry, material, rocks.length]}
      castShadow
    />
  );
};

// 3D Grass tufts - memoized clones for performance
const GrassTufts = ({ maze }: { maze: Maze }) => {
  const grass231 = useGLTF('/models/Grass_231.glb');
  const grass232 = useGLTF('/models/Grass_232.glb');
  
  // Pre-clone scenes once and memoize
  const { tufts, clonedScenes } = useMemo(() => {
    const positions: { x: number; z: number; scale: number; rotation: number; type: 1 | 2 }[] = [];
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    
    const mazeWidth = maze.grid[0].length;
    const mazeHeight = maze.grid.length;
    
    // Place grass consistently along each wall edge facing paths
    for (let y = 1; y < mazeHeight - 1; y++) {
      for (let x = 1; x < mazeWidth - 1; x++) {
        if (!maze.grid[y][x].isWall) continue;
        
        const seed = x * 2000 + y + 5000;
        
        const pathRight = x < mazeWidth - 1 && !maze.grid[y][x+1].isWall;
        const pathLeft = x > 0 && !maze.grid[y][x-1].isWall;
        const pathDown = y < mazeHeight - 1 && !maze.grid[y+1][x].isWall;
        const pathUp = y > 0 && !maze.grid[y-1][x].isWall;
        
        if (pathRight) {
          positions.push({
            x: x + 0.55 + seededRandom(seed) * 0.2,
            z: y + 0.3 + seededRandom(seed + 1) * 0.4,
            scale: 0.10 + seededRandom(seed + 2) * 0.05,
            rotation: seededRandom(seed + 3) * Math.PI * 2,
            type: seededRandom(seed + 4) > 0.5 ? 1 : 2,
          });
        }
        if (pathLeft) {
          positions.push({
            x: x + 0.25 + seededRandom(seed + 100) * 0.2,
            z: y + 0.3 + seededRandom(seed + 101) * 0.4,
            scale: 0.10 + seededRandom(seed + 102) * 0.05,
            rotation: seededRandom(seed + 103) * Math.PI * 2,
            type: seededRandom(seed + 104) > 0.5 ? 1 : 2,
          });
        }
        if (pathDown) {
          positions.push({
            x: x + 0.3 + seededRandom(seed + 200) * 0.4,
            z: y + 0.55 + seededRandom(seed + 201) * 0.2,
            scale: 0.10 + seededRandom(seed + 202) * 0.05,
            rotation: seededRandom(seed + 203) * Math.PI * 2,
            type: seededRandom(seed + 204) > 0.5 ? 1 : 2,
          });
        }
        if (pathUp) {
          positions.push({
            x: x + 0.3 + seededRandom(seed + 300) * 0.4,
            z: y + 0.25 + seededRandom(seed + 301) * 0.2,
            scale: 0.10 + seededRandom(seed + 302) * 0.05,
            rotation: seededRandom(seed + 303) * Math.PI * 2,
            type: seededRandom(seed + 304) > 0.5 ? 1 : 2,
          });
        }
      }
    }
    
    // Pre-clone all scenes once
    const scenes = positions.map((tuft) => {
      const scene = (tuft.type === 1 ? grass231 : grass232).scene.clone();
      scene.position.set(tuft.x, 0, tuft.z);
      scene.rotation.set(0, tuft.rotation, 0);
      const s = tuft.scale * 0.04;
      scene.scale.set(s, s, s);
      return scene;
    });
    
    return { tufts: positions, clonedScenes: scenes };
  }, [maze, grass231, grass232]);
  
  return (
    <>
      {clonedScenes.map((scene, i) => (
        <primitive key={i} object={scene} />
      ))}
    </>
  );
};

// Ground with grass/path differentiation based on wall data
const Ground = ({ maze, rocks }: { maze: Maze; rocks: RockPosition[] }) => {
  const width = maze.grid[0].length;
  const height = maze.grid.length;
  const planeWidth = width + 10;
  const planeHeight = height + 10;
  const centerX = width / 2;
  const centerZ = height / 2;
  
  return (
    <group>
      {/* Textured ground */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[centerX, 0.001, centerZ]}
      >
        <planeGeometry args={[planeWidth, planeHeight, 1, 1]} />
        <GroundMaterial maze={maze} />
      </mesh>
      
      {/* Shadow receiving plane on top */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[centerX, 0.002, centerZ]}
        receiveShadow
      >
        <planeGeometry args={[planeWidth, planeHeight, 1, 1]} />
        <shadowMaterial transparent opacity={0.4} />
      </mesh>
      
      {/* 3D Props for visual depth */}
      <ScatteredRocks rocks={rocks} />
      <GrassTufts maze={maze} />
    </group>
  );
};

const MazeWalls = ({ maze, playerStateRef, optimizationSettings }: { 
  maze: Maze; 
  playerStateRef?: React.MutableRefObject<{ x: number; y: number }>;
  optimizationSettings?: CornOptimizationSettings;
}) => {
  const { interiorWalls, boundaryWalls } = useMemo(() => {
    const interior: { x: number; z: number }[] = [];
    const boundary: { x: number; z: number; offsetX: number; offsetZ: number }[] = [];
    
    const maxX = maze.grid[0].length - 1;
    const maxZ = maze.grid.length - 1;
    
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isWall) {
          // Boundary walls = cells on the edge of the maze grid
          if (x === 0 || x === maxX || y === 0 || y === maxZ) {
            let offsetX = 0;
            let offsetZ = 0;
            if (x === 0) offsetX = -1.5;
            if (x === maxX) offsetX = 1.5;
            if (y === 0) offsetZ = -1.5;
            if (y === maxZ) offsetZ = 1.5;
            boundary.push({ x, z: y, offsetX, offsetZ });
          } else {
            // All other walls are interior walls
            interior.push({ x, z: y });
          }
        }
      });
    });
    
    return { interiorWalls: interior, boundaryWalls: boundary };
  }, [maze]);

  return (
    <InstancedWalls 
      positions={interiorWalls}
      noShadowPositions={[]}
      boundaryPositions={boundaryWalls}
      playerPositionRef={playerStateRef}
      optimizationSettings={optimizationSettings}
    />
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
  rocks,
}: { 
  animalType: AnimalType;
  playerStateRef: MutableRefObject<PlayerState>;
  isMovingRef: MutableRefObject<boolean>;
  maze: Maze;
  keysPressed: MutableRefObject<Set<string>>;
  speedBoostActive: boolean;
  onCellInteraction: (x: number, y: number) => void;
  isPaused: boolean;
  rocks: RockPosition[];
}) => {
  const groupRef = useRef<any>(null);
  const smoothRotation = useRef(0);
  const smoothPositionX = useRef(0);
  const smoothPositionZ = useRef(0);
  const positionInitialized = useRef(false);
  const lastCellRef = useRef({ x: -1, y: -1 }); // Track last cell for interaction check
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Handle movement - use clamped delta for smooth per-frame updates
    if (!isPaused) {
      // Clamp delta to prevent large jumps on frame drops
      const clampedDelta = Math.min(delta, 0.05);
      
      // Build input from pressed keys (arrow keys + WASD)
      const input: MovementInput = {
        forward: keysPressed.current.has('arrowup') || keysPressed.current.has('w'),
        backward: keysPressed.current.has('arrowdown') || keysPressed.current.has('s'),
        rotateLeft: keysPressed.current.has('arrowleft') || keysPressed.current.has('a'),
        rotateRight: keysPressed.current.has('arrowright') || keysPressed.current.has('d'),
      };
      
      // Update isMoving ref
      isMovingRef.current = input.forward || input.backward;
      
      // Calculate movement with clamped delta (smooth per-frame updates)
      const prev = playerStateRef.current;
      const newState = calculateMovement(maze, prev, input, clampedDelta, speedBoostActive, rocks);
      playerStateRef.current = newState;
      
      // Only check interactions when entering a new cell
      const currentCellX = Math.floor(newState.x);
      const currentCellY = Math.floor(newState.y);
      if (currentCellX !== lastCellRef.current.x || currentCellY !== lastCellRef.current.y) {
        lastCellRef.current = { x: currentCellX, y: currentCellY };
        onCellInteraction(newState.x, newState.y);
      }
    }
    
    // Initialize smooth position on first frame
    if (!positionInitialized.current) {
      smoothPositionX.current = playerStateRef.current.x;
      smoothPositionZ.current = playerStateRef.current.y;
      positionInitialized.current = true;
    }
    
    // Smooth position with fixed lerp factor (same approach as rotation)
    const targetX = playerStateRef.current.x;
    const targetZ = playerStateRef.current.y;
    smoothPositionX.current += (targetX - smoothPositionX.current) * 0.3;
    smoothPositionZ.current += (targetZ - smoothPositionZ.current) * 0.3;
    
    groupRef.current.position.x = smoothPositionX.current;
    groupRef.current.position.z = smoothPositionZ.current;
    
    // Smooth rotation with fixed lerp factor (not delta-dependent)
    const targetRotation = -playerStateRef.current.rotation + Math.PI;
    let rotDiff = targetRotation - smoothRotation.current;
    if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    
    // Fixed lerp factor for consistent rotation smoothing
    smoothRotation.current += rotDiff * 0.15;
    
    // Normalize rotation
    if (smoothRotation.current > Math.PI * 2) smoothRotation.current -= Math.PI * 2;
    if (smoothRotation.current < 0) smoothRotation.current += Math.PI * 2;
    
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
  // Reusable vectors to avoid GC (creating new Vector3 every frame causes jitter)
  const targetPos = useRef(new Vector3());
  const targetLookAt = useRef(new Vector3());
  
  // Camera settings - over-the-shoulder view balanced for all animals
  const CAMERA_DISTANCE = 1.6;
  const CAMERA_HEIGHT = 1.9;
  const LOOK_AHEAD = 1.3;
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
    
    // Calculate camera position behind player (reuse vector to avoid GC)
    targetPos.current.set(
      playerX - Math.sin(rot) * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      playerZ + Math.cos(rot) * CAMERA_DISTANCE
    );
    
    // Calculate look target ahead of player (reuse vector to avoid GC)
    targetLookAt.current.set(
      playerX + Math.sin(rot) * LOOK_AHEAD,
      LOOK_HEIGHT,
      playerZ - Math.cos(rot) * LOOK_AHEAD
    );
    
    // Initialize on first frame
    if (!initialized.current) {
      smoothRotation.current = playerRotation;
      currentPosition.current.copy(targetPos.current);
      currentLookAt.current.copy(targetLookAt.current);
      initialized.current = true;
    }
    
    // Smooth position interpolation
    currentPosition.current.lerp(targetPos.current, POSITION_SMOOTHING);
    currentLookAt.current.lerp(targetLookAt.current, POSITION_SMOOTHING);
    
    // Apply to camera
    camera.position.copy(currentPosition.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
};

// FPS Counter component - uses portal to render outside Canvas
const FPSDisplay = ({ fps }: { fps: number }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 10,
      left: 10,
      background: 'rgba(0,0,0,0.7)',
      color: fps > 50 ? '#4ade80' : fps > 30 ? '#facc15' : '#ef4444',
      padding: '4px 8px',
      borderRadius: '4px',
      fontFamily: 'monospace',
      fontSize: '14px',
      fontWeight: 'bold',
      zIndex: 1000,
      pointerEvents: 'none'
    }}>
      {fps} FPS
    </div>
  );
};

const FPSTracker = ({ onFpsUpdate }: { onFpsUpdate: (fps: number) => void }) => {
  const frames = useRef(0);
  const lastTime = useRef(performance.now());
  
  useFrame(() => {
    frames.current++;
    const now = performance.now();
    if (now - lastTime.current >= 1000) {
      onFpsUpdate(frames.current);
      frames.current = 0;
      lastTime.current = now;
    }
  });
  
  return null;
};

const Scene = ({ maze, animalType, playerStateRef, isMovingRef, collectedPowerUps = new Set(), keysPressed, speedBoostActive, onCellInteraction, isPaused, onSceneReady, cornOptimizationSettings }: Maze3DSceneProps) => {
  // Signal scene is ready after first render
  const hasSignaled = useRef(false);
  
  useFrame(() => {
    if (!hasSignaled.current && onSceneReady) {
      hasSignaled.current = true;
      onSceneReady();
    }
  });

  // Generate rock positions once (shared between visuals and collision)
  const rocks = useMemo(() => generateRockPositions(maze), [maze]);

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

  // Light ref for following player
  const lightRef = useRef<any>(null);
  const lastLightPos = useRef({ x: 0, z: 0 });
  
  // Update light position only when player moves significantly (reduces shadow flickering)
  useFrame(() => {
    if (lightRef.current && playerStateRef.current) {
      const px = playerStateRef.current.x;
      const pz = playerStateRef.current.y;
      
      // Only update if player moved more than 2 units from last light position
      const dx = px - lastLightPos.current.x;
      const dz = pz - lastLightPos.current.z;
      const distSq = dx * dx + dz * dz;
      
      if (distSq > 4) { // 2 units squared
        // Round to reduce micro-jitter
        const roundedX = Math.round(px);
        const roundedZ = Math.round(pz);
        lightRef.current.position.set(roundedX + 15, 35, roundedZ + 15);
        lightRef.current.target.position.set(roundedX, 0, roundedZ);
        lightRef.current.target.updateMatrixWorld();
        lastLightPos.current = { x: roundedX, z: roundedZ };
      }
    }
  });

return (
    <>
      {/* Lighting - 8am morning sunlight */}
      <ambientLight intensity={0.9} color="#FFF8F0" />
      
      {/* Main sun light - follows player for consistent shadows */}
      <directionalLight
        ref={lightRef}
        position={[15, 35, 15]}
        intensity={3.5}
        color="#FFFDF5"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-bias={-0.0005}
        shadow-radius={2}
      >
        <object3D attach="target" />
      </directionalLight>
      
      {/* Fill light from opposite side */}
      <directionalLight
        position={[-15, 15, -10]}
        intensity={0.45}
        color="#D8E8FF"
      />
      
      {/* Hemisphere light for natural sky/ground color */}
      <hemisphereLight args={['#87CEEB', '#9B7B5A', 0.55]} />
      
      
      {/* Dark green background to hide sky through corn gaps */}
      <color attach="background" args={['#1a2810']} />
      
      {/* Fog to fade distant corn to background color */}
      <fog attach="fog" args={['#1a2810', 8, 25]} />
      
      {/* Ground */}
      <Ground maze={maze} rocks={rocks} />
      
      {/* Maze Walls (corn) with optimizations */}
      <MazeWalls 
        maze={maze} 
        playerStateRef={playerStateRef}
        optimizationSettings={cornOptimizationSettings}
      />
      
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
        rocks={rocks}
      />
      
      {/* Camera - smooth over-the-shoulder follow */}
      <OverShoulderCameraController 
        playerStateRef={playerStateRef}
      />
    </>
  );
};

export const Maze3DCanvas = (props: Maze3DSceneProps) => {
  const [fps, setFps] = useState(0);
  
  // Detect mobile for pixel ratio capping
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
      || window.innerWidth < 768;
  }, []);
  
  // Cap pixel ratio on mobile for performance (max 1.5 instead of 2-3)
  const pixelRatio = isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio;
  
  return (
    <div className="w-full h-full">
      <FPSDisplay fps={fps} />
      <Canvas 
        shadows 
        gl={{ logarithmicDepthBuffer: true, antialias: !isMobile }} 
        dpr={pixelRatio}
      >
        <PerspectiveCamera makeDefault fov={60} near={0.5} far={100} />
        <Scene {...props} />
        <FPSTracker onFpsUpdate={setFps} />
      </Canvas>
    </div>
  );
};
