import { useRef, useMemo, useEffect } from 'react';
import { Group, Mesh, Object3D, InstancedMesh as ThreeInstancedMesh, Matrix4, BufferGeometry, Material, Quaternion, Euler, BoxGeometry, MeshBasicMaterial, MeshLambertMaterial, Color, FrontSide, DoubleSide, Fog } from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';

// Fog settings for hiding outer corn
const FOG_RETREAT_DISTANCE = 5; // Player must be within 5m for fog to retreat
const FOG_NEAR_DEFAULT = 2;      // Fog starts at 2m when far from outer corn
const FOG_FAR_DEFAULT = 8;       // Fog ends at 8m when far (hides outer corn)
const FOG_NEAR_CLOSE = 2;        // Fog starts at 2m when close to outer corn  
const FOG_FAR_CLOSE = 25;        // Fog ends at 25m when close (shows more)

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
  lodDistance: number;  // Distance at which to switch to simple geometry
  farMaterialDistance: number; // Distance at which to use cheap material (5m)
  enableShadowOptimization: boolean;
  enableDistanceCulling: boolean;
  enableLOD: boolean;
  enableFarMaterialOptimization: boolean;
}

export const DEFAULT_CORN_SETTINGS: CornOptimizationSettings = {
  shadowRadius: 8,
  cullDistance: 20,
  lodDistance: 8,  // Switch to simple geo beyond 8 units
  farMaterialDistance: 5, // Use cheap material beyond 5 meters
  enableShadowOptimization: true,
  enableDistanceCulling: true,
  enableLOD: true,
  enableFarMaterialOptimization: true,
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

// Instanced walls using InstancedMesh
interface InstancedWallsProps {
  edgePositions: { x: number; z: number; edges: ('left' | 'right' | 'top' | 'bottom')[] }[];  // Edge stalks only
  noShadowPositions?: { x: number; z: number }[];     // Full cell walls (no shadows)
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
  size?: [number, number, number];
  playerPositionRef?: React.MutableRefObject<{ x: number; y: number }>;
  optimizationSettings?: CornOptimizationSettings;
}

// Density settings
const ROWS = 3;
const STALKS_PER_ROW = 3;
const STALK_SPACING = 0.28;

// Boundary walls - reduced for performance
const BOUNDARY_ROWS = 3;
const BOUNDARY_STALKS_PER_ROW = 3;
const BOUNDARY_SPACING = 0.35;
const BOUNDARY_DEPTH = 1.2;

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
        
        // Position based on which edge
        let offsetX = 0;
        let offsetZ = 0;
        const edgeOffset = (ROWS - 1) / 2 * STALK_SPACING; // Position at the edge of the cell
        const colOffset = (col - (STALKS_PER_ROW - 1) / 2) * STALK_SPACING;
        
        switch (edge) {
          case 'left':   offsetX = -edgeOffset; offsetZ = colOffset; break;
          case 'right':  offsetX = edgeOffset;  offsetZ = colOffset; break;
          case 'top':    offsetX = colOffset;   offsetZ = -edgeOffset; break;
          case 'bottom': offsetX = colOffset;   offsetZ = edgeOffset; break;
        }
        
        const jitterX = (seededRandom(stalkSeed) - 0.5) * 0.03;
        const jitterZ = (seededRandom(stalkSeed + 1) - 0.5) * 0.03;
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

// Generate transforms for a set of wall positions (full 3x3 grid)
const generateWallTransforms = (
  positions: { x: number; z: number }[],
  seedOffset: number = 0
): WallTransformData[] => {
  const transforms: WallTransformData[] = [];
  const dummy = new Object3D();
  
  positions.forEach((wallPos) => {
    const baseSeed = wallPos.x * 1000 + wallPos.z + seedOffset;
    const centerX = wallPos.x + 0.5;
    const centerZ = wallPos.z + 0.5;
    
    for (let row = 0; row < ROWS; row++) {
      const rowOffset = (row % 2) * (STALK_SPACING / 2);
      for (let col = 0; col < STALKS_PER_ROW; col++) {
        const stalkSeed = baseSeed + row * 100 + col;
        const offsetX = (col - (STALKS_PER_ROW - 1) / 2) * STALK_SPACING + rowOffset;
        const offsetZ = (row - (ROWS - 1) / 2) * STALK_SPACING;
        const jitterX = (seededRandom(stalkSeed) - 0.5) * 0.03;
        const jitterZ = (seededRandom(stalkSeed + 1) - 0.5) * 0.03;
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
}: InstancedWallsProps) => {
  const edgeGroupRef = useRef<Group>(null);
  const cheapGroupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene: gltfScene } = useGLTF('/models/Corn.glb');
  const { scene } = useThree();
  
  // Track closest distance to any outer/boundary corn cell
  const cheapCellCenters = useMemo(() => {
    const centers: { x: number; z: number }[] = [];
    noShadowPositions.forEach(pos => centers.push({ x: pos.x + 0.5, z: pos.z + 0.5 }));
    boundaryPositions.forEach(pos => centers.push({ x: pos.x + 0.5, z: pos.z + 0.5 }));
    return centers;
  }, [noShadowPositions, boundaryPositions]);
  
  // Dynamic fog that retreats when player approaches outer corn
  useFrame(() => {
    if (!playerPositionRef?.current || cheapCellCenters.length === 0) return;
    
    const px = playerPositionRef.current.x;
    const pz = playerPositionRef.current.y; // y is z in 2D coords
    
    // Find minimum distance to any outer/boundary corn
    let minDist = Infinity;
    for (const center of cheapCellCenters) {
      const dx = px - center.x;
      const dz = pz - center.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) minDist = dist;
    }
    
    // Lerp fog based on distance (retreat when within 10m)
    const t = Math.max(0, Math.min(1, (FOG_RETREAT_DISTANCE - minDist) / FOG_RETREAT_DISTANCE));
    const fogNear = FOG_NEAR_DEFAULT + (FOG_NEAR_CLOSE - FOG_NEAR_DEFAULT) * t;
    const fogFar = FOG_FAR_DEFAULT + (FOG_FAR_CLOSE - FOG_FAR_DEFAULT) * t;
    
    // Update scene fog
    if (scene.fog instanceof Fog) {
      scene.fog.near = fogNear;
      scene.fog.far = fogFar;
    }
    
    // Hide cheap corn when fog covers it (player far away)
    if (cheapGroupRef.current) {
      cheapGroupRef.current.visible = minDist < FOG_RETREAT_DISTANCE + 5;
    }
  });
  
  // Extract mesh data from GLTF with optimized materials + sample color for cheap material
  const { meshDataList, firstGeometry, cheapMaterial } = useMemo(() => {
    const meshes: MeshData[] = [];
    let firstGeo: BufferGeometry | null = null;
    let sampledColor: Color | null = null;
    
    gltfScene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        const mat = mesh.material as any;
        
        // Sample color from GLTF for cheap material
        if (!sampledColor && mat.color) {
          sampledColor = mat.color.clone();
          console.log('[CornWall] Sampled GLTF color for cheap material:', sampledColor.getHexString());
        }
        
        // Clone and optimize material (fix transparency/overdraw issues)
        const optimizedMaterial = Array.isArray(mesh.material) 
          ? mesh.material.map(m => optimizeMaterial(m.clone()))
          : optimizeMaterial(mesh.material.clone());
        
        meshes.push({
          geometry: mesh.geometry.clone(),
          material: optimizedMaterial
        });
        
        if (!firstGeo) {
          firstGeo = mesh.geometry.clone();
        }
      }
    });
    
    // Create cheap material using sampled GLTF color
    const cheapMat = new MeshLambertMaterial({ 
      color: sampledColor || new Color(0.12, 0.25, 0.10),
      transparent: false,
      depthWrite: true,
      depthTest: true,
      side: FrontSide,
    });
    
    return { 
      meshDataList: meshes, 
      firstGeometry: firstGeo || new BoxGeometry(0.1, 2, 0.1),
      cheapMaterial: cheapMat
    };
  }, [gltfScene]);
  
  // Generate transforms separately for edge vs non-edge corn
  const { edgeTransforms, cheapTransforms } = useMemo(() => {
    const edge = generateEdgeTransforms(edgePositions, 0);
    const outer = generateWallTransforms(noShadowPositions, 10000);
    const boundary = generateBoundaryTransforms(boundaryPositions);
    return { 
      edgeTransforms: edge, 
      cheapTransforms: [...outer, ...boundary] 
    };
  }, [edgePositions, noShadowPositions, boundaryPositions]);

  // Create instanced meshes
  useEffect(() => {
    const edgeGroup = edgeGroupRef.current;
    const cheapGroup = cheapGroupRef.current;
    if (!edgeGroup || !cheapGroup || meshDataList.length === 0 || createdRef.current) return;
    
    createdRef.current = true;
    const allMeshes: ThreeInstancedMesh[] = [];
    
    // EDGE CORN (adjacent to paths): Full GLTF materials
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
        instancedMesh.castShadow = false;
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = true;
        
        edgeGroup.add(instancedMesh);
        allMeshes.push(instancedMesh);
      });
    }
    
    // OUTER + BOUNDARY CORN: Single cheap material (1 draw call)
    if (cheapTransforms.length > 0) {
      const cheapMesh = new ThreeInstancedMesh(
        firstGeometry.clone(),
        cheapMaterial.clone(),
        cheapTransforms.length
      );
      
      cheapTransforms.forEach((t, i) => {
        cheapMesh.setMatrixAt(i, t.matrix);
      });
      
      cheapMesh.instanceMatrix.needsUpdate = true;
      cheapMesh.castShadow = false;
      cheapMesh.receiveShadow = true;
      cheapMesh.frustumCulled = true;
      
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
      createdRef.current = false;
    };
  }, [meshDataList, firstGeometry, cheapMaterial, edgeTransforms, cheapTransforms]);

  if (edgeTransforms.length === 0 && cheapTransforms.length === 0) return null;

  return (
    <>
      <group ref={edgeGroupRef} />
      <group ref={cheapGroupRef} />
    </>
  );
};
