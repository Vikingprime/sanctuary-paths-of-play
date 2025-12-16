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
  lodDistance: number;
  farMaterialDistance: number;
  enableShadowOptimization: boolean;
  enableDistanceCulling: boolean;
  enableLOD: boolean;
  enableFarMaterialOptimization: boolean;
  maxInstances: number;
  renderDistance: number;
}

export const DEFAULT_CORN_SETTINGS: CornOptimizationSettings = {
  shadowRadius: 8,
  cullDistance: 20,
  lodDistance: 8,
  farMaterialDistance: 5,
  enableShadowOptimization: true,
  enableDistanceCulling: true,
  enableLOD: true,
  enableFarMaterialOptimization: true,
  maxInstances: 5000,
  renderDistance: 30,
};

// Simple LOD geometry - single green box per stalk (1 draw call total)
const LOD_BOX_GEOMETRY = new BoxGeometry(0.08, 2.5, 0.08);
const LOD_BOX_MATERIAL = new MeshBasicMaterial({ color: new Color(0.2, 0.5, 0.15) });

// Hidden matrix (scale 0) for hiding instances
const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);

// Helper to optimize material for performance (fix transparency/overdraw issues)
const optimizeMaterial = (material: Material): Material => {
  const mat = material as any;
  
  if ('transparent' in mat) {
    mat.transparent = false;
  }
  if ('alphaTest' in mat) {
    mat.alphaTest = 0.5;
  }
  if ('depthWrite' in mat) {
    mat.depthWrite = true;
  }
  if ('depthTest' in mat) {
    mat.depthTest = true;
  }
  if ('side' in mat) {
    mat.side = FrontSide;
  }
  
  mat.needsUpdate = true;
  return material;
};

// Instanced walls using InstancedMesh
interface InstancedWallsProps {
  edgePositions: { x: number; z: number; edges: ('left' | 'right' | 'top' | 'bottom')[] }[];
  noShadowPositions?: { x: number; z: number }[];
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
    
    wallPos.edges.forEach((edge, edgeIdx) => {
      for (let col = 0; col < STALKS_PER_ROW; col++) {
        const stalkSeed = baseSeed + edgeIdx * 1000 + col;
        
        let offsetX = 0;
        let offsetZ = 0;
        const edgeOffset = (ROWS - 1) / 2 * STALK_SPACING;
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
  const { scene } = useGLTF('/models/Corn.glb');
  
  // Extract mesh data from GLTF with optimized materials + sample color for cheap material
  const { meshDataList, firstGeometry, cheapMaterial } = useMemo(() => {
    const meshes: MeshData[] = [];
    let firstGeo: BufferGeometry | null = null;
    let sampledColor: Color | null = null;
    
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        const mat = mesh.material as any;
        
        if (!sampledColor && mat.color) {
          sampledColor = mat.color.clone();
        }
        
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
  }, [scene]);
  
  // Generate ALL transforms once (with position data for distance filtering)
  const { allEdgeTransforms, allCheapTransforms } = useMemo(() => {
    const edge = generateEdgeTransforms(edgePositions, 0);
    const outer = generateWallTransforms(noShadowPositions, 10000);
    const boundary = generateBoundaryTransforms(boundaryPositions);
    return { 
      allEdgeTransforms: edge, 
      allCheapTransforms: [...outer, ...boundary] 
    };
  }, [edgePositions, noShadowPositions, boundaryPositions]);

  // Track instanced meshes for frame updates
  const edgeMeshesRef = useRef<ThreeInstancedMesh[]>([]);
  const cheapMeshRef = useRef<ThreeInstancedMesh | null>(null);
  const lastPlayerPosRef = useRef<{ x: number; z: number }>({ x: -999, z: -999 });

  // Create instanced meshes with max capacity
  useEffect(() => {
    const edgeGroup = edgeGroupRef.current;
    const cheapGroup = cheapGroupRef.current;
    if (!edgeGroup || !cheapGroup || meshDataList.length === 0 || createdRef.current) return;
    
    createdRef.current = true;
    const maxInstances = optimizationSettings.maxInstances;
    const allMeshes: ThreeInstancedMesh[] = [];
    edgeMeshesRef.current = [];
    
    // EDGE CORN: Create with max possible count
    const edgeCount = Math.min(allEdgeTransforms.length, maxInstances);
    if (edgeCount > 0) {
      meshDataList.forEach((meshData) => {
        const instancedMesh = new ThreeInstancedMesh(
          meshData.geometry.clone(),
          Array.isArray(meshData.material)
            ? meshData.material.map(m => m.clone())
            : meshData.material.clone(),
          edgeCount
        );
        
        // Initialize all as hidden
        for (let i = 0; i < edgeCount; i++) {
          instancedMesh.setMatrixAt(i, HIDDEN_MATRIX);
        }
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.castShadow = false;
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = true;
        
        edgeGroup.add(instancedMesh);
        edgeMeshesRef.current.push(instancedMesh);
        allMeshes.push(instancedMesh);
      });
    }
    
    // CHEAP CORN: Create with remaining budget
    const cheapBudget = Math.max(0, maxInstances - edgeCount);
    const cheapCount = Math.min(allCheapTransforms.length, cheapBudget);
    if (cheapCount > 0) {
      const cheapMesh = new ThreeInstancedMesh(
        firstGeometry.clone(),
        cheapMaterial.clone(),
        cheapCount
      );
      
      // Initialize all as hidden
      for (let i = 0; i < cheapCount; i++) {
        cheapMesh.setMatrixAt(i, HIDDEN_MATRIX);
      }
      
      cheapMesh.instanceMatrix.needsUpdate = true;
      cheapMesh.castShadow = false;
      cheapMesh.receiveShadow = true;
      cheapMesh.frustumCulled = true;
      
      cheapGroup.add(cheapMesh);
      cheapMeshRef.current = cheapMesh;
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
      edgeMeshesRef.current = [];
      cheapMeshRef.current = null;
      createdRef.current = false;
    };
  }, [meshDataList, firstGeometry, cheapMaterial, allEdgeTransforms.length, allCheapTransforms.length, optimizationSettings.maxInstances]);

  // Update instances each frame based on distance from player
  useFrame(() => {
    if (!playerPositionRef?.current) return;
    
    const px = playerPositionRef.current.x;
    const pz = playerPositionRef.current.y; // y in 2D = z in 3D
    
    // Only update if player moved significantly (reduces CPU load)
    const dx = px - lastPlayerPosRef.current.x;
    const dz = pz - lastPlayerPosRef.current.z;
    if (dx * dx + dz * dz < 1) return; // Only update if moved > 1 unit
    lastPlayerPosRef.current = { x: px, z: pz };
    
    const renderDist = optimizationSettings.renderDistance;
    const renderDistSq = renderDist * renderDist;
    const maxInstances = optimizationSettings.maxInstances;
    
    // Sort edge transforms by distance and filter within range
    const edgeSorted = allEdgeTransforms
      .map(t => {
        const tdx = t.centerX - px;
        const tdz = t.centerZ - pz;
        return { ...t, distSq: tdx * tdx + tdz * tdz };
      })
      .filter(t => t.distSq < renderDistSq)
      .sort((a, b) => a.distSq - b.distSq);
    
    const edgeToShow = edgeSorted.slice(0, Math.min(edgeSorted.length, maxInstances));
    
    // Update edge meshes
    edgeMeshesRef.current.forEach(mesh => {
      const count = mesh.count;
      for (let i = 0; i < count; i++) {
        if (i < edgeToShow.length) {
          mesh.setMatrixAt(i, edgeToShow[i].matrix);
        } else {
          mesh.setMatrixAt(i, HIDDEN_MATRIX);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
    
    // Sort cheap transforms by distance and filter within range
    const remainingBudget = Math.max(0, maxInstances - edgeToShow.length);
    const cheapMesh = cheapMeshRef.current;
    
    if (cheapMesh && remainingBudget > 0) {
      const cheapSorted = allCheapTransforms
        .map(t => {
          const tdx = t.centerX - px;
          const tdz = t.centerZ - pz;
          return { ...t, distSq: tdx * tdx + tdz * tdz };
        })
        .filter(t => t.distSq < renderDistSq)
        .sort((a, b) => a.distSq - b.distSq);
      
      const cheapToShow = cheapSorted.slice(0, Math.min(cheapSorted.length, remainingBudget, cheapMesh.count));
      
      for (let i = 0; i < cheapMesh.count; i++) {
        if (i < cheapToShow.length) {
          cheapMesh.setMatrixAt(i, cheapToShow[i].matrix);
        } else {
          cheapMesh.setMatrixAt(i, HIDDEN_MATRIX);
        }
      }
      cheapMesh.instanceMatrix.needsUpdate = true;
    }
  });

  if (allEdgeTransforms.length === 0 && allCheapTransforms.length === 0) return null;

  return (
    <>
      <group ref={edgeGroupRef} />
      <group ref={cheapGroupRef} />
    </>
  );
};

export default CornWall;
