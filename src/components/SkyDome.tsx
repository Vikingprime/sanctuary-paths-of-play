import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Mesh, SphereGeometry, MeshBasicMaterial, CanvasTexture, BackSide } from 'three';

// Fog color MUST match scene fog exactly - #B8B0A0
const FOG_COLOR_HEX = '#B8B0A0';

/**
 * SkyDome component that renders a gradient sky sphere.
 * 
 * Key features:
 * - Follows camera every frame (no parallax/moving sphere feeling)
 * - Uses canvas texture for gradient (no shader issues)
 * - Horizon color matches fog exactly for seamless blending
 * - Does NOT affect fog or culling behavior
 */
export const SkyDome = () => {
  const meshRef = useRef<Mesh>(null);
  const { camera } = useThree();

  // Create geometry, material, and texture ONCE
  const { geometry, material } = useMemo(() => {
    // Create canvas for gradient texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Vertical gradient from top to horizon
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    
    // Top: soft pleasant blue sky
    gradient.addColorStop(0, '#6BA3D6');
    
    // Upper-mid: lighter blue transitioning to warmer
    gradient.addColorStop(0.25, '#8BB8E0');
    
    // Mid: pale warm sky
    gradient.addColorStop(0.5, '#B5C8D8');
    
    // Lower-mid: transitioning to fog color
    gradient.addColorStop(0.7, '#B0B5A8');
    
    // Horizon band: EXACT fog color for seamless blend
    gradient.addColorStop(0.85, FOG_COLOR_HEX);
    gradient.addColorStop(1.0, FOG_COLOR_HEX);

    // Fill background with gradient
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Optional: subtle sun glow in upper sky
    const sunGradient = ctx.createRadialGradient(
      canvas.width * 0.7, // Sun position X (upper right area)
      canvas.height * 0.15, // Sun position Y (high up)
      0,
      canvas.width * 0.7,
      canvas.height * 0.15,
      canvas.width * 0.3
    );
    sunGradient.addColorStop(0, 'rgba(255, 248, 220, 0.4)');
    sunGradient.addColorStop(0.3, 'rgba(255, 240, 200, 0.2)');
    sunGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sunGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create texture from canvas
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Geometry: sphere with reasonable segments
    const geo = new SphereGeometry(1, 32, 16);

    // Material with all required flags per spec
    const mat = new MeshBasicMaterial({
      map: texture,
      side: BackSide,           // We are inside the sphere
      fog: false,               // Sky must NOT be fogged
      depthTest: false,         // Render behind everything
      depthWrite: false,        // Don't affect depth buffer
      toneMapped: false,        // Preserve colors
    });

    return { geometry: geo, material: mat };
  }, []);

  // Set mesh properties after mount
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.frustumCulled = false;
      // Render first (behind everything else)
      meshRef.current.renderOrder = -1000;
    }
  }, []);

  // Every frame: position dome at camera, scale to safe radius
  useFrame(() => {
    if (!meshRef.current) return;

    // Copy camera position so dome moves with camera (no parallax)
    meshRef.current.position.copy(camera.position);

    // Scale to safe radius: inside frustum but feels infinite
    // Use min of desired size and 95% of camera.far
    const desiredSkyRadius = 1000;
    const safeRadius = Math.min(desiredSkyRadius, camera.far * 0.95);
    meshRef.current.scale.setScalar(safeRadius);
  });

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  );
};
