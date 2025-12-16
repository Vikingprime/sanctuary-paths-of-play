import { useRef, useMemo, useEffect } from 'react';
import { Group, Mesh, Object3D, InstancedMesh as ThreeInstancedMesh, Matrix4, BufferGeometry, Material, Quaternion, Euler, BoxGeometry, MeshBasicMaterial, Color } from 'three';
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
  enableShadowOptimization: boolean;
  enableDistanceCulling: boolean;
  enableLOD: boolean;
}

export const DEFAULT_CORN_SETTINGS: CornOptimizationSettings = {
  shadowRadius: 8,
  cullDistance: 20,
  lodDistance: 8,  // Switch to simple geo beyond 8 units
  enableShadowOptimization: true,
  enableDistanceCulling: true,
  enableLOD: true,
};

// Simple LOD geometry - single green box per stalk (1 draw call total)
const LOD_BOX_GEOMETRY = new BoxGeometry(0.08, 2.5, 0.08);
const LOD_BOX_MATERIAL = new MeshBasicMaterial({ color: new Color(0.2, 0.5, 0.15) });

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
  const noShadowGroupRef = useRef<Group>(null);
  const lodGroupRef = useRef<Group>(null);
  const createdRef = useRef(false);
  const { scene } = useGLTF('/models/Corn.glb');
  
  // Store mesh refs for dynamic updates
  const shadowMeshesRef = useRef<ThreeInstancedMesh[]>([]);
  const noShadowMeshesRef = useRef<ThreeInstancedMesh[]>([]);
  const lodMeshRef = useRef<ThreeInstancedMesh | null>(null);
  
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
  const { edgeTransforms, outerTransforms, boundaryTransformsData, allTransforms } = useMemo(() => {
    const edge = generateEdgeTransforms(edgePositions, 0);
    const outer = generateWallTransforms(noShadowPositions, 10000);
    const boundary = generateBoundaryTransforms(boundaryPositions);
    const all = [...edge, ...outer, ...boundary];
    return { edgeTransforms: edge, outerTransforms: outer, boundaryTransformsData: boundary, allTransforms: all };
  }, [edgePositions, noShadowPositions, boundaryPositions]);

  // Create instanced meshes
  useEffect(() => {
    const shadowGroup = shadowGroupRef.current;
    const noShadowGroup = noShadowGroupRef.current;
    const lodGroup = lodGroupRef.current;
    if (!shadowGroup || !noShadowGroup || !lodGroup || meshDataList.length === 0 || createdRef.current) return;
    
    createdRef.current = true;
    
    // Edge stalks (adjacent to paths) - these CAST shadows
    const shadowMeshes: ThreeInstancedMesh[] = [];
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
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = true;
        
        shadowGroup.add(instancedMesh);
        shadowMeshes.push(instancedMesh);
      });
    }
    shadowMeshesRef.current = shadowMeshes;
    
    // Outer walls + boundary - these do NOT cast shadows (optimization)
    const allNoShadowTransforms = [...outerTransforms, ...boundaryTransformsData];
    const noShadowMeshes: ThreeInstancedMesh[] = [];
    if (allNoShadowTransforms.length > 0) {
      meshDataList.forEach((meshData) => {
        const instancedMesh = new ThreeInstancedMesh(
          meshData.geometry.clone(),
          Array.isArray(meshData.material)
            ? meshData.material.map(m => m.clone())
            : meshData.material.clone(),
          allNoShadowTransforms.length
        );
        
        allNoShadowTransforms.forEach((t, i) => {
          instancedMesh.setMatrixAt(i, t.matrix);
        });
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.castShadow = false;
        instancedMesh.receiveShadow = true;
        instancedMesh.frustumCulled = true;
        
        noShadowGroup.add(instancedMesh);
        noShadowMeshes.push(instancedMesh);
      });
    }
    noShadowMeshesRef.current = noShadowMeshes;
    
    // LOD mesh - simple boxes for ALL corn (single draw call)
    if (allTransforms.length > 0) {
      const lodMesh = new ThreeInstancedMesh(
        LOD_BOX_GEOMETRY,
        LOD_BOX_MATERIAL,
        allTransforms.length
      );
      
      const lodDummy = new Object3D();
      allTransforms.forEach((t, i) => {
        // Extract position from the transform matrix and create simple upright box
        const pos = { x: 0, y: 0, z: 0 };
        t.matrix.decompose(lodDummy.position, lodDummy.quaternion, lodDummy.scale);
        lodDummy.position.y = 1.25; // Center the box vertically
        lodDummy.quaternion.identity(); // Reset rotation for simple boxes
        lodDummy.scale.set(1, 1, 1);
        lodDummy.updateMatrix();
        lodMesh.setMatrixAt(i, lodDummy.matrix);
      });
      
      lodMesh.instanceMatrix.needsUpdate = true;
      lodMesh.castShadow = false;
      lodMesh.receiveShadow = false;
      lodMesh.frustumCulled = true;
      lodMesh.visible = false; // Start hidden, shown when far
      
      lodGroup.add(lodMesh);
      lodMeshRef.current = lodMesh;
    }
    
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
      if (lodMeshRef.current) {
        const parent = lodMeshRef.current.parent;
        if (parent) {
          parent.remove(lodMeshRef.current);
        }
        lodMeshRef.current.dispose();
      }
      createdRef.current = false;
    };
  }, [meshDataList, edgeTransforms, outerTransforms, boundaryTransformsData, allTransforms]);

  // Dynamic LOD and culling based on player position
  useFrame(() => {
    if (!playerPositionRef) return;
    
    const px = playerPositionRef.current.x;
    const pz = playerPositionRef.current.y;
    const lodDist = optimizationSettings.lodDistance;
    const cullDist = optimizationSettings.cullDistance;
    
    // LOD switching - show simple geometry when far, detailed when close
    if (optimizationSettings.enableLOD) {
      const shadowGroup = shadowGroupRef.current;
      const noShadowGroup = noShadowGroupRef.current;
      const lodMesh = lodMeshRef.current;
      
      // Calculate distance to maze center (rough approximation)
      const mazeCenterX = edgePositions.length > 0 
        ? edgePositions.reduce((sum, p) => sum + p.x, 0) / edgePositions.length 
        : 0;
      const mazeCenterZ = edgePositions.length > 0 
        ? edgePositions.reduce((sum, p) => sum + p.z, 0) / edgePositions.length 
        : 0;
      
      // For now, use simple toggle: detailed when playing, always show detailed
      // TODO: Could do per-chunk LOD switching for larger mazes
      if (shadowGroup) shadowGroup.visible = true;
      if (noShadowGroup) noShadowGroup.visible = true;
      if (lodMesh) lodMesh.visible = false;
    }
    
    // Distance culling for boundary corn
    if (optimizationSettings.enableDistanceCulling) {
      const noShadowGroup = noShadowGroupRef.current;
      if (noShadowGroup) {
        noShadowGroup.visible = true; // Keep visible for now
      }
    }
    
    // Update shadow casting based on toggle
    const shouldCastShadows = optimizationSettings.enableShadowOptimization;
    shadowMeshesRef.current.forEach(mesh => {
      mesh.castShadow = true;
    });
    noShadowMeshesRef.current.forEach(mesh => {
      mesh.castShadow = !shouldCastShadows;
    });
  });

  if (edgeTransforms.length === 0 && outerTransforms.length === 0 && boundaryTransformsData.length === 0) return null;

  return (
    <>
      <group ref={shadowGroupRef} />
      <group ref={noShadowGroupRef} />
      <group ref={lodGroupRef} />
    </>
  );
};
