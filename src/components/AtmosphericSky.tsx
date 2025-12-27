import { useMemo, useRef } from 'react';
import { ShaderMaterial, BackSide, Color, AdditiveBlending } from 'three';
import { useFrame } from '@react-three/fiber';

interface AtmosphericSkyProps {
  topColor?: string;      // Sky blue at zenith
  horizonColor?: string;  // MUST match fog color exactly
  sunColor?: string;      // Sun/halo tint
  sunIntensity?: number;  // Sun brightness (0-1)
  cloudSpeed?: number;    // Cloud movement speed
}

/**
 * Atmospheric sky dome with:
 * - Vertical gradient (blue top → fog-matched horizon)
 * - Subtle sun disc with soft halo
 * - Slow-moving high clouds (only in upper sky)
 * - Slight warm tint at horizon for "harvest moon" vibe
 */
export const AtmosphericSky = ({
  topColor = '#7FB6E6',      // Soft sky blue
  horizonColor = '#B8B0A0',  // MUST match fogColor exactly
  sunColor = '#FFF8E8',      // Warm white sun
  sunIntensity = 0.4,
  cloudSpeed = 0.008,
}: AtmosphericSkyProps) => {
  const materialRef = useRef<ShaderMaterial>(null);

  const material = useMemo(() => {
    return new ShaderMaterial({
      uniforms: {
        topColor: { value: new Color(topColor) },
        horizonColor: { value: new Color(horizonColor) },
        sunColor: { value: new Color(sunColor) },
        sunIntensity: { value: sunIntensity },
        sunDirection: { value: [0.4, 0.3, 0.5] }, // Sun position (normalized)
        time: { value: 0 },
        cloudSpeed: { value: cloudSpeed },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunColor;
        uniform float sunIntensity;
        uniform vec3 sunDirection;
        uniform float time;
        uniform float cloudSpeed;
        
        varying vec3 vWorldPosition;
        varying vec3 vPosition;
        
        // Simple hash for noise
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        
        // Value noise
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        // FBM for clouds
        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < 4; i++) {
            value += amplitude * noise(p);
            p *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }
        
        void main() {
          vec3 dir = normalize(vWorldPosition);
          float height = dir.y;
          
          // Clamp to positive hemisphere
          height = max(height, 0.0);
          
          // === SKY GRADIENT ===
          // Smooth gradient from horizon (0) to zenith (1)
          float gradientT = smoothstep(0.0, 0.5, height);
          
          // Slight warm tint at horizon for "harvest moon" cozy feel
          vec3 warmHorizon = mix(horizonColor, vec3(0.78, 0.72, 0.65), 0.15);
          
          // Base sky color
          vec3 skyColor = mix(warmHorizon, topColor, gradientT);
          
          // === SUN + HALO ===
          vec3 sunDir = normalize(sunDirection);
          float sunDot = dot(dir, sunDir);
          
          // Soft sun disc (very subtle, no hard edge)
          float sunDisc = smoothstep(0.995, 0.999, sunDot) * 0.6;
          
          // Wide soft halo around sun
          float halo = pow(max(sunDot, 0.0), 8.0) * 0.25;
          float innerHalo = pow(max(sunDot, 0.0), 32.0) * 0.4;
          
          vec3 sunContrib = sunColor * (sunDisc + halo + innerHalo) * sunIntensity;
          skyColor += sunContrib;
          
          // === CLOUDS (only in upper sky) ===
          // Only show clouds above horizon band (height > 0.2)
          float cloudMask = smoothstep(0.15, 0.4, height);
          
          if (cloudMask > 0.01) {
            // Project onto dome for cloud UVs
            vec2 cloudUV = dir.xz / (height + 0.1) * 0.3;
            cloudUV += time * cloudSpeed;
            
            // Layered cloud noise
            float cloud1 = fbm(cloudUV * 2.0);
            float cloud2 = fbm(cloudUV * 4.0 + 10.0);
            float clouds = cloud1 * 0.6 + cloud2 * 0.4;
            
            // Threshold to create cloud shapes
            clouds = smoothstep(0.4, 0.7, clouds);
            
            // Very subtle, semi-transparent clouds
            float cloudAlpha = clouds * cloudMask * 0.2;
            vec3 cloudColor = mix(vec3(1.0), sunColor, 0.1);
            
            skyColor = mix(skyColor, cloudColor, cloudAlpha);
          }
          
          // === ATMOSPHERIC PERSPECTIVE ===
          // Slight desaturation toward horizon
          float saturation = mix(0.85, 1.0, gradientT);
          vec3 gray = vec3(dot(skyColor, vec3(0.299, 0.587, 0.114)));
          skyColor = mix(gray, skyColor, saturation);
          
          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
      side: BackSide,
      depthWrite: false,
      fog: false, // Sky should NOT receive fog
    });
  }, [topColor, horizonColor, sunColor, sunIntensity, cloudSpeed]);

  // Animate clouds
  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value += delta;
    }
  });

  return (
    <mesh renderOrder={-1000}>
      <sphereGeometry args={[500, 32, 32]} />
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
};
