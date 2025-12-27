import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { 
  MeshBasicMaterial, 
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
 * Atmospheric sky dome - VISIBILITY DEBUG
 * Using MeshBasicMaterial with magenta to prove it renders
 */
export const AtmosphericSky = (_props: AtmosphericSkyProps) => {
  const { scene, camera } = useThree();
  const skyMeshRef = useRef<Mesh | null>(null);
  const addedRef = useRef(false);

  useEffect(() => {
    // Only add once
    if (addedRef.current) return;
    addedRef.current = true;
    
    console.log('[AtmosphericSky] Creating MAGENTA debug dome...');
    
    // Simplest possible material - MeshBasicMaterial with magenta
    const skyMaterial = new MeshBasicMaterial({
      color: 0xff00ff, // MAGENTA
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });

    // Create sphere geometry
    const skyGeometry = new SphereGeometry(1, 32, 16);
    const skyMesh = new Mesh(skyGeometry, skyMaterial);
    
    // Make it HUGE
    skyMesh.scale.setScalar(10000);
    
    // Critical settings
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -1000;
    skyMesh.name = 'DEBUG_SKY_DOME';
    
    // Position at camera initially
    skyMesh.position.copy(camera.position);
    
    skyMeshRef.current = skyMesh;
    scene.add(skyMesh);
    
    console.log('[AtmosphericSky] Dome added:', {
      position: skyMesh.position.toArray(),
      scale: skyMesh.scale.toArray(),
      visible: skyMesh.visible,
      inScene: scene.children.includes(skyMesh)
    });

    // Don't remove on cleanup - persist across rerenders
    return () => {
      // Intentionally NOT removing to prevent rerender issues
      console.log('[AtmosphericSky] Cleanup called but NOT removing dome');
    };
  }, [scene, camera]);

  // Every frame: keep dome centered on camera
  useFrame(() => {
    if (skyMeshRef.current) {
      skyMeshRef.current.position.copy(camera.position);
    }
  });

  return null;
};
