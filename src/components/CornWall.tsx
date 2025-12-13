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
    // Base corn colors
    vec3 darkGreen = vec3(0.18, 0.38, 0.12);
    vec3 lightGreen = vec3(0.28, 0.52, 0.18);
    vec3 golden = vec3(0.55, 0.48, 0.22);
    vec3 brown = vec3(0.32, 0.22, 0.12);
    
    // Very low frequency stalk pattern to avoid aliasing
    float stalkPattern = sin(vUv.x * 12.0) * 0.5 + 0.5;
    stalkPattern = smoothstep(0.3, 0.7, stalkPattern);
    
    // Height-based color
    float heightFactor = vUv.y;
    
    // Mix greens with smooth stalk pattern
    vec3 greenMix = mix(darkGreen, lightGreen, stalkPattern * 0.5);
    
    // Golden tint at top
    vec3 topColor = mix(greenMix, golden, smoothstep(0.75, 0.95, heightFactor) * 0.4);
    
    // Brown at bottom
    vec3 finalColor = mix(brown, topColor, smoothstep(0.0, 0.12, heightFactor));
    
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
