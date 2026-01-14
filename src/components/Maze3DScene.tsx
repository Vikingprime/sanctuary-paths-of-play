import { useRef, useMemo, useEffect, MutableRefObject, useState, forwardRef } from 'react';
import { Canvas, useFrame, useThree, extend, useLoader } from '@react-three/fiber';
import { PerspectiveCamera, ContactShadows, useGLTF, Html } from '@react-three/drei';
import { Vector3, ShaderMaterial, Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, Object3D, InstancedMesh, MeshStandardMaterial, DodecahedronGeometry, Group, AnimationMixer, Mesh, Material, Raycaster, BoxGeometry, MeshBasicMaterial, DoubleSide, Matrix4, PlaneGeometry, BackSide, SRGBColorSpace, TextureLoader, RepeatWrapping, ClampToEdgeWrapping } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Maze, AnimalType, DialogueTrigger, MazeCharacter } from '@/types/game';
import { InstancedWalls, CornOptimizationSettings, DEFAULT_CORN_SETTINGS, CullStats, setCellOpacity } from './CornWall';
import { PlayerCube } from './PlayerCube';
import { PlayerState, MovementInput, calculateMovement, generateRockPositions, RockPosition, CharacterPosition, checkCharacterCollision } from '@/game/GameLogic';
import { getCharacterScale, getCharacterYOffset, getCharacterHeight, getCharacterDebugPlaneColor } from '@/game/CharacterConfig';
import { findBestDirectionAngle } from '@/game/MazeUtils';
import { calculateFadeFactor, useOpacityFade } from './FogFadeMaterial';
import { getAutopushEnabled, getLOSFaderEnabled, frameMetrics, checkGcSpike } from '@/lib/debug';
import { MOBILE_CONTROL_CONFIG } from './MobileControls';
// LOSCornFader removed - corn fading is now integrated into CameraController's autopush logic

// ============= UNIFIED FOG/ATMOSPHERE COLOR =============
// Single source of truth for fog, sky horizon, and ground shader fog
// Gray-fog color that sits below the treeline in the sky image
const ATMOSPHERE_COLOR = '#A8A090';  // Gray-beige fog matching distant haze
// Extended performance info type
export interface PerformanceInfo {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  frameTime: number;
  gpuTime?: number;
  // Per-frame debug metrics
  raycastCount?: number;
  activeFadedCells?: number;
  collisionChecks?: number;
  // New diagnostic metrics
  playerX?: number;
  playerZ?: number;
  opacityUpdates?: number;
  shadowMoves?: number;
  animationUpdates?: number;
  gcSpikes?: number;
}

// === PERFORMANCE TOGGLES (for testing) ===
// Now controlled via props from MazeGame3D

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
  // Mobile controls - WASD joystick system
  mobileTargetYawRef?: MutableRefObject<number>; // Legacy - not used in new system
  mobileYawRateRef?: MutableRefObject<number>;   // Legacy - not used in new system  
  mobileIsMovingRef?: MutableRefObject<boolean>;
  mobileThrottleRef?: MutableRefObject<number>;  // Legacy - not used in new system
  mobileTouchActiveRef?: MutableRefObject<boolean>;
  mobileWasdRef?: MutableRefObject<{ w: boolean; a: boolean; s: boolean; d: boolean }>;
  mobileTurnIntensityRef?: MutableRefObject<number>;
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
  // Feature toggles for performance testing
  shadowsEnabled?: boolean;
  grassEnabled?: boolean;
  rocksEnabled?: boolean;
  animationsEnabled?: boolean;
  opacityFadeEnabled?: boolean;
  cornEnabled?: boolean;
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
        // Fog uniforms - uses unified atmosphere color
        fogColor: { value: new Color(ATMOSPHERE_COLOR) },
        fogDensity: { value: 0.14 },  // Matches scene fog density
        fogHeightMax: { value: 2.5 },  // Height above which fog fades out
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
        uniform float fogHeightMax;
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
          
          // Organic edge distortion for natural grass patches - expanded for larger grass areas
          float edgeWarp = fbm(worldUV * 1.2 + 10.0) * 0.55;  // Increased from 0.35 to 0.55 for larger grass areas
          float edgeDetail = noise(worldUV * 4.0) * 0.12;
          float wallMask = smoothstep(0.10, 0.90, isWall + edgeWarp - edgeDetail);  // Expanded range
          wallMask = smoothstep(0.0, 1.0, wallMask);
          
          // Create path edge spillover - grass creeps into path sides but not center
          // Only apply where we're close to a wall (transition zone)
          float edgeDistance = isWall + edgeWarp * 0.6;  // How close to wall edge
          float spilloverNoise = fbm(worldUV * 3.0 + 700.0);
          // Spillover strongest near edges (edgeDistance 0.3-0.6), fades toward center
          float spilloverZone = smoothstep(0.15, 0.35, edgeDistance) * smoothstep(0.65, 0.45, edgeDistance);
          float spilloverMask = spilloverZone * smoothstep(0.4, 0.7, spilloverNoise) * 0.7;
          
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
          
          // Mix path and grass, then add spillover grass patches on path edges
          vec3 finalColor = mix(pathColor, grassAreaColor, wallMask);
          // Add grass spillover to path edges - sparse grass patches creeping into the path sides
          vec3 spilloverGrass = mix(grassDark, grassMoss, noise(worldUV * 5.0 + 800.0) * 0.4);
          finalColor = mix(finalColor, spilloverGrass, spilloverMask * (1.0 - wallMask));  // Only on path areas
          
          // Apply height-attenuated exponential fog
          // Ground is at Y=0, fog strongest there, fading out above corn height
          float heightAttenuation = 1.0 - smoothstep(0.0, fogHeightMax, vWorldPos.y);
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          fogFactor *= heightAttenuation;
          
          // Use fog color directly (no desaturation) for consistent atmosphere matching
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
    // Enable transparency for opacity fade
    const mat = new MeshStandardMaterial({ 
      color: "#7A6350", 
      roughness: 0.9,
      transparent: true,
      opacity: 1,
    });
    
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
  
  // Distance culling - only update when visible set changes
  const lastVisibleCountRef = useRef(-1);
  
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
    
    for (let i = 0; i < rockTransforms.length; i++) {
      const t = rockTransforms[i];
      const distSq = (px - t.x) ** 2 + (pz - t.z) ** 2;
      
      if (distSq < cullDistSq) {
        meshRef.current.setMatrixAt(visibleCount, t.matrix);
        visibleCount++;
      }
    }
    
    // Only update GPU if count actually changed
    if (lastVisibleCountRef.current !== visibleCount) {
      meshRef.current.count = visibleCount;
      meshRef.current.instanceMatrix.needsUpdate = true;
      lastVisibleCountRef.current = visibleCount;
    }
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

// 3D Grass tufts - STATIC rendering, no per-frame updates
const GRASS_CULL_DISTANCE = 12;

const GrassTufts = ({ maze, playerStateRef }: { maze: Maze; playerStateRef: MutableRefObject<PlayerState> }) => {
  const grass231 = useGLTF('/models/Grass_231.glb');
  const grass232 = useGLTF('/models/Grass_232.glb');
  const groupRef = useRef<Group>(null);
  
  // Pre-calculate all grass positions once
  const allGrassData = useMemo(() => {
    const positions: { x: number; z: number; scale: number; rotation: number; type: 1 | 2 }[] = [];
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    
    const mazeWidth = maze.grid[0].length;
    const mazeHeight = maze.grid.length;
    
    // Place grass on wall edges facing paths - 16% spawn rate
    for (let y = 1; y < mazeHeight - 1; y++) {
      for (let x = 1; x < mazeWidth - 1; x++) {
        if (!maze.grid[y][x].isWall) continue;
        
        const seed = x * 2000 + y + 5000;
        
        const pathRight = x < mazeWidth - 1 && !maze.grid[y][x+1].isWall;
        const pathLeft = x > 0 && !maze.grid[y][x-1].isWall;
        const pathDown = y < mazeHeight - 1 && !maze.grid[y+1][x].isWall;
        const pathUp = y > 0 && !maze.grid[y-1][x].isWall;
        
        if (pathRight && seededRandom(seed + 500) < 0.16) {
          positions.push({
            x: x + 0.55 + seededRandom(seed) * 0.2,
            z: y + 0.3 + seededRandom(seed + 1) * 0.4,
            scale: 0.10 + seededRandom(seed + 2) * 0.05,
            rotation: seededRandom(seed + 3) * Math.PI * 2,
            type: seededRandom(seed + 4) > 0.5 ? 1 : 2,
          });
        }
        if (pathLeft && seededRandom(seed + 600) < 0.16) {
          positions.push({
            x: x + 0.25 + seededRandom(seed + 100) * 0.2,
            z: y + 0.3 + seededRandom(seed + 101) * 0.4,
            scale: 0.10 + seededRandom(seed + 102) * 0.05,
            rotation: seededRandom(seed + 103) * Math.PI * 2,
            type: seededRandom(seed + 104) > 0.5 ? 1 : 2,
          });
        }
        if (pathDown && seededRandom(seed + 700) < 0.16) {
          positions.push({
            x: x + 0.3 + seededRandom(seed + 200) * 0.4,
            z: y + 0.55 + seededRandom(seed + 201) * 0.2,
            scale: 0.10 + seededRandom(seed + 202) * 0.05,
            rotation: seededRandom(seed + 203) * Math.PI * 2,
            type: seededRandom(seed + 204) > 0.5 ? 1 : 2,
          });
        }
        if (pathUp && seededRandom(seed + 800) < 0.16) {
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
  
  // Pre-clone and position all scenes ONCE - filter by initial player distance
  const clonedScenes = useMemo(() => {
    const px = playerStateRef.current.x;
    const pz = playerStateRef.current.y;
    const cullDistSq = GRASS_CULL_DISTANCE * GRASS_CULL_DISTANCE;
    
    return allGrassData
      .filter(tuft => {
        const distSq = (tuft.x - px) ** 2 + (tuft.z - pz) ** 2;
        return distSq < cullDistSq;
      })
      .map((tuft) => {
        const scene = (tuft.type === 1 ? grass231 : grass232).scene.clone();
        scene.position.set(tuft.x, 0, tuft.z);
        scene.rotation.set(0, tuft.rotation, 0);
        const s = tuft.scale * 0.04;
        scene.scale.set(s, s, s);
        
        // Replace PBR materials with MeshBasicMaterial for consistent lighting
        scene.traverse((child: Object3D) => {
          if ((child as any).isMesh) {
            const mesh = child as Mesh;
            const oldMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            
            const newMats = oldMats.map(oldMat => {
              const color = (oldMat as any).color?.clone() || new Color(0x4a7c3f);
              return new MeshBasicMaterial({
                color,
                side: DoubleSide,
              });
            });
            
            mesh.material = newMats.length === 1 ? newMats[0] : newMats;
          }
        });
        
        return scene;
      });
  }, [allGrassData, grass231, grass232, playerStateRef]);
  
  // NO useFrame - completely static rendering
  
  return (
    <group ref={groupRef}>
      {clonedScenes.map((scene, i) => (
        <primitive key={i} object={scene} />
      ))}
    </group>
  );
};

// Ground with grass/path differentiation based on wall data
const Ground = ({ maze, rocks, playerStateRef, rocksEnabled = true, grassEnabled = true }: { 
  maze: Maze; 
  rocks: RockPosition[]; 
  playerStateRef: MutableRefObject<PlayerState>;
  rocksEnabled?: boolean;
  grassEnabled?: boolean;
}) => {
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
      {rocksEnabled && <ScatteredRocks rocks={rocks} playerStateRef={playerStateRef} />}
      {grassEnabled && <GrassTufts maze={maze} playerStateRef={playerStateRef} />}
    </group>
  );
};


const MazeWalls = forwardRef<Group, { 
  maze: Maze; 
  playerStateRef?: React.MutableRefObject<{ x: number; y: number }>;
  optimizationSettings?: CornOptimizationSettings;
  onCullStats?: (stats: CullStats) => void;
}>(({ maze, playerStateRef, optimizationSettings, onCullStats }, ref) => {
  // Ref for camera collision boxes (simple raycasting targets)
  const cameraCollidersRef = useRef<Group>(null);
  
  const { edgePositions, depthOnlyWalls, boundaryWalls, allWallPositions } = useMemo(() => {
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
    
    // Collect ALL wall positions for camera colliders
    const allWalls: { x: number; z: number }[] = [];
    
    // For each wall cell, check which sides face a path
    maze.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.isWall) {
          allWalls.push({ x, z: y });
          
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
      boundaryWalls: boundary,
      allWallPositions: allWalls,
    };
  }, [maze]);
  
  // Create individual camera collider meshes (NOT instanced - for proper raycasting)
  // InstancedMesh raycasting only checks bounding box, not individual instances
  const cameraColliderMeshes = useMemo(() => {
    if (allWallPositions.length === 0) return [];
    
    const geometry = new BoxGeometry(0.85, 2.5, 0.85); // Slightly smaller than cell
    const material = new MeshBasicMaterial({ 
      visible: false, // Invisible - only for raycasting
      color: 0xff0000,
    });
    
    // Create individual meshes for each wall cell
    const meshes: Mesh[] = [];
    allWallPositions.forEach((pos) => {
      const mesh = new Mesh(geometry, material);
      mesh.position.set(pos.x + 0.5, 1.25, pos.z + 0.5);
      mesh.name = 'wallCollider';
      mesh.userData.isCameraBlocker = true;
      mesh.userData.cellX = pos.x;
      mesh.userData.cellZ = pos.z;
      meshes.push(mesh);
    });
    
    return meshes;
  }, [allWallPositions]);

  // Callback to set both internal and forwarded ref
  const setRefs = useMemo(() => {
    return (node: Group | null) => {
      // Set internal ref
      (cameraCollidersRef as React.MutableRefObject<Group | null>).current = node;
      // Set forwarded ref
      if (ref) {
        if (typeof ref === 'function') {
          ref(node);
        } else {
          (ref as React.MutableRefObject<Group | null>).current = node;
        }
      }
    };
  }, [ref]);

  return (
    <group>
      {/* Camera collision boxes (invisible, for raycasting only) */}
      <group ref={setRefs} name="cameraColliders">
        {cameraColliderMeshes.map((mesh, i) => (
          <primitive key={i} object={mesh} />
        ))}
      </group>
      
      {/* Visual corn (InstancedWalls) */}
      <InstancedWalls 
        edgePositions={edgePositions}
        noShadowPositions={depthOnlyWalls}
        boundaryPositions={boundaryWalls}
        playerPositionRef={playerStateRef}
        optimizationSettings={optimizationSettings}
        onCullStats={onCullStats}
      />
    </group>
  );
});

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
  maze: Maze; // Required for raycasting initial facing direction
  showCollisionDebug?: boolean; // Show debug ground plane under character
}

const CharacterRenderer = ({
  modelFile,
  position,
  animation,
  playerStateRef,
  isDialogueActive,
  isGoalMarker = false,
  alwaysFacePlayer = false,
  maze,
  showCollisionDebug = false,
}: CharacterRendererProps) => {
  const groupRef = useRef<Group>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const initialRotationSet = useRef(false);
  
  const modelPath = `/models/${modelFile}`;
  const { scene, animations } = useGLTF(modelPath);
  
  // Get character scale and Y offset from centralized config
  const characterScale = getCharacterScale(modelFile);
  const characterYOffset = getCharacterYOffset(modelFile);
  const debugPlaneColor = getCharacterDebugPlaneColor(modelFile);
  
  // Calculate initial facing direction using same approach as dialogue code
  // findBestDirectionAngle returns angle from +X axis (0 = +X, π/2 = +Z)
  // atan2(dx, dz) returns angle from +Z axis, so we need: π/2 - bestAngle
  const initialRotation = useMemo(() => {
    const charX = position.x + 0.5;
    const charZ = position.y + 0.5;
    const bestAngle = findBestDirectionAngle(maze, charX, charZ);
    // Convert from math angle (from +X) to Three.js rotation.y (from +Z, like atan2(dx, dz))
    return Math.PI / 2 - bestAngle;
  }, [maze, position.x, position.y]);
  
  // Clone the scene using SkeletonUtils for skinned meshes
  // Make materials transparent for opacity fading
  const { model, materials } = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const mats: Material[] = [];
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Enable transparency for fading
        if (child.material) {
          const childMats = Array.isArray(child.material) ? child.material : [child.material];
          childMats.forEach((mat: Material) => {
            (mat as any).transparent = true;
            (mat as any).opacity = 1;
            mats.push(mat);
          });
        }
      }
    });
    return { model: clone, materials: mats };
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
    if (groupRef.current) {
      // Set initial rotation on first frame (raycast-based)
      if (!initialRotationSet.current) {
        groupRef.current.rotation.y = initialRotation;
        initialRotationSet.current = true;
      }
      
      // Face player during dialogue OR if alwaysFacePlayer is set
      if (playerStateRef && (isDialogueActive || alwaysFacePlayer)) {
        const charX = position.x + 0.5;
        const charZ = position.y + 0.5;
        const playerX = playerStateRef.current.x;
        const playerZ = playerStateRef.current.y;
        
        const dx = playerX - charX;
        const dz = playerZ - charZ;
        const angle = Math.atan2(dx, dz);
        groupRef.current.rotation.y = angle;
      }
      
      // Apply opacity fade based on distance from player
      if (playerStateRef) {
        const charX = position.x + 0.5;
        const charZ = position.y + 0.5;
        const playerX = playerStateRef.current.x;
        const playerZ = playerStateRef.current.y;
        
        const dx = playerX - charX;
        const dz = playerZ - charZ;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const fadeFactor = calculateFadeFactor(distance);
        
        // Apply opacity to all materials
        materials.forEach(mat => {
          (mat as any).opacity = fadeFactor;
        });
        
        groupRef.current.visible = fadeFactor > 0.01;
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
        <primitive object={model} scale={characterScale} castShadow receiveShadow />
      </group>
      {/* Debug ground plane - shows y=0 level to help adjust yOffset */}
      {showCollisionDebug && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005 - characterYOffset, 0]} renderOrder={1000}>
          <planeGeometry args={[0.6, 0.6]} />
          <meshBasicMaterial color={debugPlaneColor} transparent opacity={0.5} depthTest={false} depthWrite={false} side={DoubleSide} />
        </mesh>
      )}
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
const GoalMarker = ({ position, playerStateRef, isDialogueActive, maze, showCollisionDebug }: { 
  position: [number, number, number];
  playerStateRef?: MutableRefObject<PlayerState>;
  isDialogueActive?: boolean;
  maze: Maze;
  showCollisionDebug?: boolean;
}) => {
  return (
    <CharacterRenderer
      modelFile="Farmer.glb"
      position={{ x: position[0], y: position[2] }}
      animation="wave"
      playerStateRef={playerStateRef}
      isDialogueActive={isDialogueActive || false}
      isGoalMarker={true}
      maze={maze}
      showCollisionDebug={showCollisionDebug}
    />
  );
};

// PlacedCharacter - wraps CharacterRenderer for maze.characters array
const PlacedCharacter = ({ 
  character, 
  playerStateRef,
  isDialogueActive,
  maze,
  showCollisionDebug,
}: { 
  character: MazeCharacter;
  playerStateRef?: MutableRefObject<PlayerState>;
  isDialogueActive: boolean;
  maze: Maze;
  showCollisionDebug?: boolean;
}) => {
  return (
    <CharacterRenderer
      modelFile={character.model}
      position={character.position}
      animation={character.animation}
      playerStateRef={playerStateRef}
      isDialogueActive={isDialogueActive}
      alwaysFacePlayer={character.alwaysFacePlayer}
      maze={maze}
      showCollisionDebug={showCollisionDebug}
    />
  );
};

// DialogueCharacter - wraps CharacterRenderer for legacy dialogues with characterModel/speakerPosition
const DialogueCharacter = ({ 
  dialogue, 
  playerStateRef,
  isActiveDialogue,
  maze,
  showCollisionDebug,
}: { 
  dialogue: DialogueTrigger;
  playerStateRef?: MutableRefObject<PlayerState>;
  isActiveDialogue: boolean;
  maze: Maze;
  showCollisionDebug?: boolean;
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
      maze={maze}
      showCollisionDebug={showCollisionDebug}
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
  mobileYawRateRef,
  mobileIsMovingRef,
  mobileThrottleRef,
  mobileTouchActiveRef,
  mobileWasdRef,
  mobileTurnIntensityRef,
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
  mobileYawRateRef?: MutableRefObject<number>;
  mobileIsMovingRef?: MutableRefObject<boolean>;
  mobileThrottleRef?: MutableRefObject<number>;
  mobileTouchActiveRef?: MutableRefObject<boolean>;
  mobileWasdRef?: MutableRefObject<{ w: boolean; a: boolean; s: boolean; d: boolean }>;
  mobileTurnIntensityRef?: MutableRefObject<number>;
  speedBoostActive: boolean;
  onCellInteraction: (x: number, y: number) => void;
  isPaused: boolean;
  isMuted?: boolean;
  rocks: RockPosition[];
  characters: CharacterPosition[];
  showCollisionDebug?: boolean;
}) => {
  const groupRef = useRef<any>(null);
  const smoothRotation = useRef<number | null>(null); // Initialize to null, set on first frame
  const smoothPositionX = useRef(0);
  const smoothPositionZ = useRef(0);
  const positionInitialized = useRef(false);
  const lastCellRef = useRef({ x: -1, y: -1 }); // Track last cell for interaction check
  const smoothBankAngle = useRef(0); // For banking/leaning during turns
  
  // Mobile steering no longer uses these (yaw rate system instead)
  
  // Helper: normalize angle to [-PI, PI]
  const normalizeAngle = (angle: number): number => {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  };
  
  // Helper: lerp between angles (handles wraparound)
  const lerpAngle = (from: number, to: number, t: number): number => {
    const diff = normalizeAngle(to - from);
    return normalizeAngle(from + diff * t);
  };
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Handle movement - use clamped delta for smooth per-frame updates
    if (!isPaused) {
      // Clamp delta to prevent large jumps on frame drops
      const clampedDelta = Math.min(delta, 0.05);
      
      // Check if mobile touch is active AND has actual input
      const mobileWasd = mobileWasdRef?.current ?? { w: false, a: false, s: false, d: false };
      const mobileHasInput = mobileWasd.w || mobileWasd.a || mobileWasd.s || mobileWasd.d;
      const mobileActive = (mobileTouchActiveRef?.current ?? false) && mobileHasInput;
      
      // Check if any keyboard keys are pressed
      const keyboardActive = keysPressed.current.has('w') || keysPressed.current.has('s') || 
                            keysPressed.current.has('a') || keysPressed.current.has('d') ||
                            keysPressed.current.has('arrowup') || keysPressed.current.has('arrowdown') ||
                            keysPressed.current.has('arrowleft') || keysPressed.current.has('arrowright');
      
      let input: MovementInput;
      
      // Keyboard ALWAYS takes priority, then mobile if it has actual input
      if (keyboardActive) {
        // KEYBOARD MODE: Original per-frame rotation accumulation
        const isKeyboardRotation = keysPressed.current.has('arrowleft') || keysPressed.current.has('a') || 
                                   keysPressed.current.has('arrowright') || keysPressed.current.has('d');
        input = {
          forward: keysPressed.current.has('arrowup') || keysPressed.current.has('w'),
          backward: keysPressed.current.has('arrowdown') || keysPressed.current.has('s'),
          rotateLeft: keysPressed.current.has('arrowleft') || keysPressed.current.has('a'),
          rotateRight: keysPressed.current.has('arrowright') || keysPressed.current.has('d'),
          rotationIntensity: isKeyboardRotation ? 1.0 : 1.0,
        };
        
        // Update isMoving ref
        isMovingRef.current = input.forward || input.backward;
        
        // Calculate movement with clamped delta (smooth per-frame updates)
        const prev = playerStateRef.current;
        const newState = calculateMovement(maze, prev, input, clampedDelta, speedBoostActive, rocks, animalType, characters);
        playerStateRef.current = newState;
      } else if (mobileActive) {
        // MOBILE WASD MODE: Use joystick WASD flags directly like keyboard
        input = {
          forward: mobileWasd.w,
          backward: mobileWasd.s,
          rotateLeft: mobileWasd.a,
          rotateRight: mobileWasd.d,
          rotationIntensity: 1.5 * (mobileTurnIntensityRef?.current ?? 1.0), // Base 1.5x + proportional drag intensity
        };
        
        // Update isMoving ref - only forward/backward triggers animation
        isMovingRef.current = mobileWasd.w || mobileWasd.s;
        
        // Calculate movement (same as keyboard)
        const prev = playerStateRef.current;
        const newState = calculateMovement(maze, prev, input, clampedDelta, speedBoostActive, rocks, animalType, characters);
        playerStateRef.current = newState;
      } else {
        // No input - no movement
        isMovingRef.current = false;
      }
      
      // Only check interactions when entering a new cell
      const currentCellX = Math.floor(playerStateRef.current.x);
      const currentCellY = Math.floor(playerStateRef.current.y);
      if (currentCellX !== lastCellRef.current.x || currentCellY !== lastCellRef.current.y) {
        lastCellRef.current = { x: currentCellX, y: currentCellY };
        onCellInteraction(playerStateRef.current.x, playerStateRef.current.y);
      }
    } else {
      // When paused (including dialogue), freeze movement
      isMovingRef.current = false;
    }
    
    // Initialize smooth position and rotation on first frame
    if (!positionInitialized.current) {
      smoothPositionX.current = playerStateRef.current.x;
      smoothPositionZ.current = playerStateRef.current.y;
      // Initialize rotation to match the actual starting rotation
      const initialRotation = -playerStateRef.current.rotation + Math.PI;
      smoothRotation.current = initialRotation;
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
    let rotDiff = targetRotation - (smoothRotation.current ?? targetRotation);
    if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    
    // Fixed lerp factor for consistent rotation smoothing
    smoothRotation.current = (smoothRotation.current ?? targetRotation) + rotDiff * 0.15;
    
    // Normalize rotation
    if (smoothRotation.current > Math.PI * 2) smoothRotation.current -= Math.PI * 2;
    if (smoothRotation.current < 0) smoothRotation.current += Math.PI * 2;
    
    groupRef.current.rotation.y = smoothRotation.current;
    
    // === BANKING / LEANING ===
    // Bank angle is based on yaw rate - lean into turns
    const MAX_BANK_ANGLE = 0.18; // ~10 degrees max lean
    const yawRate = mobileYawRateRef?.current ?? 0;
    
    // Target bank is opposite of turn direction (lean into the turn)
    const targetBank = -yawRate * 0.08; // Scale yaw rate to bank angle
    const clampedTargetBank = Math.max(-MAX_BANK_ANGLE, Math.min(MAX_BANK_ANGLE, targetBank));
    
    // Smooth the bank angle
    smoothBankAngle.current += (clampedTargetBank - smoothBankAngle.current) * 0.15;
    
    // Apply bank (Z-axis rotation for roll)
    groupRef.current.rotation.z = smoothBankAngle.current;
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

// Autopush configuration for foliage collision
interface AutopushConfig {
  enabled: boolean;
  minDist: number;      // Minimum camera distance (never push closer than this)
  padding: number;      // Padding before obstacle
  pushLerp: number;     // Lerp speed when pushing in (faster)
  relaxLerp: number;    // Lerp speed when relaxing out (slower)
  headHeight: number;   // Height of target (animal head)
  rayCount: 3 | 1;      // 1 for single ray, 3 for left/center/right
  raySpread: number;    // Spread angle for side rays (radians)
  holdTimeMs: number;   // Hysteresis: hold pushed-in state for this many ms after ray clears
  minPushDelta: number; // Ignore micro-hits: only push if distance reduction > this
}

const DEFAULT_AUTOPUSH: AutopushConfig = {
  enabled: true,
  minDist: 2.2,         // Min distance to push camera (never closer than this)
  padding: 0.3,         // Padding before corn
  pushLerp: 0.25,       // Moderate push-in (was 0.35)
  relaxLerp: 0.04,      // Very slow relax-out (prevents pumping)
  headHeight: 1.2,      // Raised ray origin to cow head height (avoids ground/body hits)
  rayCount: 3,          // Use 3 rays for stability
  raySpread: 0.12,      // ~7 degrees spread for side rays
  holdTimeMs: 250,      // Keep pushed-in for 250ms after ray clears
  minPushDelta: 0.25,   // Ignore grazing hits (was 0.6, too strict; 0.05 too loose)
};

// Zoom speed limits (units per second)
const AUTOPUSH_ZOOM_IN_SPEED = 2.0;  // Max zoom-in speed
const AUTOPUSH_ZOOM_OUT_SPEED = 1.0; // Max zoom-out speed

// Simple over-the-shoulder camera with smooth follow - reads from ref each frame
const OverShoulderCameraController = ({ 
  playerStateRef,
  restartKey,
  topDownCamera = false,
  groundLevelCamera = false,
  foliageGroupRef,
  autopush = DEFAULT_AUTOPUSH,
  animalType,
  maze,
}: { 
  playerStateRef: MutableRefObject<PlayerState>;
  restartKey?: number;
  topDownCamera?: boolean;
  groundLevelCamera?: boolean;
  foliageGroupRef?: React.RefObject<Group>;
  autopush?: AutopushConfig;
  animalType?: AnimalType;
  maze?: Maze;
}) => {
  const { camera, scene } = useThree();
  
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
  
  // Autopush state - scalar-based distance easing
  const currentAutopushDist = useRef<number | null>(null);
  const lastHitTime = useRef<number>(0); // Timestamp of last hit for hysteresis
  const lastFrameTime = useRef<number>(performance.now()); // For speed limiting
  const raycaster = useRef(new Raycaster());
  const rayOrigin = useRef(new Vector3());
  const rayDir = useRef(new Vector3());
  const tempVec = useRef(new Vector3());
  
  // Corn fading state - track cells that are currently faded
  const fadedCellsRef = useRef<Map<string, { opacity: number; lastHitTime: number }>>(new Map());
  
  // Cached camera blockers to avoid traversing every frame
  const cachedCameraBlockers = useRef<Object3D[]>([]);
  const lastFoliageChildCount = useRef<number>(0);
  
  // Reusable refs to avoid per-frame allocations (reduces GC pressure)
  const headPosRef = useRef(new Vector3());
  const finalTargetPosRef = useRef(new Vector3());
  const hitCellsRef = useRef(new Set<string>());
  const centerRayHitCellsRef = useRef(new Set<string>());
  
  // Reset camera state when restartKey changes
  useEffect(() => {
    if (restartKey !== lastRestartKey.current) {
      lastRestartKey.current = restartKey;
      initialized.current = false;
      hasPlayerMoved.current = false;
      initialPlayerPos.current = null;
      currentDistance.current = 0.4;
      currentAutopushDist.current = null;
      // Clear faded cells to prevent stale fade states
      fadedCellsRef.current.clear();
    }
  }, [restartKey]);
  
  // Camera settings - over-the-shoulder view balanced for all animals
  const DEBUG_OVERHEAD_VIEW = topDownCamera; // Use prop for toggle
  
  // Get character-scaled camera parameters
  const animalModel = animalType === 'pig' ? 'Pig.glb' : animalType === 'cow' ? 'Cow.glb' : animalType === 'bird' ? 'Hen.glb' : 'Cow.glb';
  const animalHeight = getCharacterHeight(animalModel);
  
  // Character-scaled camera framing:
  // targetHeight: where camera looks (center of character) - scaled by animal height
  // softMinDist: comfortable resting distance when clear - scaled by animal height
  const targetHeight = Math.max(0.25, Math.min(1.2, 0.6 * animalHeight));
  const softMinDist = Math.max(1.0, Math.min(2.4, 1.2 * animalHeight));
  
  const CAMERA_DISTANCE_START = 0.4;
  const CAMERA_DISTANCE_NORMAL = Math.max(softMinDist, 2.0); // Use softMinDist as minimum comfortable distance
  const CAMERA_HEIGHT_START = 1.8;
  const CAMERA_HEIGHT_NORMAL = 2.4;
  const LOOK_AHEAD = 1.3;
  const LOOK_HEIGHT_START = 0.0;
  const LOOK_HEIGHT_NORMAL = targetHeight; // Use character-scaled look height
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
    
    // Calculate desired camera position behind player (reuse vector to avoid GC)
    const desiredDist = currentDistance.current;
    targetPos.current.set(
      playerX - Math.sin(rot) * desiredDist,
      currentHeight,
      playerZ + Math.cos(rot) * desiredDist
    );
    
    // Calculate target head position (for raycasting origin) - use character-scaled height
    // Reuse ref to avoid GC
    headPosRef.current.set(playerX, targetHeight, playerZ);
    
    // === AUTOPUSH LOGIC ===
    // Reuse ref instead of cloning
    finalTargetPosRef.current.copy(targetPos.current);
    
    // Check if autopush is enabled via debug toggle
    const autopushEnabled = getAutopushEnabled();
    
    if (autopush.enabled && autopushEnabled && foliageGroupRef?.current && !DEBUG_OVERHEAD_VIEW && !groundLevelCamera) {
      // Calculate direction from head to desired camera position
      rayDir.current.copy(targetPos.current).sub(headPosRef.current).normalize();
      const rayLength = headPosRef.current.distanceTo(targetPos.current);
      
      // Cache camera blockers - only rebuild when foliage group changes
      const currentChildCount = foliageGroupRef.current.children.length;
      if (currentChildCount !== lastFoliageChildCount.current) {
        lastFoliageChildCount.current = currentChildCount;
        cachedCameraBlockers.current = [];
        foliageGroupRef.current.traverse((child) => {
          const mesh = child as Mesh;
          if (mesh.isMesh) {
            cachedCameraBlockers.current.push(child);
          }
        });
      }
      const cameraBlockers = cachedCameraBlockers.current;
      // Perform raycasts (1 or 3 rays)
      let closestHitDist = rayLength;
      let hitObjectName = '';
      // Reuse Set refs to avoid per-frame allocations
      hitCellsRef.current.clear();
      centerRayHitCellsRef.current.clear();
      
      const performRaycast = (direction: Vector3) => {
        rayOrigin.current.copy(headPosRef.current);
        raycaster.current.set(rayOrigin.current, direction);
        raycaster.current.far = rayLength;
        
        // Use recursive=true to check nested meshes inside the foliage group
        const intersects = raycaster.current.intersectObjects(cameraBlockers, true);
        if (intersects.length > 0) {
          const hitDist = intersects[0].distance;
          if (hitDist < closestHitDist) {
            closestHitDist = hitDist;
            hitObjectName = intersects[0].object.name || 'unnamed';
          }
          
          // Collect hit cells for corn fading using userData (not hit.point)
          for (const hit of intersects) {
            const cellX = hit.object.userData.cellX;
            const cellZ = hit.object.userData.cellZ;
            if (cellX !== undefined && cellZ !== undefined) {
              hitCellsRef.current.add(`${cellX},${cellZ}`);
              
              // Also fade adjacent cells to catch visual corn leaves extending from neighbors
              if (maze) {
                const adjacents = [
                  [cellX - 1, cellZ], [cellX + 1, cellZ],
                  [cellX, cellZ - 1], [cellX, cellZ + 1]
                ];
                for (const [ax, az] of adjacents) {
                  // Only add if it's a valid wall cell in the maze
                  if (ax >= 0 && az >= 0 && 
                      az < maze.grid.length && 
                      ax < maze.grid[0].length && 
                      maze.grid[az][ax].isWall) {
                    hitCellsRef.current.add(`${ax},${az}`);
                  }
                }
              }
            }
          }
        }
      };
      
      // Center ray - collect hits for both autopush AND fading
      performRaycast(rayDir.current);
      frameMetrics.raycastCount++; // Track raycasts for debug
      hitCellsRef.current.forEach(cell => centerRayHitCellsRef.current.add(cell));
      
      // Side rays (if enabled) - only for autopush, NOT for fading
      if (autopush.rayCount === 3) {
        // Calculate perpendicular direction in XZ plane
        const perpX = -rayDir.current.z;
        const perpZ = rayDir.current.x;
        
        // Save center ray hits, clear for side rays (they don't contribute to fading)
        // No allocation needed - we already have centerRayHitCellsRef
        hitCellsRef.current.clear();
        
        // Left ray
        tempVec.current.set(
          rayDir.current.x + perpX * autopush.raySpread,
          rayDir.current.y,
          rayDir.current.z + perpZ * autopush.raySpread
        ).normalize();
        performRaycast(tempVec.current);
        frameMetrics.raycastCount++;
        
        // Right ray
        tempVec.current.set(
          rayDir.current.x - perpX * autopush.raySpread,
          rayDir.current.y,
          rayDir.current.z - perpZ * autopush.raySpread
        ).normalize();
        performRaycast(tempVec.current);
        frameMetrics.raycastCount++;
        // Restore only center ray hits for fading
        hitCellsRef.current.clear();
        centerRayHitCellsRef.current.forEach(cell => hitCellsRef.current.add(cell));
      }
      
      // Get current time for hysteresis
      const now = performance.now();
      
      // === CORN FADING LOGIC ===
      // Constants for fading - will be applied AFTER we determine if autopush is triggered
      const FADE_TARGET = 0.55;       // Target opacity when faded (more visible)
      const FADE_IN_SPEED = 0.15;     // How fast corn fades out (per frame)
      const FADE_OUT_SPEED = 0.03;    // How fast corn fades back in (per frame)
      const HOLD_TIME = 200;          // ms to hold fade before starting fade-out
      
      // We'll apply fading ONLY after determining if autopush is actually pushing
      // For now, just store the hit cells and process them after autopush logic
      
      // Determine blocked distance with micro-hit filtering and hysteresis
      let targetDist = rayLength; // Default: no blocking, use full distance
      const desiredDistForAutopush = rayLength;
      
      // Use the ref-based hitCells for all subsequent logic
      const hitCells = hitCellsRef.current;
      
      if (closestHitDist < rayLength) {
        // We have a hit - camera should be IN FRONT of the wall, not behind it
        // Don't clamp to minDist here - that would put camera inside the wall!
        // Use a small minimum to prevent camera from being inside player's head
        const absoluteMinDist = 0.5; // Never closer than 0.5 units to player
        const potentialBlockedDist = Math.max(
          closestHitDist - autopush.padding,
          absoluteMinDist
        );
        
        // Check if the RAW HIT is significant (not the clamped distance)
        // This properly detects real obstructions vs grazing leaves
        const rawObstruction = desiredDistForAutopush - closestHitDist;
        const isSignificantHit = rawObstruction > autopush.minPushDelta;
        
        if (isSignificantHit) {
          // Significant hit - push camera in front of wall
          targetDist = potentialBlockedDist;
          lastHitTime.current = now; // Record hit time for hysteresis
          
          // === APPLY CORN FADING ONLY AFTER AUTOPUSH LERP HAS SETTLED ===
          // Check if camera has finished lerping (current distance is close to target)
          const lerpSettled = currentAutopushDist.current !== null && 
            Math.abs(currentAutopushDist.current - potentialBlockedDist) < 0.15;
          
          if (lerpSettled) {
            // Mark hit cells as needing fade only after camera settles
            // Check if we already have faded cells (autopush already active)
            const hasExistingFadedCells = fadedCellsRef.current.size > 0;
            frameMetrics.activeFadedCells = fadedCellsRef.current.size; // Track for debug
            
            for (const cellKey of hitCells) {
              const existing = fadedCellsRef.current.get(cellKey);
              if (existing) {
                existing.lastHitTime = now;
              } else {
                // If autopush is already active with faded cells, start new cells at target opacity
                // This prevents blinking when turning and hitting new cells
                const startOpacity = hasExistingFadedCells ? FADE_TARGET : 1.0;
                fadedCellsRef.current.set(cellKey, { opacity: startOpacity, lastHitTime: now });
              }
            }
          }
        } else {
          // Grazing hit - ignore, but check hysteresis
          const timeSinceHit = now - lastHitTime.current;
          if (timeSinceHit < autopush.holdTimeMs && currentAutopushDist.current !== null) {
            // Still in hysteresis hold period - maintain current pushed distance
            targetDist = currentAutopushDist.current;
          }
        }
        
        // Update all faded cells (always update opacity animation)
        // But only fade OUT if camera lerp has settled
        const lerpSettledForFade = currentAutopushDist.current !== null && 
          Math.abs(currentAutopushDist.current - targetDist) < 0.15;
        
        for (const [cellKey, state] of fadedCellsRef.current) {
          const isCurrentlyHit = hitCells.has(cellKey) && isSignificantHit && lerpSettledForFade;
          const timeSinceHit = now - state.lastHitTime;
          
          if (isCurrentlyHit) {
            // Fade out (reduce opacity)
            state.opacity = Math.max(FADE_TARGET, state.opacity - FADE_IN_SPEED);
          } else if (timeSinceHit > HOLD_TIME) {
            // Fade back in (increase opacity)
            state.opacity = Math.min(1.0, state.opacity + FADE_OUT_SPEED);
          }
          
          // Apply opacity to corn instances
          const [cx, cz] = cellKey.split(',').map(Number);
          setCellOpacity(cx, cz, state.opacity);
          
          // Remove fully opaque cells that haven't been hit recently
          if (state.opacity >= 0.99 && timeSinceHit > 1000) {
            setCellOpacity(cx, cz, 1.0); // Ensure fully reset
            fadedCellsRef.current.delete(cellKey);
          }
        }
      } else {
        // No hit - check hysteresis before relaxing
        const timeSinceHit = now - lastHitTime.current;
        if (timeSinceHit < autopush.holdTimeMs && currentAutopushDist.current !== null) {
          // Still in hysteresis hold period - maintain current pushed distance
          targetDist = currentAutopushDist.current;
        } else {
          // Hysteresis expired - relax toward comfortable distance for this character
          // Use softMinDist to ensure small animals remain visible and well-framed
          targetDist = Math.max(rayLength, softMinDist);
        }
        
        // No autopush active - fade all cells back to opaque
        for (const [cellKey, state] of fadedCellsRef.current) {
          const timeSinceHitCell = now - state.lastHitTime;
          
          if (timeSinceHitCell > HOLD_TIME) {
            // Fade back in (increase opacity)
            state.opacity = Math.min(1.0, state.opacity + FADE_OUT_SPEED);
          }
          
          // Apply opacity to corn instances
          const [cx, cz] = cellKey.split(',').map(Number);
          setCellOpacity(cx, cz, state.opacity);
          
          // Remove fully opaque cells that haven't been hit recently
          if (state.opacity >= 0.99 && timeSinceHitCell > 1000) {
            setCellOpacity(cx, cz, 1.0); // Ensure fully reset
            fadedCellsRef.current.delete(cellKey);
          }
        }
      }
      
      // Initialize autopush distance on first frame
      if (currentAutopushDist.current === null) {
        currentAutopushDist.current = desiredDistForAutopush;
      }
      
      // Scalar-based distance easing with speed limits
      const currAutoDist = currentAutopushDist.current;
      
      // Calculate delta time for speed limiting
      const deltaTime = Math.min((now - lastFrameTime.current) / 1000, 0.1); // Cap at 100ms
      lastFrameTime.current = now;
      
      // Determine if we're pushing in or relaxing out
      const isPushingIn = targetDist < currAutoDist;
      const lerpSpeed = isPushingIn ? autopush.pushLerp : autopush.relaxLerp;
      
      // Calculate desired change
      let desiredChange = (targetDist - currAutoDist) * lerpSpeed;
      
      // Apply speed limits (units per second * deltaTime = max change this frame)
      const maxZoomIn = AUTOPUSH_ZOOM_IN_SPEED * deltaTime;
      const maxZoomOut = AUTOPUSH_ZOOM_OUT_SPEED * deltaTime;
      
      if (desiredChange < 0) {
        // Zooming in (distance decreasing)
        desiredChange = Math.max(desiredChange, -maxZoomIn);
      } else {
        // Zooming out (distance increasing)
        desiredChange = Math.min(desiredChange, maxZoomOut);
      }
      
      // Apply the speed-limited change
      currentAutopushDist.current = currAutoDist + desiredChange;
      
      // Clamp to valid range (use absoluteMinDist=0.5, not autopush.minDist which is for relaxed state)
      const absoluteMinDist = 0.5;
      currentAutopushDist.current = Math.max(absoluteMinDist, Math.min(currentAutopushDist.current, desiredDistForAutopush));
      
      // Apply autopush: position camera at the smoothed distance
      // Reuse tempVec for the direction * distance calculation to avoid allocation
      tempVec.current.copy(rayDir.current).multiplyScalar(currentAutopushDist.current);
      finalTargetPosRef.current.copy(headPosRef.current).add(tempVec.current);
      
      // Preserve the Y height from the original target
      finalTargetPosRef.current.y = currentHeight;
    }
    
    // Calculate look target ahead of player (reuse vector to avoid GC)
    const currentLookHeight = LOOK_HEIGHT_START + distanceProgress * (LOOK_HEIGHT_NORMAL - LOOK_HEIGHT_START);
    targetLookAt.current.set(
      playerX + Math.sin(rot) * LOOK_AHEAD,
      currentLookHeight,
      playerZ - Math.cos(rot) * LOOK_AHEAD
    );
    
    // Smooth position interpolation
    currentPosition.current.lerp(finalTargetPosRef.current, POSITION_SMOOTHING);
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
  
  const CAMERA_HEIGHT = 1.5;  // Raised 0.5 units for better character visibility
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

// Sky colors - uses unified atmosphere color for horizon
const SKY_TOP_COLOR = '#6191B5';          // Sky blue at zenith
const SKY_BOTTOM_COLOR = ATMOSPHERE_COLOR; // Match fog color exactly

// Sky dome component - 3D sphere that renders the sky without scene.background
// Gradient starts at 99% up (mostly beige, tiny blue cap at zenith)
const SkyBackground = () => {
  const skyRef = useRef<Mesh>(null);
  const { camera } = useThree();
  
  // Keep sky centered on camera (infinite sky effect)
  useFrame(() => {
    if (skyRef.current) {
      skyRef.current.position.copy(camera.position);
    }
  });

  // Load the farm horizon texture
  const texture = useLoader(TextureLoader, '/textures/farm-horizon.png');
  
  // Configure texture for seamless wrapping
  // Disable mipmaps to prevent seam artifacts from atan() derivative discontinuity
  useMemo(() => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearFilter; // No mipmaps - prevents dotted seam line
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
  }, [texture]);
  
  // ShaderMaterial for sky using cylindrical projection (no vertical stretching)
  const skyMaterial = useMemo(() => {
    const mat = new ShaderMaterial({
      uniforms: {
        skyTexture: { value: texture },
        horizonHeight: { value: 0.05 },   // Where horizon sits in view space (-1 to 1)
        imageHeight: { value: 0.8 },      // Taller band to preserve aspect ratio
        bottomColor: { value: new Color(ATMOSPHERE_COLOR) },
        topColor: { value: new Color(SKY_TOP_COLOR) },
      },
      vertexShader: `
        varying vec3 vLocalPosition;
        void main() {
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D skyTexture;
        uniform float horizonHeight;
        uniform float imageHeight;
        uniform vec3 bottomColor;
        uniform vec3 topColor;
        varying vec3 vLocalPosition;
        
        void main() {
          vec3 viewDir = normalize(vLocalPosition);
          float height = viewDir.y; // -1 (down) to 1 (up)
          
          // Image band boundaries
          float imageBottom = horizonHeight - imageHeight * 0.5;
          float imageTop = horizonHeight + imageHeight * 0.5;
          
          // Fog transition zone - gray fog fades into bottom of image (below trees)
          float fogTopHeight = imageBottom + 0.15;
          
          // Calculate horizontal angle for texture U coordinate (wrap around)
          float angle = atan(viewDir.x, viewDir.z);
          float u = (angle / (2.0 * 3.14159265) + 0.5) * 3.0;
          
          vec3 finalColor;
          
          // Check if we're in the image band
          if (height >= imageBottom && height <= imageTop) {
            // Map height within band to V coordinate (0 to 1)
            float v = (height - imageBottom) / imageHeight;
            vec3 imageColor = texture2D(skyTexture, vec2(u, v)).rgb;
            
            // Blend fog into the bottom portion of the image (below trees)
            if (height < fogTopHeight) {
              float fogBlend = smoothstep(fogTopHeight, imageBottom, height);
              finalColor = mix(imageColor, bottomColor, fogBlend);
            } else {
              finalColor = imageColor;
            }
          } else if (height < imageBottom) {
            // Below image: solid fog color
            finalColor = bottomColor;
          } else {
            // Above image: gradient to sky blue
            float t = clamp((height - imageTop) / (1.0 - imageTop), 0.0, 1.0);
            finalColor = mix(topColor, topColor * 0.8, t);
          }
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: BackSide,
      fog: false,
      depthWrite: false,
      toneMapped: false,
    });
    return mat;
  }, [texture]);
  
  return (
    <mesh ref={skyRef} renderOrder={-1000} material={skyMaterial}>
      <sphereGeometry args={[95, 32, 32]} />
    </mesh>
  );
};

const Scene = ({ maze, animalType, playerStateRef, isMovingRef, collectedPowerUps = new Set(), keysPressed, mobileTargetYawRef, mobileYawRateRef, mobileIsMovingRef, mobileThrottleRef, mobileTouchActiveRef, mobileWasdRef, mobileTurnIntensityRef, speedBoostActive, onCellInteraction, isPaused, isMuted, onSceneReady, cornOptimizationSettings, onCullStats, restartKey, dialogueTarget, topDownCamera = false, groundLevelCamera = false, showCollisionDebug = true, shadowsEnabled = true, grassEnabled = true, rocksEnabled = true, animationsEnabled = true, opacityFadeEnabled = true, cornEnabled = true }: Maze3DSceneProps) => {
  // Signal scene is ready after first render
  const hasSignaled = useRef(false);
  
  // Ref for corn walls - used by camera autopush raycasting
  const foliageGroupRef = useRef<Group>(null);
  
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
        castShadow={shadowsEnabled}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0001}
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
      
      {/* Sky orb - flat material, no fog/tonemapping */}
      <SkyBackground />
      
      {/* Exponential fog - uses unified atmosphere color
          Density 0.14 ensures corn is ~90% obscured at 14m cull distance */}
      <fogExp2 attach="fog" args={[ATMOSPHERE_COLOR, 0.14]} />
      {/* Ground */}
      <Ground maze={maze} rocks={rocks} playerStateRef={playerStateRef} rocksEnabled={rocksEnabled} grassEnabled={grassEnabled} />
      
      {/* Maze Walls (corn) with optimizations */}
      {cornEnabled && (
        <MazeWalls 
          ref={foliageGroupRef}
          maze={maze} 
          playerStateRef={playerStateRef}
          optimizationSettings={cornOptimizationSettings}
          onCullStats={onCullStats}
        />
      )}
      
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
          maze={maze}
          showCollisionDebug={showCollisionDebug}
        />
      ))}
      
      {/* Dialogue Characters - render characters for dialogues with characterModel and speakerPosition (legacy) */}
      {maze.dialogues?.filter(d => d.characterModel && d.speakerPosition && !d.speakerCharacterId).map((dialogue) => (
        <DialogueCharacter
          key={`dialogue-char-${dialogue.id}`}
          dialogue={dialogue}
          playerStateRef={playerStateRef}
          isActiveDialogue={dialogueTarget !== null && dialogueTarget !== undefined}
          maze={maze}
          showCollisionDebug={showCollisionDebug}
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
        mobileYawRateRef={mobileYawRateRef}
        mobileIsMovingRef={mobileIsMovingRef}
        mobileThrottleRef={mobileThrottleRef}
        mobileTouchActiveRef={mobileTouchActiveRef}
        mobileWasdRef={mobileWasdRef}
        mobileTurnIntensityRef={mobileTurnIntensityRef}
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
        <>
          <OverShoulderCameraController 
            playerStateRef={playerStateRef}
            restartKey={restartKey}
            topDownCamera={topDownCamera}
            groundLevelCamera={groundLevelCamera}
            foliageGroupRef={foliageGroupRef}
            animalType={animalType}
            maze={maze}
          />
          {/* Corn fading is now integrated into the CameraController's autopush logic */}
        </>
      )}
    </>
  );
};

// Component to track and report renderer info (throttled to avoid state churn)
const RendererInfoTracker = ({ 
  onRendererInfo, 
  playerStateRef 
}: { 
  onRendererInfo?: (info: PerformanceInfo) => void;
  playerStateRef?: MutableRefObject<PlayerState>;
}) => {
  const { gl, scene } = useThree();
  const lastUpdate = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const frameCountRef = useRef(0);
  const lastFrameTime = useRef(performance.now());
  
  useFrame(() => {
    const now = performance.now();
    const frameTime = now - lastFrameTime.current;
    lastFrameTime.current = now;
    
    // Track GC spikes (frame time > 50ms)
    checkGcSpike(frameTime);
    
    // Keep last 30 frame times for averaging
    frameTimesRef.current.push(frameTime);
    if (frameTimesRef.current.length > 30) {
      frameTimesRef.current.shift();
    }
    
    if (onRendererInfo) {
      // Accumulate frame count for per-frame averaging
      frameCountRef.current++;
      
      if (now - lastUpdate.current > 250) { // Update every 250ms for more responsive metrics
        const frameCount = frameCountRef.current;
        lastUpdate.current = now;
        frameCountRef.current = 0;
        
        // Calculate average frame time
        const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        
        // Read metrics and calculate per-frame averages
        const perFrameRaycasts = frameCount > 0 ? Math.round(frameMetrics.raycastCount / frameCount) : 0;
        const perFrameCollisions = frameCount > 0 ? Math.round(frameMetrics.collisionChecks / frameCount) : 0;
        const perFrameOpacityUpdates = frameCount > 0 ? Math.round(frameMetrics.opacityBufferUpdates / frameCount) : 0;
        const perFrameAnimations = frameCount > 0 ? Math.round(frameMetrics.animationMixerUpdates / frameCount) : 0;
        
        onRendererInfo({
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length || 0,
          frameTime: avgFrameTime,
          raycastCount: perFrameRaycasts,
          activeFadedCells: frameMetrics.activeFadedCells,
          collisionChecks: perFrameCollisions,
          // New metrics
          playerX: playerStateRef?.current.x,
          playerZ: playerStateRef?.current.y,
          opacityUpdates: perFrameOpacityUpdates,
          shadowMoves: frameMetrics.shadowLightMoves,
          animationUpdates: perFrameAnimations,
          gcSpikes: frameMetrics.gcSpikes,
        });
        
        // Reset metrics for next interval
        frameMetrics.raycastCount = 0;
        frameMetrics.activeFadedCells = 0;
        frameMetrics.collisionChecks = 0;
        frameMetrics.opacityBufferUpdates = 0;
        frameMetrics.shadowLightMoves = 0;
        frameMetrics.animationMixerUpdates = 0;
        frameMetrics.gcSpikes = 0;
      }
    }
  });
  
  return null;
};

export const Maze3DCanvas = (props: Maze3DSceneProps) => {
  const [fps, setFps] = useState(0);
  const [cullStats, setCullStats] = useState<CullStats | null>(null);

  // Track orientation to force recalculation on change
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    () => (typeof window !== 'undefined' && window.innerWidth > window.innerHeight) ? 'landscape' : 'portrait'
  );

  // Listen for orientation changes
  useEffect(() => {
    const handleOrientationChange = () => {
      const newOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      setOrientation(prev => prev !== newOrientation ? newOrientation : prev);
    };
    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  // Recalculate mobile detection when orientation changes
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
      || (orientation === 'portrait' && window.innerWidth < 768)
      || (orientation === 'landscape' && window.innerHeight < 768);
  }, [orientation]);

  // Cap pixel ratio more aggressively for mobile, especially in landscape
  const basePixelRatio = useMemo(() => {
    if (isMobile) {
      // In landscape, screen has more pixels - cap more aggressively
      return orientation === 'landscape' 
        ? Math.min(window.devicePixelRatio, 1.0)
        : Math.min(window.devicePixelRatio, 1.5);
    }
    return window.devicePixelRatio;
  }, [isMobile, orientation]);

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
        <RendererInfoTracker onRendererInfo={props.onRendererInfo} playerStateRef={props.playerStateRef} />
      </Canvas>
    </div>
  );
};
