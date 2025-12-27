import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { 
  MeshBasicMaterial, 
  BackSide, 
  Mesh,
  SphereGeometry,
  PerspectiveCamera
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
 * Atmospheric sky dome - sized to camera far plane
 */
export const AtmosphericSky = (_props: AtmosphericSkyProps) => {
  const { scene, camera } = useThree();
  const skyMeshRef = useRef<Mesh | null>(null);
  const addedRef = useRef(false);

  useEffect(() => {
    if (addedRef.current) return;
    addedRef.current = true;
    
    // Get camera far plane - use 0.95 of it so we're inside the frustum
    const perspCam = camera as PerspectiveCamera;
    const radius = (perspCam.far || 1000) * 0.95;
    
    console.log('[AtmosphericSky] Camera far:', perspCam.far, 'Using radius:', radius);
    
    // Simple magenta material for debug
    const skyMaterial = new MeshBasicMaterial({
      color: 0xff00ff, // MAGENTA
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });

    // Create sphere with radius based on camera far plane
    const skyGeometry = new SphereGeometry(radius, 32, 16);
    const skyMesh = new Mesh(skyGeometry, skyMaterial);
    
    // Critical settings
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -1000;
    skyMesh.name = 'SKY_DOME';
    
    // Start at camera position
    skyMesh.position.copy(camera.position);
    
    skyMeshRef.current = skyMesh;
    scene.add(skyMesh);
    
    console.log('[AtmosphericSky] Dome added with radius:', radius);

    return () => {
      console.log('[AtmosphericSky] Cleanup - NOT removing');
    };
  }, [scene, camera]);

  // Keep dome centered on camera every frame
  useFrame(() => {
    if (skyMeshRef.current) {
      skyMeshRef.current.position.copy(camera.position);
    }
  });

  return null;
};
