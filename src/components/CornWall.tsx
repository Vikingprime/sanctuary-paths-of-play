import { useRef, useMemo, useEffect } from 'react';
import { Group, Mesh, Object3D, InstancedMesh as ThreeInstancedMesh, Matrix4, BufferGeometry, Material, Quaternion, Euler, Vector3 } from 'three';
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
  shadowRadius: number;        // Only corn within this radius casts shadows
  cullDistance: number;        // Hide corn beyond this distance
  enableShadowOptimization: boolean;
  enableDistanceCulling: boolean;
}

export const DEFAULT_CORN_SETTINGS: CornOptimizationSettings = {
  shadowRadius: 8,
  cullDistance: 20,
  enableShadowOptimization: true,
  enableDistanceCulling: true,
};

// Instanced walls using InstancedMesh for each mesh in the GLTF (2 draw calls)
interface InstancedWallsProps {
  positions: { x: number; z: number }[];
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
  size?: [number, number, number];
  playerPosition?: { x: number; z: number };
  optimizationSettings?: CornOptimizationSettings;
}

// Density settings - full density for visual quality
const ROWS = 3;
const STALKS_PER_ROW = 3;
const STALK_SPACING = 0.28;

// Boundary walls
const BOUNDARY_ROWS = 6;
const BOUNDARY_STALKS_PER_ROW = 4;
const BOUNDARY_SPACING = 0.30;
const BOUNDARY_DEPTH = 2.0;

// Extract mesh data from GLTF for instancing
interface MeshData {
  geometry: BufferGeometry;
  material: Material | Material[];
}

interface StalkTransform {
  matrix: Matrix4;
  wallX: number;
  wallZ: number;
  isBoundary: boolean;
}

export const InstancedWalls = ({ 
  positions, 
  boundaryPositions = [], 
  size = [0.6, 1, 0.6],
  playerPosition,
  optimizationSettings = DEFAULT_CORN_SETTINGS,
}: InstancedWallsProps) => {
  const shadowGroupRef = useRef<Group>(null);
  const noShadowGroupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene } = useGLTF('/models/Corn.glb');
  
  // Refs for instanced meshes so we can update visibility
  const shadowMeshesRef = useRef<ThreeInstancedMesh[]>([]);
  const noShadowMeshesRef = useRef<ThreeInstancedMesh[]>([]);
  
  // Extract all meshes from the GLTF model (preserves original materials)
  const meshDataList = useMemo(() => {
    const meshes: MeshData[] = [];
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        meshes.push({
          geometry: mesh.geometry.clone(),
          material: Array.isArray(mesh.material) 
            ? mesh.material.map(m => m.clone()) 
            : mesh.material.clone()
        });
      }
    });
    return meshes;
  }, [scene]);
  
  // Create stable key for positions
  const positionsKey = useMemo(() => {
    return JSON.stringify(positions) + JSON.stringify(boundaryPositions);
  }, [positions, boundaryPositions]);
  
  // Generate all stalk transforms with wall position info
  const stalkTransforms = useMemo(() => {
    const transforms: StalkTransform[] = [];
    const dummy = new Object3D();
    
    // Regular interior walls
    positions.forEach((wallPos) => {
      const baseSeed = wallPos.x * 1000 + wallPos.z;
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
            wallPos.x + 0.5 + offsetX + jitterX,
            0,
            wallPos.z + 0.5 + offsetZ + jitterZ
          );
          const uprightQuat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0, 'XYZ'));
          const yRotQuat = new Quaternion().setFromEuler(new Euler(0, rotation, 0, 'XYZ'));
          dummy.quaternion.copy(uprightQuat).premultiply(yRotQuat);
          dummy.scale.set(widthScale, widthScale, heightScale);
          dummy.updateMatrix();
          transforms.push({
            matrix: dummy.matrix.clone(),
            wallX: wallPos.x + 0.5,
            wallZ: wallPos.z + 0.5,
            isBoundary: false,
          });
        }
      }
    });
    
    // Boundary walls - these are outer border, never cast shadows (optimization)
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
          transforms.push({
            matrix: dummy.matrix.clone(),
            wallX: posX,
            wallZ: posZ,
            isBoundary: true,
          });
        }
      }
    });
    
    return transforms;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsKey]);

  // Split transforms into interior (can cast shadow) and boundary (never shadows)
  const { interiorTransforms, boundaryTransformsList } = useMemo(() => {
    const interior = stalkTransforms.filter(t => !t.isBoundary);
    const boundary = stalkTransforms.filter(t => t.isBoundary);
    return { interiorTransforms: interior, boundaryTransformsList: boundary };
  }, [stalkTransforms]);

  useEffect(() => {
    const shadowGroup = shadowGroupRef.current;
    const noShadowGroup = noShadowGroupRef.current;
    if (!shadowGroup || !noShadowGroup || stalkTransforms.length === 0 || meshDataList.length === 0 || createdRef.current) return;
    
    createdRef.current = true;
    
    // Create shadow-casting instances (interior corn only)
    const shadowMeshes: ThreeInstancedMesh[] = [];
    meshDataList.forEach((meshData) => {
      const instancedMesh = new ThreeInstancedMesh(
        meshData.geometry.clone(), 
        Array.isArray(meshData.material) 
          ? meshData.material.map(m => m.clone()) 
          : meshData.material.clone(), 
        interiorTransforms.length
      );
      
      interiorTransforms.forEach((transform, i) => {
        instancedMesh.setMatrixAt(i, transform.matrix);
      });
      
      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;
      instancedMesh.frustumCulled = true;
      
      shadowGroup.add(instancedMesh);
      shadowMeshes.push(instancedMesh);
    });
    shadowMeshesRef.current = shadowMeshes;
    
    // Create non-shadow instances (boundary corn)
    const noShadowMeshes: ThreeInstancedMesh[] = [];
    if (boundaryTransformsList.length > 0) {
      meshDataList.forEach((meshData) => {
        const instancedMesh = new ThreeInstancedMesh(
          meshData.geometry.clone(), 
          Array.isArray(meshData.material) 
            ? meshData.material.map(m => m.clone()) 
            : meshData.material.clone(), 
          boundaryTransformsList.length
        );
        
        boundaryTransformsList.forEach((transform, i) => {
          instancedMesh.setMatrixAt(i, transform.matrix);
        });
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.castShadow = false; // No shadows for boundary
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = true;
        
        noShadowGroup.add(instancedMesh);
        noShadowMeshes.push(instancedMesh);
      });
    }
    noShadowMeshesRef.current = noShadowMeshes;
    
    return () => {
      [...shadowMeshes, ...noShadowMeshes].forEach(mesh => {
        const parent = mesh.parent;
        if (parent && parent.children.includes(mesh)) {
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
  }, [stalkTransforms, meshDataList, interiorTransforms, boundaryTransformsList]);

  // Dynamic shadow/visibility updates based on player position
  useFrame(() => {
    if (!playerPosition || !optimizationSettings.enableDistanceCulling) return;
    
    const cullDistSq = optimizationSettings.cullDistance * optimizationSettings.cullDistance;
    
    // Update visibility of boundary corn based on distance
    noShadowMeshesRef.current.forEach(mesh => {
      // Simple distance-based visibility - hide if player is far from maze center
      // For now, boundary corn is always visible but doesn't cast shadows
      mesh.visible = true;
    });
  });

  if (stalkTransforms.length === 0) return null;

  return (
    <>
      <group ref={shadowGroupRef} />
      <group ref={noShadowGroupRef} />
    </>
  );
};
