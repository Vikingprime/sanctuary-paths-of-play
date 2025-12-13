import { useEffect, useRef, useMemo } from 'react';
import { InstancedMesh, Object3D, ShaderMaterial, Color } from 'three';

// Custom corn shader for realistic corn stalk appearance
const cornVertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    
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
  
  void main() {
    // Solid corn colors - height-based gradient only, no horizontal patterns
    vec3 brown = vec3(0.35, 0.25, 0.15);
    vec3 darkGreen = vec3(0.2, 0.4, 0.15);
    vec3 midGreen = vec3(0.25, 0.5, 0.18);
    vec3 lightGreen = vec3(0.35, 0.55, 0.2);
    vec3 golden = vec3(0.5, 0.45, 0.2);
    
    float h = vUv.y;
    
    // Smooth vertical gradient: brown -> dark green -> mid green -> light green -> golden
    vec3 color = brown;
    color = mix(color, darkGreen, smoothstep(0.0, 0.15, h));
    color = mix(color, midGreen, smoothstep(0.15, 0.4, h));
    color = mix(color, lightGreen, smoothstep(0.4, 0.7, h));
    color = mix(color, golden, smoothstep(0.8, 1.0, h));
    
    gl_FragColor = vec4(color, 1.0);
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
