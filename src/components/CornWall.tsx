import { useRef, useMemo, useEffect } from 'react';
import { Group, Mesh, Object3D, InstancedMesh as ThreeInstancedMesh, Matrix4, BufferGeometry, BufferAttribute, Material, Quaternion, Euler, BoxGeometry, MeshBasicMaterial, MeshLambertMaterial, Color, FrontSide, DoubleSide, Vector3, CylinderGeometry, InstancedBufferAttribute } from 'three';
import { useGLTF, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import cornTexture from '@/assets/corn-texture.png';

// LOD distance tiers
const LOD_FULL_QUALITY_DISTANCE = 6;   // Full GLTF materials within 6m
const LOD_CHEAP_DISTANCE = 16;          // Cheap material 6-16m, hidden beyond 16m

// Hard cull distance - fog should obscure corn before this distance
const CULL_DISTANCE = 14; // Hard cull at 14m where fog is dense

// Fade distance thresholds for opacity (player-based)
const FADE_START = 10;  // Start fading corn at 10m from player
const FADE_END = 14;    // Fully transparent at 14m from player

interface CornWallProps {
  position: [number, number, number];
  size?: [number, number, number];
}

// Preload models
useGLTF.preload('/models/Corn.glb');

// Seeded random for stable randomness
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Single wall component for simple cases
export const CornWall = ({ position, size = [1, 3, 1] }: CornWallProps) => {
  const { scene } = useGLTF('/models/Corn.glb');
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  
  return (
    <group position={position}>
      <primitive object={clonedScene} scale={[size[0], size[1], size[2]]} />
    </group>
  );
};

// Optimization settings interface
export interface CornOptimizationSettings {
  shadowRadius: number;
  cullDistance: number;
  lodDistance: number;
  farMaterialDistance: number;
  enableShadowOptimization: boolean;
  enableDistanceCulling: boolean;
  enableLOD: boolean;
  enableFarMaterialOptimization: boolean;
  enableDynamicFog: boolean;
  enableEdgeCornCulling: boolean;
}

export const DEFAULT_CORN_SETTINGS: CornOptimizationSettings = {
  shadowRadius: 8,
  cullDistance: 18,
  lodDistance: 6,
  farMaterialDistance: 5,
  enableShadowOptimization: true,
  enableDistanceCulling: true,
  enableLOD: true,
  enableFarMaterialOptimization: true,
  enableDynamicFog: true,
  enableEdgeCornCulling: true,
};

// Simple LOD geometry - single green box per stalk (1 draw call total)
const LOD_BOX_GEOMETRY = new BoxGeometry(0.08, 1.25, 0.08);
const LOD_BOX_MATERIAL = new MeshBasicMaterial({ color: new Color(0.25, 0.42, 0.18), fog: true });

// ============= Per-instance opacity system =============
// Maps cell key "x,z" to array of { meshRef, instanceIndex }
interface InstanceRef {
  mesh: ThreeInstancedMesh;
  index: number;
}

// Global registry of cell -> instances mapping
const cellToInstances = new Map<string, InstanceRef[]>();

// Global reference to opacity attributes that need updating
const opacityAttributesNeedingUpdate = new Set<InstancedBufferAttribute>();

// Global reference to color attributes that need updating
const colorAttributesNeedingUpdate = new Set<InstancedBufferAttribute>();

// Register an instance for a cell
export function registerCellInstance(cellX: number, cellZ: number, mesh: ThreeInstancedMesh, index: number) {
  const key = `${cellX},${cellZ}`;
  if (!cellToInstances.has(key)) {
    cellToInstances.set(key, []);
  }
  cellToInstances.get(key)!.push({ mesh, index });
}

// Clear registrations for a specific mesh (used after culling reorders)
export function clearMeshFromRegistry(mesh: ThreeInstancedMesh) {
  for (const [key, instances] of cellToInstances.entries()) {
    cellToInstances.set(key, instances.filter(inst => inst.mesh !== mesh));
    if (cellToInstances.get(key)!.length === 0) {
      cellToInstances.delete(key);
    }
  }
}

// Clear all registrations (call when recreating meshes)
export function clearCellRegistry() {
  cellToInstances.clear();
  opacityAttributesNeedingUpdate.clear();
  colorAttributesNeedingUpdate.clear();
}

// Debug: get registry stats
export function getCellRegistryStats() {
  return {
    cellCount: cellToInstances.size,
    sampleCells: Array.from(cellToInstances.keys()).slice(0, 10)
  };
}

// Set opacity for all instances in a cell (also sets debug color: red when faded, white when opaque)
export function setCellOpacity(cellX: number, cellZ: number, opacity: number) {
  const key = `${cellX},${cellZ}`;
  const instances = cellToInstances.get(key);
  
  if (!instances) {
    return;
  }
  
  // Calculate debug color: red when faded, white when opaque
  // Lerp from white (1,1,1) to red (1,0,0) based on how faded we are
  const fadeAmount = 1.0 - opacity; // 0 = opaque, 1 = fully faded
  const r = 1.0;
  const g = 1.0 - fadeAmount; // 1 when opaque, 0 when faded
  const b = 1.0 - fadeAmount; // 1 when opaque, 0 when faded
  
  for (const { mesh, index } of instances) {
    // Update opacity
    const opacityAttr = mesh.geometry.getAttribute('instanceOpacity') as InstancedBufferAttribute;
    if (opacityAttr) {
      (opacityAttr.array as Float32Array)[index] = opacity;
      opacityAttributesNeedingUpdate.add(opacityAttr);
    }
    
    // Update debug color (RGB stored as 3 floats per instance)
    const colorAttr = mesh.geometry.getAttribute('instanceColor') as InstancedBufferAttribute;
    if (colorAttr) {
      const arr = colorAttr.array as Float32Array;
      arr[index * 3 + 0] = r;
      arr[index * 3 + 1] = g;
      arr[index * 3 + 2] = b;
      colorAttributesNeedingUpdate.add(colorAttr);
    }
  }
}

// Get current opacity for a cell (from first instance)
export function getCellOpacity(cellX: number, cellZ: number): number {
  const key = `${cellX},${cellZ}`;
  const instances = cellToInstances.get(key);
  if (!instances || instances.length === 0) return 1.0;
  
  const { mesh, index } = instances[0];
  const attr = mesh.geometry.getAttribute('instanceOpacity') as InstancedBufferAttribute;
  if (attr) {
    return (attr.array as Float32Array)[index];
  }
  return 1.0;
}

// Flush opacity and color updates (call once per frame)
function flushOpacityUpdates() {
  opacityAttributesNeedingUpdate.forEach(attr => {
    attr.needsUpdate = true;
  });
  opacityAttributesNeedingUpdate.clear();
  
  colorAttributesNeedingUpdate.forEach(attr => {
    attr.needsUpdate = true;
  });
  colorAttributesNeedingUpdate.clear();
}

// ============= End per-instance opacity system =============

// Helper to add per-instance opacity AND color support to a material using onBeforeCompile
// Rim light configuration
const RIM_LIGHT_COLOR = 'vec3(1.0, 0.85, 0.6)'; // Warm sunset orange
const RIM_LIGHT_POWER = '3.0'; // Fresnel falloff power (higher = tighter rim)
const RIM_LIGHT_STRENGTH = '0.0'; // Disabled

const addInstanceOpacitySupport = (material: Material, playerPosRef?: { value: Vector3 }): Material => {
  const mat = material as any;
  
  // Enable transparency for fading
  mat.transparent = true;
  mat.depthWrite = true;
  mat.depthTest = true;
  mat.side = FrontSide;
  
  const originalOnBeforeCompile = mat.onBeforeCompile;
  
  mat.onBeforeCompile = (shader: any) => {
    if (originalOnBeforeCompile) {
      originalOnBeforeCompile(shader);
    }
    
    // Add uniforms for distance fade
    if (playerPosRef) {
      shader.uniforms.playerPos = playerPosRef;
      shader.uniforms.fadeStart = { value: FADE_START };
      shader.uniforms.fadeEnd = { value: FADE_END };
      shader.uniforms.shaderFadeEnabled = { value: 1.0 }; // 1.0 = enabled, 0.0 = disabled
    }
    
    // Store shader reference
    mat.userData.shader = shader;
    
    // Inject attribute and varying in vertex shader (opacity + color + rim light normal)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      attribute float instanceOpacity;
      attribute vec3 instanceColor;
      varying float vInstanceOpacity;
      varying vec3 vInstanceColor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;`
    );
    
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vInstanceOpacity = instanceOpacity;
      vInstanceColor = instanceColor;
      #ifdef USE_INSTANCING
        vWorldPos = (instanceMatrix * vec4(position, 1.0)).xyz;
        vWorldNormal = normalize(mat3(instanceMatrix) * normal);
      #else
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
      #endif
      vViewDir = normalize(cameraPosition - vWorldPos);`
    );
    
    // Inject varying and uniforms in fragment shader
    const distanceUniforms = playerPosRef ? `
      uniform vec3 playerPos;
      uniform float fadeStart;
      uniform float fadeEnd;
      uniform float shaderFadeEnabled;` : '';
    
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying float vInstanceOpacity;
      varying vec3 vInstanceColor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;${distanceUniforms}`
    );
    
    // Apply per-instance opacity + color tint + rim light + optional distance fade at end of fragment shader
    const distanceFadeCode = playerPosRef ? `
      float distToPlayer = distance(vWorldPos.xz, playerPos.xz);
      float distFade = mix(1.0, 1.0 - smoothstep(fadeStart, fadeEnd, distToPlayer), shaderFadeEnabled);
      gl_FragColor.a *= distFade;` : '';
    
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      // Apply per-instance opacity from LOS fading
      gl_FragColor.a *= vInstanceOpacity;${distanceFadeCode}
      
      // Rim lighting - warm backlight effect
      float rimFactor = 1.0 - max(0.0, dot(normalize(vWorldNormal), normalize(vViewDir)));
      rimFactor = pow(rimFactor, ${RIM_LIGHT_POWER}) * ${RIM_LIGHT_STRENGTH};
      gl_FragColor.rgb += ${RIM_LIGHT_COLOR} * rimFactor;
      
      if (gl_FragColor.a < 0.01) discard;`
    );
  };
  
  mat.needsUpdate = true;
  return material;
};

// Helper to optimize material for performance
const optimizeMaterial = (material: Material, playerPosRef?: { value: Vector3 }): Material => {
  return addInstanceOpacitySupport(material, playerPosRef);
};

// Cull stats for debugging
export interface CullStats {
  edgeVisible: number;
  edgeTotal: number;
  cheapVisible: number;
  cheapTotal: number;
}

// Instanced walls using InstancedMesh
interface InstancedWallsProps {
  edgePositions: { x: number; z: number; edges: ('left' | 'right' | 'top' | 'bottom')[] }[];
  noShadowPositions?: { x: number; z: number; avoidEdges?: ('left' | 'right' | 'top' | 'bottom')[] }[];
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
  size?: [number, number, number];
  playerPositionRef?: React.MutableRefObject<{ x: number; y: number }>;
  optimizationSettings?: CornOptimizationSettings;
  onCullStats?: (stats: CullStats) => void;
  shaderFadeEnabled?: boolean;
}

// Density settings - staggered rows to close gaps
const ROWS = 3;
const STALKS_PER_ROW = 2;
const STALK_SPACING = 0.5;

// Boundary walls - reduced for performance
const BOUNDARY_ROWS = 2;
const BOUNDARY_STALKS_PER_ROW = 2;
const BOUNDARY_SPACING = 0.45;
const BOUNDARY_DEPTH = 1.0;

interface MeshData {
  geometry: BufferGeometry;
  material: Material | Material[];
}

interface WallTransformData {
  matrix: Matrix4;
  centerX: number;
  centerZ: number;
  cellX: number;  // Added: which cell this stalk belongs to
  cellZ: number;  // Added: which cell this stalk belongs to
}

// Generate transforms for edge stalks only
const generateEdgeTransforms = (
  edgePositions: { x: number; z: number; edges: ('left' | 'right' | 'top' | 'bottom')[] }[],
  seedOffset: number = 0
): WallTransformData[] => {
  const transforms: WallTransformData[] = [];
  const dummy = new Object3D();
  
  edgePositions.forEach((wallPos) => {
    const baseSeed = wallPos.x * 1000 + wallPos.z + seedOffset;
    const centerX = wallPos.x + 0.5;
    const centerZ = wallPos.z + 0.5;
    const cellX = wallPos.x;
    const cellZ = wallPos.z;
    
    wallPos.edges.forEach((edge, edgeIdx) => {
      for (let col = 0; col < STALKS_PER_ROW; col++) {
        const stalkSeed = baseSeed + edgeIdx * 1000 + col;
        
        let offsetX = 0;
        let offsetZ = 0;
        const edgeOffset = 0.45;
        const colOffset = (col - (STALKS_PER_ROW - 1) / 2) * STALK_SPACING;
        
        switch (edge) {
          case 'left':   offsetX = -edgeOffset; offsetZ = colOffset; break;
          case 'right':  offsetX = edgeOffset;  offsetZ = colOffset; break;
          case 'top':    offsetX = colOffset;   offsetZ = -edgeOffset; break;
          case 'bottom': offsetX = colOffset;   offsetZ = edgeOffset; break;
        }
        
        const jitterX = (seededRandom(stalkSeed) - 0.5) * 0.12;
        const jitterZ = (seededRandom(stalkSeed + 1) - 0.5) * 0.12;
        const rotation = seededRandom(stalkSeed + 2) * Math.PI * 2;
        
        const baseScale = 100;
        const heightMultiplier = 0.891; // 0.81 * 1.1
        const widthMultiplier = 0.7;
        const heightVariation = 1.2 + seededRandom(stalkSeed + 3) * 0.05;
        const widthScale = baseScale * heightVariation * widthMultiplier;
        const heightScale = baseScale * heightVariation * heightMultiplier;
        
        dummy.position.set(
          centerX + offsetX + jitterX,
          0,
          centerZ + offsetZ + jitterZ
        );
        const uprightQuat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0, 'XYZ'));
        const yRotQuat = new Quaternion().setFromEuler(new Euler(0, rotation, 0, 'XYZ'));
        dummy.quaternion.copy(uprightQuat).premultiply(yRotQuat);
        dummy.scale.set(widthScale, widthScale, heightScale);
        dummy.updateMatrix();
        transforms.push({ matrix: dummy.matrix.clone(), centerX, centerZ, cellX, cellZ });
      }
    });
  });
  
  return transforms;
};

// Generate transforms for wall positions, avoiding specific edges
const generateWallTransforms = (
  positions: { x: number; z: number; avoidEdges?: ('left' | 'right' | 'top' | 'bottom')[] }[],
  seedOffset: number = 0
): WallTransformData[] => {
  const transforms: WallTransformData[] = [];
  const dummy = new Object3D();
  const edgeZone = 0.35;
  
  positions.forEach((wallPos) => {
    const baseSeed = wallPos.x * 1000 + wallPos.z + seedOffset;
    const centerX = wallPos.x + 0.5;
    const centerZ = wallPos.z + 0.5;
    const cellX = wallPos.x;
    const cellZ = wallPos.z;
    const avoidEdges = wallPos.avoidEdges || [];
    
    for (let row = 0; row < ROWS; row++) {
      const stalksInRow = STALKS_PER_ROW + (row % 2);
      const rowOffset = (row % 2) * (STALK_SPACING / 2);
      
      for (let col = 0; col < stalksInRow; col++) {
        const stalkSeed = baseSeed + row * 100 + col;
        let offsetX = (col - (stalksInRow - 1) / 2) * STALK_SPACING + rowOffset;
        let offsetZ = (row - (ROWS - 1) / 2) * STALK_SPACING;
        const jitterX = (seededRandom(stalkSeed) - 0.5) * 0.1;
        const jitterZ = (seededRandom(stalkSeed + 1) - 0.5) * 0.1;
        
        let tooCloseToEdge = false;
        if (avoidEdges.includes('left') && offsetX + jitterX < -edgeZone + 0.1) tooCloseToEdge = true;
        if (avoidEdges.includes('right') && offsetX + jitterX > edgeZone - 0.1) tooCloseToEdge = true;
        if (avoidEdges.includes('top') && offsetZ + jitterZ < -edgeZone + 0.1) tooCloseToEdge = true;
        if (avoidEdges.includes('bottom') && offsetZ + jitterZ > edgeZone - 0.1) tooCloseToEdge = true;
        
        if (tooCloseToEdge) continue;
        
        const rotation = seededRandom(stalkSeed + 2) * Math.PI * 2;
        const baseScale = 100;
        const heightMultiplier = 0.891; // 0.81 * 1.1
        const widthMultiplier = 0.7;
        const heightVariation = 1.2 + seededRandom(stalkSeed + 3) * 0.05;
        const widthScale = baseScale * heightVariation * widthMultiplier;
        const heightScale = baseScale * heightVariation * heightMultiplier;
        
        dummy.position.set(
          centerX + offsetX + jitterX,
          0,
          centerZ + offsetZ + jitterZ
        );
        const uprightQuat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0, 'XYZ'));
        const yRotQuat = new Quaternion().setFromEuler(new Euler(0, rotation, 0, 'XYZ'));
        dummy.quaternion.copy(uprightQuat).premultiply(yRotQuat);
        dummy.scale.set(widthScale, widthScale, heightScale);
        dummy.updateMatrix();
        transforms.push({ matrix: dummy.matrix.clone(), centerX, centerZ, cellX, cellZ });
      }
    }
  });
  
  return transforms;
};

// Generate transforms for boundary walls
const generateBoundaryTransforms = (
  boundaryPositions: { x: number; z: number; offsetX: number; offsetZ: number }[]
): WallTransformData[] => {
  const transforms: WallTransformData[] = [];
  const dummy = new Object3D();
  
  boundaryPositions.forEach((wallPos) => {
    const baseSeed = wallPos.x * 1000 + wallPos.z + 50000;
    const dirX = wallPos.offsetX !== 0 ? Math.sign(wallPos.offsetX) : 0;
    const dirZ = wallPos.offsetZ !== 0 ? Math.sign(wallPos.offsetZ) : 0;
    const cellX = wallPos.x;
    const cellZ = wallPos.z;
    
    for (let row = 0; row < BOUNDARY_ROWS; row++) {
      const rowOffset = (row % 2) * (BOUNDARY_SPACING / 2);
      const depthOffset = (row / (BOUNDARY_ROWS - 1)) * BOUNDARY_DEPTH;
      
      for (let col = 0; col < BOUNDARY_STALKS_PER_ROW; col++) {
        const stalkSeed = baseSeed + row * 100 + col;
        const offsetX = (col - (BOUNDARY_STALKS_PER_ROW - 1) / 2) * BOUNDARY_SPACING + rowOffset;
        const offsetZ = (col - (BOUNDARY_STALKS_PER_ROW - 1) / 2) * BOUNDARY_SPACING + rowOffset;
        const jitterX = (seededRandom(stalkSeed) - 0.5) * 0.03;
        const jitterZ = (seededRandom(stalkSeed + 1) - 0.5) * 0.03;
        const rotation = seededRandom(stalkSeed + 2) * Math.PI * 2;
        
        let posX = wallPos.x + 0.5 + jitterX;
        let posZ = wallPos.z + 0.5 + jitterZ;
        
        if (dirX !== 0) {
          posX += dirX * depthOffset;
          posZ += offsetZ;
        } else {
          posX += offsetX;
          posZ += dirZ * depthOffset;
        }
        
        const baseScale = 100;
        const heightMultiplier = 0.891; // 0.81 * 1.1
        const widthMultiplier = 0.7;
        const heightVariation = 1.2 + seededRandom(stalkSeed + 3) * 0.05;
        const widthScale = baseScale * heightVariation * widthMultiplier;
        const heightScale = baseScale * heightVariation * heightMultiplier;
        dummy.position.set(posX, 0, posZ);
        const uprightQuat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0, 'XYZ'));
        const yRotQuat = new Quaternion().setFromEuler(new Euler(0, rotation, 0, 'XYZ'));
        dummy.quaternion.copy(uprightQuat).premultiply(yRotQuat);
        dummy.scale.set(widthScale, widthScale, heightScale);
        dummy.updateMatrix();
        transforms.push({ matrix: dummy.matrix.clone(), centerX: posX, centerZ: posZ, cellX, cellZ });
      }
    }
  });
  
  return transforms;
};

// Helper to add instanceOpacity and instanceColor attributes to an InstancedMesh
function addOpacityAttribute(mesh: ThreeInstancedMesh, count: number, transforms: WallTransformData[]) {
  // Add opacity attribute (1 float per instance)
  const opacityArray = new Float32Array(count).fill(1.0);
  const opacityAttr = new InstancedBufferAttribute(opacityArray, 1);
  mesh.geometry.setAttribute('instanceOpacity', opacityAttr);
  
  // Add color attribute (3 floats per instance: RGB) - default white
  const colorArray = new Float32Array(count * 3).fill(1.0);
  const colorAttr = new InstancedBufferAttribute(colorArray, 3);
  mesh.geometry.setAttribute('instanceColor', colorAttr);
  
  console.log('[CORN_WALL] Added opacity/color attributes to mesh with', count, 'instances');
  console.log('[CORN_WALL] Mesh has instanceOpacity:', mesh.geometry.hasAttribute('instanceOpacity'));
  
  // Register each instance with its cell
  for (let i = 0; i < transforms.length && i < count; i++) {
    const t = transforms[i];
    registerCellInstance(t.cellX, t.cellZ, mesh, i);
  }
}

export const InstancedWalls = ({ 
  edgePositions, 
  noShadowPositions = [],
  boundaryPositions = [], 
  playerPositionRef,
  optimizationSettings = DEFAULT_CORN_SETTINGS,
  onCullStats,
  shaderFadeEnabled = true,
}: InstancedWallsProps) => {
  const edgeGroupRef = useRef<Group>(null);
  const cheapGroupRef = useRef<Group>(null);
  const billboardGroupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene: gltfScene } = useGLTF('/models/Corn.glb');
  const { scene, camera } = useThree();
  
  // Load corn texture for billboards
  const cornTex = useTexture(cornTexture);
  
  // Player position uniform for shader-based opacity fade
  const playerPosUniform = useMemo(() => ({ value: new Vector3() }), []);
  
  // Track closest distance to any outer/boundary corn cell
  const cheapCellCenters = useMemo(() => {
    const centers: { x: number; z: number }[] = [];
    noShadowPositions.forEach(pos => centers.push({ x: pos.x + 0.5, z: pos.z + 0.5 }));
    boundaryPositions.forEach(pos => centers.push({ x: pos.x + 0.5, z: pos.z + 0.5 }));
    return centers;
  }, [noShadowPositions, boundaryPositions]);
  
  // Store reference to cheap mesh for dynamic count updates
  const cheapMeshRef = useRef<ThreeInstancedMesh | null>(null);
  const cheapMeshCountRef = useRef(0);
  const cheapTransformsRef = useRef<WallTransformData[]>([]);
  
  // Store references to edge meshes for distance culling
  const edgeMeshesRef = useRef<ThreeInstancedMesh[]>([]);
  const edgeTransformsRef = useRef<WallTransformData[]>([]);
  
  // Billboard mesh for distant corn
  const billboardMeshRef = useRef<ThreeInstancedMesh | null>(null);
  const billboardTransformsRef = useRef<WallTransformData[]>([]);
  
  // Track last update position to avoid recalculating every frame
  const lastUpdatePosRef = useRef({ x: -999, z: -999 });
  const lastCamDirRef = useRef({ x: 0, z: 1 });
  
  // Calculate culling distances
  const CULL_DISTANCE_SQ = CULL_DISTANCE * CULL_DISTANCE;
  const ROTATION_THRESHOLD = 0.15;
  const BACK_CULL_DOT_THRESHOLD = -0.5;
  
  // Per-frame updates
  useFrame(() => {
    // Update player position uniform for shader
    if (playerPositionRef?.current) {
      playerPosUniform.value.set(
        playerPositionRef.current.x,
        0,
        playerPositionRef.current.y
      );
    }
    
    // Flush any pending opacity updates
    flushOpacityUpdates();
    
    // Player position for distance calculations
    const px = playerPositionRef?.current?.x ?? 0;
    const pz = playerPositionRef?.current?.y ?? 0;
    
    // Update shader uniforms for all materials (playerPos + shaderFadeEnabled)
    const updateShaderUniforms = (materials: Material | Material[]) => {
      const mats = Array.isArray(materials) ? materials : [materials];
      for (const mat of mats) {
        const shader = (mat as any).userData?.shader;
        if (shader) {
          if (shader.uniforms.playerPos) {
            shader.uniforms.playerPos.value.copy(playerPosUniform.value);
          }
          if (shader.uniforms.shaderFadeEnabled) {
            shader.uniforms.shaderFadeEnabled.value = shaderFadeEnabled ? 1.0 : 0.0;
          }
        }
      }
    };
    
    // Update edge mesh shaders
    for (const mesh of edgeMeshesRef.current) {
      updateShaderUniforms(mesh.material);
    }
    
    // Update cheap mesh shader
    if (cheapMeshRef.current) {
      updateShaderUniforms(cheapMeshRef.current.material);
    }
    
    // Skip ALL culling if distance culling is disabled
    if (!optimizationSettings.enableDistanceCulling) return;
    
    // Get camera forward direction for back-culling
    const camForward = new Vector3();
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();
    
    // Check if position changed significantly
    const dx = px - lastUpdatePosRef.current.x;
    const dz = pz - lastUpdatePosRef.current.z;
    const positionChanged = dx * dx + dz * dz >= 0.25;
    
    // Check if camera direction changed significantly
    const camDx = camForward.x - lastCamDirRef.current.x;
    const camDz = camForward.z - lastCamDirRef.current.z;
    const directionChanged = camDx * camDx + camDz * camDz >= ROTATION_THRESHOLD * ROTATION_THRESHOLD;
    
    const shouldUpdate = positionChanged || directionChanged || lastUpdatePosRef.current.x === -999;
    
    if (!shouldUpdate) return;
    lastUpdatePosRef.current = { x: px, z: pz };
    lastCamDirRef.current = { x: camForward.x, z: camForward.z };
    
    const cullDistSq = CULL_DISTANCE_SQ;
    let edgeCount = 0;
    let cheapCount = 0;
    
    // Helper to check if corn is in viewable arc
    const NEAR_DISTANCE_SQ = 6 * 6;
    const isInViewArc = (cornX: number, cornZ: number, distSq: number): boolean => {
      if (distSq < NEAR_DISTANCE_SQ) return true;
      
      const toCornX = cornX - px;
      const toCornZ = cornZ - pz;
      const len = Math.sqrt(distSq);
      if (len < 0.001) return true;
      const dot = (toCornX / len) * camForward.x + (toCornZ / len) * camForward.z;
      return dot > BACK_CULL_DOT_THRESHOLD;
    };
    
    // Cull edge corn AND rebuild cell registry after reordering
    if (edgeMeshesRef.current.length > 0 && edgeTransformsRef.current.length > 0) {
      const transforms = edgeTransformsRef.current;
      
      // Clear registry for edge meshes before reordering
      for (const mesh of edgeMeshesRef.current) {
        clearMeshFromRegistry(mesh);
      }
      
      for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        const distSq = (px - t.centerX) ** 2 + (pz - t.centerZ) ** 2;
        
        if (distSq < cullDistSq && isInViewArc(t.centerX, t.centerZ, distSq)) {
          for (const mesh of edgeMeshesRef.current) {
            mesh.setMatrixAt(edgeCount, t.matrix);
            // Re-register with new index
            registerCellInstance(t.cellX, t.cellZ, mesh, edgeCount);
            // Reset opacity when instance is moved to new index (prevents corruption)
            const opacityAttr = mesh.geometry.getAttribute('instanceOpacity') as InstancedBufferAttribute;
            if (opacityAttr) {
              (opacityAttr.array as Float32Array)[edgeCount] = 1.0;
            }
          }
          edgeCount++;
        }
      }
      
      for (const mesh of edgeMeshesRef.current) {
        mesh.count = edgeCount;
        mesh.instanceMatrix.needsUpdate = true;
        // Mark opacity as needing update after culling
        const opacityAttr = mesh.geometry.getAttribute('instanceOpacity') as InstancedBufferAttribute;
        if (opacityAttr) {
          opacityAttr.needsUpdate = true;
        }
      }
    }
    
    // Cull cheap corn AND rebuild cell registry after reordering
    if (cheapMeshRef.current && cheapTransformsRef.current.length > 0) {
      const transforms = cheapTransformsRef.current;
      const mesh = cheapMeshRef.current;
      
      // Clear registry for cheap mesh before reordering
      clearMeshFromRegistry(mesh);
      
      for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        const distSq = (px - t.centerX) ** 2 + (pz - t.centerZ) ** 2;
        
        if (distSq < cullDistSq && isInViewArc(t.centerX, t.centerZ, distSq)) {
          mesh.setMatrixAt(cheapCount, t.matrix);
          // Re-register with new index
          registerCellInstance(t.cellX, t.cellZ, mesh, cheapCount);
          // Reset opacity when instance is moved to new index (prevents corruption)
          const opacityAttr = mesh.geometry.getAttribute('instanceOpacity') as InstancedBufferAttribute;
          if (opacityAttr) {
            (opacityAttr.array as Float32Array)[cheapCount] = 1.0;
          }
          cheapCount++;
        }
      }
      
      mesh.count = cheapCount;
      mesh.instanceMatrix.needsUpdate = true;
      // Mark opacity as needing update after culling
      const opacityAttr = mesh.geometry.getAttribute('instanceOpacity') as InstancedBufferAttribute;
      if (opacityAttr) {
        opacityAttr.needsUpdate = true;
      }
    }
    
    // Disable LOD corn
    if (billboardMeshRef.current) {
      billboardMeshRef.current.count = 0;
    }
    
    // Report cull stats
    const stats = {
      edgeVisible: edgeCount,
      edgeTotal: edgeTransformsRef.current.length,
      cheapVisible: cheapCount,
      cheapTotal: cheapTransformsRef.current.length,
    };
    onCullStats?.(stats);
  });
  
  // Extract mesh data from GLTF with optimized materials
  const { meshDataList, cheapStalkGeometry, cheapMaterial, billboardGeometry, billboardMaterial } = useMemo(() => {
    const meshes: MeshData[] = [];
    const stalkMeshes: MeshData[] = [];
    const cornCobMeshes: MeshData[] = [];
    let sampledColor: Color | null = null;
    
    gltfScene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        const mat = mesh.material as any;
        
        let isCornCob = false;
        if (mat.color) {
          const r = mat.color.r;
          const g = mat.color.g;
          const b = mat.color.b;
          isCornCob = r > 0.5 && g > 0.3 && b < 0.3 && r > g * 0.8;
        }
        
        if (!sampledColor && mat.color && !isCornCob) {
          sampledColor = mat.color.clone();
        }
        
        const optimizedMaterial = Array.isArray(mesh.material) 
          ? mesh.material.map(m => optimizeMaterial(m.clone(), playerPosUniform))
          : optimizeMaterial(mesh.material.clone(), playerPosUniform);
        
        // Clone geometry - scale down corn cobs to 0.75x
        const clonedGeometry = mesh.geometry.clone();
        if (isCornCob) {
          clonedGeometry.scale(0.75, 0.75, 0.75);
        }
        
        const meshData = {
          geometry: clonedGeometry,
          material: optimizedMaterial
        };
        
        meshes.push(meshData);
        
        if (isCornCob) {
          cornCobMeshes.push(meshData);
        } else {
          stalkMeshes.push(meshData);
        }
      }
    });
    
    const firstStalkGeo: BufferGeometry = stalkMeshes.length >= 1 
      ? stalkMeshes[0].geometry.clone()
      : new BoxGeometry(0.1, 2, 0.1);
    
    const cheapMat = new MeshLambertMaterial({ 
      color: sampledColor || new Color(0.12, 0.25, 0.10),
      transparent: true,
      depthWrite: true,
      depthTest: true,
      side: FrontSide,
      fog: true,  // Ensure fog blending with scene
    });
    
    // Add instance opacity support to cheap material
    addInstanceOpacitySupport(cheapMat, playerPosUniform);
    
    // Create stalk geometry
    const stalk = new CylinderGeometry(0.04, 0.05, 2.0, 6, 1);
    stalk.translate(0, 1.0, 0);
    
    // Create leaves
    const leafPositions: number[] = [];
    const leafNormals: number[] = [];
    const leafCount = 6;
    const leafLength = 0.5;
    const leafWidth = 0.08;
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const baseY = 0.4 + i * 0.28;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      
      const tipY = baseY + 0.15;
      
      leafPositions.push(cos * 0.05, baseY, sin * 0.05);
      leafPositions.push(cos * 0.05, baseY + leafWidth * 2, sin * 0.05);
      leafPositions.push(cos * leafLength, tipY, sin * leafLength);
      
      const nx = cos * 0.7;
      const nz = sin * 0.7;
      const ny = 0.7;
      leafNormals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      
      leafPositions.push(cos * 0.05, baseY + leafWidth * 2, sin * 0.05);
      leafPositions.push(cos * 0.05, baseY, sin * 0.05);
      leafPositions.push(cos * leafLength, tipY, sin * leafLength);
      leafNormals.push(-nx, -ny, -nz, -nx, -ny, -nz, -nx, -ny, -nz);
    }
    
    const stalkPos = stalk.attributes.position.array;
    const stalkNorm = stalk.attributes.normal.array;
    const stalkIdx = stalk.index!.array;
    
    const totalLeafVerts = leafCount * 6;
    const totalVerts = stalk.attributes.position.count + totalLeafVerts;
    const combinedPos = new Float32Array(totalVerts * 3);
    const combinedNorm = new Float32Array(totalVerts * 3);
    
    combinedPos.set(stalkPos, 0);
    combinedNorm.set(stalkNorm, 0);
    
    combinedPos.set(leafPositions, stalkPos.length);
    combinedNorm.set(leafNormals, stalkNorm.length);
    
    const leafIndices: number[] = [];
    const stalkVertCount = stalk.attributes.position.count;
    for (let i = 0; i < leafCount * 2; i++) {
      const base = stalkVertCount + i * 3;
      leafIndices.push(base, base + 1, base + 2);
    }
    
    const combinedIdx = new Uint16Array(stalkIdx.length + leafIndices.length);
    combinedIdx.set(stalkIdx, 0);
    combinedIdx.set(leafIndices, stalkIdx.length);
    
    const lodCornGeo = new BufferGeometry();
    lodCornGeo.setAttribute('position', new BufferAttribute(combinedPos, 3));
    lodCornGeo.setAttribute('normal', new BufferAttribute(combinedNorm, 3));
    lodCornGeo.setIndex(new BufferAttribute(combinedIdx, 1));
    
    const lodCornMat = new MeshLambertMaterial({
      color: new Color(0.2, 0.45, 0.15),
      side: DoubleSide,
      depthWrite: true,
      fog: true,  // Ensure fog blending with scene
    });
    
    return { 
      meshDataList: meshes, 
      cheapStalkGeometry: firstStalkGeo,
      cheapMaterial: cheapMat,
      billboardGeometry: lodCornGeo,
      billboardMaterial: lodCornMat
    };
  }, [gltfScene, cornTex]);
  
  // Generate transforms for all corn types
  const { edgeTransforms, cheapTransforms, allBillboardTransforms } = useMemo(() => {
    const edge = generateEdgeTransforms(edgePositions, 0);
    const outer = generateWallTransforms(noShadowPositions, 10000);
    const boundary = generateBoundaryTransforms(boundaryPositions);
    const cheap3D = [...outer, ...boundary];
    
    const allTransforms = [...edge, ...cheap3D];
    const billboardTransforms: WallTransformData[] = [];
    const bbDummy = new Object3D();
    
    allTransforms.forEach(t => {
      const pos = new Vector3();
      const quat = new Quaternion();
      const scale = new Vector3();
      t.matrix.decompose(pos, quat, scale);
      
      bbDummy.position.set(pos.x, 1.25, pos.z);
      bbDummy.rotation.set(0, 0, 0);
      bbDummy.scale.set(1, 1, 1);
      bbDummy.updateMatrix();
      
      billboardTransforms.push({ matrix: bbDummy.matrix.clone(), centerX: t.centerX, centerZ: t.centerZ, cellX: t.cellX, cellZ: t.cellZ });
    });
    
    return { 
      edgeTransforms: edge, 
      cheapTransforms: cheap3D,
      allBillboardTransforms: billboardTransforms
    };
  }, [edgePositions, noShadowPositions, boundaryPositions]);
  

  // Create instanced meshes
  useEffect(() => {
    const edgeGroup = edgeGroupRef.current;
    const cheapGroup = cheapGroupRef.current;
    const billboardGroup = billboardGroupRef.current;
    if (!edgeGroup || !cheapGroup || !billboardGroup || meshDataList.length === 0 || createdRef.current) return;
    
    createdRef.current = true;
    
    // Clear previous registrations
    clearCellRegistry();
    
    const allMeshes: ThreeInstancedMesh[] = [];
    
    // EDGE CORN: Full GLTF materials
    const edgeMeshes: ThreeInstancedMesh[] = [];
    if (edgeTransforms.length > 0) {
      meshDataList.forEach((meshData) => {
        // DON'T clone materials here - they already have onBeforeCompile set up
        // Cloning loses the onBeforeCompile callback
        const instancedMesh = new ThreeInstancedMesh(
          meshData.geometry.clone(),
          meshData.material, // Use directly, don't clone
          edgeTransforms.length
        );
        
        // Add instanceOpacity attribute
        addOpacityAttribute(instancedMesh, edgeTransforms.length, edgeTransforms);
        
        edgeTransforms.forEach((t, i) => {
          instancedMesh.setMatrixAt(i, t.matrix);
        });
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = false;
        
        edgeGroup.add(instancedMesh);
        allMeshes.push(instancedMesh);
        edgeMeshes.push(instancedMesh);
      });
      
      edgeMeshesRef.current = edgeMeshes;
      edgeTransformsRef.current = edgeTransforms;
    }
    
    // OUTER + BOUNDARY CORN: Single cheap material
    if (cheapTransforms.length > 0) {
      // DON'T clone material - it already has onBeforeCompile set up
      const cheapMesh = new ThreeInstancedMesh(
        cheapStalkGeometry.clone(),
        cheapMaterial, // Use directly, don't clone
        cheapTransforms.length
      );
      
      // Add instanceOpacity attribute
      addOpacityAttribute(cheapMesh, cheapTransforms.length, cheapTransforms);
      
      cheapTransforms.forEach((t, i) => {
        cheapMesh.setMatrixAt(i, t.matrix);
      });
      
      cheapMesh.instanceMatrix.needsUpdate = true;
      cheapMesh.castShadow = false;
      cheapMesh.receiveShadow = false;
      cheapMesh.frustumCulled = false;
      
      cheapMeshRef.current = cheapMesh;
      cheapMeshCountRef.current = cheapTransforms.length;
      cheapTransformsRef.current = cheapTransforms;
      
      cheapGroup.add(cheapMesh);
      allMeshes.push(cheapMesh);
    }
    
    return () => {
      clearCellRegistry();
      allMeshes.forEach(mesh => {
        const parent = mesh.parent;
        if (parent) {
          parent.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
          mesh.dispose();
        }
      });
      cheapMeshRef.current = null;
      cheapTransformsRef.current = [];
      edgeMeshesRef.current = [];
      edgeTransformsRef.current = [];
      createdRef.current = false;
    };
  }, [meshDataList, cheapStalkGeometry, cheapMaterial, billboardGeometry, billboardMaterial, edgeTransforms, cheapTransforms, allBillboardTransforms]);

  if (edgeTransforms.length === 0 && cheapTransforms.length === 0) return null;

  return (
    <>
      <group ref={edgeGroupRef} />
      <group ref={cheapGroupRef} />
      <group ref={billboardGroupRef} />
    </>
  );
};
