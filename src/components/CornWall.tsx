import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Group, Mesh, Object3D, InstancedMesh as ThreeInstancedMesh, Matrix4 } from 'three';
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

// Density settings - full density for visual quality
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

export const InstancedWalls = ({ positions, boundaryPositions = [], size = [0.6, 1, 0.6] }: InstancedWallsProps) => {
  const { scene } = useGLTF('/models/Corn.glb');
  const [group, setGroup] = useState<Group | null>(null);
  const lastGroupRef = useRef<Group | null>(null);
  
  // Callback ref to capture the group when it's mounted
  const groupRefCallback = useCallback((node: Group | null) => {
    if (node && node !== lastGroupRef.current) {
      console.log('[CornWall] Group ref captured (new group)');
      lastGroupRef.current = node;
      setGroup(node);
    }
  }, []);
  
  // Generate all stalk transforms - memoize based on positions only
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
          
          dummy.position.set(
            wallPos.x + 0.5 + offsetX + jitterX,
            0,
            wallPos.z + 0.5 + offsetZ + jitterZ
          );
          dummy.rotation.set(0, rotation, 0);
          dummy.scale.set(size[0], height, size[2]);
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
          
          dummy.position.set(posX, 0, posZ);
          dummy.rotation.set(0, rotation, 0);
          dummy.scale.set(size[0], height, size[2]);
          dummy.updateMatrix();
          transforms.push(dummy.matrix.clone());
        }
      }
    });
    
    console.log('[CornWall] Generated transforms:', transforms.length);
    return transforms;
  }, [positions, boundaryPositions, size]);

  // Create instanced meshes once when group is available
  useEffect(() => {
    if (!group || stalkTransforms.length === 0) return;
    
    // Check if this group already has children (already populated)
    if (group.children.length > 0) {
      console.log('[CornWall] Group already has children, skipping');
      return;
    }
    
    console.log('[CornWall] Creating instanced meshes, transforms:', stalkTransforms.length);
    
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const originalMesh = child as Mesh;
        console.log('[CornWall] Found mesh:', originalMesh.name);
        
        const instancedMesh = new ThreeInstancedMesh(
          originalMesh.geometry.clone(),
          originalMesh.material,
          stalkTransforms.length
        );
        
        // Apply all transforms
        stalkTransforms.forEach((matrix, i) => {
          instancedMesh.setMatrixAt(i, matrix);
        });
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = false;
        
        group.add(instancedMesh);
        console.log('[CornWall] Added instanced mesh with', stalkTransforms.length, 'instances');
      }
    });
    
    console.log('[CornWall] Total children in group:', group.children.length);
  }, [group, scene, stalkTransforms]);

  if (stalkTransforms.length === 0) return null;

  return <group ref={groupRefCallback} />;
};
