import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { 
  ShaderMaterial, 
  BackSide, 
  Color, 
  Vector3,
  Mesh,
  SphereGeometry
} from 'three';

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
 * Atmospheric sky dome that follows the camera
 * Uses BackSide rendering with proper depth settings
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
  const { scene, camera } = useThree();
  const skyMeshRef = useRef<Mesh | null>(null);
  const materialRef = useRef<ShaderMaterial | null>(null);
  const timeRef = useRef(0);

  useEffect(() => {
    // Create sky material
    const skyMaterial = new ShaderMaterial({
      uniforms: {
        zenithColor: { value: new Color(zenithColor) },
        midColor: { value: new Color(midColor) },
        horizonColor: { value: new Color(horizonColor) },
        sunColor: { value: new Color(sunColor) },
        sunIntensity: { value: sunIntensity },
        sunDirection: { value: new Vector3(...sunPosition).normalize() },
        time: { value: 0 },
        cloudSpeed: { value: cloudSpeed },
      },
      vertexShader: `
        varying vec3 vWorldDirection;
        
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldDirection = normalize(worldPos.xyz - cameraPosition);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 zenithColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform vec3 sunColor;
        uniform float sunIntensity;
        uniform vec3 sunDirection;
        uniform float time;
        uniform float cloudSpeed;
        
        varying vec3 vWorldDirection;
        
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
          vec3 dir = normalize(vWorldDirection);
          float height = dir.y * 0.5 + 0.5; // Remap from [-1,1] to [0,1]
          
          // === 3-STOP SKY GRADIENT ===
          float midPoint = 0.5;
          float zenithPoint = 0.75;
          
          vec3 skyColor;
          if (height < midPoint) {
            float t = height / midPoint;
            t = smoothstep(0.0, 1.0, t);
            skyColor = mix(horizonColor, midColor, t);
          } else {
            float t = (height - midPoint) / (zenithPoint - midPoint);
            t = clamp(t, 0.0, 1.0);
            t = smoothstep(0.0, 1.0, t);
            skyColor = mix(midColor, zenithColor, t);
          }
          
          // === SUN + HALO ===
          vec3 sunDir = normalize(sunDirection);
          float sunDot = dot(dir, sunDir);
          
          float sunDisc = smoothstep(0.996, 0.9995, sunDot) * 0.5;
          float halo = pow(max(sunDot, 0.0), 6.0) * 0.15;
          float innerHalo = pow(max(sunDot, 0.0), 24.0) * 0.25;
          
          vec3 sunContrib = sunColor * (sunDisc + halo + innerHalo) * sunIntensity;
          skyColor += sunContrib;
          
          // === HIGH CLOUDS (only in upper sky) ===
          float cloudMinHeight = 0.6;
          float cloudFadeIn = 0.75;
          float cloudMask = smoothstep(cloudMinHeight, cloudFadeIn, height);
          
          if (cloudMask > 0.01) {
            vec2 cloudUV = dir.xz / (max(dir.y, 0.1)) * 0.25;
            cloudUV += vec2(time * cloudSpeed, time * cloudSpeed * 0.3);
            
            float cloud1 = fbm(cloudUV * 1.5);
            float cloud2 = fbm(cloudUV * 3.0 + 5.0);
            float clouds = cloud1 * 0.65 + cloud2 * 0.35;
            
            clouds = smoothstep(0.45, 0.72, clouds);
            
            float cloudAlpha = clouds * cloudMask * 0.18;
            vec3 cloudColor = mix(vec3(1.0), sunColor, 0.08);
            
            skyColor = mix(skyColor, cloudColor, cloudAlpha);
          }
          
          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });

    materialRef.current = skyMaterial;

    // Create sky dome geometry
    const skyGeometry = new SphereGeometry(500, 32, 32);
    const skyMesh = new Mesh(skyGeometry, skyMaterial);
    skyMesh.renderOrder = -1000;
    skyMesh.frustumCulled = false;
    
    skyMeshRef.current = skyMesh;
    scene.add(skyMesh);

    return () => {
      scene.remove(skyMesh);
      skyGeometry.dispose();
      skyMaterial.dispose();
    };
  }, [scene, zenithColor, midColor, horizonColor, sunColor, sunIntensity, sunPosition, cloudSpeed]);

  // Keep sky centered on camera and animate
  useFrame((_, delta) => {
    timeRef.current += delta;
    
    if (skyMeshRef.current) {
      skyMeshRef.current.position.copy(camera.position);
    }
    
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = timeRef.current;
    }
  });

  return null; // Sky is added directly to scene
};
