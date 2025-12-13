import { useRef, useMemo, useEffect } from 'react';
import { Group, Mesh, Object3D, InstancedMesh as ThreeInstancedMesh, Matrix4, BufferGeometry, Material } from 'three';
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

// Instanced walls using native InstancedMesh for each mesh in the GLTF
interface InstancedWallsProps {
  positions: { x: number; z: number }[];
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
  size?: [number, number, number];
}

// Density settings
const ROWS = 3;
const STALKS_PER_ROW = 3;
const STALK_SPACING = 0.28;
const MIN_HEIGHT = 2.0;
const MAX_HEIGHT = 3.0;

// Boundary walls
const BOUNDARY_ROWS = 8;
const BOUNDARY_STALKS_PER_ROW = 6;
const BOUNDARY_SPACING = 0.25;
const BOUNDARY_DEPTH = 2.5;

// Extract mesh data from GLTF for instancing
interface MeshData {
  geometry: BufferGeometry;
  material: Material | Material[];
}

export const InstancedWalls = ({ positions, boundaryPositions = [], size = [0.6, 1, 0.6] }: InstancedWallsProps) => {
  const groupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene } = useGLTF('/models/Corn.glb');
  
  // Extract all meshes from the GLTF model
  const meshDataList = useMemo(() => {
    const meshes: MeshData[] = [];
    console.log('[CornWall] Traversing GLTF scene:', scene);
    scene.traverse((child) => {
      console.log('[CornWall] Child:', child.type, child.name);
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        console.log('[CornWall] Found mesh:', mesh.name, 'geometry:', mesh.geometry, 'material:', mesh.material);
        // Check if geometry has position attribute
        if (mesh.geometry.attributes.position) {
          console.log('[CornWall] Mesh has', mesh.geometry.attributes.position.count, 'vertices');
        }
        meshes.push({
          geometry: mesh.geometry.clone(),
          material: Array.isArray(mesh.material) 
            ? mesh.material.map(m => m.clone()) 
            : mesh.material.clone()
        });
      }
    });
    console.log('[CornWall] Found', meshes.length, 'meshes in GLTF');
    return meshes;
  }, [scene]);
  
  // Create stable key for positions
  const positionsKey = useMemo(() => {
    return JSON.stringify(positions) + JSON.stringify(boundaryPositions);
  }, [positions, boundaryPositions]);
  
  // Generate all stalk transforms
  const stalkTransforms = useMemo(() => {
    const transforms: Matrix4[] = [];
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
          const height = MIN_HEIGHT + seededRandom(stalkSeed + 3) * (MAX_HEIGHT - MIN_HEIGHT);
          
          // GLTF corn model - use uniform scaling with height variation
          const baseScale = 80; // Base uniform scale
          const heightVariation = 0.8 + seededRandom(stalkSeed + 3) * 0.4; // 0.8-1.2 variation
          const finalScale = baseScale * heightVariation;
          
          dummy.position.set(
            wallPos.x + 0.5 + offsetX + jitterX,
            0, // Start at ground level
            wallPos.z + 0.5 + offsetZ + jitterZ
          );
          dummy.rotation.set(0, rotation, 0);
          dummy.scale.set(finalScale, finalScale, finalScale); // Uniform scale
          dummy.updateMatrix();
          transforms.push(dummy.matrix.clone());
        }
      }
    });
    
    // Boundary walls
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
          const height = MIN_HEIGHT + seededRandom(stalkSeed + 3) * (MAX_HEIGHT - MIN_HEIGHT);
          
          let posX = wallPos.x + 0.5 + jitterX;
          let posZ = wallPos.z + 0.5 + jitterZ;
          
          if (dirX !== 0) {
            posX += dirX * depthOffset;
            posZ += offsetZ;
          } else {
            posX += offsetX;
            posZ += dirZ * depthOffset;
          }
          
          const baseScale = 80;
          const heightVariation = 0.8 + seededRandom(stalkSeed + 3) * 0.4;
          const finalScale = baseScale * heightVariation;
          dummy.position.set(posX, 0, posZ);
          dummy.rotation.set(0, rotation, 0);
          dummy.scale.set(finalScale, finalScale, finalScale);
          dummy.updateMatrix();
          transforms.push(dummy.matrix.clone());
        }
      }
    });
    
    return transforms;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsKey]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || stalkTransforms.length === 0 || meshDataList.length === 0 || createdRef.current) return;
    
    createdRef.current = true;
    
    // Create an InstancedMesh for each mesh in the GLTF
    const instancedMeshes: ThreeInstancedMesh[] = [];
    
    meshDataList.forEach((meshData, meshIndex) => {
      const instancedMesh = new ThreeInstancedMesh(
        meshData.geometry, 
        meshData.material, 
        stalkTransforms.length
      );
      
      stalkTransforms.forEach((matrix, i) => {
        instancedMesh.setMatrixAt(i, matrix);
      });
      
      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;
      instancedMesh.frustumCulled = false; // Ensure visibility
      
      group.add(instancedMesh);
      instancedMeshes.push(instancedMesh);
      
      console.log(`[CornWall] Added InstancedMesh ${meshIndex} with ${stalkTransforms.length} instances`);
    });
    
    return () => {
      instancedMeshes.forEach(mesh => {
        if (group.children.includes(mesh)) {
          group.remove(mesh);
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
  }, [stalkTransforms, meshDataList]);

  if (stalkTransforms.length === 0) return null;

  return <group ref={groupRef} />;
};
