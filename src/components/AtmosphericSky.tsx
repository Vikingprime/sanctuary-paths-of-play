import { useRef } from 'react';
import { BackSide, Mesh } from 'three';
import { useFrame } from '@react-three/fiber';
import { GradientTexture } from '@react-three/drei';

interface AtmosphericSkyProps {
  zenithColor?: string;    // Top of sky - soft blue
  midColor?: string;       // Mid sky - pale desaturated blue-gray  
  horizonColor?: string;   // MUST match fog color exactly
  sunColor?: string;       // Unused but kept for API compatibility
  sunIntensity?: number;   // Unused but kept for API compatibility
  sunPosition?: [number, number, number]; // Unused but kept for API compatibility
  cloudSpeed?: number;     // Unused but kept for API compatibility
}

/**
 * Simple atmospheric sky dome using drei's GradientTexture
 * - Vertical gradient: zenith blue → mid gray-blue → horizon fog
 * - No fog applied (sky ignores scene fog)
 */
export const AtmosphericSky = ({
  zenithColor = '#6BA8DC',    // Soft blue at top
  midColor = '#A8B8C4',       // Pale desaturated blue-gray
  horizonColor = '#B8B0A0',   // MUST match fogColor exactly
}: AtmosphericSkyProps) => {
  const meshRef = useRef<Mesh>(null);

  // Slowly rotate for subtle movement
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.002;
    }
  });

  return (
    <mesh ref={meshRef} scale={[-1, 1, 1]}>
      <sphereGeometry args={[500, 32, 32]} />
      <meshBasicMaterial side={BackSide} fog={false}>
        <GradientTexture
          stops={[0, 0.4, 0.7, 1]}
          colors={[horizonColor, horizonColor, midColor, zenithColor]}
        />
      </meshBasicMaterial>
    </mesh>
  );
};
