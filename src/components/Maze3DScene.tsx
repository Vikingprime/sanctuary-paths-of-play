import { useRef, useMemo, useEffect, MutableRefObject, useState, forwardRef } from 'react';
import { Canvas, useFrame, useThree, extend, useLoader } from '@react-three/fiber';
import { PerspectiveCamera, ContactShadows, useGLTF, Html, useTexture } from '@react-three/drei';
import { Vector3, ShaderMaterial, Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, Object3D, InstancedMesh, MeshStandardMaterial, DodecahedronGeometry, Group, AnimationMixer, Mesh, Material, Raycaster, BoxGeometry, MeshBasicMaterial, DoubleSide, Matrix4, PlaneGeometry, BackSide, SRGBColorSpace, TextureLoader, RepeatWrapping, ClampToEdgeWrapping, CanvasTexture, BufferGeometry, BufferAttribute, Float32BufferAttribute } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Maze, AnimalType, DialogueTrigger, MazeCharacter } from '@/types/game';
import { NPCRuntimeState } from '@/game/NPCRuntime';
import { InstancedWalls, CornOptimizationSettings, DEFAULT_CORN_SETTINGS, CullStats, setCellOpacity } from './CornWall';
import { PlayerCube } from './PlayerCube';
import { PlayerState, MovementInput, calculateMovement, generateRockPositions, RockPosition, CharacterPosition, checkCharacterCollision, checkCollision } from '@/game/GameLogic';
import { getCharacterScale, getCharacterYOffset, getCharacterHeight, getCharacterDebugPlaneColor, getCharacterTintColor, getCharacterRotationOffset } from '@/game/CharacterConfig';
import { findBestDirectionAngle } from '@/game/MazeUtils';
import { calculateFadeFactor, useOpacityFade } from './FogFadeMaterial';
import { getAutopushEnabled, getLOSFaderEnabled, frameMetrics, checkGcSpike } from '@/lib/debug';
import { MOBILE_CONTROL_CONFIG } from './MobileControls';
import { FogConfig, FOG_COLOR } from '@/game/FogConfig';
// LOSCornFader removed - corn fading is now integrated into CameraController's autopush logic
import mapTowerSignImage from '@/assets/map-tower-sign.png';
import { MedialAxisVisualization } from './MedialAxisVisualization';
import { SpurConfig } from '@/game/MedialAxis';
import { 
  MagnetismConfig, 
  MagnetismCache, 
  MagnetismTurnResult,
  MagnetismTurnState,
  DEFAULT_MAGNETISM_CONFIG, 
  buildMagnetismCache, 
  calculateMagnetismTurn,
  constrainMovementToTangent,
  findNearestPolylinePoint,
  PolylineNearestResult,
} from '@/game/CorridorMagnetism';

// Re-export for backward compatibility
export const ATMOSPHERE_COLOR = FogConfig.COLOR_HEX;
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
  shadowCasters?: number;
}

// === PERFORMANCE TOGGLES (for testing) ===
// Now controlled via props from MazeGame3D

interface DialogueTarget {
  speakerX: number;
  speakerZ: number;
  speakerHeight: number;
}

interface Maze3DSceneProps {
  maze: Maze;
  animalType: AnimalType;
  playerStateRef: MutableRefObject<PlayerState>;
  isMovingRef: MutableRefObject<boolean>;
  collectedPowerUps?: Set<string>;
  keysPressed: MutableRefObject<Set<string>>;
  // Mobile controls - 2D joystick system (Summer Afternoon style)
  joystickXRef?: MutableRefObject<number>; // -1 (left) to 1 (right)
  joystickYRef?: MutableRefObject<number>; // -1 (toward camera) to 1 (away from camera)
  mobileIsMovingRef?: MutableRefObject<boolean>;
  mobileTouchActiveRef?: MutableRefObject<boolean>;
  cameraYawRef?: MutableRefObject<number>; // Camera orbit yaw angle
  cameraOrbitDeltaRef?: MutableRefObject<number>; // Per-frame orbit delta from touch
  cameraOrbitActiveRef?: MutableRefObject<boolean>; // Whether orbit touch is active
  speedBoostActive: boolean;
  onCellInteraction: (x: number, y: number) => void;
  onCharacterClick?: (characterId: string) => void; // For click-triggered dialogues
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
  simpleGroundEnabled?: boolean;
  cornCullingEnabled?: boolean;
  skyEnabled?: boolean;
  shaderFadeEnabled?: boolean;
  lowShadowRes?: boolean;
  skeletonEnabled?: boolean;
  overlayGridEnabled?: boolean;
  showPrunedSpurs?: boolean;
  spurConfig?: SpurConfig | null;
  onDefaultSpurConfig?: (config: SpurConfig) => void;
  // Magnetism configuration
  magnetismConfig?: MagnetismConfig;
  magnetismDebugRef?: MutableRefObject<MagnetismTurnResult['debug'] | null>;
  showMagnetTarget?: boolean;
  showMagnetVector?: boolean;
  // Polyline smoothing configuration
  polylineConfig?: { chaikinIterations?: number; chaikinCornerExtraIterations?: number; chaikinFactor?: number; cornerPushStrength?: number } | null;
  // Rail movement mode
  railMode?: boolean;
  railPathRef?: MutableRefObject<Array<{ x: number; z: number }>>;
  railPathIndexRef?: MutableRefObject<number>;
  railFractionalIndexRef?: MutableRefObject<number>;
  railTurnPhaseRef?: MutableRefObject<boolean>;
  railTargetAngleRef?: MutableRefObject<number>;
  railTurnSpeed?: number;
  onRailMoveComplete?: () => void;
  onMagnetismCacheReady?: (cache: MagnetismCache) => void;
  // NPC rotation overrides (characterId -> Y rotation in radians)
  npcRotations?: Record<string, number>;
  // NPC position overrides for patrolling characters (characterId -> {x, y} grid position)
  npcPositions?: Record<string, { x: number; y: number }>;
  // NPC blocked states (stopped due to collision with player)
  npcBlockedStates?: Record<string, boolean>;
  // Hide vision cone overlays (during dialogue or debug toggle)
  hideVisionCones?: boolean;
  // Bait positions in world space
  baitPositions?: Array<{ id: string; x: number; y: number }>;
}

// Ground shader using multiple photo textures with random patches
// Path mud, grass/leaves, rocks - blended organically
const GroundMaterial = ({ maze, simple = false }: { maze: Maze; simple?: boolean }) => {
  // Load all ground textures
  const pathTexture = useTexture('/textures/ground-path-v2.jpg');
  const grassTexture = useTexture('/textures/ground-grass.jpg');
  const leavesTexture = useTexture('/textures/ground-leaves.jpg');
  const dirtTexture = useTexture('/textures/dirt_floor.jpg');
  
  const { material } = useMemo(() => {
    const mazeWidth = maze.grid[0].length;
    const mazeHeight = maze.grid.length;
    
    // Configure textures for tiling
    [pathTexture, grassTexture, leavesTexture, dirtTexture].forEach(tex => {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.minFilter = LinearMipmapLinearFilter;
      tex.magFilter = LinearFilter;
    });
    
    // Create wall map texture - white = wall, black = path
    const data = new Uint8Array(mazeWidth * mazeHeight * 4);
    for (let y = 0; y < mazeHeight; y++) {
      for (let x = 0; x < mazeWidth; x++) {
        const idx = (y * mazeWidth + x) * 4;
        const isWall = maze.grid[y][x].isWall ? 255 : 0;
        data[idx] = isWall;
        data[idx + 1] = isWall;
        data[idx + 2] = isWall;
        data[idx + 3] = 255;
      }
    }
    
    const wallMapTex = new DataTexture(data, mazeWidth, mazeHeight);
    wallMapTex.needsUpdate = true;
    wallMapTex.magFilter = LinearFilter;
    wallMapTex.minFilter = LinearFilter;
    
    const mat = new ShaderMaterial({
      uniforms: {
        pathTex: { value: pathTexture },
        grassTex: { value: grassTexture },
        leavesTex: { value: leavesTexture },
        dirtTex: { value: dirtTexture },
        wallMap: { value: wallMapTex },
        mazeWidth: { value: mazeWidth },
        mazeHeight: { value: mazeHeight },
        tileScale: { value: 2.0 },
        pathBrightness: { value: 0.48 },
        grassDarkness: { value: 0.25 },
        spilloverStrength: { value: 1.5 },
        fogColor: { value: new Color(ATMOSPHERE_COLOR) },
        fogDensity: { value: 0.14 },
        fogHeightMax: { value: 2.5 },
      },
      fog: true,
      vertexShader: `
        varying vec3 vWorldPos;
        varying float vFogDepth;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: simple ? `
        uniform sampler2D wallMap;
        uniform float mazeWidth;
        uniform float mazeHeight;
        uniform vec3 fogColor;
        uniform float fogDensity;
        uniform float fogHeightMax;
        varying float vFogDepth;
        varying vec3 vWorldPos;
        
        void main() {
          vec2 mazeUV = vWorldPos.xz / vec2(mazeWidth, mazeHeight);
          float isWall = texture2D(wallMap, mazeUV).r;
          float wallMask = smoothstep(0.4, 0.6, isWall);
          
          float inBounds = step(0.0, mazeUV.x) * step(mazeUV.x, 1.0) * 
                          step(0.0, mazeUV.y) * step(mazeUV.y, 1.0);
          wallMask = mix(1.0, wallMask, inBounds);
          
          vec3 pathColor = vec3(0.55, 0.35, 0.26);
          vec3 grassColor = vec3(0.14, 0.22, 0.1);
          vec3 finalColor = mix(pathColor, grassColor, wallMask);
          
          float heightAttenuation = 1.0 - smoothstep(0.0, fogHeightMax, vWorldPos.y);
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          fogFactor *= heightAttenuation;
          finalColor = mix(finalColor, fogColor, clamp(fogFactor, 0.0, 1.0));
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      ` : `
        uniform sampler2D pathTex;
        uniform sampler2D grassTex;
        uniform sampler2D leavesTex;
        uniform sampler2D dirtTex;
        uniform sampler2D wallMap;
        uniform float mazeWidth;
        uniform float mazeHeight;
        uniform float tileScale;
        uniform float pathBrightness;
        uniform float grassDarkness;
        uniform float spilloverStrength;
        uniform vec3 fogColor;
        uniform float fogDensity;
        uniform float fogHeightMax;
        varying vec3 vWorldPos;
        varying float vFogDepth;
        
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
        
        void main() {
          vec2 worldUV = vWorldPos.xz;
          vec2 mazeUV = worldUV / vec2(mazeWidth, mazeHeight);
          float isWall = texture2D(wallMap, mazeUV).r;
          
          // Soft organic edge for wall/path boundary
          float edgeNoise = noise(worldUV * 1.2) * 0.4;
          float wallMask = smoothstep(0.25, 0.75, isWall + edgeNoise);
          
          // Edge proximity for transition effects (wall edges)
          float edgeProximity = smoothstep(0.05, 0.45, isWall) * smoothstep(0.95, 0.4, isWall);
          
          // Grass jutting FROM corn edges - irregular protrusions
          float pathArea = 1.0 - smoothstep(0.3, 0.7, isWall);
          
          // Directional noise that creates finger-like protrusions from edges
          float juttingNoise = noise(worldUV * 3.0 + 100.0);
          float juttingDetail = noise(worldUV * 6.0 + 150.0) * 0.25;
          
          // Extend edge proximity further on some spots (irregular edge depth)
          float irregularEdge = edgeProximity + juttingNoise * 0.4;
          
          // Create jagged protrusions - more grass where noise is high AND near edge
          float juttingAmount = smoothstep(0.35, 0.65, irregularEdge) * smoothstep(0.4, 0.6, juttingNoise + juttingDetail);
          float grassLeak = juttingAmount * spilloverStrength;
          
          float inBounds = step(0.0, mazeUV.x) * step(mazeUV.x, 1.0) * 
                          step(0.0, mazeUV.y) * step(mazeUV.y, 1.0);
          wallMask = mix(1.0, wallMask, inBounds);
          grassLeak = grassLeak * inBounds;
          
          // Sample textures
          vec2 texUV = worldUV * tileScale;
          vec3 pathColor = texture2D(pathTex, texUV).rgb * pathBrightness * vec3(1.0, 0.85, 0.7);
          vec3 grassColor = texture2D(grassTex, texUV).rgb * grassDarkness * vec3(1.0, 0.8, 0.55);
          vec3 leavesColor = texture2D(leavesTex, texUV * 0.8).rgb * 0.65;
          vec3 dirtColor = texture2D(dirtTex, texUV * 1.5).rgb * 0.95;
          
          // Occasional small patches - only near edges, sparse
          float patchNoise1 = noise(worldUV * 1.2 + 300.0);
          float patchNoise2 = noise(worldUV * 0.9 + 500.0);
          
          // Leaves - rare, small patches near edges
          float leavesPatch = smoothstep(0.72, 0.85, patchNoise1) * edgeProximity * 0.4;
          
          // Dirt patches - very sparse, on path sides
          float dirtPatch = smoothstep(0.75, 0.88, patchNoise2) * edgeProximity * 0.35;
          
          // Base: path is dominant, grass under corn
          vec3 baseColor = mix(pathColor, grassColor, wallMask);
          
          // Grass leaking onto path edges - use full grass color
          baseColor = mix(baseColor, grassColor, grassLeak);
          
          // Apply sparse patches
          vec3 finalColor = baseColor;
          finalColor = mix(finalColor, leavesColor, leavesPatch);
          finalColor = mix(finalColor, dirtColor, dirtPatch);
          
          // Apply fog
          float heightAttenuation = 1.0 - smoothstep(0.0, fogHeightMax, vWorldPos.y);
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          fogFactor *= heightAttenuation;
          finalColor = mix(finalColor, fogColor, clamp(fogFactor, 0.0, 1.0));
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
    
    return { material: mat };
  }, [maze, simple, pathTexture, grassTexture, leavesTexture, dirtTexture]);
  
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
const Ground = ({ maze, rocks, playerStateRef, rocksEnabled = true, grassEnabled = true, simpleGroundEnabled = false }: { 
  maze: Maze; 
  rocks: RockPosition[]; 
  playerStateRef: MutableRefObject<PlayerState>;
  rocksEnabled?: boolean;
  grassEnabled?: boolean;
  simpleGroundEnabled?: boolean;
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
        <GroundMaterial maze={maze} simple={simpleGroundEnabled} />
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
  shaderFadeEnabled?: boolean;
  rimLightStrength?: number;
}>(({ maze, playerStateRef, optimizationSettings, onCullStats, shaderFadeEnabled = true, rimLightStrength = 0.25 }, ref) => {
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
        shaderFadeEnabled={shaderFadeEnabled}
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
  const signTexture = useTexture(mapTowerSignImage);
  
  return (
    <group position={position}>
      {/* Tower base - height=1, positioned at y=0.5 means bottom is at y=0 */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 1, 8]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      {/* Tower sign with maze image - front */}
      <mesh position={[0, 1.1, 0.03]}>
        <planeGeometry args={[0.4, 0.3]} />
        <meshStandardMaterial map={signTexture} />
      </mesh>
      {/* Tower sign with maze image - back */}
      <mesh position={[0, 1.1, -0.03]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.4, 0.3]} />
        <meshStandardMaterial map={signTexture} />
      </mesh>
      {/* Sign backing */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.45, 0.35, 0.05]} />
        <meshStandardMaterial color="#5C4033" />
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
  isGoalMarker?: boolean;
  alwaysFacePlayer?: boolean;
  maze: Maze;
  showCollisionDebug?: boolean;
  rotationOverride?: number;
  isPatrolling?: boolean; // enables smooth position interpolation in useFrame
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
  rotationOverride,
  isPatrolling = false,
}: CharacterRendererProps) => {
  const groupRef = useRef<Group>(null);
  const rootGroupRef = useRef<Group>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const initialRotationSet = useRef(false);
  
  const modelPath = `/models/${modelFile}`;
  const { scene, animations } = useGLTF(modelPath);
  
  // Get character scale and Y offset from centralized config
  const characterScale = getCharacterScale(modelFile);
  const characterYOffset = getCharacterYOffset(modelFile);
  const debugPlaneColor = getCharacterDebugPlaneColor(modelFile);
  const tintColor = getCharacterTintColor(modelFile);
  
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
  // Force visibility on clones and disable frustum culling for tiny models
  // Some GLTFs arrive with hidden children or unreliable bounds after cloning
  const { model, materials } = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const mats: Material[] = [];

    clone.visible = true;
    clone.traverse((child: any) => {
      child.visible = true;

      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;

        // Clone materials per instance and enable transparency for fading
        if (child.material) {
          const childMats = Array.isArray(child.material) ? child.material : [child.material];
          const clonedChildMats = childMats.map((mat: Material) => {
            const clonedMat = mat.clone();
            (clonedMat as any).transparent = true;
            (clonedMat as any).opacity = 1;

            if (tintColor && clonedMat instanceof MeshStandardMaterial) {
              clonedMat.color.lerp(new Color(tintColor), 0.55);
            }

            mats.push(clonedMat);
            return clonedMat;
          });

          child.material = Array.isArray(child.material) ? clonedChildMats : clonedChildMats[0];
        }
      }
    });

    return { model: clone, materials: mats };
  }, [scene, tintColor]);
  
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
    // Smooth position interpolation for patrolling NPCs
    if (isPatrolling && rootGroupRef.current) {
      const targetX = position.x + 0.5;
      const targetZ = position.y + 0.5;
      const lerpSpeed = 8; // higher = snappier
      rootGroupRef.current.position.x += (targetX - rootGroupRef.current.position.x) * Math.min(lerpSpeed * delta, 1);
      rootGroupRef.current.position.z += (targetZ - rootGroupRef.current.position.z) * Math.min(lerpSpeed * delta, 1);
    }

    if (groupRef.current) {
      // Set initial rotation on first frame (raycast-based)
      if (!initialRotationSet.current) {
        groupRef.current.rotation.y = initialRotation;
        initialRotationSet.current = true;
      }
      
      // Face player during dialogue OR if alwaysFacePlayer is set
      if (playerStateRef && (isDialogueActive || alwaysFacePlayer)) {
        const charX = isPatrolling && rootGroupRef.current ? rootGroupRef.current.position.x : position.x + 0.5;
        const charZ = isPatrolling && rootGroupRef.current ? rootGroupRef.current.position.z : position.y + 0.5;
        const playerX = playerStateRef.current.x;
        const playerZ = playerStateRef.current.y;
        
        const dx = playerX - charX;
        const dz = playerZ - charZ;
        const angle = Math.atan2(dx, dz);
        groupRef.current.rotation.y = angle;
      } else if (rotationOverride !== undefined) {
        // Apply NPC turning/patrol rotation override directly
        // directionToRotation already uses the same convention as initialRotation (PI/2 - atan2)
        // No rotationOffset needed - that was causing east/west to be swapped
        groupRef.current.rotation.y = rotationOverride;
      }
      
      // Apply opacity fade based on distance from player
      if (playerStateRef) {
        const charX = isPatrolling && rootGroupRef.current ? rootGroupRef.current.position.x : position.x + 0.5;
        const charZ = isPatrolling && rootGroupRef.current ? rootGroupRef.current.position.z : position.y + 0.5;
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
    <group ref={rootGroupRef} position={[position.x + 0.5, characterYOffset, position.y + 0.5]}>
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
  onClick,
  rotationOverride,
  positionOverride,
  isBlocked = false,
}: { 
  character: MazeCharacter;
  playerStateRef?: MutableRefObject<PlayerState>;
  isDialogueActive: boolean;
  maze: Maze;
  showCollisionDebug?: boolean;
  onClick?: (characterId: string) => void;
  rotationOverride?: number; // Y rotation in radians, overrides default facing
  positionOverride?: { x: number; y: number }; // Override position for patrolling NPCs
  isBlocked?: boolean; // True when NPC is stopped due to player collision
}) => {
  // Check if this character has any click-triggered dialogues
  const hasClickDialogue = maze.dialogues?.some(
    d => d.triggerType === 'click' && d.speakerCharacterId === character.id
  );
  
  return (
    <group
      onClick={hasClickDialogue ? (e) => {
        e.stopPropagation();
        onClick?.(character.id);
      } : undefined}
    >
      <CharacterRenderer
        modelFile={character.model}
        position={positionOverride ?? character.position}
        animation={isBlocked ? 'idle' : character.animation}
        playerStateRef={playerStateRef}
        isDialogueActive={isDialogueActive}
        alwaysFacePlayer={character.alwaysFacePlayer}
        maze={maze}
        showCollisionDebug={showCollisionDebug}
        rotationOverride={rotationOverride}
        isPatrolling={!!positionOverride}
      />
    </group>
  );
};

// VisionConeOverlay - renders a smooth triangle cone on the ground for NPC vision zones
const VisionConeOverlay = ({ 
  character, 
  rotationOverride,
  positionOverride,
  maze,
}: { 
  character: MazeCharacter;
  rotationOverride?: number;
  positionOverride?: { x: number; y: number };
  maze: Maze;
}) => {
  const coneGeometry = useMemo(() => {
    if (!character.coneVision) return null;
    
    const { range, spreadPerCell } = character.coneVision;
    const pos = positionOverride ?? character.position;
    
    // Calculate cone half-angle from spread parameters
    const farHalfWidth = spreadPerCell * (range - 1) + 0.5;
    const halfAngle = Math.atan2(farHalfWidth, range);
    
    // Determine direction
    let direction: 'north' | 'south' | 'east' | 'west' = 'south';
    if (rotationOverride !== undefined) {
      const normalized = ((rotationOverride % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (normalized < Math.PI * 0.25 || normalized > Math.PI * 1.75) direction = 'south';
      else if (normalized < Math.PI * 0.75) direction = 'west';
      else if (normalized < Math.PI * 1.25) direction = 'north';
      else direction = 'east';
    }
    
    // Forward direction angle in XZ plane
    let baseAngle: number;
    switch (direction) {
      case 'south': baseAngle = Math.PI / 2; break;   // +Z
      case 'north': baseAngle = -Math.PI / 2; break;  // -Z
      case 'east':  baseAngle = 0; break;              // +X
      case 'west':  baseAngle = Math.PI; break;        // -X
    }
    
    // Ray-march across the cone to find wall intersections
    const rayCount = 48;
    const maxDist = range + 0.5;
    const stepSize = 0.12;
    const rayEndpoints: [number, number][] = [];
    
    // NPC center in world coords
    const cx = pos.x + 0.5;
    const cz = pos.y + 0.5;
    const gridHeight = maze.grid.length;
    const gridWidth = maze.grid[0]?.length ?? 0;
    
    for (let i = 0; i <= rayCount; i++) {
      const t = i / rayCount;
      const angle = baseAngle - halfAngle + t * 2 * halfAngle;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      
      // March ray until wall or max distance
      let hitDist = maxDist;
      for (let d = stepSize; d <= maxDist; d += stepSize) {
        const wx = cx + dirX * d;
        const wz = cz + dirZ * d;
        const gx = Math.floor(wx);
        const gz = Math.floor(wz);
        
        // Out of bounds or wall cell = stop ray
        if (gz < 0 || gz >= gridHeight || gx < 0 || gx >= gridWidth || maze.grid[gz]?.[gx]?.isWall) {
          hitDist = d - stepSize * 0.5; // Pull back slightly to not overlap wall
          break;
        }
      }
      
      // Store endpoint in local space (relative to NPC center)
      rayEndpoints.push([dirX * hitDist, dirZ * hitDist]);
    }
    
    // Build triangle fan from center to adjacent ray endpoint pairs
    const fanVertices: number[] = [];
    for (let i = 0; i < rayCount; i++) {
      fanVertices.push(0, 0, 0);
      fanVertices.push(rayEndpoints[i][0], 0, rayEndpoints[i][1]);
      fanVertices.push(rayEndpoints[i + 1][0], 0, rayEndpoints[i + 1][1]);
    }
    
    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(new Float32Array(fanVertices), 3));
    geom.computeVertexNormals();
    return geom;
  }, [character.coneVision, character.position, positionOverride, rotationOverride, maze]);
  
  if (!coneGeometry) return null;
  
  
  
  const pos = positionOverride ?? character.position;
  
  // Characters render at (pos.x + 0.5, pos.y + 0.5) - center of grid cell
  const cx = pos.x + 0.5;
  const cz = pos.y + 0.5;
  
  return (
    <group>
      {/* Smooth triangle cone */}
      {coneGeometry && (
        <mesh
          position={[cx, 0.03, cz]}
          geometry={coneGeometry}
        >
          <meshBasicMaterial
            color="#cc2200"
            transparent
            opacity={0.25}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      )}
    </group>
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
  joystickXRef,
  joystickYRef,
  mobileIsMovingRef,
  mobileTouchActiveRef,
  cameraYawRef,
  cameraOrbitDeltaRef,
  cameraOrbitActiveRef,
  speedBoostActive,
  onCellInteraction,
  isPaused,
  isMuted,
  rocks,
  characters,
  showCollisionDebug = true,
  animalRimLight = 0.5,
  magnetismConfig,
  magnetismDebugRef,
  onMagnetismCacheReady,
  // Rail movement props
  railMode = false,
  railPathRef,
  railPathIndexRef,
  railFractionalIndexRef,
  railTurnPhaseRef,
  railTargetAngleRef,
  railTurnSpeed = 2.5,
  onRailMoveComplete,
  // Polyline config for cache rebuilding
  polylineConfig,
  // Restart key to force cache re-trigger
  restartKey,
}: {
  animalType: AnimalType;
  playerStateRef: MutableRefObject<PlayerState>;
  isMovingRef: MutableRefObject<boolean>;
  maze: Maze;
  keysPressed: MutableRefObject<Set<string>>;
  joystickXRef?: MutableRefObject<number>;
  joystickYRef?: MutableRefObject<number>;
  mobileIsMovingRef?: MutableRefObject<boolean>;
  mobileTouchActiveRef?: MutableRefObject<boolean>;
  cameraYawRef?: MutableRefObject<number>;
  cameraOrbitDeltaRef?: MutableRefObject<number>;
  cameraOrbitActiveRef?: MutableRefObject<boolean>;
  speedBoostActive: boolean;
  onCellInteraction: (x: number, y: number) => void;
  isPaused: boolean;
  isMuted?: boolean;
  rocks: RockPosition[];
  characters: CharacterPosition[];
  showCollisionDebug?: boolean;
  animalRimLight?: number;
  magnetismConfig?: MagnetismConfig;
  magnetismDebugRef?: MutableRefObject<MagnetismTurnResult['debug'] | null>;
  onMagnetismCacheReady?: (cache: MagnetismCache) => void;
  // Rail movement props
  railMode?: boolean;
  railPathRef?: MutableRefObject<Array<{ x: number; z: number }>>;
  railPathIndexRef?: MutableRefObject<number>;
  railFractionalIndexRef?: MutableRefObject<number>;
  railTurnPhaseRef?: MutableRefObject<boolean>;
  railTargetAngleRef?: MutableRefObject<number>;
  railTurnSpeed?: number;
  onRailMoveComplete?: () => void;
  // Polyline config
  polylineConfig?: { chaikinIterations?: number; chaikinCornerExtraIterations?: number; chaikinFactor?: number; cornerPushStrength?: number } | null;
  // Restart key to force cache re-trigger on restart
  restartKey?: number;
}) => {
  const groupRef = useRef<any>(null);
  const smoothRotation = useRef<number | null>(null); // Initialize to null, set on first frame
  const smoothPositionX = useRef(0);
  const smoothPositionZ = useRef(0);
  const positionInitialized = useRef(false);
  const lastCellRef = useRef({ x: -1, y: -1 }); // Track last cell for interaction check
  const smoothBankAngle = useRef(0); // For banking/leaning during turns
  
  // Reset smooth position initialization when restartKey changes
  // This ensures the animal doesn't "jump" from old position to new snapped position
  useEffect(() => {
    positionInitialized.current = false;
  }, [restartKey]);
  
  // Animation state refs for PlayerCube
  const isTurningRef = useRef(false); // True when turning in place (no forward movement)
  const moveSpeedRef = useRef(0); // Current movement speed 0-1 (for walk vs gallop)
  
  // Magnetism state (turn-based)
  const magnetismCacheRef = useRef<MagnetismCache | null>(null);
  const magnetismTurnStateRef = useRef<MagnetismTurnState>({ currentCorrection: 0, initialized: false, committedSign: 1, lastNearestFx: -1, lastNearestFy: -1, lockDuration: 0, smoothedSpineX: 0, smoothedSpineZ: 0 });
  
  // Collision state for magnetism weakening
  const collisionIntensityRef = useRef(0);
  
  // Ref pattern for onMagnetismCacheReady to avoid triggering useMemo recomputation
  const onMagnetismCacheReadyRef = useRef(onMagnetismCacheReady);
  onMagnetismCacheReadyRef.current = onMagnetismCacheReady;
  
  // Build magnetism cache when maze or polyline config changes
  useMemo(() => {
    if (magnetismConfig?.enabled) {
      const cache = buildMagnetismCache(maze, undefined, polylineConfig);
      magnetismCacheRef.current = cache;
      // Clear rail path when cache rebuilds (path points are now stale)
      if (railPathRef) {
        railPathRef.current = [];
      }
      if (railPathIndexRef) {
        railPathIndexRef.current = 0;
      }
      if (railFractionalIndexRef) {
        railFractionalIndexRef.current = 0;
      }
      // Notify parent that cache is ready (for rail mode)
      onMagnetismCacheReadyRef.current?.(cache);
    }
  }, [maze, magnetismConfig?.enabled, polylineConfig, railPathRef, railPathIndexRef, railFractionalIndexRef, restartKey]);
  
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
      
      // === RAIL MODE: Automatic movement along polyline path ===
      // Move by stepping through path points at a fixed world-space speed
      // Position is set EXACTLY on path points - no "move toward" interpolation
      if (railMode && railPathRef?.current && railPathRef.current.length >= 2 && railPathIndexRef) {
        const path = railPathRef.current;
        
        // === TURN PHASE: Rotate to face path direction before moving ===
        if (railTurnPhaseRef?.current && railTargetAngleRef?.current !== undefined) {
          const player = playerStateRef.current;
          const targetAngle = railTargetAngleRef.current;
          
          // Calculate angle difference
          let angleDiff = targetAngle - player.rotation;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          
          // Turn speed from prop (default 2.5 radians per second)
          const turnAmount = railTurnSpeed * clampedDelta;
          
          if (Math.abs(angleDiff) <= turnAmount) {
            // Finished turning - snap to target and start moving
            playerStateRef.current = {
              ...player,
              rotation: targetAngle,
            };
            railTurnPhaseRef.current = false;
          } else {
            // Continue turning
            const turnDir = angleDiff > 0 ? 1 : -1;
            let newRotation = player.rotation + turnDir * turnAmount;
            while (newRotation < 0) newRotation += Math.PI * 2;
            while (newRotation >= Math.PI * 2) newRotation -= Math.PI * 2;
            
            playerStateRef.current = {
              ...player,
              rotation: newRotation,
            };
            
            // Set animation state to turning
            isTurningRef.current = true;
            isMovingRef.current = false;
            moveSpeedRef.current = 0;
          }
          // Skip movement during turn phase
        } else {
          // === MOVEMENT PHASE: Travel along the path ===
          
          // Use a continuous progress value instead of integer index
          // This tracks our exact position along the polyline
          // Path now starts exactly at player position, so no jerk on first frame
          let progress = railFractionalIndexRef?.current ?? 0;
          const isFirstMovementFrame = progress === 0;
          
          // Calculate total distance to travel this frame
          const RAIL_SPEED = 2.5; // World units per second
          let remainingDist = RAIL_SPEED * clampedDelta;
          
          // Step through path segments until we've traveled the required distance
          while (remainingDist > 0 && progress < path.length - 1) {
            const currentIdx = Math.floor(progress);
            const nextIdx = Math.min(currentIdx + 1, path.length - 1);
            
            const p0 = path[currentIdx];
            const p1 = path[nextIdx];
            
            // Distance from current fractional position to next point
            const segmentT = progress - currentIdx; // 0-1 within this segment
            const currentX = p0.x + (p1.x - p0.x) * segmentT;
            const currentZ = p0.z + (p1.z - p0.z) * segmentT;
            
            // Segment length
            const segDx = p1.x - p0.x;
            const segDz = p1.z - p0.z;
            const segLen = Math.sqrt(segDx * segDx + segDz * segDz);
            
            if (segLen < 0.0001) {
              // Skip zero-length segments
              progress = nextIdx;
              continue;
            }
            
            // How far to the end of this segment?
            const distToSegEnd = segLen * (1 - segmentT);
            
            if (remainingDist >= distToSegEnd) {
              // Move to end of this segment and continue
              remainingDist -= distToSegEnd;
              progress = nextIdx;
            } else {
              // Partial move within this segment
              const advanceT = remainingDist / segLen;
              progress += advanceT;
              remainingDist = 0;
            }
          }
          
          // Clamp progress to valid range
          progress = Math.min(progress, path.length - 1);
          if (railFractionalIndexRef) {
            railFractionalIndexRef.current = progress;
          }
          railPathIndexRef.current = Math.floor(progress);
          
          // Calculate exact position on path
          const currentIdx = Math.floor(progress);
          const nextIdx = Math.min(currentIdx + 1, path.length - 1);
          const t = progress - currentIdx;
          const p0 = path[currentIdx];
          const p1 = path[nextIdx];
          const newX = p0.x + (p1.x - p0.x) * t;
          const newZ = p0.z + (p1.z - p0.z) * t;
          
          // Calculate tangent for rotation using interpolation to avoid discrete jumps
          // Use fractional progress to smoothly interpolate between tangent windows
          const LOOK_BEHIND = 3;
          const LOOK_AHEAD = 5;
          
          // Get tangent at current integer index and next integer index
          const idx0 = currentIdx;
          const idx1 = Math.min(currentIdx + 1, path.length - 1);
          const frac = t; // 0-1 fractional part within current segment
          
          // Tangent window for idx0
          const behind0 = Math.max(0, idx0 - LOOK_BEHIND);
          const ahead0 = Math.min(path.length - 1, idx0 + LOOK_AHEAD);
          const dx0 = path[ahead0].x - path[behind0].x;
          const dz0 = path[ahead0].z - path[behind0].z;
          const angle0 = Math.atan2(dx0, dz0);
          
          // Tangent window for idx1
          const behind1 = Math.max(0, idx1 - LOOK_BEHIND);
          const ahead1 = Math.min(path.length - 1, idx1 + LOOK_AHEAD);
          const dx1 = path[ahead1].x - path[behind1].x;
          const dz1 = path[ahead1].z - path[behind1].z;
          const angle1 = Math.atan2(dx1, dz1);
          
          // Interpolate between the two tangent angles
          let angleDiff = angle1 - angle0;
          if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          const visualAngle = angle0 + angleDiff * frac;
          
          let targetRotation = -visualAngle + Math.PI;
          while (targetRotation < 0) targetRotation += Math.PI * 2;
          while (targetRotation >= Math.PI * 2) targetRotation -= Math.PI * 2;
          
          // Smooth rotation interpolation to avoid jitter
          // Lerp toward target rotation with high smoothing factor
          let finalRotation = targetRotation;
          if (!isFirstMovementFrame) {
            const currentRot = playerStateRef.current.rotation;
            let rotDiff = targetRotation - currentRot;
            // Handle wrap-around
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            // Smooth with high lerp factor (0.15) for responsive but smooth turns
            const ROTATION_SMOOTH = 0.15;
            finalRotation = currentRot + rotDiff * ROTATION_SMOOTH;
            // Normalize
            while (finalRotation < 0) finalRotation += Math.PI * 2;
            while (finalRotation >= Math.PI * 2) finalRotation -= Math.PI * 2;
          }
          
          // Set position exactly on the path curve
          playerStateRef.current = {
            x: newX,
            y: newZ,
            rotation: isFirstMovementFrame ? playerStateRef.current.rotation : finalRotation,
          };
          
          // Check if reached end
          if (progress >= path.length - 1.01) {
            railPathRef.current = [];
            railPathIndexRef.current = 0;
            if (railFractionalIndexRef) railFractionalIndexRef.current = 0;
            isMovingRef.current = false;
            moveSpeedRef.current = 0;
            onRailMoveComplete?.();
          } else {
            isMovingRef.current = true;
            isTurningRef.current = false;
            moveSpeedRef.current = 0.8;
          }
        }
        
        // In rail mode, still apply camera orbit delta from touch
        if (cameraYawRef && cameraOrbitDeltaRef && cameraOrbitDeltaRef.current !== 0) {
          cameraYawRef.current += cameraOrbitDeltaRef.current;
          cameraOrbitDeltaRef.current = 0;
          while (cameraYawRef.current > Math.PI * 2) cameraYawRef.current -= Math.PI * 2;
          while (cameraYawRef.current < 0) cameraYawRef.current += Math.PI * 2;
        }
        
        // In rail mode, keyboard Q/E for camera orbit
        if (cameraYawRef) {
          const KEYBOARD_ORBIT_SPEED = 2.0;
          if (keysPressed.current.has('q')) {
            cameraYawRef.current -= KEYBOARD_ORBIT_SPEED * clampedDelta;
          }
          if (keysPressed.current.has('e')) {
            cameraYawRef.current += KEYBOARD_ORBIT_SPEED * clampedDelta;
          }
          while (cameraYawRef.current > Math.PI * 2) cameraYawRef.current -= Math.PI * 2;
          while (cameraYawRef.current < 0) cameraYawRef.current += Math.PI * 2;
        }
        
        // Skip normal movement processing in rail mode
      } else {
        // === NORMAL MOVEMENT (keyboard/joystick) ===
      
      // Get joystick input
      const joyX = joystickXRef?.current ?? 0;
      const joyY = joystickYRef?.current ?? 0;
      const joystickMagnitude = Math.sqrt(joyX * joyX + joyY * joyY);
      const mobileActive = (mobileTouchActiveRef?.current ?? false) && joystickMagnitude > 0.01;
      
      // Check if any keyboard keys are pressed
      const keyboardActive = keysPressed.current.has('w') || keysPressed.current.has('s') || 
                            keysPressed.current.has('a') || keysPressed.current.has('d') ||
                            keysPressed.current.has('arrowup') || keysPressed.current.has('arrowdown') ||
                            keysPressed.current.has('arrowleft') || keysPressed.current.has('arrowright');
      
      let input: MovementInput;
      
      // Keyboard ALWAYS takes priority, then mobile joystick
      if (keyboardActive) {
        // KEYBOARD MODE: Traditional WASD controls
        input = {
          forward: keysPressed.current.has('arrowup') || keysPressed.current.has('w'),
          backward: keysPressed.current.has('arrowdown') || keysPressed.current.has('s'),
          rotateLeft: keysPressed.current.has('arrowleft') || keysPressed.current.has('a'),
          rotateRight: keysPressed.current.has('arrowright') || keysPressed.current.has('d'),
          rotationIntensity: 1.0,
        };
        
        // Update animation refs for keyboard
        const isForwardOrBack = input.forward || input.backward;
        const isRotating = input.rotateLeft || input.rotateRight;
        isMovingRef.current = isForwardOrBack;
        isTurningRef.current = isRotating && !isForwardOrBack; // Only turning in place
        moveSpeedRef.current = isForwardOrBack ? 1.0 : 0; // Keyboard is always full speed
        
        // Keyboard Q/E for camera orbit (while also moving with WASD)
        if (cameraYawRef) {
          const KEYBOARD_ORBIT_SPEED = 2.0;
          if (keysPressed.current.has('q')) {
            cameraYawRef.current -= KEYBOARD_ORBIT_SPEED * clampedDelta;
          }
          if (keysPressed.current.has('e')) {
            cameraYawRef.current += KEYBOARD_ORBIT_SPEED * clampedDelta;
          }
          while (cameraYawRef.current > Math.PI * 2) cameraYawRef.current -= Math.PI * 2;
          while (cameraYawRef.current < 0) cameraYawRef.current += Math.PI * 2;
        }
        
        // Calculate movement with clamped delta
        const prev = playerStateRef.current;
        const newState = calculateMovement(maze, prev, input, clampedDelta, speedBoostActive, rocks, animalType, characters);
        playerStateRef.current = { x: newState.x, y: newState.y, rotation: newState.rotation };
        collisionIntensityRef.current = newState.collisionIntensity;
      } else if (mobileActive) {
        // MOBILE JOYSTICK MODE: Summer Afternoon style camera-relative movement
        // Camera orbits based on joystick X
        const ORBIT_SPEED = 2.5; // radians per second at full deflection
        if (cameraYawRef) {
          cameraYawRef.current += joyX * ORBIT_SPEED * clampedDelta;
          // Normalize to 0-2PI
          while (cameraYawRef.current > Math.PI * 2) cameraYawRef.current -= Math.PI * 2;
          while (cameraYawRef.current < 0) cameraYawRef.current += Math.PI * 2;
        }
        
        // Apply camera orbit delta from touch (right side of screen)
        if (cameraYawRef && cameraOrbitDeltaRef) {
          cameraYawRef.current += cameraOrbitDeltaRef.current;
          cameraOrbitDeltaRef.current = 0; // Consume delta
          // Normalize
          while (cameraYawRef.current > Math.PI * 2) cameraYawRef.current -= Math.PI * 2;
          while (cameraYawRef.current < 0) cameraYawRef.current += Math.PI * 2;
        }
        
        // Movement is ALWAYS forward (toward or away from camera based on joystick Y)
        // joystickY > 0 = push away from camera, joystickY < 0 = pull toward camera
        const hasMovement = Math.abs(joyY) > 0.1;
        const hasRotation = Math.abs(joyX) > 0.1; // Camera is orbiting, which implies character turn
        
        if (hasMovement && cameraYawRef) {
          // Calculate world movement direction based on camera yaw
          const cameraYaw = cameraYawRef.current;
          
          // Movement direction: forward from camera's perspective
          // joyY positive = move in direction camera faces (away)
          // joyY negative = move toward camera (but still facing camera direction)
          const targetMoveAngle = cameraYaw + (joyY < 0 ? Math.PI : 0);
          const moveSpeed = Math.abs(joyY);
          
          // GRADUAL TURNING: Instead of snapping to target rotation, smoothly rotate
          // This prevents the jerking when joystick moves from one side to another
          const currentRotation = playerStateRef.current.rotation;
          const angleDiff = normalizeAngle(targetMoveAngle - currentRotation);
          
          // Turn speed in radians per second (3.0 is the standard turn rate)
          const TURN_SPEED = 3.0;
          const maxTurn = TURN_SPEED * clampedDelta;
          
          // Clamp the turn to max speed, ensuring we turn the shortest direction
          let newRotation: number;
          if (Math.abs(angleDiff) <= maxTurn) {
            newRotation = targetMoveAngle; // Close enough, snap to target
          } else {
            // Rotate toward target at max speed
            newRotation = currentRotation + Math.sign(angleDiff) * maxTurn;
          }
          
          // Normalize the new rotation
          newRotation = normalizeAngle(newRotation);
          // Convert to 0-2PI range for consistency
          if (newRotation < 0) newRotation += Math.PI * 2;
          
          // Create movement input - always "forward" in the calculated direction
          input = {
            forward: true,
            backward: false,
            rotateLeft: false,
            rotateRight: false,
            rotationIntensity: 1.0,
            speedMultiplier: moveSpeed,
          };
          
          // Update player rotation gradually
          playerStateRef.current = {
            ...playerStateRef.current,
            rotation: newRotation,
          };
          
          // Calculate movement
          const prev = playerStateRef.current;
          const newState = calculateMovement(maze, prev, input, clampedDelta, speedBoostActive, rocks, animalType, characters);
          
          // Apply tangent constraint at high magnetism strength (locks movement to corridor direction)
          // Now uses fresh polyline lookup with current position (no frame lag)
          const magnetStrength = magnetismConfig?.enabled ? (magnetismConfig.strength ?? 5) : 0;
          // Use VISUAL rotation (same as magnetism debug) to match where the animal visually faces
          const constraintVisualRotation = -newState.rotation + Math.PI;
          
          // Calculate joystick world direction for junction prediction in constraint
          let constraintJoyDirX = 0;
          let constraintJoyDirZ = 0;
          const joyXConstraint = joystickXRef?.current ?? 0;
          const joyYConstraint = joystickYRef?.current ?? 0;
          const joystickMagConstraint = Math.sqrt(joyXConstraint * joyXConstraint + joyYConstraint * joyYConstraint);
          const mobileActiveConstraint = (mobileTouchActiveRef?.current ?? false) && joystickMagConstraint > 0.01;
          const keyboardActiveConstraint = keysPressed.current.has('w') || keysPressed.current.has('s') || 
                                keysPressed.current.has('a') || keysPressed.current.has('d') ||
                                keysPressed.current.has('arrowup') || keysPressed.current.has('arrowdown') ||
                                keysPressed.current.has('arrowleft') || keysPressed.current.has('arrowright');
          
          if (mobileActiveConstraint && cameraYawRef && joystickMagConstraint > 0.1) {
            const camYaw = cameraYawRef.current;
            const targetAngle = camYaw + (joyYConstraint < 0 ? Math.PI : 0);
            constraintJoyDirX = Math.sin(targetAngle);
            constraintJoyDirZ = Math.cos(targetAngle);
          } else if (keyboardActiveConstraint) {
            constraintJoyDirX = Math.sin(newState.rotation);
            constraintJoyDirZ = Math.cos(newState.rotation);
          }
          
          const constrained = constrainMovementToTangent(
            prev.x,
            prev.y,
            newState.x,
            newState.y,
            magnetismCacheRef.current,              // Pass cache for fresh lookup
            magnetStrength,
            constraintVisualRotation,               // Use visual rotation (matches debug markers)
            DEFAULT_MAGNETISM_CONFIG.frontOffset,   // Pass front offset (0.35)
            constraintJoyDirX,                      // Joystick world direction for junction prediction
            constraintJoyDirZ
          );
          
          
          playerStateRef.current = { x: constrained.x, y: constrained.z, rotation: newState.rotation };
          collisionIntensityRef.current = newState.collisionIntensity;
          
          // Update animation refs
          isMovingRef.current = true;
          isTurningRef.current = Math.abs(angleDiff) > 0.15; // Turning significantly
          moveSpeedRef.current = moveSpeed;
        } else if (hasRotation && cameraYawRef) {
          // Only camera orbiting, animal should turn to face camera direction
          const cameraYaw = cameraYawRef.current;
          const targetRotation = cameraYaw; // Face the direction camera is looking
          
          const currentRotation = playerStateRef.current.rotation;
          const angleDiff = normalizeAngle(targetRotation - currentRotation);
          
          // Slower turn when stationary
          const TURN_SPEED = 2.0;
          const maxTurn = TURN_SPEED * clampedDelta;
          
          let newRotation: number;
          if (Math.abs(angleDiff) <= maxTurn) {
            newRotation = targetRotation;
          } else {
            newRotation = currentRotation + Math.sign(angleDiff) * maxTurn;
          }
          
          newRotation = normalizeAngle(newRotation);
          if (newRotation < 0) newRotation += Math.PI * 2;
          
          playerStateRef.current = {
            ...playerStateRef.current,
            rotation: newRotation,
          };
          
          // Update animation refs - turning in place
          isMovingRef.current = false;
          isTurningRef.current = Math.abs(angleDiff) > 0.05;
          moveSpeedRef.current = 0;
        } else {
          // No input - no movement or turning
          isMovingRef.current = false;
          isTurningRef.current = false;
          moveSpeedRef.current = 0;
          collisionIntensityRef.current = 0; // Reset collision state when idle
        }
      } else {
        // No joystick/keyboard input - but still apply camera orbit delta from touch
        if (cameraYawRef && cameraOrbitDeltaRef && cameraOrbitDeltaRef.current !== 0) {
          cameraYawRef.current += cameraOrbitDeltaRef.current;
          cameraOrbitDeltaRef.current = 0;
          while (cameraYawRef.current > Math.PI * 2) cameraYawRef.current -= Math.PI * 2;
          while (cameraYawRef.current < 0) cameraYawRef.current += Math.PI * 2;
        }
        
        // Keyboard Q/E for camera orbit
        if (cameraYawRef) {
          const KEYBOARD_ORBIT_SPEED = 2.0;
          if (keysPressed.current.has('q')) {
            cameraYawRef.current -= KEYBOARD_ORBIT_SPEED * clampedDelta;
          }
          if (keysPressed.current.has('e')) {
            cameraYawRef.current += KEYBOARD_ORBIT_SPEED * clampedDelta;
          }
          while (cameraYawRef.current > Math.PI * 2) cameraYawRef.current -= Math.PI * 2;
          while (cameraYawRef.current < 0) cameraYawRef.current += Math.PI * 2;
        }
        
        isMovingRef.current = false;
        isTurningRef.current = false;
        moveSpeedRef.current = 0;
        collisionIntensityRef.current = 0;
      }
      } // End of else block for normal movement (non-rail mode)
      
      // === MAGNETISM: Calculate turn-based corridor alignment ===
      // Skip magnetism in rail mode - the path already defines exact movement
      // Always calculate for debug visualization, but only apply correction when moving
      if (!railMode && magnetismConfig?.enabled && magnetismCacheRef.current) {
        const config = magnetismConfig || DEFAULT_MAGNETISM_CONFIG;
        const player = playerStateRef.current;
        
        // Calculate turn correction based on alignment with corridor spine
        // Use visual rotation (matches mesh rotation) for sensing points
        const visualRotation = -player.rotation + Math.PI;
        
        // Calculate joystick direction in world space for junction prediction
        // This allows the magnetism system to choose the best branch at junctions
        let joystickWorldDirX = 0;
        let joystickWorldDirZ = 0;
        
        // Re-compute mobile/keyboard active state for magnetism context
        const joyXMag = joystickXRef?.current ?? 0;
        const joyYMag = joystickYRef?.current ?? 0;
        const joystickMagForMagnetism = Math.sqrt(joyXMag * joyXMag + joyYMag * joyYMag);
        const mobileActiveForMagnetism = (mobileTouchActiveRef?.current ?? false) && joystickMagForMagnetism > 0.01;
        const keyboardActiveForMagnetism = keysPressed.current.has('w') || keysPressed.current.has('s') || 
                              keysPressed.current.has('a') || keysPressed.current.has('d') ||
                              keysPressed.current.has('arrowup') || keysPressed.current.has('arrowdown') ||
                              keysPressed.current.has('arrowleft') || keysPressed.current.has('arrowright');
        
        if (mobileActiveForMagnetism && cameraYawRef) {
          if (joystickMagForMagnetism > 0.1) {
            // Convert joystick input to world direction
            // joyY controls forward/backward, joyX controls left/right turn
            // The movement direction is based on camera yaw
            const cameraYaw = cameraYawRef.current;
            const targetAngle = cameraYaw + (joyYMag < 0 ? Math.PI : 0);
            
            // Direction the player wants to move (in world space)
            joystickWorldDirX = Math.sin(targetAngle);
            joystickWorldDirZ = Math.cos(targetAngle);
          }
        } else if (keyboardActiveForMagnetism) {
          // For keyboard, use the current facing direction as the "joystick" direction
          joystickWorldDirX = Math.sin(player.rotation);
          joystickWorldDirZ = Math.cos(player.rotation);
        }
        
        const magnetResult = calculateMagnetismTurn(
          player.x,
          player.y,
          visualRotation,
          magnetismCacheRef.current,
          config,
          magnetismTurnStateRef.current,
          clampedDelta,
          joystickWorldDirX,
          joystickWorldDirZ
        );
        
        // Apply turn correction when moving, but WEAKEN during collisions
        // This allows the player to turn more freely when stuck against walls
        
        
        if (isMovingRef.current && magnetResult.turnCorrection !== 0) {
          // Weaken magnetism based on collision intensity (0 = full magnetism, 1 = no magnetism)
          const collisionWeakening = 1 - collisionIntensityRef.current;
          const weakenedCorrection = magnetResult.turnCorrection * collisionWeakening;
          
          if (Math.abs(weakenedCorrection) > 0.001) {
            // Negate the correction because it was calculated in visual space (inverted rotation)
            const newRotation = normalizeAngle(player.rotation - weakenedCorrection);
            // Convert to 0-2PI range for consistency
            let normalizedRotation = newRotation;
            if (normalizedRotation < 0) normalizedRotation += Math.PI * 2;
            
            playerStateRef.current = {
              ...playerStateRef.current,
              rotation: normalizedRotation,
            };
            
            // Note: Camera yaw sync removed - it was causing disorienting movement.
            // The magnetism now only affects the player's rotation, not the camera.
          }
        }
        
        // Update debug ref for visualization (always, even when stationary)
        if (magnetismDebugRef) {
          magnetismDebugRef.current = magnetResult.debug;
        }
      } else if (magnetismDebugRef) {
        // Clear debug when magnetism disabled
        magnetismDebugRef.current = null;
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
    
    // Smooth position with mode-aware lerp factor
    // Rail mode: instant position snap to eliminate all lag/jitter
    // Joystick mode: gentle smoothing for natural movement
    const targetX = playerStateRef.current.x;
    const targetZ = playerStateRef.current.y;
    const posLerpFactor = railMode ? 1.0 : 0.3;
    smoothPositionX.current += (targetX - smoothPositionX.current) * posLerpFactor;
    smoothPositionZ.current += (targetZ - smoothPositionZ.current) * posLerpFactor;
    
    groupRef.current.position.x = smoothPositionX.current;
    groupRef.current.position.z = smoothPositionZ.current;
    
    // Smooth rotation with fixed lerp factor
    // In rail mode, use very fast lerp (near-instant) to lock rotation to path tangent
    const targetRotation = -playerStateRef.current.rotation + Math.PI;
    let rotDiff = targetRotation - (smoothRotation.current ?? targetRotation);
    if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    
    // Rail mode: snap to target rotation immediately; Joystick mode: smooth transition
    const rotLerpFactor = railMode ? 1.0 : 0.15;
    smoothRotation.current = (smoothRotation.current ?? targetRotation) + rotDiff * rotLerpFactor;
    
    // Normalize rotation
    if (smoothRotation.current > Math.PI * 2) smoothRotation.current -= Math.PI * 2;
    if (smoothRotation.current < 0) smoothRotation.current += Math.PI * 2;
    
    groupRef.current.rotation.y = smoothRotation.current;
    
    // === BANKING / LEANING ===
    // Bank based on joystick X (turning/orbiting)
    const MAX_BANK_ANGLE = 0.18; // ~10 degrees max lean
    const joyXForBank = joystickXRef?.current ?? 0;
    
    // Target bank is opposite of turn direction (lean into the turn)
    const targetBank = -joyXForBank * 0.15;
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
        isTurningRef={isTurningRef}
        moveSpeedRef={moveSpeedRef}
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
  raySpread: 0.25,      // ~14 degrees spread for side rays (wider to catch adjacent corn)
  holdTimeMs: 250,      // Keep pushed-in for 250ms after ray clears
  minPushDelta: 0.25,   // Ignore grazing hits (was 0.6, too strict; 0.05 too loose)
};

// Zoom speed limits (units per second)
const AUTOPUSH_ZOOM_IN_SPEED = 2.0;  // Max zoom-in speed
const AUTOPUSH_ZOOM_OUT_SPEED = 1.0; // Max zoom-out speed

// Simple over-the-shoulder camera with smooth follow - reads from ref each frame
// Supports orbit mode when cameraYawRef is provided (Summer Afternoon style)
const OverShoulderCameraController = ({ 
  playerStateRef,
  restartKey,
  topDownCamera = false,
  groundLevelCamera = false,
  foliageGroupRef,
  autopush = DEFAULT_AUTOPUSH,
  animalType,
  maze,
  opacityFadeEnabled = true,
  cameraYawRef,
  cameraOrbitActiveRef,
  mobileTouchActiveRef,
  keysPressed,
  railMode = false,
  isMovingRef,
}: { 
  playerStateRef: MutableRefObject<PlayerState>;
  restartKey?: number;
  topDownCamera?: boolean;
  groundLevelCamera?: boolean;
  foliageGroupRef?: React.RefObject<Group>;
  autopush?: AutopushConfig;
  animalType?: AnimalType;
  maze?: Maze;
  opacityFadeEnabled?: boolean;
  cameraYawRef?: MutableRefObject<number>;
  cameraOrbitActiveRef?: MutableRefObject<boolean>;
  mobileTouchActiveRef?: MutableRefObject<boolean>;
  keysPressed?: MutableRefObject<Set<string>>;
  railMode?: boolean;
  isMovingRef?: MutableRefObject<boolean>;
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
  const currentDistance = useRef(0.4);
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
  // Use faster smoothing in rail mode to match the instant animal position/rotation
  const POSITION_SMOOTHING = railMode ? 0.5 : 0.15;
  const ROTATION_SMOOTHING = railMode ? 0.5 : 0.12;
  const DISTANCE_ZOOM_SPEED = 0.02; // How fast camera pulls back
  const MOVEMENT_THRESHOLD = 0.3; // How far player must move from spawn to trigger zoom
  
  useFrame(() => {
    const { x: playerX, y: playerZ, rotation: playerRotation } = playerStateRef.current;
    
    // === CAMERA DRIFT-BACK ===
    // When no orbit touch is active AND no joystick is being used, drift camera back behind player
    const orbitActive = cameraOrbitActiveRef?.current ?? false;
    const touchActive = mobileTouchActiveRef?.current ?? false;
    
    // Also pause drift when Q/E keys are held
    const qeActive = keysPressed?.current?.has('q') || keysPressed?.current?.has('e');
    
    if (cameraYawRef && !orbitActive && !touchActive && !qeActive) {
      let diff = playerRotation - cameraYawRef.current;
      // Shortest path wrap-around
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      // Only drift if there's meaningful difference
      if (Math.abs(diff) > 0.01) {
        const isMoving = isMovingRef?.current ?? false;
        const DRIFT_SPEED = isMoving ? 0.0104 : 0.008; // 1.3x faster while moving
        cameraYawRef.current += diff * DRIFT_SPEED;
        // Normalize
        while (cameraYawRef.current > Math.PI * 2) cameraYawRef.current -= Math.PI * 2;
        while (cameraYawRef.current < 0) cameraYawRef.current += Math.PI * 2;
      }
    }
    
    // In orbit mode (Q/E or touch), use cameraYawRef; otherwise follow player rotation
    // In rail mode, still allow orbit override when cameraYawRef differs from playerRotation
    const targetCameraYaw = cameraYawRef?.current ?? playerRotation;
    
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
      smoothRotation.current = targetCameraYaw;
      initialPlayerPos.current = { x: playerX, z: playerZ };
      const rot = targetCameraYaw;
      // Set camera position immediately without interpolation (start close)
      currentPosition.current.set(
        playerX - Math.sin(rot) * CAMERA_DISTANCE_START,
        CAMERA_HEIGHT_START,
        playerZ + Math.cos(rot) * CAMERA_DISTANCE_START
      );
      currentLookAt.current.set(
        playerX,
        LOOK_HEIGHT_START,
        playerZ
      );
      initialized.current = true;
    }
    
    // Smoothly interpolate camera rotation using shortest path
    // Use cameraYawRef for orbit mode, player rotation for traditional mode
    let rotDiff = targetCameraYaw - smoothRotation.current;
    // Handle wrap-around (shortest path)
    if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    smoothRotation.current += rotDiff * ROTATION_SMOOTHING;
    // Keep in 0-2π range
    smoothRotation.current = ((smoothRotation.current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    
    const rot = smoothRotation.current;
    
    // Calculate desired camera position orbiting around player
    const desiredDist = currentDistance.current;
    targetPos.current.set(
      playerX - Math.sin(rot) * desiredDist,
      currentHeight,
      playerZ + Math.cos(rot) * desiredDist
    );
    
    // For orbit camera, always look at player (not ahead of player)
    const lookHeight = LOOK_HEIGHT_START + distanceProgress * (LOOK_HEIGHT_NORMAL - LOOK_HEIGHT_START);
    targetLookAt.current.set(
      playerX,
      lookHeight,
      playerZ
    );
    
    // Calculate target head position (for raycasting origin) - use autopush headHeight
    // to ensure rays have enough horizontal component to hit wall colliders
    // Reuse ref to avoid GC
    const rayOriginHeight = Math.max(targetHeight, autopush.headHeight);
    headPosRef.current.set(playerX, rayOriginHeight, playerZ);
    
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
      
      const performRaycast = (direction: Vector3, collectFadeCells = false) => {
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
          
          // Only the center ray contributes cells for translucency.
          // Side rays are used for autopush only so corn at the edges doesn't fade while moving.
          if (collectFadeCells) {
            for (const hit of intersects) {
              const cellX = hit.object.userData.cellX;
              const cellZ = hit.object.userData.cellZ;
              if (cellX !== undefined && cellZ !== undefined) {
                centerRayHitCellsRef.current.add(`${cellX},${cellZ}`);
              }
            }
          }
        }
      };
      
      // Center ray - collect hits for both autopush AND fading
      performRaycast(rayDir.current, true);
      frameMetrics.raycastCount++; // Track raycasts for debug
      
      // Side rays (if enabled) - autopush only
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
        frameMetrics.raycastCount++;
        
        // Right ray
        tempVec.current.set(
          rayDir.current.x - perpX * autopush.raySpread,
          rayDir.current.y,
          rayDir.current.z - perpZ * autopush.raySpread
        ).normalize();
        performRaycast(tempVec.current);
        frameMetrics.raycastCount++;
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
      
      // Only the center ray may drive translucency.
      const fadeCells = centerRayHitCellsRef.current;
      
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
        } else {
          // Grazing hit - ignore, but check hysteresis
          const timeSinceHit = now - lastHitTime.current;
          if (timeSinceHit < autopush.holdTimeMs && currentAutopushDist.current !== null) {
            // Still in hysteresis hold period - maintain current pushed distance
            targetDist = currentAutopushDist.current;
          }
        }
        
        // Only fade for direct, significant center-ray occlusion.
        if (opacityFadeEnabled && isSignificantHit && fadeCells.size > 0) {
          frameMetrics.activeFadedCells = fadedCellsRef.current.size;
          
          for (const cellKey of fadeCells) {
            const existing = fadedCellsRef.current.get(cellKey);
            if (existing) {
              existing.lastHitTime = now;
            } else {
              fadedCellsRef.current.set(cellKey, { opacity: 1.0, lastHitTime: now });
            }
          }
        }
        
        // Update all faded cells
        if (opacityFadeEnabled) {
          for (const [cellKey, state] of fadedCellsRef.current) {
            const isCurrentlyHit = fadeCells.has(cellKey) && isSignificantHit;
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
        if (opacityFadeEnabled) {
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
      }
      
      frameMetrics.activeFadedCells = fadedCellsRef.current.size;
      
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
  
  useFrame(() => {
    const playerX = playerStateRef.current.x;
    const playerZ = playerStateRef.current.y;
    const speakerHeight = Math.max(0.25, dialogueTarget.speakerHeight || 1.0);
    const smallNpcBias = Math.min(1, Math.max(0, (0.6 - speakerHeight) / 0.35));
    const cameraHeight = Math.min(2.4, Math.max(1.22, 1.1 + speakerHeight * 0.85 + smallNpcBias * 0.18));
    const lookHeight = Math.min(1.35, Math.max(0.22, speakerHeight * 0.72 + smallNpcBias * 0.12));
    const baseZoomDistance = Math.min(3.0, Math.max(1.05, 1.05 + speakerHeight * 1.15 - smallNpcBias * 0.45));
    
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

    // For tiny characters, move the camera closer than the player's silhouette and add a slight side offset.
    const maxZoomBeforePlayer = dist > 0.5
      ? Math.max(0.72, dist - (0.5 + smallNpcBias * 0.45))
      : baseZoomDistance;
    const zoomDistance = smallNpcBias > 0 ? Math.min(baseZoomDistance, maxZoomBeforePlayer) : baseZoomDistance;
    const sideOffset = smallNpcBias * 0.55;
    const perpX = -dirZ;
    const perpZ = dirX;
    
    const camX = speakerX + dirX * zoomDistance + perpX * sideOffset;
    const camZ = speakerZ + dirZ * zoomDistance + perpZ * sideOffset;
    
    camera.position.set(camX, cameraHeight, camZ);
    camera.up.set(0, 1, 0);
    camera.lookAt(speakerX, lookHeight, speakerZ);
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

  // Load both horizon textures: barn (panel 1) and trees (panels 0, 2)
  const barnTexture = useLoader(TextureLoader, '/textures/farm-horizon.png');
  const treesTexture = useLoader(TextureLoader, '/textures/horizon-trees.png');
  
  // Configure textures for seamless wrapping
  // Disable mipmaps to prevent seam artifacts from atan() derivative discontinuity
  useMemo(() => {
    [barnTexture, treesTexture].forEach(tex => {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = ClampToEdgeWrapping;
      tex.minFilter = LinearFilter; // No mipmaps - prevents dotted seam line
      tex.magFilter = LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
    });
  }, [barnTexture, treesTexture]);
  
  // ShaderMaterial for sky using cylindrical projection with dual textures
  // Panel layout: trees (0) | barn (1) | trees (2)
  const skyMaterial = useMemo(() => {
    const mat = new ShaderMaterial({
      uniforms: {
        barnTexture: { value: barnTexture },
        treesTexture: { value: treesTexture },
        horizonHeight: { value: FogConfig.HORIZON_HEIGHT },
        imageHeight: { value: FogConfig.HORIZON_IMAGE_HEIGHT },
        bottomColor: { value: FOG_COLOR.clone() },
        topColor: { value: new Color(SKY_TOP_COLOR) },
        fogSolidHeightPct: { value: FogConfig.SKY_BAND_SOLID_HEIGHT },
        fogTransitionTopPct: { value: FogConfig.SKY_BAND_TRANSITION_TOP },
      },
      vertexShader: `
        varying vec3 vLocalPosition;
        void main() {
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D barnTexture;
        uniform sampler2D treesTexture;
        uniform float horizonHeight;
        uniform float imageHeight;
        uniform vec3 bottomColor;
        uniform vec3 topColor;
        uniform float fogSolidHeightPct;
        uniform float fogTransitionTopPct;
        varying vec3 vLocalPosition;
        
        void main() {
          vec3 viewDir = normalize(vLocalPosition);
          float height = viewDir.y; // -1 (down) to 1 (up)
          
          // Image band boundaries
          float imageBottom = horizonHeight - imageHeight * 0.5;
          float imageTop = horizonHeight + imageHeight * 0.5;
          
          // Fog band: solid fog up to fogSolidHeight, then transition to image up to fogTopHeight
          // Add smooth wave variation - uses u_raw (calculated below) so we compute angle first
          float angle = atan(viewDir.x, viewDir.z);
          float u_raw = (angle / (2.0 * 3.14159265) + 0.5); // 0-1 around full circle
          
          // Smooth curved variation using overlapping sine waves (always adds, never subtracts)
          float wave1 = sin(u_raw * 6.28318 * 2.0) * 0.5 + 0.5; // 2 waves around circle
          float wave2 = sin(u_raw * 6.28318 * 3.0 + 1.0) * 0.5 + 0.5; // 3 waves, offset
          float wave3 = sin(u_raw * 6.28318 * 5.0 + 2.5) * 0.5 + 0.5; // 5 waves, offset
          float waveVariation = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2); // Blend waves
          float fogHeightBoost = waveVariation * 0.08; // Max 8% additional height
          
          float fogSolidHeight = imageBottom + imageHeight * (fogSolidHeightPct + fogHeightBoost);
          float fogTopHeight = imageBottom + imageHeight * (fogTransitionTopPct + fogHeightBoost);
          
          // Repeat 3x and determine which panel we're in (angle/u_raw already computed above)
          
          // Repeat 3x and determine which panel we're in
          float u_scaled = u_raw * 3.0;
          int panel = int(floor(u_scaled));
          float u = fract(u_scaled); // 0-1 within each panel
          
          vec3 finalColor;
          
          // Gamma correct the fog color (linear -> sRGB) since we have toneMapped: false
          vec3 fogColorCorrected = pow(bottomColor, vec3(1.0 / 2.2));
          vec3 skyColorCorrected = pow(topColor, vec3(1.0 / 2.2));
          
          // Check if we're in the image band
          if (height >= imageBottom && height <= imageTop) {
            // Map height within band to V coordinate (0 to 1)
            float v = (height - imageBottom) / imageHeight;
            
            // Sample from barn for panel 1, trees for panels 0 and 2
            vec3 imageColor;
            if (panel == 1) {
              imageColor = texture2D(barnTexture, vec2(u, v)).rgb;
            } else {
              imageColor = texture2D(treesTexture, vec2(u, v)).rgb;
            }
            
            // Boost saturation and contrast for crisper colors
            vec3 gray = vec3(dot(imageColor, vec3(0.299, 0.587, 0.114)));
            imageColor = mix(gray, imageColor, 1.3); // Saturation boost (1.0 = normal)
            imageColor = (imageColor - 0.5) * 1.15 + 0.5; // Contrast boost
            imageColor = clamp(imageColor, 0.0, 1.0);
            
            if (height < fogSolidHeight) {
              // Below solid threshold: 100% fog color
              finalColor = fogColorCorrected;
            } else if (height < fogTopHeight) {
              // Transition zone: blend from fog to image
              float fogBlend = smoothstep(fogTopHeight, fogSolidHeight, height);
              finalColor = mix(imageColor, fogColorCorrected, fogBlend);
            } else {
              // Above fog: pure image (already sRGB)
              finalColor = imageColor;
            }
          } else if (height < imageBottom) {
            // Below image: solid fog color
            finalColor = fogColorCorrected;
          } else {
            // Above image: gradient to sky blue
            float t = clamp((height - imageTop) / (1.0 - imageTop), 0.0, 1.0);
            finalColor = mix(skyColorCorrected, skyColorCorrected * 0.8, t);
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
  }, [barnTexture, treesTexture]);
  
  return (
    <mesh ref={skyRef} renderOrder={-1000} material={skyMaterial}>
      <sphereGeometry args={[95, 32, 32]} />
    </mesh>
  );
};

const Scene = ({ maze, animalType, playerStateRef, isMovingRef, collectedPowerUps = new Set(), keysPressed, joystickXRef, joystickYRef, mobileIsMovingRef, mobileTouchActiveRef, cameraYawRef, cameraOrbitDeltaRef, cameraOrbitActiveRef, speedBoostActive, onCellInteraction, onCharacterClick, isPaused, isMuted, onSceneReady, cornOptimizationSettings, onCullStats, debugMode = false, restartKey, dialogueTarget, topDownCamera = false, groundLevelCamera = false, showCollisionDebug = true, shadowsEnabled = true, grassEnabled = true, rocksEnabled = true, animationsEnabled = true, opacityFadeEnabled = true, cornEnabled = true, simpleGroundEnabled = false, cornCullingEnabled = true, skyEnabled = true, shaderFadeEnabled = true, lowShadowRes = false, cornRimLight = 0.25, animalRimLight = 0.5, skeletonEnabled = false, overlayGridEnabled = false, showPrunedSpurs = false, spurConfig = null, onDefaultSpurConfig, magnetismConfig, magnetismDebugRef, showMagnetTarget = false, showMagnetVector = false, polylineConfig = null, railMode = false, railPathRef, railPathIndexRef, railFractionalIndexRef, railTurnPhaseRef, railTargetAngleRef, railTurnSpeed = 2.5, onRailMoveComplete, onMagnetismCacheReady, npcRotations = {}, npcPositions = {}, npcBlockedStates = {}, hideVisionCones = false, baitPositions = [] }: Maze3DSceneProps & { simpleGroundEnabled?: boolean; cornCullingEnabled?: boolean; skyEnabled?: boolean; shaderFadeEnabled?: boolean; lowShadowRes?: boolean; cornRimLight?: number; animalRimLight?: number; skeletonEnabled?: boolean; overlayGridEnabled?: boolean; showPrunedSpurs?: boolean; spurConfig?: { maxSpurLen: number; minSpurDistance: number } | null; onDefaultSpurConfig?: (config: { maxSpurLen: number; minSpurDistance: number }) => void; polylineConfig?: { chaikinIterations?: number; chaikinCornerExtraIterations?: number; cornerPushStrength?: number } | null }) => {
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
    
    // Add placed characters from maze.characters (use npcPositions for patrolling ones)
    maze.characters?.forEach((char) => {
      const pos = npcPositions[char.id] ?? char.position;
      positions.push({
        x: pos.x,
        y: pos.y,
        radius: char.patrol ? 0.15 : CHARACTER_COLLISION_RADIUS, // Patrolling NPCs - player can squeeze past
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
  }, [maze, npcPositions]);

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
      <ambientLight intensity={0.9} color="#FFE4CC" />
      
      {/* Near shadows - resolution controlled by lowShadowRes toggle */}
      {/* Key forces remount when resolution changes - Three.js caches shadow maps */}
      {/* Main light coming from barn direction (Panel 1 = ~180° = -Z direction) */}
      <directionalLight
        key={`shadow-light-${lowShadowRes ? 'lo' : 'hi'}`}
        ref={lightRef}
        position={[0, 50, -25]}
        intensity={1.75}
        color="#FFA050"
        castShadow={shadowsEnabled}
        shadow-mapSize={lowShadowRes ? [512, 512] : [2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
          shadow-camera-left={-15}
          shadow-camera-right={15}
          shadow-camera-top={15}
          shadow-camera-bottom={-15}
        shadow-bias={-0.0001}
      >
        <object3D attach="target" />
      </directionalLight>
      
      
      {/* Fill light from opposite side (trees direction) */}
      <directionalLight
        position={[0, 15, 25]}
        intensity={0.45}
        color="#FFE8D0"
      />
      
      {/* Hemisphere light for natural sky/ground color */}
      <hemisphereLight args={['#FFB870', '#9B7B5A', 0.55]} />
      
      {/* Sky orb - flat material, no fog/tonemapping */}
      {skyEnabled && <SkyBackground />}
      
      {/* Exponential fog - uses unified atmosphere color
          Density 0.14 ensures corn is ~90% obscured at 14m cull distance */}
      <fogExp2 attach="fog" args={[FogConfig.COLOR_HEX, FogConfig.DENSITY]} />
      {/* Ground */}
      <Ground maze={maze} rocks={rocks} playerStateRef={playerStateRef} rocksEnabled={rocksEnabled} grassEnabled={grassEnabled} simpleGroundEnabled={simpleGroundEnabled} />
      
      {/* Maze Walls (corn) with optimizations */}
      {cornEnabled && (
        <MazeWalls 
          ref={foliageGroupRef}
          maze={maze} 
          playerStateRef={playerStateRef}
          optimizationSettings={{ ...cornOptimizationSettings, enableDistanceCulling: cornCullingEnabled && (cornOptimizationSettings?.enableDistanceCulling ?? true) }}
          onCullStats={onCullStats}
          shaderFadeEnabled={shaderFadeEnabled}
          rimLightStrength={cornRimLight}
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
      
      {/* Medial Axis Skeleton Visualization (debug only) */}
      {debugMode && (
        <MedialAxisVisualization 
          maze={maze} 
          visible={skeletonEnabled || overlayGridEnabled || showMagnetTarget || showMagnetVector} 
          showRidge={false}
          showHeatmap={overlayGridEnabled}
          showPrunedSpurs={showPrunedSpurs}
          height={0.15}
          pointSize={0.08}
          spurConfig={spurConfig}
          onDefaultSpurConfig={onDefaultSpurConfig}
          polylineConfig={polylineConfig}
          showMagnetTarget={showMagnetTarget}
          showMagnetVector={showMagnetVector}
          magnetismDebugRef={magnetismDebugRef}
          playerStateRef={playerStateRef}
        />
      )}
      
      {/* Placed Characters from maze.characters array */}
      {maze.characters?.map((character) => (
        <PlacedCharacter
          key={`placed-char-${character.id}`}
          character={character}
          playerStateRef={playerStateRef}
          isDialogueActive={
            dialogueTarget !== null && 
            Math.abs(dialogueTarget.speakerX - (npcPositions[character.id]?.x ?? character.position.x)) < 0.5 &&
            Math.abs(dialogueTarget.speakerZ - (npcPositions[character.id]?.y ?? character.position.y)) < 0.5
          }
          maze={maze}
          showCollisionDebug={showCollisionDebug}
          onClick={onCharacterClick}
          rotationOverride={npcRotations[character.id]}
          positionOverride={npcPositions[character.id]}
          isBlocked={npcBlockedStates[character.id]}
        />
      ))}
      
      {/* Placed Bait objects */}
      {baitPositions?.map((bait) => (
        <group key={bait.id} position={[bait.x, 0.05, bait.y]}>
          <mesh>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color="#ff8800" emissive="#ff6600" emissiveIntensity={0.3} />
          </mesh>
          {/* Glow ring */}
          <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
            <ringGeometry args={[0.15, 0.25, 16]} />
            <meshBasicMaterial color="#ffaa00" transparent opacity={0.4} />
          </mesh>
        </group>
      ))}
      
      {/* Vision Cone overlays for NPCs with vision - hidden during dialogue or when debug-disabled */}
      {!hideVisionCones && maze.characters?.filter(c => c.coneVision || c.directionalVision).map((character) => (
        <VisionConeOverlay
          key={`vision-${character.id}`}
          character={character}
          rotationOverride={npcRotations[character.id]}
          positionOverride={npcPositions[character.id]}
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
        joystickXRef={joystickXRef}
        joystickYRef={joystickYRef}
        mobileIsMovingRef={mobileIsMovingRef}
        mobileTouchActiveRef={mobileTouchActiveRef}
        cameraYawRef={cameraYawRef}
        cameraOrbitDeltaRef={cameraOrbitDeltaRef}
        cameraOrbitActiveRef={cameraOrbitActiveRef}
        speedBoostActive={speedBoostActive}
        onCellInteraction={onCellInteraction}
        isPaused={isPaused}
        isMuted={isMuted}
        rocks={rocks}
        characters={characterPositions}
        showCollisionDebug={showCollisionDebug}
        animalRimLight={animalRimLight}
        magnetismConfig={magnetismConfig}
        magnetismDebugRef={magnetismDebugRef}
        onMagnetismCacheReady={onMagnetismCacheReady}
        railMode={railMode}
        railPathRef={railPathRef}
        railPathIndexRef={railPathIndexRef}
        railFractionalIndexRef={railFractionalIndexRef}
        railTurnPhaseRef={railTurnPhaseRef}
        railTargetAngleRef={railTargetAngleRef}
        railTurnSpeed={railTurnSpeed}
        onRailMoveComplete={onRailMoveComplete}
        polylineConfig={polylineConfig}
        restartKey={restartKey}
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
            opacityFadeEnabled={opacityFadeEnabled}
            cameraYawRef={cameraYawRef}
            cameraOrbitActiveRef={cameraOrbitActiveRef}
            mobileTouchActiveRef={mobileTouchActiveRef}
            keysPressed={keysPressed}
            railMode={railMode}
            isMovingRef={isMovingRef}
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
        
        // Count shadow-casting instances (for InstancedMesh, count instances not just mesh)
        let shadowCasterCount = 0;
        scene.traverse((obj) => {
          if ((obj as Mesh).castShadow) {
            const mesh = obj as Mesh;
            // Check if it's an InstancedMesh
            if ((mesh as InstancedMesh).isInstancedMesh) {
              shadowCasterCount += (mesh as InstancedMesh).count;
            } else {
              shadowCasterCount++;
            }
          }
        });
        
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
          shadowCasters: shadowCasterCount,
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
