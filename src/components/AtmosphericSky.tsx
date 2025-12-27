import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { 
  MeshBasicMaterial, 
  BackSide, 
  Mesh,
  BoxGeometry,
  Scene
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
 * DEBUG: BoxGeometry skybox that should cover EVERYTHING
 */
export const AtmosphericSky = (_props: AtmosphericSkyProps) => {
  const { scene, camera } = useThree();
  const skyMeshRef = useRef<Mesh | null>(null);
  const sceneRef = useRef<Scene | null>(null);

  useEffect(() => {
    // Store scene reference for comparison
    sceneRef.current = scene;
    
    console.log('[AtmosphericSky] Scene instance:', scene.uuid);
    console.log('[AtmosphericSky] Scene children BEFORE:', scene.children.length);
    
    // HUGE BOX - should be impossible to miss
    const size = 50; // Large enough to encompass everything
    const skyGeometry = new BoxGeometry(size, size, size);
    
    // Magenta material
    const skyMaterial = new MeshBasicMaterial({
      color: 0xff00ff,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });

    const skyMesh = new Mesh(skyGeometry, skyMaterial);
    
    // RENDER ON TOP OF EVERYTHING
    skyMesh.renderOrder = 999999;
    skyMesh.frustumCulled = false;
    skyMesh.name = 'DEBUG_SKYBOX';
    
    // Start at camera
    skyMesh.position.copy(camera.position);
    
    skyMeshRef.current = skyMesh;
    scene.add(skyMesh);
    
    console.log('[AtmosphericSky] Skybox added!');
    console.log('[AtmosphericSky] Scene children AFTER:', scene.children.length);
    console.log('[AtmosphericSky] Mesh in scene.children?', scene.children.includes(skyMesh));
    console.log('[AtmosphericSky] Mesh visible?', skyMesh.visible);
    console.log('[AtmosphericSky] Mesh position:', skyMesh.position.toArray());
    console.log('[AtmosphericSky] Camera position:', camera.position.toArray());

    return () => {
      console.log('[AtmosphericSky] Cleanup - removing mesh');
      scene.remove(skyMesh);
      skyGeometry.dispose();
      skyMaterial.dispose();
    };
  }, [scene, camera]);

  // Keep skybox centered on camera every frame
  useFrame(() => {
    if (skyMeshRef.current) {
      skyMeshRef.current.position.copy(camera.position);
    }
    
    // Verify scene is still the same
    if (sceneRef.current && sceneRef.current !== scene) {
      console.warn('[AtmosphericSky] SCENE CHANGED! Was:', sceneRef.current.uuid, 'Now:', scene.uuid);
    }
  });

  return null;
};
