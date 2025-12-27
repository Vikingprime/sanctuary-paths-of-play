import { useMemo } from 'react';
import { ShaderMaterial, BackSide, Color } from 'three';

interface GradientSkyProps {
  topColor?: string;
  horizonColor?: string;
  fogColor?: string;
  horizonBlend?: number; // How much of the sky is horizon color (0-1)
}

/**
 * Gradient sky dome that blends from blue at zenith to fog color at horizon.
 * This ensures distant objects fade into a matching horizon, eliminating the
 * "white corn" artifact when fog color doesn't match background.
 */
export const GradientSky = ({ 
  topColor = '#5DA9E9',      // Slightly desaturated sky blue at top
  horizonColor = '#C8C4B8',  // Matches fog color at horizon
  fogColor = '#C8C4B8',      // Fog color for smooth blending
  horizonBlend = 0.35,       // How far up the horizon color extends
}: GradientSkyProps) => {
  const material = useMemo(() => {
    return new ShaderMaterial({
      uniforms: {
        topColor: { value: new Color(topColor) },
        horizonColor: { value: new Color(horizonColor) },
        fogColor: { value: new Color(fogColor) },
        horizonBlend: { value: horizonBlend },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 fogColor;
        uniform float horizonBlend;
        varying vec3 vWorldPosition;
        
        void main() {
          // Normalize Y to get height factor (0 at horizon, 1 at zenith)
          float height = normalize(vWorldPosition).y;
          
          // Clamp to positive hemisphere
          height = max(height, 0.0);
          
          // Create smooth gradient from horizon to top
          // horizonBlend controls how much of the lower sky uses horizon color
          float t = smoothstep(0.0, horizonBlend, height);
          
          // Blend from fog color (at horizon) through horizon color to top color
          // At very bottom: use fogColor for seamless fog blending
          // At horizon band: blend horizonColor  
          // At top: use topColor
          float fogBlend = 1.0 - smoothstep(0.0, 0.08, height);
          vec3 skyColor = mix(horizonColor, topColor, t);
          skyColor = mix(skyColor, fogColor, fogBlend);
          
          // Slight desaturation toward horizon for atmospheric perspective
          float saturation = mix(0.7, 1.0, t);
          vec3 gray = vec3(dot(skyColor, vec3(0.299, 0.587, 0.114)));
          skyColor = mix(gray, skyColor, saturation);
          
          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
      side: BackSide,
      depthWrite: false,
      fog: false, // Sky should NOT receive fog
    });
  }, [topColor, horizonColor, fogColor, horizonBlend]);

  return (
    <mesh renderOrder={-1000}>
      <sphereGeometry args={[500, 32, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};
