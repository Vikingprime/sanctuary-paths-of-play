/**
 * Shared SkyBackground component - 360° horizon with fog band
 * Used by both Maze3DScene and BoardGameMode
 */
import { useRef, useMemo } from 'react';
import { useFrame, useThree, useLoader } from '@react-three/fiber';
import {
  Mesh,
  ShaderMaterial,
  Color,
  BackSide,
  TextureLoader,
  RepeatWrapping,
  ClampToEdgeWrapping,
  LinearFilter,
} from 'three';
import { FogConfig, FOG_COLOR } from '@/game/FogConfig';

const SKY_TOP_COLOR = '#6191B5';

export const SkyBackground = () => {
  const skyRef = useRef<Mesh>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (skyRef.current) {
      skyRef.current.position.copy(camera.position);
    }
  });

  const barnTexture = useLoader(TextureLoader, '/textures/farm-horizon.png');
  const treesTexture = useLoader(TextureLoader, '/textures/horizon-trees.png');

  useMemo(() => {
    [barnTexture, treesTexture].forEach(tex => {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = ClampToEdgeWrapping;
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
    });
  }, [barnTexture, treesTexture]);

  const skyMaterial = useMemo(() => {
    const mat = new ShaderMaterial({
      uniforms: {
        barnTexture: { value: barnTexture },
        treesTexture: { value: treesTexture },
        horizonHeight: { value: FogConfig.HORIZON_HEIGHT },
        imageHeight: { value: FogConfig.HORIZON_IMAGE_HEIGHT },
        bottomColor: { value: FOG_COLOR.clone() },
        topColor: { value: new Color(SKY_TOP_COLOR) },
        fogSolidHeightPct: { value: FogConfig.SKY_BAND_SOLID_HEIGHT },
        fogTransitionTopPct: { value: FogConfig.SKY_BAND_TRANSITION_TOP },
      },
      vertexShader: `
        varying vec3 vLocalPosition;
        void main() {
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D barnTexture;
        uniform sampler2D treesTexture;
        uniform float horizonHeight;
        uniform float imageHeight;
        uniform vec3 bottomColor;
        uniform vec3 topColor;
        uniform float fogSolidHeightPct;
        uniform float fogTransitionTopPct;
        varying vec3 vLocalPosition;
        
        void main() {
          vec3 viewDir = normalize(vLocalPosition);
          float height = viewDir.y;
          
          float imageBottom = horizonHeight - imageHeight * 0.5;
          float imageTop = horizonHeight + imageHeight * 0.5;
          
          float angle = atan(viewDir.x, viewDir.z);
          float u_raw = (angle / (2.0 * 3.14159265) + 0.5);
          
          float wave1 = sin(u_raw * 6.28318 * 2.0) * 0.5 + 0.5;
          float wave2 = sin(u_raw * 6.28318 * 3.0 + 1.0) * 0.5 + 0.5;
          float wave3 = sin(u_raw * 6.28318 * 5.0 + 2.5) * 0.5 + 0.5;
          float waveVariation = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2);
          float fogHeightBoost = waveVariation * 0.08;
          
          float fogSolidHeight = imageBottom + imageHeight * (fogSolidHeightPct + fogHeightBoost);
          float fogTopHeight = imageBottom + imageHeight * (fogTransitionTopPct + fogHeightBoost);
          
          float u_scaled = u_raw * 3.0;
          int panel = int(floor(u_scaled));
          float u = fract(u_scaled);
          
          vec3 finalColor;
          
          vec3 fogColorCorrected = pow(bottomColor, vec3(1.0 / 2.2));
          vec3 skyColorCorrected = pow(topColor, vec3(1.0 / 2.2));
          
          if (height >= imageBottom && height <= imageTop) {
            float v = (height - imageBottom) / imageHeight;
            
            vec3 imageColor;
            if (panel == 1) {
              imageColor = texture2D(barnTexture, vec2(u, v)).rgb;
            } else {
              imageColor = texture2D(treesTexture, vec2(u, v)).rgb;
            }
            
            vec3 gray = vec3(dot(imageColor, vec3(0.299, 0.587, 0.114)));
            imageColor = mix(gray, imageColor, 1.3);
            imageColor = (imageColor - 0.5) * 1.15 + 0.5;
            imageColor = clamp(imageColor, 0.0, 1.0);
            
            if (height < fogSolidHeight) {
              finalColor = fogColorCorrected;
            } else if (height < fogTopHeight) {
              float fogBlend = smoothstep(fogTopHeight, fogSolidHeight, height);
              finalColor = mix(imageColor, fogColorCorrected, fogBlend);
            } else {
              finalColor = imageColor;
            }
          } else if (height < imageBottom) {
            finalColor = fogColorCorrected;
          } else {
            float t = clamp((height - imageTop) / (1.0 - imageTop), 0.0, 1.0);
            finalColor = mix(skyColorCorrected, skyColorCorrected * 0.8, t);
          }
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: BackSide,
      fog: false,
      depthWrite: false,
      toneMapped: false,
    });
    return mat;
  }, [barnTexture, treesTexture]);

  return (
    <mesh ref={skyRef} renderOrder={-1000} material={skyMaterial}>
      <sphereGeometry args={[95, 32, 32]} />
    </mesh>
  );
};
