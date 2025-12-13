import { useRef, useMemo, useEffect } from 'react';
import { Group, Mesh, Object3D, InstancedMesh as ThreeInstancedMesh, Matrix4, BufferGeometry, Material, Quaternion, Euler, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

// Instanced walls using native InstancedMesh with merged geometry
interface InstancedWallsProps {
  positions: { x: number; z: number }[];
  boundaryPositions?: { x: number; z: number; offsetX: number; offsetZ: number }[];
  size?: [number, number, number];
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

export const InstancedWalls = ({ positions, boundaryPositions = [], size = [0.6, 1, 0.6] }: InstancedWallsProps) => {
  const groupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene } = useGLTF('/models/Corn.glb');
  
  // Merge all meshes from GLTF into a single geometry with unified material
  const mergedData = useMemo(() => {
    const geometries: BufferGeometry[] = [];
    
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        const geom = mesh.geometry.clone();
        // Apply mesh's local transform to geometry
        if (mesh.matrix) {
          geom.applyMatrix4(mesh.matrix);
        }
        geometries.push(geom);
      }
    });
    
    if (geometries.length === 0) return null;
    
    // Merge all geometries into one
    const merged = mergeGeometries(geometries, false);
    
    // Use a single unified material (green corn color)
    const material = new MeshStandardMaterial({ 
      color: 0x3d6b2e,
      roughness: 0.8,
      metalness: 0.0
    });
    
    // Dispose cloned geometries
    geometries.forEach(g => g.dispose());
    
    return { geometry: merged, material };
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
          
          const baseScale = 100;
          const heightMultiplier = 1.8;
          const heightVariation = 0.8 + seededRandom(stalkSeed + 3) * 0.4;
          const widthScale = baseScale * heightVariation;
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
          const heightVariation = 0.8 + seededRandom(stalkSeed + 3) * 0.4;
          const widthScale = baseScale * heightVariation;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsKey]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || stalkTransforms.length === 0 || !mergedData || createdRef.current) return;
    
    createdRef.current = true;
    
    // Create a SINGLE InstancedMesh with merged geometry - one draw call!
    const instancedMesh = new ThreeInstancedMesh(
      mergedData.geometry, 
      mergedData.material, 
      stalkTransforms.length
    );
    
    stalkTransforms.forEach((matrix, i) => {
      instancedMesh.setMatrixAt(i, matrix);
    });
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    instancedMesh.frustumCulled = false;
    
    group.add(instancedMesh);
    
    return () => {
      if (group.children.includes(instancedMesh)) {
        group.remove(instancedMesh);
        instancedMesh.geometry.dispose();
        (instancedMesh.material as Material).dispose();
        instancedMesh.dispose();
      }
      createdRef.current = false;
    };
  }, [stalkTransforms, mergedData]);

  if (stalkTransforms.length === 0) return null;

  return <group ref={groupRef} />;
};
