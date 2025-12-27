import { useMemo, useRef } from 'react';
import { ShaderMaterial, BackSide, Color, Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';

interface AtmosphericSkyProps {
  zenithColor?: string;    // Top of sky - soft blue
  midColor?: string;       // Mid sky - pale desaturated blue-gray  
  horizonColor?: string;   // MUST match fog color exactly
  sunColor?: string;       // Sun/halo tint
  sunIntensity?: number;   // Sun brightness (0-1)
  sunPosition?: [number, number, number]; // Sun direction (normalized)
  cloudSpeed?: number;     // Cloud movement speed
}

/**
 * Atmospheric sky dome rendered in sky-space (infinite dome):
 * - 3-stop vertical gradient: zenith blue → mid gray-blue → horizon fog
 * - Subtle off-center sun with soft radial halo
 * - High clouds ONLY in upper sky (above horizon band)
 * - No fog applied (sky ignores scene fog)
 * - No depth writing (background layer)
 */
export const AtmosphericSky = ({
  zenithColor = '#6BA8DC',    // Soft blue at top
  midColor = '#A8B8C4',       // Pale desaturated blue-gray
  horizonColor = '#B8B0A0',   // MUST match fogColor exactly
  sunColor = '#FFF8E8',       // Warm white sun
  sunIntensity = 0.3,         // Faint, cozy
  sunPosition = [0.6, 0.35, 0.4], // Upper right, off-center
  cloudSpeed = 0.004,
}: AtmosphericSkyProps) => {
  const materialRef = useRef<ShaderMaterial>(null);
  const timeRef = useRef(0);

  // Create colors once and update uniforms
  const uniforms = useMemo(() => ({
    zenithColor: { value: new Color(zenithColor) },
    midColor: { value: new Color(midColor) },
    horizonColor: { value: new Color(horizonColor) },
    sunColor: { value: new Color(sunColor) },
    sunIntensity: { value: sunIntensity },
    sunDirection: { value: new Vector3(...sunPosition).normalize() },
    time: { value: 0 },
    cloudSpeed: { value: cloudSpeed },
  }), [zenithColor, midColor, horizonColor, sunColor, sunIntensity, sunPosition, cloudSpeed]);

  // Animate clouds
  useFrame((_, delta) => {
    timeRef.current += delta;
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = timeRef.current;
    }
  });

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[500, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vDirection;
          void main() {
            // Use local position as direction (sphere centered on camera)
            vDirection = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 zenithColor;
          uniform vec3 midColor;
          uniform vec3 horizonColor;
          uniform vec3 sunColor;
          uniform float sunIntensity;
          uniform vec3 sunDirection;
          uniform float time;
          uniform float cloudSpeed;
          
          varying vec3 vDirection;
          
          // Hash for noise
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
            vec3 dir = normalize(vDirection);
            float height = max(dir.y, 0.0);
            
            // === 3-STOP SKY GRADIENT ===
            // horizon (0) → mid (0.25) → zenith (0.6+)
            float midPoint = 0.25;
            float zenithPoint = 0.6;
            
            vec3 skyColor;
            if (height < midPoint) {
              // Horizon to mid
              float t = height / midPoint;
              t = smoothstep(0.0, 1.0, t);
              skyColor = mix(horizonColor, midColor, t);
            } else {
              // Mid to zenith
              float t = (height - midPoint) / (zenithPoint - midPoint);
              t = clamp(t, 0.0, 1.0);
              t = smoothstep(0.0, 1.0, t);
              skyColor = mix(midColor, zenithColor, t);
            }
            
            // === SUN + HALO (faint, cozy) ===
            vec3 sunDir = normalize(sunDirection);
            float sunDot = dot(dir, sunDir);
            
            // Very soft sun disc (no hard edge)
            float sunDisc = smoothstep(0.996, 0.9995, sunDot) * 0.5;
            
            // Wide soft halo
            float halo = pow(max(sunDot, 0.0), 6.0) * 0.15;
            float innerHalo = pow(max(sunDot, 0.0), 24.0) * 0.25;
            
            vec3 sunContrib = sunColor * (sunDisc + halo + innerHalo) * sunIntensity;
            skyColor += sunContrib;
            
            // === HIGH CLOUDS (only in UPPER sky, NOT near horizon) ===
            // Clouds only appear above height 0.35 - well above horizon blend zone
            float cloudMinHeight = 0.35;
            float cloudFadeIn = 0.5;
            float cloudMask = smoothstep(cloudMinHeight, cloudFadeIn, height);
            
            if (cloudMask > 0.01) {
              // Project onto dome for stable cloud UVs
              vec2 cloudUV = dir.xz / (height + 0.2) * 0.25;
              cloudUV += vec2(time * cloudSpeed, time * cloudSpeed * 0.3);
              
              // Layered cloud noise
              float cloud1 = fbm(cloudUV * 1.5);
              float cloud2 = fbm(cloudUV * 3.0 + 5.0);
              float clouds = cloud1 * 0.65 + cloud2 * 0.35;
              
              // Threshold for wispy cloud shapes
              clouds = smoothstep(0.45, 0.72, clouds);
              
              // Very subtle, semi-transparent high clouds
              float cloudAlpha = clouds * cloudMask * 0.18;
              vec3 cloudColor = mix(vec3(1.0), sunColor, 0.08);
              
              skyColor = mix(skyColor, cloudColor, cloudAlpha);
            }
            
            gl_FragColor = vec4(skyColor, 1.0);
          }
        `}
        side={BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
};