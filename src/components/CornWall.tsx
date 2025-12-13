import { useRef, useMemo, createContext, useContext } from 'react';
import { Group, Mesh, Object3D } from 'three';
import { useGLTF, Merged } from '@react-three/drei';

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

// Optimized instanced walls using Merged from drei
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
  
  // Extract all meshes from the GLTF for Merged component
  const meshes = useMemo(() => {
    const result: Record<string, Mesh> = {};
    let meshIndex = 0;
    
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        result[`mesh${meshIndex}`] = child as Mesh;
        meshIndex++;
      }
    });
    
    return result;
  }, [scene]);
  
  // Generate stalk data for walls
  const stalkData = useMemo(() => {
    const data: { pos: [number, number, number]; rotation: number; height: number }[] = [];
    
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
          
          data.push({
            pos: [wallPos.x + 0.5 + offsetX + jitterX, 0, wallPos.z + 0.5 + offsetZ + jitterZ],
            rotation,
            height
          });
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
          
          data.push({
            pos: [posX, 0, posZ],
            rotation,
            height
          });
        }
      }
    });
    
    return data;
  }, [positions, boundaryPositions]);

  if (positions.length === 0 && boundaryPositions.length === 0) return null;
  if (Object.keys(meshes).length === 0) return null;

  // Use Merged for efficient GPU instancing of GLTF models
  return (
    <Merged meshes={meshes} castShadow receiveShadow>
      {(MergedMeshes: Record<string, React.FC<any>>) => (
        <group>
          {stalkData.map((stalk, i) => (
            <group
              key={i}
              position={stalk.pos}
              rotation={[0, stalk.rotation, 0]}
              scale={[size[0], stalk.height, size[2]]}
            >
              {Object.keys(MergedMeshes).map((meshKey) => {
                const MeshComponent = MergedMeshes[meshKey];
                return <MeshComponent key={meshKey} />;
              })}
            </group>
          ))}
        </group>
      )}
    </Merged>
  );
};
