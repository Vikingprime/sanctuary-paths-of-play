import { useEffect, useRef, useMemo } from 'react';
import { InstancedMesh, Object3D, MeshStandardMaterial, TextureLoader, RepeatWrapping, SRGBColorSpace, LinearMipmapLinearFilter, LinearFilter } from 'three';
import { useLoader, useThree } from '@react-three/fiber';
import cornTextureUrl from '@/assets/corn-texture.png';

interface CornWallProps {
  position: [number, number, number];
  size?: [number, number, number];
}

// Single wall component for simple cases
export const CornWall = ({ position, size = [1, 3, 1] }: CornWallProps) => {
  const texture = useLoader(TextureLoader, cornTextureUrl);
  const { gl } = useThree();
  
  const material = useMemo(() => {
    const clonedTexture = texture.clone();
    clonedTexture.wrapS = RepeatWrapping;
    clonedTexture.wrapT = RepeatWrapping;
    clonedTexture.repeat.set(1, 1);
    clonedTexture.colorSpace = SRGBColorSpace;
    clonedTexture.generateMipmaps = true;
    clonedTexture.minFilter = LinearMipmapLinearFilter;
    clonedTexture.magFilter = LinearFilter;
    // Anisotropic filtering reduces shimmer at oblique angles
    clonedTexture.anisotropy = gl.capabilities.getMaxAnisotropy();
    
    return new MeshStandardMaterial({
      map: clonedTexture,
      roughness: 0.95,
      metalness: 0,
    });
  }, [texture, gl]);

  return (
    <group position={position}>
      <mesh position={[0, size[1] / 2, 0]} material={material}>
        <boxGeometry args={size} />
      </mesh>
    </group>
  );
};

// Optimized instanced walls for rendering many walls efficiently
interface InstancedWallsProps {
  positions: { x: number; z: number }[];
  size?: [number, number, number];
}

export const InstancedWalls = ({ positions, size = [1.2, 3, 1.2] }: InstancedWallsProps) => {
  const meshRef = useRef<InstancedMesh>(null);
  const texture = useLoader(TextureLoader, cornTextureUrl);
  const { gl } = useThree();
  
  const material = useMemo(() => {
    const clonedTexture = texture.clone();
    clonedTexture.wrapS = RepeatWrapping;
    clonedTexture.wrapT = RepeatWrapping;
    clonedTexture.repeat.set(1, 2);
    clonedTexture.colorSpace = SRGBColorSpace;
    clonedTexture.generateMipmaps = true;
    clonedTexture.minFilter = LinearMipmapLinearFilter;
    clonedTexture.magFilter = LinearFilter;
    // Anisotropic filtering reduces shimmer at oblique angles
    clonedTexture.anisotropy = gl.capabilities.getMaxAnisotropy();
    
    return new MeshStandardMaterial({
      map: clonedTexture,
      roughness: 0.95,
      metalness: 0,
    });
  }, [texture, gl]);
  
  useEffect(() => {
    if (!meshRef.current || positions.length === 0) return;
    
    const dummy = new Object3D();
    
    positions.forEach((pos, i) => {
      dummy.position.set(pos.x + 0.5, size[1] / 2, pos.z + 0.5);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, size]);

  if (positions.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, positions.length]}
      frustumCulled={true}
      material={material}
    >
      <boxGeometry args={size} />
    </instancedMesh>
  );
};
