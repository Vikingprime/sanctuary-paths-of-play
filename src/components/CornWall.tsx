import { useRef, useMemo, useEffect } from 'react';
import { Group, Mesh, Object3D, InstancedMesh as ThreeInstancedMesh, Matrix4, BufferGeometry, Material, Quaternion, Euler, BoxGeometry, MeshBasicMaterial, MeshLambertMaterial, Color, FrontSide, DoubleSide } from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

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

// Cheap material for far corn - dark green to match GLTF corn stalks
const FAR_CORN_MATERIAL = new MeshLambertMaterial({ 
  color: new Color(0.15, 0.30, 0.12), // Darker green but still visible
  transparent: false,
  depthWrite: true,
  depthTest: true,
  side: FrontSide,
});

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
  const shadowGroupRef = useRef<Group>(null);
  const expensiveGroupRef = useRef<Group>(null);
  const cheapGroupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene } = useGLTF('/models/Corn.glb');
  
  // Store mesh refs for dynamic LOD updates
  const expensiveMeshesRef = useRef<ThreeInstancedMesh[]>([]);
  const cheapMeshRef = useRef<ThreeInstancedMesh | null>(null);
  
  // Store original transforms for distance-based LOD
  const allTransformsRef = useRef<WallTransformData[]>([]);
  
  // Extract mesh data from GLTF with optimized materials
  const { meshDataList, firstGeometry } = useMemo(() => {
    const meshes: MeshData[] = [];
    let firstGeo: BufferGeometry | null = null;
    
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        const mat = mesh.material as any;
        console.log('[CornWall] Original material:', {
          transparent: mat.transparent,
          alphaTest: mat.alphaTest,
          depthWrite: mat.depthWrite,
          side: mat.side,
        });
        
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
    
    return { meshDataList: meshes, firstGeometry: firstGeo || new BoxGeometry(0.1, 2, 0.1) };
  }, [scene]);
  
  // Generate ALL transforms (edge + outer + boundary)
  const allTransforms = useMemo(() => {
    const edge = generateEdgeTransforms(edgePositions, 0);
    const outer = generateWallTransforms(noShadowPositions, 10000);
    const boundary = generateBoundaryTransforms(boundaryPositions);
    const all = [...edge, ...outer, ...boundary];
    return all;
  }, [edgePositions, noShadowPositions, boundaryPositions]);

  // Create instanced meshes - BOTH expensive and cheap for ALL corn
  useEffect(() => {
    const expensiveGroup = expensiveGroupRef.current;
    const cheapGroup = cheapGroupRef.current;
    if (!expensiveGroup || !cheapGroup || meshDataList.length === 0 || allTransforms.length === 0 || createdRef.current) return;
    
    createdRef.current = true;
    allTransformsRef.current = allTransforms;
    
    // EXPENSIVE: Full GLTF materials for all corn (multiple draw calls per material)
    const expensiveMeshes: ThreeInstancedMesh[] = [];
    meshDataList.forEach((meshData) => {
      const instancedMesh = new ThreeInstancedMesh(
        meshData.geometry.clone(),
        Array.isArray(meshData.material)
          ? meshData.material.map(m => m.clone())
          : meshData.material.clone(),
        allTransforms.length
      );
      
      allTransforms.forEach((t, i) => {
        instancedMesh.setMatrixAt(i, t.matrix);
      });
      
      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.castShadow = false; // Disable shadows for performance
      instancedMesh.receiveShadow = true;
      instancedMesh.frustumCulled = true;
      
      expensiveGroup.add(instancedMesh);
      expensiveMeshes.push(instancedMesh);
    });
    expensiveMeshesRef.current = expensiveMeshes;
    
    // CHEAP: Single material for all corn (1 draw call)
    const cheapMesh = new ThreeInstancedMesh(
      firstGeometry.clone(),
      FAR_CORN_MATERIAL.clone(),
      allTransforms.length
    );
    
    // Start all cheap instances as hidden, expensive as visible
    allTransforms.forEach((t, i) => {
      cheapMesh.setMatrixAt(i, HIDDEN_MATRIX);
    });
    
    cheapMesh.instanceMatrix.needsUpdate = true;
    cheapMesh.castShadow = false;
    cheapMesh.receiveShadow = true;
    cheapMesh.frustumCulled = true;
    
    cheapGroup.add(cheapMesh);
    cheapMeshRef.current = cheapMesh;
    
    return () => {
      expensiveMeshes.forEach(mesh => {
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
      if (cheapMeshRef.current) {
        const parent = cheapMeshRef.current.parent;
        if (parent) {
          parent.remove(cheapMeshRef.current);
        }
        cheapMeshRef.current.geometry.dispose();
        (cheapMeshRef.current.material as Material).dispose();
        cheapMeshRef.current.dispose();
      }
      createdRef.current = false;
    };
  }, [meshDataList, firstGeometry, allTransforms]);

  // Dynamic distance-based LOD - switch between expensive/cheap per instance
  useFrame(() => {
    if (!playerPositionRef) return;
    
    const px = playerPositionRef.current.x;
    const pz = playerPositionRef.current.y; // Note: y is used for Z coordinate
    const farDistance = optimizationSettings.farMaterialDistance;
    
    const transforms = allTransformsRef.current;
    const expensiveMeshes = expensiveMeshesRef.current;
    const cheapMesh = cheapMeshRef.current;
    
    if (transforms.length === 0 || expensiveMeshes.length === 0 || !cheapMesh) return;
    
    let nearCount = 0;
    let farCount = 0;
    
    // Check each instance and toggle visibility based on distance
    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];
      const dx = t.centerX - px;
      const dz = t.centerZ - pz;
      const distSq = dx * dx + dz * dz;
      const farDistSq = farDistance * farDistance;
      
      if (distSq > farDistSq) {
        // FAR: Show cheap, hide expensive
        cheapMesh.setMatrixAt(i, t.matrix);
        expensiveMeshes.forEach(mesh => {
          mesh.setMatrixAt(i, HIDDEN_MATRIX);
        });
        farCount++;
      } else {
        // NEAR: Show expensive, hide cheap
        cheapMesh.setMatrixAt(i, HIDDEN_MATRIX);
        expensiveMeshes.forEach(mesh => {
          mesh.setMatrixAt(i, t.matrix);
        });
        nearCount++;
      }
    }
    
    // Debug: log counts occasionally
    if (Math.random() < 0.01) {
      console.log(`[CornLOD] Player: (${px.toFixed(1)}, ${pz.toFixed(1)}), Near: ${nearCount}, Far: ${farCount}, FarDist: ${farDistance}`);
    }
    
    expensiveMeshes.forEach(mesh => {
      mesh.instanceMatrix.needsUpdate = true;
    });
    cheapMesh.instanceMatrix.needsUpdate = true;
  });

  if (allTransforms.length === 0) return null;

  return (
    <>
      <group ref={expensiveGroupRef} />
      <group ref={cheapGroupRef} />
    </>
  );
};
