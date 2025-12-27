import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { 
  MeshBasicMaterial, 
  BackSide, 
  Mesh,
  SphereGeometry,
  CanvasTexture,
  Color
} from 'three';

interface AtmosphericSkyProps {
  zenithColor?: string;
  horizonColor?: string;
  sunColor?: string;
}

/**
 * Atmospheric sky sphere with gradient texture
 * Horizon color matches fog to hide culling
 * Variation (clouds/sun glow) kept above horizon
 */
export const AtmosphericSky = ({
  zenithColor = '#4A90D9',
  horizonColor = '#B8B0A0', // Must match fogColor!
  sunColor = '#FFE4B5',
}: AtmosphericSkyProps) => {
  const { scene, camera } = useThree();
  const skyMeshRef = useRef<Mesh | null>(null);

  useEffect(() => {
    // Set scene.background to horizon/fog color as fallback
    const horizonBg = new Color(horizonColor);
    scene.background = horizonBg;
    
    // Create gradient texture on canvas
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Vertical gradient - top to bottom
    // Top half: zenith -> mid sky
    // Bottom half: mid sky -> horizon (fog color)
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    
    // Parse colors
    const zenith = new Color(zenithColor);
    const horizon = new Color(horizonColor);
    const sun = new Color(sunColor);
    
    // Create a mid-sky color (blend of zenith and a warmer tone)
    const midSky = zenith.clone().lerp(sun, 0.15);
    
    // Gradient stops - variation ABOVE horizon, horizon band = exact fogColor
    gradient.addColorStop(0, `#${zenith.getHexString()}`);      // Top: deep blue
    gradient.addColorStop(0.2, `#${midSky.getHexString()}`);    // Upper: slightly warm
    gradient.addColorStop(0.35, `#${sun.getHexString()}`);      // Sun glow zone
    gradient.addColorStop(0.45, `#${horizon.getHexString()}`);  // Transition to horizon
    gradient.addColorStop(0.5, `#${horizon.getHexString()}`);   // Horizon = EXACT fogColor
    gradient.addColorStop(1, `#${horizon.getHexString()}`);     // Below horizon = EXACT fogColor
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add subtle cloud wisps in upper portion only (above horizon)
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height * 0.4; // Top 40% only
      const w = 30 + Math.random() * 80;
      const h = 5 + Math.random() * 15;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    const texture = new CanvasTexture(canvas);
    
    // Sphere radius based on camera.far
    const radius = (camera as any).far ? (camera as any).far * 0.9 : 500;
    
    const skyGeometry = new SphereGeometry(radius, 32, 32);
    const skyMaterial = new MeshBasicMaterial({
      map: texture,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });

    const skyMesh = new Mesh(skyGeometry, skyMaterial);
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -1000; // Render first (behind everything)
    skyMesh.name = 'AtmosphericSky';
    
    // Start at camera position
    skyMesh.position.copy(camera.position);
    
    skyMeshRef.current = skyMesh;
    scene.add(skyMesh);

    return () => {
      scene.remove(skyMesh);
      skyGeometry.dispose();
      skyMaterial.dispose();
      texture.dispose();
    };
  }, [scene, camera, zenithColor, horizonColor, sunColor]);

  // Keep sky centered on camera every frame
  useFrame(() => {
    if (skyMeshRef.current) {
      skyMeshRef.current.position.copy(camera.position);
    }
  });

  return null;
};
