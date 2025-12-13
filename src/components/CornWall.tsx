import { useEffect, useRef, useMemo } from 'react';
import { InstancedMesh, Object3D, ShaderMaterial, Color } from 'three';

// Custom corn shader for realistic corn stalk appearance
const cornVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vPosition = position;
    
    // Support for instanced rendering
    #ifdef USE_INSTANCING
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    #else
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    #endif
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const cornFragmentShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    // Base corn colors - dark green to golden yellow
    vec3 darkGreen = vec3(0.15, 0.35, 0.1);
    vec3 lightGreen = vec3(0.3, 0.55, 0.2);
    vec3 golden = vec3(0.6, 0.5, 0.2);
    vec3 brown = vec3(0.3, 0.2, 0.1);
    
    // Vertical stalks pattern - stable sine wave
    float stalkX = vUv.x * 40.0;
    float stalkPattern = sin(stalkX) * 0.5 + 0.5;
    stalkPattern = pow(stalkPattern, 0.3);
    
    // Secondary stalk detail
    float detailPattern = sin(stalkX * 2.0 + 1.0) * 0.5 + 0.5;
    stalkPattern = mix(stalkPattern, detailPattern, 0.2);
    
    // Height-based color variation
    float heightFactor = vUv.y;
    
    // Mix green shades based on stalk pattern
    vec3 greenMix = mix(darkGreen, lightGreen, stalkPattern * 0.7);
    
    // Add golden tint at the top (corn tassels)
    vec3 topColor = mix(greenMix, golden, smoothstep(0.7, 1.0, heightFactor) * 0.5);
    
    // Add brown at the bottom (base of stalks)
    vec3 finalColor = mix(brown, topColor, smoothstep(0.0, 0.15, heightFactor));
    
    // Subtle horizontal banding for leaf texture (stable)
    float leafBands = sin(vUv.y * 60.0) * 0.015;
    finalColor += vec3(leafBands * 0.5, leafBands, leafBands * 0.3);
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

interface CornWallProps {
  position: [number, number, number];
  size?: [number, number, number];
}

// Single wall component for simple cases
export const CornWall = ({ position, size = [1, 3, 1] }: CornWallProps) => {
  const material = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: cornVertexShader,
      fragmentShader: cornFragmentShader,
    });
  }, []);

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
  
  const material = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: cornVertexShader,
      fragmentShader: cornFragmentShader,
    });
  }, []);
  
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
