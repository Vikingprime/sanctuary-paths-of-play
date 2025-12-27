import { useRef, useMemo, useEffect, MutableRefObject, useState } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { PerspectiveCamera, ContactShadows, useGLTF, Html } from '@react-three/drei';
import { Vector3, ShaderMaterial, Color, DataTexture, LinearFilter, Object3D, InstancedMesh, MeshStandardMaterial, DodecahedronGeometry, Group, AnimationMixer, BackSide, DoubleSide } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Maze, AnimalType, DialogueTrigger, MazeCharacter } from '@/types/game';
import { InstancedWalls, CornOptimizationSettings, DEFAULT_CORN_SETTINGS, CullStats } from './CornWall';
import { PlayerCube } from './PlayerCube';
import { PlayerState, MovementInput, calculateMovement, generateRockPositions, RockPosition, CharacterPosition, checkCharacterCollision } from '@/game/GameLogic';
import { getCharacterScale, getCharacterYOffset } from '@/game/CharacterConfig';

// Extended performance info type
export interface PerformanceInfo {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  frameTime: number;
  gpuTime?: number;
}

// === PERFORMANCE TOGGLES (for testing) ===
const ENABLE_3D_ROCKS = true;         // 3D rock meshes scattered in scene
const ENABLE_3D_GRASS = true;         // 3D grass tuft meshes

interface DialogueTarget {
  speakerX: number;
  speakerZ: number;
}

interface Maze3DSceneProps {
  maze: Maze;
  animalType: AnimalType;
  playerStateRef: MutableRefObject<PlayerState>;
  isMovingRef: MutableRefObject<boolean>;
  collectedPowerUps?: Set<string>;
  keysPressed: MutableRefObject<Set<string>>;
  rotationIntensityRef?: MutableRefObject<number>;
  speedBoostActive: boolean;
  onCellInteraction: (x: number, y: number) => void;
  isPaused: boolean;
  isMuted?: boolean;
  onSceneReady?: () => void;
  cornOptimizationSettings?: CornOptimizationSettings;
  lowPixelRatio?: boolean;
  onRendererInfo?: (info: PerformanceInfo) => void;
  onCullStats?: (stats: CullStats) => void;
  debugMode?: boolean;
  restartKey?: number; // Increment to force camera reset
  dialogueTarget?: DialogueTarget | null; // Active dialogue speaker position for cutscene camera
  topDownCamera?: boolean; // Toggle between normal and top-down camera
  groundLevelCamera?: boolean; // Toggle to ground-level camera for debugging heights
  showCollisionDebug?: boolean; // Show collision debug spheres
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
        // Fog uniforms
        fogColor: { value: new Color('#5a6b55') },
        fogDensity: { value: 0.145 },  // Fog tuned for 16m corn cull distance
      },
      fog: true,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vFogDepth;
        void main() {
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
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
        uniform vec3 fogColor;
        uniform float fogDensity;
        varying vec2 vUv;
        varying float vFogDepth;
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
          vec2 mazeUV = worldUV / vec2(mazeWidth, mazeHeight);
          float isWall = texture2D(wallMap, mazeUV).r;
          
          // Organic edge distortion for natural grass patches
          float edgeWarp = fbm(worldUV * 1.5 + 10.0) * 0.35;
          float edgeDetail = noise(worldUV * 4.0) * 0.15;
          float wallMask = smoothstep(0.15, 0.85, isWall + edgeWarp - edgeDetail);
          wallMask = smoothstep(0.0, 1.0, wallMask);
          
          float inBounds = step(0.0, mazeUV.x) * step(mazeUV.x, 1.0) * 
                          step(0.0, mazeUV.y) * step(mazeUV.y, 1.0);
          wallMask = mix(1.0, wallMask, inBounds);
          
          // PATH TEXTURE
          float largeVar = fbm(worldUV * 0.6);
          float medVar = fbm(worldUV * 1.8 + 50.0);
          float fineVar = fbm(worldUV * 4.0 + 100.0);
          float wornPattern = fbm(worldUV * 0.9 + 150.0);
          float wornCenter = pow(1.0 - wallMask, 0.4) * wornPattern;
          
          vec3 pathColor = pathBase;
          pathColor = mix(pathColor, pathRich, largeVar * 0.5);
          pathColor = mix(pathColor, pathWorn, wornCenter * 0.6 + medVar * 0.25);
          
          float shadows = pow(fbm(worldUV * 2.0 + 200.0), 1.3);
          pathColor = mix(pathColor, pathDark, shadows * 0.4);
          pathColor = mix(pathColor, pathDark * 0.85, (1.0 - fineVar) * 0.12);
          
          // PATH ROCKS - use elliptical shapes with rotation for organic look
          float rockAngle1 = hash2(floor(worldUV * 1.8)) * 6.28;
          vec2 rockCenter1 = fract(worldUV * 1.8) - 0.5;
          vec2 rotated1 = vec2(
            rockCenter1.x * cos(rockAngle1) - rockCenter1.y * sin(rockAngle1),
            rockCenter1.x * sin(rockAngle1) + rockCenter1.y * cos(rockAngle1)
          );
          float largeRockNoise = hash(floor(worldUV * 1.8));
          float largeRockShape = length(rotated1 * vec2(1.0, 0.6 + hash2(floor(worldUV * 1.8)) * 0.4));
          float largeRocks = smoothstep(0.18, 0.12, largeRockShape) * step(0.92, largeRockNoise);
          
          float rockAngle2 = hash3(floor(worldUV * 3.5 + 20.0)) * 6.28;
          vec2 rockCenter2 = fract(worldUV * 3.5 + 20.0) - 0.5;
          vec2 rotated2 = vec2(
            rockCenter2.x * cos(rockAngle2) - rockCenter2.y * sin(rockAngle2),
            rockCenter2.x * sin(rockAngle2) + rockCenter2.y * cos(rockAngle2)
          );
          float medRockNoise = hash(floor(worldUV * 3.5 + 20.0));
          float medRockShape = length(rotated2 * vec2(1.0, 0.7 + hash2(floor(worldUV * 3.5 + 20.0)) * 0.3));
          float medRocks = smoothstep(0.15, 0.08, medRockShape) * step(0.88, medRockNoise);
          
          // Small rocks - also rotated for organic look
          float rockAngle3 = hash(floor(worldUV * 8.0 + 40.0)) * 6.28;
          vec2 rockCenter3 = fract(worldUV * 8.0 + 40.0) - 0.5;
          vec2 rotated3 = vec2(
            rockCenter3.x * cos(rockAngle3) - rockCenter3.y * sin(rockAngle3),
            rockCenter3.x * sin(rockAngle3) + rockCenter3.y * cos(rockAngle3)
          );
          float smallNoise = hash(floor(worldUV * 8.0 + 40.0));
          float smallShape = length(rotated3 * vec2(1.0, 0.7));
          float smallRocks = smoothstep(0.12, 0.06, smallShape) * step(0.82, smallNoise);
          
          // Tiny pebbles - use circular shapes with softer edges
          float tinyNoise = hash(floor(worldUV * 15.0 + 60.0));
          float tinyShape = length(fract(worldUV * 15.0 + 60.0) - 0.5);
          float tinyRocks = smoothstep(0.08, 0.03, tinyShape) * step(0.92, tinyNoise) * 0.5;
          float rockMask = max(max(largeRocks, medRocks * 0.9), max(smallRocks * 0.7, tinyRocks));
          float rockShade = noise(worldUV * 12.0);
          vec3 rockColor = mix(rockDark, rockMid, rockShade * 0.5 + largeVar * 0.3);
          rockColor = mix(rockColor, rockLight, noise(worldUV * 25.0) * 0.4);
          pathColor = mix(pathColor, rockColor, rockMask * 0.85);
          
          // GRASS TEXTURE with dirt patches and variation (under corn areas)
          // Start with darker green base
          vec3 grassAreaColor = grassDark;
          // Add grass color variation - mostly dark with some lighter patches
          grassAreaColor = mix(grassAreaColor, grassBase, fbm(worldUV * 2.5) * 0.35);
          grassAreaColor = mix(grassAreaColor, grassMoss, noise(worldUV * 3.0 + 300.0) * 0.25);
          
          // Add prominent dirt patches showing through grass
          float dirtPatches = fbm(worldUV * 1.0 + 400.0);
          float dirtPatchMask = smoothstep(0.35, 0.55, dirtPatches); // Lower threshold = more dirt
          vec3 dirtColor = mix(pathDark, pathBase, noise(worldUV * 2.0 + 500.0) * 0.6);
          grassAreaColor = mix(grassAreaColor, dirtColor, dirtPatchMask * 0.65); // Stronger dirt mix
          
          // Add more visible rocks/pebbles in grass areas - with rotation for organic shapes
          float grassRockAngle = hash3(floor(worldUV * 3.5 + 80.0)) * 6.28;
          vec2 grassRockCenter = fract(worldUV * 3.5 + 80.0) - 0.5;
          vec2 grassRotated = vec2(
            grassRockCenter.x * cos(grassRockAngle) - grassRockCenter.y * sin(grassRockAngle),
            grassRockCenter.x * sin(grassRockAngle) + grassRockCenter.y * cos(grassRockAngle)
          );
          float grassRockNoise = hash(floor(worldUV * 3.5 + 80.0));
          float grassRockShape = length(grassRotated * vec2(1.0, 0.65));
          float grassRocks = smoothstep(0.16, 0.08, grassRockShape) * step(0.78, grassRockNoise);
          // Smaller pebbles - circular is fine
          float pebbleNoise = hash(floor(worldUV * 7.0 + 120.0));
          float pebbleShape = length(fract(worldUV * 7.0 + 120.0) - 0.5);
          float pebbles = smoothstep(0.12, 0.06, pebbleShape) * step(0.82, pebbleNoise);
          float allRocks = max(grassRocks, pebbles * 0.8);
          grassAreaColor = mix(grassAreaColor, rockColor, allRocks * 0.85);
          
          vec3 finalColor = mix(pathColor, grassAreaColor, wallMask);
          
          // Apply exponential fog
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          finalColor = mix(finalColor, fogColor, clamp(fogFactor, 0.0, 1.0));
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
    
    return { material: mat, wallTexture: texture };
  }, [maze]);
  
  return <primitive object={material} attach="material" />;
};

// 3D Rocks using InstancedMesh with distance-only culling (no camera culling - too few rocks to matter)
const ROCK_CULL_DISTANCE = 15;

const ScatteredRocks = ({ rocks, playerStateRef }: { rocks: RockPosition[]; playerStateRef?: MutableRefObject<PlayerState> }) => {
  const meshRef = useRef<InstancedMesh>(null);
  const { camera } = useThree();
  const lastUpdateRef = useRef({ x: -999, z: -999, dirX: 0, dirZ: -1 });
  const initializedRef = useRef(false);
  
  const { geometry, material, rockTransforms } = useMemo(() => {
    const geo = new DodecahedronGeometry(1, 0);
    const mat = new MeshStandardMaterial({ color: "#7A6350", roughness: 0.9 });
    
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    
    const transforms: { matrix: any; x: number; z: number }[] = [];
    const tempObject = new Object3D();
    
    rocks.forEach((rock) => {
      // rock.radius is 0.04-0.10, we want very small visual rocks
      const visualScale = rock.radius * 0.6; // Small visual scale
      const seed = Math.floor(rock.x * 1000 + rock.z);
      const rotation = seededRandom(seed + 4) * Math.PI * 2;
      
      tempObject.position.set(rock.x, visualScale * 0.25, rock.z);
      tempObject.rotation.set(0, rotation, 0);
      tempObject.scale.set(visualScale * 1.2, visualScale * 0.5, visualScale);
      tempObject.updateMatrix();
      transforms.push({ matrix: tempObject.matrix.clone(), x: rock.x, z: rock.z });
    });
    
    return { geometry: geo, material: mat, rockTransforms: transforms };
  }, [rocks]);
  
  // Initialize all rocks on mount
  useEffect(() => {
    if (!meshRef.current || rockTransforms.length === 0) return;
    
    rockTransforms.forEach((t, i) => {
      meshRef.current!.setMatrixAt(i, t.matrix);
    });
    meshRef.current.count = rockTransforms.length;
    meshRef.current.instanceMatrix.needsUpdate = true;
    initializedRef.current = true;
  }, [rockTransforms]);
  
  // Distance-only culling - no camera direction culling (prevents rocks from disappearing on turn)
  useFrame(() => {
    if (!meshRef.current || !playerStateRef || !initializedRef.current) return;
    
    const px = playerStateRef.current.x;
    const pz = playerStateRef.current.y;
    
    // Throttle updates - only update when player moves significantly
    const dx = px - lastUpdateRef.current.x;
    const dz = pz - lastUpdateRef.current.z;
    const shouldUpdate = dx*dx + dz*dz >= 0.25 || lastUpdateRef.current.x === -999;
    
    if (!shouldUpdate) return;
    lastUpdateRef.current = { x: px, z: pz, dirX: 0, dirZ: 0 };
    
    const cullDistSq = ROCK_CULL_DISTANCE * ROCK_CULL_DISTANCE;
    let visibleCount = 0;
    
    // Two-pass: first count visible, then set matrices
    for (let i = 0; i < rockTransforms.length; i++) {
      const t = rockTransforms[i];
      const distSq = (px - t.x) ** 2 + (pz - t.z) ** 2;
      
      if (distSq < cullDistSq) {
        meshRef.current.setMatrixAt(visibleCount, t.matrix);
        visibleCount++;
      }
    }
    
    // Only update if count changed to avoid unnecessary GPU uploads
    if (meshRef.current.count !== visibleCount) {
      meshRef.current.count = visibleCount;
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });
  
  if (rocks.length === 0) return null;
  
  return (
    <instancedMesh 
      ref={meshRef} 
      args={[geometry, material, rocks.length]}
      castShadow
      frustumCulled={false}
    />
  );
};

// 3D Grass tufts - with distance + camera culling for performance
const GRASS_CULL_DISTANCE = 15; // Match corn culling distance
const GRASS_NEAR_DISTANCE = 3;  // No back-culling within this distance
const GRASS_BACK_CULL_DOT = -0.707; // cos(135°)

const GrassTufts = ({ maze, playerStateRef }: { maze: Maze; playerStateRef: MutableRefObject<PlayerState> }) => {
  const grass231 = useGLTF('/models/Grass_231.glb');
  const grass232 = useGLTF('/models/Grass_232.glb');
  const groupRef = useRef<any>(null);
  const { camera } = useThree();
  const lastUpdateRef = useRef({ x: -999, z: -999, dirX: 0, dirZ: -1 });
  const visibleRef = useRef<number[]>([]);
  const [, forceUpdate] = useState(0);
  
  // Pre-calculate all grass positions once
  const allGrassData = useMemo(() => {
    const positions: { x: number; z: number; scale: number; rotation: number; type: 1 | 2 }[] = [];
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    
    const mazeWidth = maze.grid[0].length;
    const mazeHeight = maze.grid.length;
    
    // Place grass on ~1/3 of wall edges facing paths (reduced for performance)
    for (let y = 1; y < mazeHeight - 1; y++) {
      for (let x = 1; x < mazeWidth - 1; x++) {
        if (!maze.grid[y][x].isWall) continue;
        
        const seed = x * 2000 + y + 5000;
        
        const pathRight = x < mazeWidth - 1 && !maze.grid[y][x+1].isWall;
        const pathLeft = x > 0 && !maze.grid[y][x-1].isWall;
        const pathDown = y < mazeHeight - 1 && !maze.grid[y+1][x].isWall;
        const pathUp = y > 0 && !maze.grid[y-1][x].isWall;
        
        // Only place grass 33% of the time on each edge
        if (pathRight && seededRandom(seed + 500) < 0.33) {
          positions.push({
            x: x + 0.55 + seededRandom(seed) * 0.2,
            z: y + 0.3 + seededRandom(seed + 1) * 0.4,
            scale: 0.10 + seededRandom(seed + 2) * 0.05,
            rotation: seededRandom(seed + 3) * Math.PI * 2,
            type: seededRandom(seed + 4) > 0.5 ? 1 : 2,
          });
        }
        if (pathLeft && seededRandom(seed + 600) < 0.33) {
          positions.push({
            x: x + 0.25 + seededRandom(seed + 100) * 0.2,
            z: y + 0.3 + seededRandom(seed + 101) * 0.4,
            scale: 0.10 + seededRandom(seed + 102) * 0.05,
            rotation: seededRandom(seed + 103) * Math.PI * 2,
            type: seededRandom(seed + 104) > 0.5 ? 1 : 2,
          });
        }
        if (pathDown && seededRandom(seed + 700) < 0.33) {
          positions.push({
            x: x + 0.3 + seededRandom(seed + 200) * 0.4,
            z: y + 0.55 + seededRandom(seed + 201) * 0.2,
            scale: 0.10 + seededRandom(seed + 202) * 0.05,
            rotation: seededRandom(seed + 203) * Math.PI * 2,
            type: seededRandom(seed + 204) > 0.5 ? 1 : 2,
          });
        }
        if (pathUp && seededRandom(seed + 800) < 0.33) {
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
    
    return positions;
  }, [maze]);
  
  // Pre-clone all scenes once
  const clonedScenes = useMemo(() => {
    return allGrassData.map((tuft) => {
      const scene = (tuft.type === 1 ? grass231 : grass232).scene.clone();
      scene.position.set(tuft.x, 0, tuft.z);
      scene.rotation.set(0, tuft.rotation, 0);
      const s = tuft.scale * 0.04;
      scene.scale.set(s, s, s);
      return scene;
    });
  }, [allGrassData, grass231, grass232]);
  
  // Update visible grass based on player distance + camera direction
  useFrame(() => {
    const px = playerStateRef.current.x;
    const pz = playerStateRef.current.y;
    
    // Get camera direction
    const camDir = new Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();
    
    // Throttle updates
    const dx = px - lastUpdateRef.current.x;
    const dz = pz - lastUpdateRef.current.z;
    const camDx = camDir.x - lastUpdateRef.current.dirX;
    const camDz = camDir.z - lastUpdateRef.current.dirZ;
    const shouldUpdate = dx*dx + dz*dz >= 0.25 || camDx*camDx + camDz*camDz >= 0.01 || lastUpdateRef.current.x === -999;
    
    if (!shouldUpdate) return;
    lastUpdateRef.current = { x: px, z: pz, dirX: camDir.x, dirZ: camDir.z };
    
    const cullDistSq = GRASS_CULL_DISTANCE * GRASS_CULL_DISTANCE;
    const nearDistSq = GRASS_NEAR_DISTANCE * GRASS_NEAR_DISTANCE;
    
    const visible: number[] = [];
    for (let i = 0; i < allGrassData.length; i++) {
      const g = allGrassData[i];
      const distSq = (g.x - px) ** 2 + (g.z - pz) ** 2;
      
      if (distSq >= cullDistSq) continue;
      
      // Camera culling only for distant grass
      if (distSq >= nearDistSq) {
        const toGrassX = g.x - px;
        const toGrassZ = g.z - pz;
        const len = Math.sqrt(distSq);
        const dot = (toGrassX / len) * camDir.x + (toGrassZ / len) * camDir.z;
        if (dot <= GRASS_BACK_CULL_DOT) continue;
      }
      
      visible.push(i);
    }
    
    // Only update if changed
    if (visible.length !== visibleRef.current.length || 
        visible.some((v, idx) => visibleRef.current[idx] !== v)) {
      visibleRef.current = visible;
      forceUpdate(n => n + 1);
    }
  });
  
  return (
    <group ref={groupRef}>
      {visibleRef.current.map((i) => (
        <primitive key={i} object={clonedScenes[i]} />
      ))}
    </group>
  );
};

// Ground with grass/path differentiation based on wall data
const Ground = ({ maze, rocks, playerStateRef }: { maze: Maze; rocks: RockPosition[]; playerStateRef: MutableRefObject<PlayerState> }) => {
  const width = maze.grid[0].length;
  const height = maze.grid.length;
  const planeWidth = width + 10;
  const planeHeight = height + 10;
  const centerX = width / 2;
  const centerZ = height / 2;
  
  return (
    <group>
      {/* Textured ground at y=0 */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[centerX, 0, centerZ]}
      >
        <planeGeometry args={[planeWidth, planeHeight, 1, 1]} />
        <GroundMaterial maze={maze} />
      </mesh>
      
      {/* Shadow receiving plane slightly above to avoid z-fighting */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[centerX, 0.001, centerZ]}
        receiveShadow
      >
        <planeGeometry args={[planeWidth, planeHeight, 1, 1]} />
        <shadowMaterial transparent opacity={0.4} />
      </mesh>
      
      {/* 3D Props for visual depth (toggleable for performance testing) */}
      {ENABLE_3D_ROCKS && <ScatteredRocks rocks={rocks} playerStateRef={playerStateRef} />}
      {ENABLE_3D_GRASS && <GrassTufts maze={maze} playerStateRef={playerStateRef} />}
    </group>
  );
};


const MazeWalls = ({ maze, playerStateRef, optimizationSettings, onCullStats }: { 
  maze: Maze; 
  playerStateRef?: React.MutableRefObject<{ x: number; y: number }>;
  optimizationSettings?: CornOptimizationSettings;
  onCullStats?: (stats: CullStats) => void;
}) => {
  const { edgePositions, depthOnlyWalls, boundaryWalls } = useMemo(() => {
    const maxX = maze.grid[0].length - 1;
    const maxZ = maze.grid.length - 1;
    
    // Helper to check if a cell is a path (not wall)
    const isPath = (cellX: number, cellY: number) => {
      if (cellX < 0 || cellX > maxX || cellY < 0 || cellY > maxZ) return false;
      return !maze.grid[cellY][cellX].isWall;
    };
    
    // Track which edges of each wall cell face a path
    // Key: "x,z", Value: array of directions ['left', 'right', 'top', 'bottom']
    const wallEdges = new Map<string, ('left' | 'right' | 'top' | 'bottom')[]>();
    
    // For each wall cell, check which sides face a path
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isWall) {
          const edges: ('left' | 'right' | 'top' | 'bottom')[] = [];
          if (isPath(x - 1, y)) edges.push('left');
          if (isPath(x + 1, y)) edges.push('right');
          if (isPath(x, y - 1)) edges.push('top');    // z decreases = top
          if (isPath(x, y + 1)) edges.push('bottom'); // z increases = bottom
          
          if (edges.length > 0) {
            wallEdges.set(`${x},${y}`, edges);
          }
        }
      });
    });
    
    // Build edge positions (only the stalks on edges facing paths)
    const edges: { x: number; z: number; edges: ('left' | 'right' | 'top' | 'bottom')[] }[] = [];
    const depthOnly: { x: number; z: number; avoidEdges?: ('left' | 'right' | 'top' | 'bottom')[] }[] = [];
    const boundary: { x: number; z: number; offsetX: number; offsetZ: number }[] = [];
    
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isWall) {
          const isBoundary = x === 0 || x === maxX || y === 0 || y === maxZ;
          const cellEdges = wallEdges.get(`${x},${y}`);
          
          if (isBoundary) {
            // Boundary walls
            let offsetX = 0;
            let offsetZ = 0;
            if (x === 0) offsetX = -1.5;
            if (x === maxX) offsetX = 1.5;
            if (y === 0) offsetZ = -1.5;
            if (y === maxZ) offsetZ = 1.5;
            boundary.push({ x, z: y, offsetX, offsetZ });
            
            // Also add edge stalks if this boundary wall touches a path
            if (cellEdges) {
              edges.push({ x, z: y, edges: cellEdges });
            }
          } else if (cellEdges) {
            // Interior wall with path-facing edges
            edges.push({ x, z: y, edges: cellEdges });
            // Also add to depth-only with edges to avoid
            depthOnly.push({ x, z: y, avoidEdges: cellEdges });
          } else {
            // Depth-only wall - not adjacent to any path, no edges to avoid
            depthOnly.push({ x, z: y });
          }
        }
      });
    });
    
    return { 
      edgePositions: edges, 
      depthOnlyWalls: depthOnly, 
      boundaryWalls: boundary 
    };
  }, [maze]);

  return (
    <InstancedWalls 
      edgePositions={edgePositions}
      noShadowPositions={depthOnlyWalls}
      boundaryPositions={boundaryWalls}
      playerPositionRef={playerStateRef}
      optimizationSettings={optimizationSettings}
      onCullStats={onCullStats}
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

const MapStation = ({ position, showCollisionDebug = true }: { position: [number, number, number]; showCollisionDebug?: boolean }) => {
  const COLLISION_RADIUS = 0.12; // Tiny collision radius
  
  return (
    <group position={position}>
      {/* Tower base - height=1, positioned at y=0.5 means bottom is at y=0 */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 1, 8]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      {/* Tower sign */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.05]} />
        <meshStandardMaterial color="#DEB887" />
      </mesh>
      
      {/* Debug collision ring only */}
      {showCollisionDebug && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[COLLISION_RADIUS - 0.02, COLLISION_RADIUS + 0.02, 32]} />
          <meshBasicMaterial color="#ff0000" transparent opacity={0.7} side={2} />
        </mesh>
      )}
    </group>
  );
};

// Unified character renderer - works for end farmer, placed characters, and legacy dialogue characters
// Single source of truth for character rendering, facing logic, and animation
interface CharacterRendererProps {
  modelFile: string;
  position: { x: number; y: number };
  animation?: string;
  playerStateRef?: MutableRefObject<PlayerState>;
  isDialogueActive: boolean;
  isGoalMarker?: boolean; // If true, renders invisible collision trigger
  alwaysFacePlayer?: boolean; // If true, character always faces player even outside dialogue
}

const CharacterRenderer = ({
  modelFile,
  position,
  animation,
  playerStateRef,
  isDialogueActive,
  isGoalMarker = false,
  alwaysFacePlayer = false,
}: CharacterRendererProps) => {
  const groupRef = useRef<Group>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  
  const modelPath = `/models/${modelFile}`;
  const { scene, animations } = useGLTF(modelPath);
  
  // Get character scale and Y offset from centralized config
  const characterScale = getCharacterScale(modelFile);
  const characterYOffset = getCharacterYOffset(modelFile);
  
  // Clone the scene using SkeletonUtils for skinned meshes
  const model = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);
  
  // Set up animation mixer
  useEffect(() => {
    if (animations.length > 0 && model) {
      mixerRef.current = new AnimationMixer(model);
      
      // Find matching animation or use first one
      const targetAnim = animation 
        ? animations.find((a: any) => 
            a.name.toLowerCase().includes(animation.toLowerCase())
          ) 
        : null;
      
      const animToPlay = targetAnim || animations[0];
      
      if (animToPlay) {
        const action = mixerRef.current.clipAction(animToPlay);
        action.play();
      }
    }
    
    return () => {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
      }
    };
  }, [animations, model, animation]);
  
  useFrame((state, delta) => {
    if (groupRef.current && playerStateRef) {
      // Only face player during dialogue OR if alwaysFacePlayer is set
      if (isDialogueActive || alwaysFacePlayer) {
        const charX = position.x + 0.5;
        const charZ = position.y + 0.5;
        const playerX = playerStateRef.current.x;
        const playerZ = playerStateRef.current.y;
        
        const dx = playerX - charX;
        const dz = playerZ - charZ;
        const angle = Math.atan2(dx, dz);
        groupRef.current.rotation.y = angle;
      }
    }
    
    // Update animation mixer
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  return (
    <group position={[position.x + 0.5, characterYOffset, position.y + 0.5]}>
      <group ref={groupRef}>
        <primitive object={model} scale={characterScale} />
      </group>
      {/* Invisible collision trigger for goal marker */}
      {isGoalMarker && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} visible={false}>
          <circleGeometry args={[0.8, 16]} />
          <meshStandardMaterial color="#22c55e" transparent opacity={0} />
        </mesh>
      )}
    </group>
  );
};

// GoalMarker - wraps CharacterRenderer for the end farmer
const GoalMarker = ({ position, playerStateRef, isDialogueActive }: { 
  position: [number, number, number];
  playerStateRef?: MutableRefObject<PlayerState>;
  isDialogueActive?: boolean;
}) => {
  return (
    <CharacterRenderer
      modelFile="Farmer.glb"
      position={{ x: position[0], y: position[2] }}
      animation="wave"
      playerStateRef={playerStateRef}
      isDialogueActive={isDialogueActive || false}
      isGoalMarker={true}
    />
  );
};

// PlacedCharacter - wraps CharacterRenderer for maze.characters array
const PlacedCharacter = ({ 
  character, 
  playerStateRef,
  isDialogueActive,
}: { 
  character: MazeCharacter;
  playerStateRef?: MutableRefObject<PlayerState>;
  isDialogueActive: boolean;
}) => {
  return (
    <CharacterRenderer
      modelFile={character.model}
      position={character.position}
      animation={character.animation}
      playerStateRef={playerStateRef}
      isDialogueActive={isDialogueActive}
      alwaysFacePlayer={character.alwaysFacePlayer}
    />
  );
};

// DialogueCharacter - wraps CharacterRenderer for legacy dialogues with characterModel/speakerPosition
const DialogueCharacter = ({ 
  dialogue, 
  playerStateRef,
  isActiveDialogue,
}: { 
  dialogue: DialogueTrigger;
  playerStateRef?: MutableRefObject<PlayerState>;
  isActiveDialogue: boolean;
}) => {
  const position = useMemo(() => {
    if (dialogue.speakerPosition) {
      return { x: dialogue.speakerPosition.x, y: dialogue.speakerPosition.y };
    }
    if (dialogue.cells.length > 0) {
      return { x: dialogue.cells[0].x, y: dialogue.cells[0].y };
    }
    return { x: 0, y: 0 };
  }, [dialogue]);
  
  return (
    <CharacterRenderer
      modelFile={dialogue.characterModel || 'Farmer.glb'}
      position={position}
      animation={dialogue.characterAnimation}
      playerStateRef={playerStateRef}
      isDialogueActive={isActiveDialogue}
    />
  );
};

// Player wrapper that handles movement + rendering in sync
const RefBasedPlayer = ({
  animalType, 
  playerStateRef, 
  isMovingRef,
  maze,
  keysPressed,
  rotationIntensityRef,
  speedBoostActive,
  onCellInteraction,
  isPaused,
  isMuted,
  rocks,
  characters,
  showCollisionDebug = true,
}: { 
  animalType: AnimalType;
  playerStateRef: MutableRefObject<PlayerState>;
  isMovingRef: MutableRefObject<boolean>;
  maze: Maze;
  keysPressed: MutableRefObject<Set<string>>;
  rotationIntensityRef?: MutableRefObject<number>;
  speedBoostActive: boolean;
  onCellInteraction: (x: number, y: number) => void;
  isPaused: boolean;
  isMuted?: boolean;
  rocks: RockPosition[];
  characters: CharacterPosition[];
  showCollisionDebug?: boolean;
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
      const isKeyboardRotation = keysPressed.current.has('arrowleft') || keysPressed.current.has('a') || 
                                 keysPressed.current.has('arrowright') || keysPressed.current.has('d');
      const input: MovementInput = {
        forward: keysPressed.current.has('arrowup') || keysPressed.current.has('w'),
        backward: keysPressed.current.has('arrowdown') || keysPressed.current.has('s'),
        rotateLeft: keysPressed.current.has('arrowleft') || keysPressed.current.has('a'),
        rotateRight: keysPressed.current.has('arrowright') || keysPressed.current.has('d'),
        // Use full intensity for keyboard, ref value for mobile touch
        rotationIntensity: isKeyboardRotation ? 1.0 : (rotationIntensityRef?.current ?? 1.0),
      };
      
      // Update isMoving ref
      isMovingRef.current = input.forward || input.backward;
      
      // Calculate movement with clamped delta (smooth per-frame updates)
      const prev = playerStateRef.current;
      const newState = calculateMovement(maze, prev, input, clampedDelta, speedBoostActive, rocks, animalType, characters);
      playerStateRef.current = newState;
      
      // Only check interactions when entering a new cell
      const currentCellX = Math.floor(newState.x);
      const currentCellY = Math.floor(newState.y);
      if (currentCellX !== lastCellRef.current.x || currentCellY !== lastCellRef.current.y) {
        lastCellRef.current = { x: currentCellX, y: currentCellY };
        onCellInteraction(newState.x, newState.y);
      }
    } else {
      // When paused (including dialogue), freeze movement
      isMovingRef.current = false;
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
        enableSound={!isPaused && !isMuted}
        showCollisionDebug={showCollisionDebug}
      />
    </group>
  );
};

// Simple over-the-shoulder camera with smooth follow - reads from ref each frame
const OverShoulderCameraController = ({ 
  playerStateRef,
  restartKey,
  topDownCamera = false,
  groundLevelCamera = false,
}: { 
  playerStateRef: MutableRefObject<PlayerState>;
  restartKey?: number;
  topDownCamera?: boolean;
  groundLevelCamera?: boolean;
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
  
  // Track if player has moved and camera distance
  const initialPlayerPos = useRef<{ x: number; z: number } | null>(null);
  const hasPlayerMoved = useRef(false);
  const currentDistance = useRef(0.4); // Start very close
  const lastRestartKey = useRef(restartKey);
  
  // Reset camera state when restartKey changes
  useEffect(() => {
    if (restartKey !== lastRestartKey.current) {
      lastRestartKey.current = restartKey;
      initialized.current = false;
      hasPlayerMoved.current = false;
      initialPlayerPos.current = null;
      currentDistance.current = 0.4;
    }
  }, [restartKey]);
  
  // Camera settings - over-the-shoulder view balanced for all animals
  const DEBUG_OVERHEAD_VIEW = topDownCamera; // Use prop for toggle
  
  const CAMERA_DISTANCE_START = 0.4;
  const CAMERA_DISTANCE_NORMAL = 2.0;
  const CAMERA_HEIGHT_START = 1.8;
  const CAMERA_HEIGHT_NORMAL = 2.4;
  const LOOK_AHEAD = 1.3;
  const LOOK_HEIGHT_START = 0.0;
  const LOOK_HEIGHT_NORMAL = 0.5;
  const POSITION_SMOOTHING = 0.15;
  const ROTATION_SMOOTHING = 0.12;
  const DISTANCE_ZOOM_SPEED = 0.02; // How fast camera pulls back
  const MOVEMENT_THRESHOLD = 0.3; // How far player must move from spawn to trigger zoom
  
  useFrame(() => {
    const { x: playerX, y: playerZ, rotation: playerRotation } = playerStateRef.current;
    
    // Store initial position on first frame (after initialization)
    if (initialized.current && initialPlayerPos.current === null) {
      initialPlayerPos.current = { x: playerX, z: playerZ };
    }
    
    // Check if player has moved from their initial spawn position
    if (!hasPlayerMoved.current && initialPlayerPos.current !== null) {
      const dx = playerX - initialPlayerPos.current.x;
      const dz = playerZ - initialPlayerPos.current.z;
      const distFromSpawn = Math.sqrt(dx * dx + dz * dz);
      if (distFromSpawn > MOVEMENT_THRESHOLD) {
        hasPlayerMoved.current = true;
      }
    }
    
    // Smoothly zoom camera out after player moves
    if (hasPlayerMoved.current && currentDistance.current < CAMERA_DISTANCE_NORMAL) {
      currentDistance.current += (CAMERA_DISTANCE_NORMAL - currentDistance.current) * DISTANCE_ZOOM_SPEED;
    }
    
    // Calculate current height based on distance progress
    const distanceProgress = (currentDistance.current - CAMERA_DISTANCE_START) / (CAMERA_DISTANCE_NORMAL - CAMERA_DISTANCE_START);
    const currentHeight = CAMERA_HEIGHT_START + distanceProgress * (CAMERA_HEIGHT_NORMAL - CAMERA_HEIGHT_START);
    
    // Initialize on first frame BEFORE any calculations
    if (!initialized.current) {
      smoothRotation.current = playerRotation;
      initialPlayerPos.current = { x: playerX, z: playerZ };
      const rot = playerRotation;
      // Set camera position immediately without interpolation (start close)
      currentPosition.current.set(
        playerX - Math.sin(rot) * CAMERA_DISTANCE_START,
        CAMERA_HEIGHT_START,
        playerZ + Math.cos(rot) * CAMERA_DISTANCE_START
      );
      currentLookAt.current.set(
        playerX + Math.sin(rot) * LOOK_AHEAD,
        LOOK_HEIGHT_START,
        playerZ - Math.cos(rot) * LOOK_AHEAD
      );
      initialized.current = true;
    }
    
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
      playerX - Math.sin(rot) * currentDistance.current,
      currentHeight,
      playerZ + Math.cos(rot) * currentDistance.current
    );
    
    // Calculate look target ahead of player (reuse vector to avoid GC)
    const currentLookHeight = LOOK_HEIGHT_START + distanceProgress * (LOOK_HEIGHT_NORMAL - LOOK_HEIGHT_START);
    targetLookAt.current.set(
      playerX + Math.sin(rot) * LOOK_AHEAD,
      currentLookHeight,
      playerZ - Math.cos(rot) * LOOK_AHEAD
    );
    
    // Smooth position interpolation
    currentPosition.current.lerp(targetPos.current, POSITION_SMOOTHING);
    currentLookAt.current.lerp(targetLookAt.current, POSITION_SMOOTHING);
    
    // Apply to camera
    if (groundLevelCamera) {
      // Ground level debug view - camera at ground level, looking at player from side
      const sideOffset = 2.5; // Distance to the side
      camera.position.set(
        playerX + Math.cos(rot) * sideOffset,
        0.15, // Very low - almost at ground level
        playerZ + Math.sin(rot) * sideOffset
      );
      camera.lookAt(playerX, 0.15, playerZ);
    } else if (DEBUG_OVERHEAD_VIEW) {
      // Overhead debug view - look straight down at player
      camera.position.set(playerX, 5, playerZ);
      camera.lookAt(playerX, 0, playerZ);
    } else {
      camera.position.copy(currentPosition.current);
      camera.lookAt(currentLookAt.current);
    }
  });

  return null;
};

// Preload farmer model
useGLTF.preload('/models/Farmer.glb');

// (DialogueSpeaker removed - we use the single GoalMarker farmer instead)
// Cutscene camera controller - look at the active dialogue speaker
const CutsceneCameraController = ({ 
  playerStateRef,
  dialogueTarget,
}: { 
  playerStateRef: MutableRefObject<PlayerState>;
  dialogueTarget: DialogueTarget;
}) => {
  const { camera } = useThree();
  
  const CAMERA_HEIGHT = 1.0;  // Lower camera for better framing
  const LOOK_HEIGHT = 0.9;   // Look at farmer's chest/face level
  const ZOOM_DISTANCE = 1.8; // Closer to center the farmer
  
  useFrame(() => {
    const playerX = playerStateRef.current.x;
    const playerZ = playerStateRef.current.y;
    
    // Speaker is at dialogueTarget position + 0.5 (center of cell)
    const speakerX = dialogueTarget.speakerX + 0.5;
    const speakerZ = dialogueTarget.speakerZ + 0.5;
    
    // Calculate direction from speaker to player
    const dx = playerX - speakerX;
    const dz = playerZ - speakerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    let dirX: number, dirZ: number;
    if (dist < 0.5) {
      // Player very close - use player's facing direction
      const playerRot = playerStateRef.current.rotation;
      dirX = -Math.sin(playerRot);
      dirZ = Math.cos(playerRot);
    } else {
      // Position camera on player's side of speaker
      dirX = dx / dist;
      dirZ = dz / dist;
    }
    
    // Position camera ZOOM_DISTANCE away from speaker, toward player
    const camX = speakerX + dirX * ZOOM_DISTANCE;
    const camZ = speakerZ + dirZ * ZOOM_DISTANCE;
    
    camera.position.set(camX, CAMERA_HEIGHT, camZ);
    camera.up.set(0, 1, 0);
    camera.lookAt(speakerX, LOOK_HEIGHT, speakerZ);
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

const Scene = ({ maze, animalType, playerStateRef, isMovingRef, collectedPowerUps = new Set(), keysPressed, rotationIntensityRef, speedBoostActive, onCellInteraction, isPaused, isMuted, onSceneReady, cornOptimizationSettings, onCullStats, restartKey, dialogueTarget, topDownCamera = false, groundLevelCamera = false, showCollisionDebug = true }: Maze3DSceneProps) => {
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

  // Generate character positions for collision (all placed characters + map stations)
  const CHARACTER_COLLISION_RADIUS = 0.1;
  const STATION_COLLISION_RADIUS = 0.12; // Tiny - barely perceptible
  const STATION_ROTATION_RADIUS = 0.10; // Even smaller for rotation
  const characterPositions = useMemo<CharacterPosition[]>(() => {
    const positions: CharacterPosition[] = [];
    
    // Add placed characters from maze.characters
    maze.characters?.forEach((char) => {
      positions.push({
        x: char.position.x,
        y: char.position.y,
        radius: CHARACTER_COLLISION_RADIUS,
      });
    });
    
    // Add map station towers as collision objects (with smaller rotation radius)
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isStation) {
          positions.push({
            x: x, // Grid position (collision check adds 0.5 for center)
            y: y,
            radius: STATION_COLLISION_RADIUS,
            rotationRadius: STATION_ROTATION_RADIUS, // Smaller radius allows turning at edge
            isStation: true,
          });
        }
      });
    });
    
    return positions;
  }, [maze]);

  const items = useMemo(() => {
    const powerUps: { pos: [number, number, number]; key: string }[] = [];
    const stations: [number, number, number][] = [];

    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isPowerUp) {
          powerUps.push({ pos: [x + 0.5, 0.5, y + 0.5], key: `${x},${y}` });
        }
        if (cell.isStation) {
          stations.push([x + 0.5, 0, y + 0.5]);
        }
      });
    });
    
    return { powerUps, stations };
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

  // Sky gradient shader material
  const skyMaterial = useMemo(() => {
    return new ShaderMaterial({
      uniforms: {
        topColor: { value: new Color('#8BA4C7') },      // Soft cornflower blue
        horizonColor: { value: new Color('#E8D8C8') },  // Warm peach/cream
        bottomColor: { value: new Color('#D8C8B8') },   // Matches fog
        offset: { value: 0.4 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          // Above horizon: blend from horizon to sky
          if (h > 0.0) {
            float t = pow(max(h, 0.0), exponent);
            gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
          } else {
            // Below horizon: blend to bottom color (for ground reflection)
            gl_FragColor = vec4(mix(horizonColor, bottomColor, min(-h * 2.0, 1.0)), 1.0);
          }
        }
      `,
      side: BackSide,
      depthWrite: false,
    });
  }, []);

return (
    <>
      {/* === GRADIENT SKY DOME === */}
      <mesh scale={[80, 80, 80]}>
        <sphereGeometry args={[1, 32, 16]} />
        <primitive object={skyMaterial} attach="material" />
      </mesh>
      
      {/* === GHIBLI LIGHTING MIX === */}
      {/* Hemisphere light - stronger for softer shadows with subtle purple/blue tint in shadows */}
      <hemisphereLight args={['#A8C0E0', '#8B9F7A', 1.1]} />
      
      {/* Main sun light - warm amber/golden hour tone, lower angle (30-45 deg) */}
      <directionalLight
        ref={lightRef}
        position={[20, 18, 15]}
        intensity={3.2}
        color="#FFD8A0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-bias={-0.0003}
        shadow-radius={4}
      >
        <object3D attach="target" />
      </directionalLight>
      
      {/* Fill light from opposite side - cool sky blue for shadow fill */}
      <directionalLight
        position={[-18, 10, -12]}
        intensity={0.8}
        color="#B0C8E8"
      />
      
      {/* Subtle back rim light for character pop - golden */}
      <directionalLight
        position={[-5, 6, -25]}
        intensity={0.4}
        color="#FFE0B0"
      />
      
      {/* === SKY-FOG GLUE === */}
      {/* Background color as fallback - matches horizon */}
      <color attach="background" args={['#E8D8C8']} />
      
{/* Much denser fog to fully hide corn culling in distance */}
      <fogExp2 attach="fog" args={['#D8C8B8', 0.22]} />
      
      {/* Ground */}
      <Ground maze={maze} rocks={rocks} playerStateRef={playerStateRef} />
      
      {/* Maze Walls (corn) with optimizations */}
      <MazeWalls 
        maze={maze} 
        playerStateRef={playerStateRef}
        optimizationSettings={cornOptimizationSettings}
        onCullStats={onCullStats}
      />
      
      {/* Power-ups */}
      {visiblePowerUps.map((p, i) => (
        <PowerUp key={`powerup-${p.key}`} position={p.pos} />
      ))}
      
      {/* Map Stations */}
      {items.stations.map((pos, i) => (
        <MapStation key={`station-${i}`} position={pos} />
      ))}
      
      {/* Placed Characters from maze.characters array */}
      {maze.characters?.map((character) => (
        <PlacedCharacter
          key={`placed-char-${character.id}`}
          character={character}
          playerStateRef={playerStateRef}
          isDialogueActive={
            dialogueTarget !== null && 
            Math.abs(dialogueTarget.speakerX - character.position.x) < 0.5 &&
            Math.abs(dialogueTarget.speakerZ - character.position.y) < 0.5
          }
        />
      ))}
      
      {/* Dialogue Characters - render characters for dialogues with characterModel and speakerPosition (legacy) */}
      {maze.dialogues?.filter(d => d.characterModel && d.speakerPosition && !d.speakerCharacterId).map((dialogue) => (
        <DialogueCharacter
          key={`dialogue-char-${dialogue.id}`}
          dialogue={dialogue}
          playerStateRef={playerStateRef}
          isActiveDialogue={dialogueTarget !== null && dialogueTarget !== undefined}
        />
      ))}
      
      {/* Note: GoalMarker removed - farmer is now a regular PlacedCharacter */}
      
      {/* Player - handles movement + rendering in sync */}
      <RefBasedPlayer 
        animalType={animalType}
        playerStateRef={playerStateRef}
        isMovingRef={isMovingRef}
        maze={maze}
        keysPressed={keysPressed}
        rotationIntensityRef={rotationIntensityRef}
        speedBoostActive={speedBoostActive}
        onCellInteraction={onCellInteraction}
        isPaused={isPaused}
        isMuted={isMuted}
        rocks={rocks}
        characters={characterPositions}
        showCollisionDebug={showCollisionDebug}
      />
      
      {/* Camera - use cutscene camera during dialogue, otherwise normal follow */}
      {dialogueTarget ? (
        <>
          <CutsceneCameraController 
            playerStateRef={playerStateRef}
            dialogueTarget={dialogueTarget}
          />
        </>
      ) : (
        <OverShoulderCameraController 
          playerStateRef={playerStateRef}
          restartKey={restartKey}
          topDownCamera={topDownCamera}
          groundLevelCamera={groundLevelCamera}
        />
      )}
    </>
  );
};

// Component to track and report renderer info (throttled to avoid state churn)
const RendererInfoTracker = ({ onRendererInfo }: { onRendererInfo?: (info: PerformanceInfo) => void }) => {
  const { gl, scene } = useThree();
  const lastUpdate = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTime = useRef(performance.now());
  
  useFrame(() => {
    const now = performance.now();
    const frameTime = now - lastFrameTime.current;
    lastFrameTime.current = now;
    
    // Keep last 30 frame times for averaging
    frameTimesRef.current.push(frameTime);
    if (frameTimesRef.current.length > 30) {
      frameTimesRef.current.shift();
    }
    
    if (onRendererInfo) {
      if (now - lastUpdate.current > 250) { // Update every 250ms for more responsive metrics
        lastUpdate.current = now;
        
        // Calculate average frame time
        const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        
        onRendererInfo({
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length || 0,
          frameTime: avgFrameTime,
        });
      }
    }
  });
  
  return null;
};

export const Maze3DCanvas = (props: Maze3DSceneProps) => {
  const [fps, setFps] = useState(0);
  const [cullStats, setCullStats] = useState<CullStats | null>(null);
  
  // Detect mobile for pixel ratio capping
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
      || window.innerWidth < 768;
  }, []);
  
  // Pixel ratio: use low (0.5) if testing, otherwise auto-detect
  const basePixelRatio = isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio;
  const pixelRatio = props.lowPixelRatio ? 0.5 : basePixelRatio;
  
  return (
    <div className="w-full h-full">
      {/* FPS Display - only in debug mode */}
      {props.debugMode && <FPSDisplay fps={fps} />}
      
      {/* Cull Stats Overlay - only in debug mode */}
      {props.debugMode && cullStats && props.cornOptimizationSettings?.enableDistanceCulling && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          left: '10px',
          background: 'rgba(0,0,0,0.85)',
          color: '#0f0',
          padding: '8px 12px',
          borderRadius: '6px',
          fontFamily: 'monospace',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          border: '1px solid #0f0',
          zIndex: 1000,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#ff0' }}>CULL STATS</div>
          <div>Edge: {cullStats.edgeVisible}/{cullStats.edgeTotal}</div>
          <div>Cheap: {cullStats.cheapVisible}/{cullStats.cheapTotal}</div>
          <div style={{ 
            color: cullStats.edgeVisible + cullStats.cheapVisible < 500 ? '#0f0' : '#f00',
            fontWeight: 'bold',
            marginTop: '4px',
            borderTop: '1px solid #333',
            paddingTop: '4px'
          }}>
            Total Visible: {cullStats.edgeVisible + cullStats.cheapVisible}
          </div>
        </div>
      )}
      
      <Canvas 
        shadows 
        gl={{ 
          logarithmicDepthBuffer: true, 
          antialias: !isMobile && !props.lowPixelRatio,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
          failIfMajorPerformanceCaveat: false,
        }} 
        dpr={pixelRatio}
        frameloop="always"
        performance={{ min: 0.1 }}
      >
        <PerspectiveCamera makeDefault fov={60} near={0.1} far={100} />
        <Scene {...props} onCullStats={setCullStats} />
        <FPSTracker onFpsUpdate={setFps} />
        <RendererInfoTracker onRendererInfo={props.onRendererInfo} />
      </Canvas>
    </div>
  );
};
