import { useRef, useMemo, useEffect } from 'react';
import { Group, Mesh, Object3D, InstancedMesh as ThreeInstancedMesh, Matrix4, BufferGeometry, Material, Quaternion, Euler } from 'three';
import { useGLTF } from '@react-three/drei';

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
  enableShadowOptimization: boolean;
  enableDistanceCulling: boolean;
}

export const DEFAULT_CORN_SETTINGS: CornOptimizationSettings = {
  shadowRadius: 8,
  cullDistance: 20,
  enableShadowOptimization: true,
  enableDistanceCulling: true,
};

// Instanced walls using InstancedMesh
interface InstancedWallsProps {
  positions: { x: number; z: number }[];              // Inner walls (adjacent to paths) - cast shadows
  noShadowPositions?: { x: number; z: number }[];     // Outer walls (not adjacent to paths) - no shadows
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
  size?: [number, number, number];
  playerPosition?: { x: number; z: number };
  optimizationSettings?: CornOptimizationSettings;
}

// Density settings
const ROWS = 3;
const STALKS_PER_ROW = 3;
const STALK_SPACING = 0.28;

// Boundary walls
const BOUNDARY_ROWS = 6;
const BOUNDARY_STALKS_PER_ROW = 4;
const BOUNDARY_SPACING = 0.30;
const BOUNDARY_DEPTH = 2.0;

interface MeshData {
  geometry: BufferGeometry;
  material: Material | Material[];
}

// Generate transforms for a set of wall positions
const generateWallTransforms = (
  positions: { x: number; z: number }[],
  seedOffset: number = 0
): Matrix4[] => {
  const transforms: Matrix4[] = [];
  const dummy = new Object3D();
  
  positions.forEach((wallPos) => {
    const baseSeed = wallPos.x * 1000 + wallPos.z + seedOffset;
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
        transforms.push(dummy.matrix.clone());
      }
    }
  });
  
  return transforms;
};

// Generate transforms for boundary walls
const generateBoundaryTransforms = (
  boundaryPositions: { x: number; z: number; offsetX: number; offsetZ: number }[]
): Matrix4[] => {
  const transforms: Matrix4[] = [];
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
        transforms.push(dummy.matrix.clone());
      }
    }
  });
  
  return transforms;
};

// Create instanced meshes from transforms
const createInstancedMeshes = (
  meshDataList: MeshData[],
  transforms: Matrix4[],
  castShadow: boolean,
  group: Group
): ThreeInstancedMesh[] => {
  const meshes: ThreeInstancedMesh[] = [];
  
  if (transforms.length === 0) return meshes;
  
  meshDataList.forEach((meshData) => {
    const instancedMesh = new ThreeInstancedMesh(
      meshData.geometry.clone(),
      Array.isArray(meshData.material)
        ? meshData.material.map(m => m.clone())
        : meshData.material.clone(),
      transforms.length
    );
    
    transforms.forEach((matrix, i) => {
      instancedMesh.setMatrixAt(i, matrix);
    });
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.castShadow = castShadow;
    instancedMesh.receiveShadow = true;
    instancedMesh.frustumCulled = true;
    
    group.add(instancedMesh);
    meshes.push(instancedMesh);
  });
  
  return meshes;
};

export const InstancedWalls = ({ 
  positions, 
  noShadowPositions = [],
  boundaryPositions = [], 
  optimizationSettings = DEFAULT_CORN_SETTINGS,
}: InstancedWallsProps) => {
  const shadowGroupRef = useRef<Group>(null);
  const noShadowGroupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene } = useGLTF('/models/Corn.glb');
  
  // Extract mesh data from GLTF
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
  
  // Generate transforms for each group
  const { shadowTransforms, noShadowTransforms } = useMemo(() => {
    // Inner walls (adjacent to paths) - these cast shadows
    const shadow = generateWallTransforms(positions, 0);
    
    // Outer walls + boundary - these don't cast shadows
    const noShadow = [
      ...generateWallTransforms(noShadowPositions, 10000),
      ...generateBoundaryTransforms(boundaryPositions)
    ];
    
    return { shadowTransforms: shadow, noShadowTransforms: noShadow };
  }, [positions, noShadowPositions, boundaryPositions]);

  useEffect(() => {
    const shadowGroup = shadowGroupRef.current;
    const noShadowGroup = noShadowGroupRef.current;
    if (!shadowGroup || !noShadowGroup || meshDataList.length === 0 || createdRef.current) return;
    
    createdRef.current = true;
    
    // Create shadow-casting instances (inner walls only)
    const shadowMeshes = createInstancedMeshes(meshDataList, shadowTransforms, true, shadowGroup);
    
    // Create non-shadow instances (outer walls + boundary)
    const noShadowMeshes = createInstancedMeshes(meshDataList, noShadowTransforms, false, noShadowGroup);
    
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
  }, [meshDataList, shadowTransforms, noShadowTransforms]);

  if (shadowTransforms.length === 0 && noShadowTransforms.length === 0) return null;

  return (
    <>
      <group ref={shadowGroupRef} />
      <group ref={noShadowGroupRef} />
    </>
  );
};
