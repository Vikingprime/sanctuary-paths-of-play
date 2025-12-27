import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { 
  ShaderMaterial, 
  BackSide, 
  Mesh,
  SphereGeometry
} from 'three';

interface AtmosphericSkyProps {
  zenithColor?: string;
  midColor?: string;
  horizonColor?: string;
  sunColor?: string;
  sunIntensity?: number;
  sunPosition?: [number, number, number];
  cloudSpeed?: number;
}

/**
 * Atmospheric sky dome - DEBUG VERSION
 * First prove it renders with magenta, then add gradient
 */
export const AtmosphericSky = ({
  zenithColor = '#6BA8DC',
  midColor = '#A8B8C4',
  horizonColor = '#B8B0A0',
}: AtmosphericSkyProps) => {
  const { scene, camera } = useThree();
  const skyMeshRef = useRef<Mesh | null>(null);

  useEffect(() => {
    console.log('[AtmosphericSky] Creating sky dome...');
    
    // Create sky material - MAGENTA TEST
    const skyMaterial = new ShaderMaterial({
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        void main() {
          // CONSTANT MAGENTA - proves mesh is rendering
          gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
        }
      `,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });

    // Create sky dome geometry - large enough to encompass scene
    const skyGeometry = new SphereGeometry(1000, 32, 32);
    const skyMesh = new Mesh(skyGeometry, skyMaterial);
    skyMesh.renderOrder = -1000;
    skyMesh.frustumCulled = false;
    skyMesh.name = 'AtmosphericSkyDome';
    
    skyMeshRef.current = skyMesh;
    scene.add(skyMesh);
    
    console.log('[AtmosphericSky] Sky dome added to scene:', skyMesh);
    console.log('[AtmosphericSky] Scene children count:', scene.children.length);

    return () => {
      console.log('[AtmosphericSky] Removing sky dome...');
      scene.remove(skyMesh);
      skyGeometry.dispose();
      skyMaterial.dispose();
    };
  }, [scene]);

  // Keep sky centered on camera
  useFrame(() => {
    if (skyMeshRef.current) {
      skyMeshRef.current.position.copy(camera.position);
    }
  });

  return null;
};
