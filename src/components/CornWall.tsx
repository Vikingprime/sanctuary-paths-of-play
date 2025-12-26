import { useRef, useMemo, useEffect } from 'react';
import { Group, Mesh, Object3D, InstancedMesh as ThreeInstancedMesh, Matrix4, BufferGeometry, BufferAttribute, Material, Quaternion, Euler, BoxGeometry, MeshBasicMaterial, MeshLambertMaterial, Color, FrontSide, DoubleSide, Vector3, PlaneGeometry, TextureLoader, CylinderGeometry, BackSide, Box3 } from 'three';
import { useGLTF, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import cornTexture from '@/assets/corn-texture.png';

// LOD distance tiers
const LOD_FULL_QUALITY_DISTANCE = 6;   // Full GLTF materials within 6m
const LOD_CHEAP_DISTANCE = 16;          // Cheap material 6-16m, hidden beyond 16m

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
  
  // Measure corn raw height once
  useEffect(() => {
    const box = new Box3().setFromObject(scene);
    const rawSize = new Vector3();
    box.getSize(rawSize);
    console.log(`[CORN MODEL MEASURE] Corn.glb: raw height = ${rawSize.y.toFixed(4)} (this is the reference height for 1.0 unit)`);
  }, [scene]);
  
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
  enableEdgeCornCulling: boolean; // Toggle for edge corn distance culling
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
const LOD_BOX_GEOMETRY = new BoxGeometry(0.08, 2.5, 0.08);
const LOD_BOX_MATERIAL = new MeshBasicMaterial({ color: new Color(0.2, 0.5, 0.15) });


// Hidden matrix (scale 0) for hiding instances
const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);


// Helper to optimize material for performance (fix transparency/overdraw issues)
const optimizeMaterial = (material: Material): Material => {
  const mat = material as any;
  
  // CRITICAL: Disable transparency for opaque rendering - NO transparent=true allowed
  if ('transparent' in mat) {
    mat.transparent = false;
  }
  
  // Use alphaTest instead of transparency for any alpha textures
  if ('alphaTest' in mat) {
    mat.alphaTest = 0.5;
  }
  
  // CRITICAL: Ensure proper depth handling - must write depth
  if ('depthWrite' in mat) {
    mat.depthWrite = true;
  }
  if ('depthTest' in mat) {
    mat.depthTest = true;
  }
  
  // CRITICAL: Always use FrontSide to reduce overdraw - NO DoubleSide
  if ('side' in mat) {
    mat.side = FrontSide;
  }
  
  mat.needsUpdate = true;
  return material;
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
  edgePositions: { x: number; z: number; edges: ('left' | 'right' | 'top' | 'bottom')[] }[];  // Edge stalks only
  noShadowPositions?: { x: number; z: number; avoidEdges?: ('left' | 'right' | 'top' | 'bottom')[] }[];     // Full cell walls with edges to avoid
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
  size?: [number, number, number];
  playerPositionRef?: React.MutableRefObject<{ x: number; y: number }>;
  optimizationSettings?: CornOptimizationSettings;
  onCullStats?: (stats: CullStats) => void;
}

// Density settings - staggered rows to close gaps
const ROWS = 3;
const STALKS_PER_ROW = 2; // Base count, odd rows get +1
const STALK_SPACING = 0.5; // Spacing between stalks

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
}

// Generate transforms for edge stalks only (single row facing the path)
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
    
    // For each edge direction, generate only the single row of stalks on that edge
    wallPos.edges.forEach((edge, edgeIdx) => {
      for (let col = 0; col < STALKS_PER_ROW; col++) {
        const stalkSeed = baseSeed + edgeIdx * 1000 + col;
        
        // Position based on which edge - push stalks to actual cell edge
        let offsetX = 0;
        let offsetZ = 0;
        const edgeOffset = 0.45; // Fixed offset to position at cell edge (not center)
        const colOffset = (col - (STALKS_PER_ROW - 1) / 2) * STALK_SPACING;
        
        switch (edge) {
          case 'left':   offsetX = -edgeOffset; offsetZ = colOffset; break;
          case 'right':  offsetX = edgeOffset;  offsetZ = colOffset; break;
          case 'top':    offsetX = colOffset;   offsetZ = -edgeOffset; break;
          case 'bottom': offsetX = colOffset;   offsetZ = edgeOffset; break;
        }
        
        // Increased jitter for more natural randomness
        const jitterX = (seededRandom(stalkSeed) - 0.5) * 0.12;
        const jitterZ = (seededRandom(stalkSeed + 1) - 0.5) * 0.12;
        const rotation = seededRandom(stalkSeed + 2) * Math.PI * 2;
        
        const baseScale = 100;
        const heightMultiplier = 1.8;
        const widthMultiplier = 0.7;
        const heightVariation = 0.8 + seededRandom(stalkSeed + 3) * 0.4;
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
        transforms.push({ matrix: dummy.matrix.clone(), centerX, centerZ });
      }
    });
  });
  
  return transforms;
};

// Generate transforms for a set of wall positions, avoiding specific edges
const generateWallTransforms = (
  positions: { x: number; z: number; avoidEdges?: ('left' | 'right' | 'top' | 'bottom')[] }[],
  seedOffset: number = 0
): WallTransformData[] => {
  const transforms: WallTransformData[] = [];
  const dummy = new Object3D();
  const edgeZone = 0.35; // Distance from center where edge stalks are (don't place depth stalks here)
  
  positions.forEach((wallPos) => {
    const baseSeed = wallPos.x * 1000 + wallPos.z + seedOffset;
    const centerX = wallPos.x + 0.5;
    const centerZ = wallPos.z + 0.5;
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
        
        // Check if this stalk would be too close to an edge that has edge stalks
        let tooCloseToEdge = false;
        if (avoidEdges.includes('left') && offsetX + jitterX < -edgeZone + 0.1) tooCloseToEdge = true;
        if (avoidEdges.includes('right') && offsetX + jitterX > edgeZone - 0.1) tooCloseToEdge = true;
        if (avoidEdges.includes('top') && offsetZ + jitterZ < -edgeZone + 0.1) tooCloseToEdge = true;
        if (avoidEdges.includes('bottom') && offsetZ + jitterZ > edgeZone - 0.1) tooCloseToEdge = true;
        
        if (tooCloseToEdge) continue; // Skip this stalk
        
        const rotation = seededRandom(stalkSeed + 2) * Math.PI * 2;
        const baseScale = 100;
        const heightMultiplier = 1.8;
        const widthMultiplier = 0.7;
        const heightVariation = 0.8 + seededRandom(stalkSeed + 3) * 0.4;
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
        transforms.push({ matrix: dummy.matrix.clone(), centerX, centerZ });
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
        const heightMultiplier = 1.8;
        const widthMultiplier = 0.7;
        const heightVariation = 0.8 + seededRandom(stalkSeed + 3) * 0.4;
        const widthScale = baseScale * heightVariation * widthMultiplier;
        const heightScale = baseScale * heightVariation * heightMultiplier;
        dummy.position.set(posX, 0, posZ);
        const uprightQuat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0, 'XYZ'));
        const yRotQuat = new Quaternion().setFromEuler(new Euler(0, rotation, 0, 'XYZ'));
        dummy.quaternion.copy(uprightQuat).premultiply(yRotQuat);
        dummy.scale.set(widthScale, widthScale, heightScale);
        dummy.updateMatrix();
        transforms.push({ matrix: dummy.matrix.clone(), centerX: posX, centerZ: posZ });
      }
    }
  });
  
  return transforms;
};

export const InstancedWalls = ({ 
  edgePositions, 
  noShadowPositions = [],
  boundaryPositions = [], 
  playerPositionRef,
  optimizationSettings = DEFAULT_CORN_SETTINGS,
  onCullStats,
}: InstancedWallsProps) => {
  const edgeGroupRef = useRef<Group>(null);
  const cheapGroupRef = useRef<Group>(null);
  const billboardGroupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene: gltfScene } = useGLTF('/models/Corn.glb');
  const { scene, camera } = useThree();
  
  // Measure corn once
  useEffect(() => {
    const box = new Box3().setFromObject(gltfScene);
    const rawSize = new Vector3();
    box.getSize(rawSize);
    // Corn is scaled with baseScale=100, heightMultiplier=1.8, so final height = rawHeight * 180
    const finalCornHeight = rawSize.y * 100 * 1.8;
    console.log(`[CORN INSTANCED MEASURE] Corn.glb: raw height = ${rawSize.y.toFixed(4)}, with scale 180 -> final height = ${finalCornHeight.toFixed(2)}`);
    console.log(`[CORN INSTANCED MEASURE] To get target heights relative to corn:`);
    console.log(`  Cow (0.63): needs final height ${(finalCornHeight * 0.63).toFixed(2)}`);
    console.log(`  Woman (0.68): needs final height ${(finalCornHeight * 0.68).toFixed(2)}`);
    console.log(`  Farmer (0.72): needs final height ${(finalCornHeight * 0.72).toFixed(2)}`);
    console.log(`  Pig (0.38): needs final height ${(finalCornHeight * 0.38).toFixed(2)}`);
    console.log(`  Chicken (0.19): needs final height ${(finalCornHeight * 0.19).toFixed(2)}`);
  }, [gltfScene]);
  
  // Load corn texture for billboards
  const cornTex = useTexture(cornTexture);
  
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
  
  // Billboard mesh for distant corn (2 triangles per stalk vs hundreds)
  const billboardMeshRef = useRef<ThreeInstancedMesh | null>(null);
  const billboardTransformsRef = useRef<WallTransformData[]>([]);
  
  // Track last update position and camera direction for culling
  const lastUpdatePosRef = useRef({ x: -999, z: -999 });
  const lastCamDirRef = useRef({ x: 0, z: -1 }); // Track camera direction for rotation-based updates
  const lastCullingEnabledRef = useRef<boolean | null>(null);
  const UPDATE_THRESHOLD = 0.5;
  const ROTATION_THRESHOLD = 0.1; // ~5.7 degrees of rotation triggers update
  const cullDebugRef = useRef(0); // Debug counter
  
  // Distance threshold for culling
  const CULL_DISTANCE_SQ = 12 * 12; // 12m squared
  
  // Camera direction culling - cull back 90 degrees (keep front 270 degrees)
  const BACK_CULL_DOT_THRESHOLD = -0.707; // cos(135°) - corn behind this angle gets culled
  
  // Distance culling (fog is now handled by scene's FogExp2)
  useFrame(() => {
    // Skip ALL culling if distance culling is disabled
    if (!optimizationSettings.enableDistanceCulling) return;
    
    const px = playerPositionRef?.current?.x ?? 0;
    const pz = playerPositionRef?.current?.y ?? 0;
    
    // Get camera forward direction for back-culling
    const camForward = new Vector3();
    camera.getWorldDirection(camForward);
    camForward.y = 0; // Flatten to horizontal plane
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
    
    // Helper to check if corn is in viewable arc (front 270 degrees)
    // Only apply back-culling to corn >6m away - nearby corn always visible
    const NEAR_DISTANCE_SQ = 6 * 6; // 6m squared - no back-culling within this
    const isInViewArc = (cornX: number, cornZ: number, distSq: number): boolean => {
      // Always show corn within 3m regardless of angle
      if (distSq < NEAR_DISTANCE_SQ) return true;
      
      const toCornX = cornX - px;
      const toCornZ = cornZ - pz;
      const len = Math.sqrt(distSq);
      if (len < 0.001) return true;
      const dot = (toCornX / len) * camForward.x + (toCornZ / len) * camForward.z;
      return dot > BACK_CULL_DOT_THRESHOLD; // Keep if not directly behind
    };
    
    // Cull edge corn (GLTF) - re-pack visible instances
    if (edgeMeshesRef.current.length > 0 && edgeTransformsRef.current.length > 0) {
      const transforms = edgeTransformsRef.current;
      
      for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        const distSq = (px - t.centerX) ** 2 + (pz - t.centerZ) ** 2;
        // Distance cull AND camera-direction cull (back-cull only for >3m)
        if (distSq < cullDistSq && isInViewArc(t.centerX, t.centerZ, distSq)) {
          for (const mesh of edgeMeshesRef.current) {
            mesh.setMatrixAt(edgeCount, t.matrix);
          }
          edgeCount++;
        }
      }
      
      for (const mesh of edgeMeshesRef.current) {
        mesh.count = edgeCount;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    
    // Cull cheap corn (interior/boundary)
    if (cheapMeshRef.current && cheapTransformsRef.current.length > 0) {
      const transforms = cheapTransformsRef.current;
      
      for (let i = 0; i < transforms.length; i++) {
        const t = transforms[i];
        const distSq = (px - t.centerX) ** 2 + (pz - t.centerZ) ** 2;
        // Distance cull AND camera-direction cull (back-cull only for >3m)
        if (distSq < cullDistSq && isInViewArc(t.centerX, t.centerZ, distSq)) {
          cheapMeshRef.current.setMatrixAt(cheapCount, t.matrix);
          cheapCount++;
        }
      }
      
      cheapMeshRef.current.count = cheapCount;
      cheapMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    
    // Disable LOD corn - just let fog hide the empty space
    if (billboardMeshRef.current) {
      billboardMeshRef.current.count = 0;
    }
    
    // Always report cull stats
    const stats = {
      edgeVisible: edgeCount,
      edgeTotal: edgeTransformsRef.current.length,
      cheapVisible: cheapCount,
      cheapTotal: cheapTransformsRef.current.length,
    };
    // console.log('[CullStats]', stats); // Disabled for cleaner console
    onCullStats?.(stats);
  });
  
  // Extract mesh data from GLTF with optimized materials
  // For cheap corn (non-edge): only use stalk/leaf geometry, skip corn cobs
  const { meshDataList, cheapStalkGeometry, cheapMaterial, billboardGeometry, billboardMaterial } = useMemo(() => {
    const meshes: MeshData[] = [];
    const stalkMeshes: MeshData[] = []; // Only stalk/leaf meshes (no corn cobs)
    const cornCobMeshes: MeshData[] = []; // Only corn cob meshes
    let sampledColor: Color | null = null;
    
    gltfScene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        const mat = mesh.material as any;
        
        // Check if this is a corn cob by color (yellow/orange hues)
        let isCornCob = false;
        if (mat.color) {
          const r = mat.color.r;
          const g = mat.color.g;
          const b = mat.color.b;
          // Corn cobs are yellow/orange: high red, medium-high green, low blue
          isCornCob = r > 0.5 && g > 0.3 && b < 0.3 && r > g * 0.8;
          // Corn cob detected by color
        }
        
        if (!sampledColor && mat.color && !isCornCob) {
          sampledColor = mat.color.clone();
        }
        
        const optimizedMaterial = Array.isArray(mesh.material) 
          ? mesh.material.map(m => optimizeMaterial(m.clone()))
          : optimizeMaterial(mesh.material.clone());
        
        const meshData = {
          geometry: mesh.geometry.clone(),
          material: optimizedMaterial
        };
        
        meshes.push(meshData);
        
        // Separate stalk and corn cob meshes
        if (isCornCob) {
          cornCobMeshes.push(meshData);
        } else {
          stalkMeshes.push(meshData);
        }
      }
    });
    
    
    // Use just the FIRST stalk geometry for cheap corn (keeps triangle count low)
    const firstStalkGeo: BufferGeometry = stalkMeshes.length >= 1 
      ? stalkMeshes[0].geometry.clone()
      : new BoxGeometry(0.1, 2, 0.1); // Fallback if no stalk meshes found
    
    const cheapMat = new MeshLambertMaterial({ 
      color: sampledColor || new Color(0.12, 0.25, 0.10),
      transparent: false,
      depthWrite: true,
      depthTest: true,
      side: FrontSide,
    });
    
    // Low-poly LOD corn: thicker stalk + larger drooping leaves
    // Create stalk (6-sided cylinder, thicker for visibility)
    const stalk = new CylinderGeometry(0.04, 0.05, 2.0, 6, 1);
    stalk.translate(0, 1.0, 0); // Base at y=0
    
    // Create larger, drooping triangular leaves
    const leafPositions: number[] = [];
    const leafNormals: number[] = [];
    const leafCount = 6; // More leaves for better coverage
    const leafLength = 0.5; // Longer leaves
    const leafWidth = 0.08; // Wider base
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const baseY = 0.4 + i * 0.28; // Leaves spread along stalk
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      
      // Leaf droops downward at tip (tip is lower than mid-point)
      const tipY = baseY + 0.15; // Tip slightly above base but leaf curves out
      
      // Triangle: base on stalk, extends outward and curves down
      // Vertex 0: base bottom (on stalk)
      leafPositions.push(cos * 0.05, baseY, sin * 0.05);
      // Vertex 1: base top (on stalk, slightly higher)
      leafPositions.push(cos * 0.05, baseY + leafWidth * 2, sin * 0.05);
      // Vertex 2: tip (extended outward, drooping)
      leafPositions.push(cos * leafLength, tipY, sin * leafLength);
      
      // Normal pointing outward-upward
      const nx = cos * 0.7;
      const nz = sin * 0.7;
      const ny = 0.7;
      leafNormals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      
      // Add second triangle for backface (leaf has thickness visually)
      leafPositions.push(cos * 0.05, baseY + leafWidth * 2, sin * 0.05);
      leafPositions.push(cos * 0.05, baseY, sin * 0.05);
      leafPositions.push(cos * leafLength, tipY, sin * leafLength);
      leafNormals.push(-nx, -ny, -nz, -nx, -ny, -nz, -nx, -ny, -nz);
    }
    
    // Get stalk data
    const stalkPos = stalk.attributes.position.array;
    const stalkNorm = stalk.attributes.normal.array;
    const stalkIdx = stalk.index!.array;
    
    // Combine stalk + leaves into single geometry
    const totalLeafVerts = leafCount * 6; // 2 triangles per leaf, 3 verts each
    const totalVerts = stalk.attributes.position.count + totalLeafVerts;
    const combinedPos = new Float32Array(totalVerts * 3);
    const combinedNorm = new Float32Array(totalVerts * 3);
    
    // Copy stalk
    combinedPos.set(stalkPos, 0);
    combinedNorm.set(stalkNorm, 0);
    
    // Copy leaves
    combinedPos.set(leafPositions, stalkPos.length);
    combinedNorm.set(leafNormals, stalkNorm.length);
    
    // Build indices: stalk indices + leaf triangles
    const leafIndices: number[] = [];
    const stalkVertCount = stalk.attributes.position.count;
    for (let i = 0; i < leafCount * 2; i++) { // 2 triangles per leaf
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
    
    // Green material matching the corn color
    const lodCornMat = new MeshLambertMaterial({
      color: new Color(0.2, 0.45, 0.15),
      side: DoubleSide, // See leaves from both sides
      depthWrite: true,
    });
    
    // Use all meshes from the model (stalk + leaves + corn cobs)
    
    
    return { 
      meshDataList: meshes, 
      cheapStalkGeometry: firstStalkGeo,
      cheapMaterial: cheapMat,
      billboardGeometry: lodCornGeo,
      billboardMaterial: lodCornMat
    };
  }, [gltfScene, cornTex]);
  
  // Generate transforms for all corn types + billboard transforms
  const { edgeTransforms, cheapTransforms, allBillboardTransforms } = useMemo(() => {
    const edge = generateEdgeTransforms(edgePositions, 0);
    const outer = generateWallTransforms(noShadowPositions, 10000);
    const boundary = generateBoundaryTransforms(boundaryPositions);
    const cheap3D = [...outer, ...boundary];
    
    // Generate billboard transforms for ALL corn (edge + cheap)
    const allTransforms = [...edge, ...cheap3D];
    const billboardTransforms: WallTransformData[] = [];
    const bbDummy = new Object3D();
    
    allTransforms.forEach(t => {
      const pos = new Vector3();
      const quat = new Quaternion();
      const scale = new Vector3();
      t.matrix.decompose(pos, quat, scale);
      
      // Billboard: upright plane at stalk position, slightly above ground
      bbDummy.position.set(pos.x, 1.25, pos.z); // Center billboard vertically
      bbDummy.rotation.set(0, 0, 0); // Reset rotation (will face camera via shader or lookAt)
      bbDummy.scale.set(1, 1, 1);
      bbDummy.updateMatrix();
      
      billboardTransforms.push({ matrix: bbDummy.matrix.clone(), centerX: t.centerX, centerZ: t.centerZ });
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
    const allMeshes: ThreeInstancedMesh[] = [];
    
    // EDGE CORN (adjacent to paths): Full GLTF materials
    const edgeMeshes: ThreeInstancedMesh[] = [];
    if (edgeTransforms.length > 0) {
      meshDataList.forEach((meshData) => {
        const instancedMesh = new ThreeInstancedMesh(
          meshData.geometry.clone(),
          Array.isArray(meshData.material)
            ? meshData.material.map(m => m.clone())
            : meshData.material.clone(),
          edgeTransforms.length
        );
        
        edgeTransforms.forEach((t, i) => {
          instancedMesh.setMatrixAt(i, t.matrix);
        });
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.castShadow = true;  // Edge corn casts shadows
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = false;  // Disable - we do distance culling manually
        
        edgeGroup.add(instancedMesh);
        allMeshes.push(instancedMesh);
        edgeMeshes.push(instancedMesh);
      });
      
      // Store refs for distance culling
      edgeMeshesRef.current = edgeMeshes;
      edgeTransformsRef.current = edgeTransforms;
      
      
    }
    
    // OUTER + BOUNDARY CORN: Single cheap material (1 draw call)
    if (cheapTransforms.length > 0) {
      const cheapMesh = new ThreeInstancedMesh(
        cheapStalkGeometry.clone(),
        cheapMaterial.clone(),
        cheapTransforms.length
      );
      
      cheapTransforms.forEach((t, i) => {
        cheapMesh.setMatrixAt(i, t.matrix);
      });
      
      cheapMesh.instanceMatrix.needsUpdate = true;
      cheapMesh.castShadow = false;
      cheapMesh.receiveShadow = true;
      cheapMesh.frustumCulled = false;  // Disable - we do distance culling manually
      
      // Store refs for dynamic LOD updates
      cheapMeshRef.current = cheapMesh;
      cheapMeshCountRef.current = cheapTransforms.length;
      cheapTransformsRef.current = cheapTransforms;
      
      cheapGroup.add(cheapMesh);
      allMeshes.push(cheapMesh);
    }
    
    return () => {
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
