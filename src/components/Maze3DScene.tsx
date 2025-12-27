import { useRef, useMemo, useEffect, MutableRefObject, useState, forwardRef } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { PerspectiveCamera, ContactShadows, useGLTF, Html } from '@react-three/drei';
import { Vector3, ShaderMaterial, Color, DataTexture, LinearFilter, Object3D, InstancedMesh, MeshStandardMaterial, DodecahedronGeometry, Group, AnimationMixer, Mesh, Material, Raycaster, BoxGeometry, MeshBasicMaterial } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Maze, AnimalType, DialogueTrigger, MazeCharacter } from '@/types/game';
import { InstancedWalls, CornOptimizationSettings, DEFAULT_CORN_SETTINGS, CullStats } from './CornWall';
import { PlayerCube } from './PlayerCube';
import { PlayerState, MovementInput, calculateMovement, generateRockPositions, RockPosition, CharacterPosition, checkCharacterCollision } from '@/game/GameLogic';
import { getCharacterScale, getCharacterYOffset } from '@/game/CharacterConfig';
import { findStartRotation } from '@/game/MazeUtils';
import { calculateFadeFactor, useOpacityFade } from './FogFadeMaterial';
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
        // Fog uniforms - warm neutral atmospheric tone matching horizon
        fogColor: { value: new Color('#B8B0A0') },
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
          
          // Apply height-attenuated exponential fog
          // Ground is at Y=0, fog strongest there, fading out above corn height
          float heightAttenuation = 1.0 - smoothstep(0.0, fogHeightMax, vWorldPos.y);
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          fogFactor *= heightAttenuation;
          
          // Desaturate fog slightly for more atmospheric look
          vec3 desatFogColor = mix(fogColor, vec3(dot(fogColor, vec3(0.299, 0.587, 0.114))), 0.2);
          finalColor = mix(finalColor, desatFogColor, clamp(fogFactor, 0.0, 1.0));
          
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
  
  // Distance culling with opacity fade via material (all instances share same opacity)
  useFrame(() => {
    if (!meshRef.current || !playerStateRef || !initializedRef.current) return;
    
    const px = playerStateRef.current.x;
    const pz = playerStateRef.current.y;
    
    // Throttle updates - only update when player moves significantly
    const dx = px - lastUpdateRef.current.x;
    const dz = pz - lastUpdateRef.current.z;
    const shouldUpdate = dx*dx + dz*dz >= 0.1 || lastUpdateRef.current.x === -999;
    
    if (!shouldUpdate) return;
    lastUpdateRef.current = { x: px, z: pz, dirX: 0, dirZ: 0 };
    
    const cullDistSq = ROCK_CULL_DISTANCE * ROCK_CULL_DISTANCE;
    let visibleCount = 0;
    let minFade = 1;
    
    // Two-pass: first count visible and find min fade for material
    for (let i = 0; i < rockTransforms.length; i++) {
      const t = rockTransforms[i];
      const distSq = (px - t.x) ** 2 + (pz - t.z) ** 2;
      
      if (distSq < cullDistSq) {
        const distance = Math.sqrt(distSq);
        const fadeFactor = calculateFadeFactor(distance);
        
        if (fadeFactor > 0.01) {
          meshRef.current.setMatrixAt(visibleCount, t.matrix);
          visibleCount++;
          // Track minimum fade factor for shared material opacity
          // (This is a simplification - ideally each rock would have its own fade)
        }
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
  
  // Pre-clone all scenes once and make materials transparent for fading
  const { clonedScenes, materialRefs } = useMemo(() => {
    const scenes = allGrassData.map((tuft) => {
      const scene = (tuft.type === 1 ? grass231 : grass232).scene.clone();
      scene.position.set(tuft.x, 0, tuft.z);
      scene.rotation.set(0, tuft.rotation, 0);
      const s = tuft.scale * 0.04;
      scene.scale.set(s, s, s);
      
      // Make materials transparent for opacity fade
      scene.traverse((child: Object3D) => {
        if ((child as any).isMesh) {
          const mesh = child as Mesh;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach(mat => {
            (mat as any).transparent = true;
            (mat as any).opacity = 1;
          });
        }
      });
      
      return scene;
    });
    
    // Store material references for each grass tuft for opacity updates
    const matRefs = scenes.map(scene => {
      const materials: Material[] = [];
      scene.traverse((child: Object3D) => {
        if ((child as any).isMesh) {
          const mesh = child as Mesh;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.push(...mats);
        }
      });
      return materials;
    });
    
    return { clonedScenes: scenes, materialRefs: matRefs };
  }, [allGrassData, grass231, grass232]);
  
  // Update visible grass based on player distance + camera direction with opacity fade
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
    const shouldUpdate = dx*dx + dz*dz >= 0.1 || camDx*camDx + camDz*camDz >= 0.01 || lastUpdateRef.current.x === -999;
    
    if (!shouldUpdate) return;
    lastUpdateRef.current = { x: px, z: pz, dirX: camDir.x, dirZ: camDir.z };
    
    const cullDistSq = GRASS_CULL_DISTANCE * GRASS_CULL_DISTANCE;
    const nearDistSq = GRASS_NEAR_DISTANCE * GRASS_NEAR_DISTANCE;
    
    const visible: number[] = [];
    for (let i = 0; i < allGrassData.length; i++) {
      const g = allGrassData[i];
      const distSq = (g.x - px) ** 2 + (g.z - pz) ** 2;
      
      if (distSq >= cullDistSq) {
        // Hide grass beyond cull distance
        clonedScenes[i].visible = false;
        continue;
      }
      
      // Camera culling only for distant grass
      if (distSq >= nearDistSq) {
        const toGrassX = g.x - px;
        const toGrassZ = g.z - pz;
        const len = Math.sqrt(distSq);
        const dot = (toGrassX / len) * camDir.x + (toGrassZ / len) * camDir.z;
        if (dot <= GRASS_BACK_CULL_DOT) {
          clonedScenes[i].visible = false;
          continue;
        }
      }
      
      // Apply opacity fade based on distance
      const distance = Math.sqrt(distSq);
      const fadeFactor = calculateFadeFactor(distance);
      
      clonedScenes[i].visible = fadeFactor > 0.01;
      
      // Update material opacity
      materialRefs[i].forEach(mat => {
        (mat as any).opacity = fadeFactor;
      });
      
      if (fadeFactor > 0.01) {
        visible.push(i);
      }
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
  
  // Create instanced camera colliders (invisible boxes for raycasting)
  const cameraColliderMesh = useMemo(() => {
    if (allWallPositions.length === 0) return null;
    
    const geometry = new BoxGeometry(0.9, 2.5, 0.9); // Slightly smaller than cell, tall enough for camera
    const material = new MeshBasicMaterial({ 
      visible: false, // Invisible - only for raycasting
      color: 0xff0000,
    });
    
    const mesh = new InstancedMesh(geometry, material, allWallPositions.length);
    mesh.name = 'cameraColliders';
    mesh.userData.isCameraBlocker = true;
    
    // Set up instance matrices
    const dummy = new Object3D();
    allWallPositions.forEach((pos, i) => {
      dummy.position.set(pos.x + 0.5, 1.25, pos.z + 0.5); // Center of cell, raised to mid-height
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    
    // Pre-compute bounding box for the entire mesh
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    
    return mesh;
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
        {cameraColliderMesh && <primitive object={cameraColliderMesh} />}
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
}: CharacterRendererProps) => {
  const groupRef = useRef<Group>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const initialRotationSet = useRef(false);
  
  const modelPath = `/models/${modelFile}`;
  const { scene, animations } = useGLTF(modelPath);
  
  // Get character scale and Y offset from centralized config
  const characterScale = getCharacterScale(modelFile);
  const characterYOffset = getCharacterYOffset(modelFile);
  
  // Calculate initial facing direction using same logic as player
  // findStartRotation returns "player rotation" format, convert to Three.js rotation.y with: -rotation + π
  const initialRotation = useMemo(() => {
    const charX = position.x + 0.5;
    const charZ = position.y + 0.5;
    const rotation = findStartRotation(maze, charX, charZ);
    return -rotation + Math.PI; // Same transform as player uses
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
const GoalMarker = ({ position, playerStateRef, isDialogueActive, maze }: { 
  position: [number, number, number];
  playerStateRef?: MutableRefObject<PlayerState>;
  isDialogueActive?: boolean;
  maze: Maze;
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
    />
  );
};

// PlacedCharacter - wraps CharacterRenderer for maze.characters array
const PlacedCharacter = ({ 
  character, 
  playerStateRef,
  isDialogueActive,
  maze,
}: { 
  character: MazeCharacter;
  playerStateRef?: MutableRefObject<PlayerState>;
  isDialogueActive: boolean;
  maze: Maze;
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
    />
  );
};

// DialogueCharacter - wraps CharacterRenderer for legacy dialogues with characterModel/speakerPosition
const DialogueCharacter = ({ 
  dialogue, 
  playerStateRef,
  isActiveDialogue,
  maze,
}: { 
  dialogue: DialogueTrigger;
  playerStateRef?: MutableRefObject<PlayerState>;
  isActiveDialogue: boolean;
  maze: Maze;
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
  const smoothRotation = useRef<number | null>(null); // Initialize to null, set on first frame
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
}: { 
  playerStateRef: MutableRefObject<PlayerState>;
  restartKey?: number;
  topDownCamera?: boolean;
  groundLevelCamera?: boolean;
  foliageGroupRef?: React.RefObject<Group>;
  autopush?: AutopushConfig;
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
  
  // Reset camera state when restartKey changes
  useEffect(() => {
    if (restartKey !== lastRestartKey.current) {
      lastRestartKey.current = restartKey;
      initialized.current = false;
      hasPlayerMoved.current = false;
      initialPlayerPos.current = null;
      currentDistance.current = 0.4;
      currentAutopushDist.current = null;
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
    
    // Calculate desired camera position behind player (reuse vector to avoid GC)
    const desiredDist = currentDistance.current;
    targetPos.current.set(
      playerX - Math.sin(rot) * desiredDist,
      currentHeight,
      playerZ + Math.cos(rot) * desiredDist
    );
    
    // Calculate target head position (for raycasting origin)
    const headPos = new Vector3(playerX, autopush.headHeight, playerZ);
    
    // === AUTOPUSH LOGIC ===
    let finalTargetPos = targetPos.current.clone();
    
    if (autopush.enabled && foliageGroupRef?.current && !DEBUG_OVERHEAD_VIEW && !groundLevelCamera) {
      // Calculate direction from head to desired camera position
      rayDir.current.copy(targetPos.current).sub(headPos).normalize();
      const rayLength = headPos.distanceTo(targetPos.current);
      
      // Find camera collider meshes - these are invisible boxes for raycasting
      // The foliageGroupRef points to the cameraColliders group which contains an InstancedMesh
      const cameraBlockers: Object3D[] = [];
      
      // The foliageGroupRef.current IS the cameraColliders group, so just get the mesh children
      foliageGroupRef.current.traverse((child) => {
        if ((child as InstancedMesh).isInstancedMesh) {
          cameraBlockers.push(child);
        }
      });
      
      // Debug: throttled logging
      const debugLogRef = (window as any).__autopushDebugLog || { lastLog: 0, loggedOnce: false };
      (window as any).__autopushDebugLog = debugLogRef;
      
      // One-time debug: log ref contents
      if (!debugLogRef.loggedOnce) {
        debugLogRef.loggedOnce = true;
        const childInfo: string[] = [];
        foliageGroupRef.current.traverse((child) => {
          childInfo.push(`${child.name || 'unnamed'} (${child.type})`);
        });
        console.log('[AUTOPUSH DEBUG] foliageGroupRef:', {
          name: foliageGroupRef.current.name,
          type: foliageGroupRef.current.type,
          childCount: foliageGroupRef.current.children.length,
          allDescendants: childInfo.slice(0, 10),
          blockerCount: cameraBlockers.length,
        });
      }
      
      // Perform raycasts (1 or 3 rays)
      let closestHitDist = rayLength;
      let hitObjectName = '';
      
      const performRaycast = (direction: Vector3) => {
        rayOrigin.current.copy(headPos);
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
        }
      };
      
      // Center ray
      performRaycast(rayDir.current);
      
      // Side rays (if enabled)
      if (autopush.rayCount === 3) {
        // Calculate perpendicular direction in XZ plane
        const perpX = -rayDir.current.z;
        const perpZ = rayDir.current.x;
        
        // Left ray
        tempVec.current.set(
          rayDir.current.x + perpX * autopush.raySpread,
          rayDir.current.y,
          rayDir.current.z + perpZ * autopush.raySpread
        ).normalize();
        performRaycast(tempVec.current);
        
        // Right ray
        tempVec.current.set(
          rayDir.current.x - perpX * autopush.raySpread,
          rayDir.current.y,
          rayDir.current.z - perpZ * autopush.raySpread
        ).normalize();
        performRaycast(tempVec.current);
      }
      
      // Get current time for hysteresis
      const now = performance.now();
      
      // Determine blocked distance with micro-hit filtering and hysteresis
      let targetDist = rayLength; // Default: no blocking, use full distance
      const desiredDistForAutopush = rayLength;
      
      // Calculate debug values
      const hitDist = closestHitDist;
      const pushedDist = hitDist < rayLength ? Math.max(hitDist - autopush.padding, autopush.minDist) : rayLength;
      const rawObstruction = desiredDistForAutopush - hitDist;
      const accepted = rawObstruction > autopush.minPushDelta;
      const hasHit = closestHitDist < rayLength;
      
      // Throttled debug log (every 500ms)
      if (now - debugLogRef.lastLog > 500) {
        debugLogRef.lastLog = now;
        console.log('[AUTOPUSH]', {
          blockerCount: cameraBlockers.length,
          rayOriginY: headPos.y.toFixed(2),
          desiredDist: rayLength.toFixed(2),
          hitDist: hasHit ? hitDist.toFixed(2) : 'none',
          hitObject: hasHit ? hitObjectName : 'none',
          pushedDist: pushedDist.toFixed(2),
          rawObstruction: rawObstruction.toFixed(2),
          minPushDelta: autopush.minPushDelta,
          accepted,
          currentAutopushDist: currentAutopushDist.current?.toFixed(2) ?? 'null',
        });
      }
      
      if (closestHitDist < rayLength) {
        // We have a hit - calculate potential blocked distance
        const potentialBlockedDist = Math.max(
          closestHitDist - autopush.padding,
          autopush.minDist
        );
        
        // Check if the RAW HIT is significant (not the clamped distance)
        // This properly detects real obstructions vs grazing leaves
        const rawObstruction = desiredDistForAutopush - closestHitDist;
        const isSignificantHit = rawObstruction > autopush.minPushDelta;
        
        if (isSignificantHit) {
          // Significant hit - push in
          targetDist = potentialBlockedDist;
          lastHitTime.current = now; // Record hit time for hysteresis
        } else {
          // Grazing hit - ignore, but check hysteresis
          const timeSinceHit = now - lastHitTime.current;
          if (timeSinceHit < autopush.holdTimeMs && currentAutopushDist.current !== null) {
            // Still in hysteresis hold period - maintain current pushed distance
            targetDist = currentAutopushDist.current;
          }
        }
      } else {
        // No hit - check hysteresis before relaxing
        const timeSinceHit = now - lastHitTime.current;
        if (timeSinceHit < autopush.holdTimeMs && currentAutopushDist.current !== null) {
          // Still in hysteresis hold period - maintain current pushed distance
          targetDist = currentAutopushDist.current;
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
      
      // Clamp to valid range
      currentAutopushDist.current = Math.max(autopush.minDist, Math.min(currentAutopushDist.current, desiredDistForAutopush));
      
      // Apply autopush: position camera at the smoothed distance
      finalTargetPos.copy(headPos).add(
        rayDir.current.clone().multiplyScalar(currentAutopushDist.current)
      );
      
      // Preserve the Y height from the original target
      finalTargetPos.y = currentHeight;
    }
    
    // Calculate look target ahead of player (reuse vector to avoid GC)
    const currentLookHeight = LOOK_HEIGHT_START + distanceProgress * (LOOK_HEIGHT_NORMAL - LOOK_HEIGHT_START);
    targetLookAt.current.set(
      playerX + Math.sin(rot) * LOOK_AHEAD,
      currentLookHeight,
      playerZ - Math.cos(rot) * LOOK_AHEAD
    );
    
    // Smooth position interpolation
    currentPosition.current.lerp(finalTargetPos, POSITION_SMOOTHING);
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
      
      {/* Background color MUST match fog color exactly for seamless horizon blending
          This is the key fix: distant corn fades into this color, not into a mismatched sky */}
      <color attach="background" args={['#B8B0A0']} />
      
      {/* Exponential fog - warm neutral tone matching background
          Density 0.14 ensures corn is ~90% obscured at 14m cull distance */}
      <fogExp2 attach="fog" args={['#B8B0A0', 0.14]} />
      
      {/* Ground */}
      <Ground maze={maze} rocks={rocks} playerStateRef={playerStateRef} />
      
      {/* Maze Walls (corn) with optimizations */}
      <MazeWalls 
        ref={foliageGroupRef}
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
          maze={maze}
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
          foliageGroupRef={foliageGroupRef}
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
