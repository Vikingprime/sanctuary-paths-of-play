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
  
  // Pseudo-random function using world position for stability
  float random(vec2 st) {
    return fract(sin(dot(floor(st * 20.0), vec2(12.9898, 78.233))) * 43758.5453123);
  }
  
  void main() {
    // Base corn colors - dark green to golden yellow
    vec3 darkGreen = vec3(0.15, 0.35, 0.1);
    vec3 lightGreen = vec3(0.3, 0.55, 0.2);
    vec3 golden = vec3(0.6, 0.5, 0.2);
    vec3 brown = vec3(0.3, 0.2, 0.1);
    
    // Vertical stalks pattern - use floor to prevent sub-pixel jitter
    float stalkPattern = sin(floor(vUv.x * 40.0) / 40.0 * 40.0) * 0.5 + 0.5;
    stalkPattern = pow(stalkPattern, 0.3);
    
    // Height-based color variation (darker at bottom, lighter/golden at top)
    float heightFactor = vUv.y;
    
    // Mix green shades based on stalk pattern
    vec3 greenMix = mix(darkGreen, lightGreen, stalkPattern * 0.7);
    
    // Add golden tint at the top (like corn tassels)
    vec3 topColor = mix(greenMix, golden, smoothstep(0.7, 1.0, heightFactor) * 0.5);
    
    // Add brown at the very bottom (soil/base of stalks)
    vec3 finalColor = mix(brown, topColor, smoothstep(0.0, 0.15, heightFactor));
    
    // Add subtle random variation - use world position for stable noise
    vec2 stableCoord = vec2(vPosition.x + vPosition.z, vPosition.y);
    float noise = random(stableCoord) * 0.06;
    finalColor += vec3(noise * 0.5, noise, noise * 0.3);
    
    // Subtle vertical lines for individual stalk texture
    float lines = sin(floor(vUv.x * 80.0) / 80.0 * 80.0) * 0.02;
    finalColor += vec3(lines);
    
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
