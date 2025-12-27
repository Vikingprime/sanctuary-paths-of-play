import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Color } from 'three';

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
 * Atmospheric sky using scene.background
 * This is the most reliable way to set a sky color
 */
export const AtmosphericSky = ({
  horizonColor = '#B8B0A0',
}: AtmosphericSkyProps) => {
  const { scene, gl } = useThree();

  useEffect(() => {
    // TEST 1: Set scene.background to magenta
    console.log('[AtmosphericSky] Setting scene.background to MAGENTA');
    scene.background = new Color(0xff00ff);
    
    // TEST 2: Also set clear color
    console.log('[AtmosphericSky] Setting gl.setClearColor to MAGENTA');
    gl.setClearColor(0xff00ff, 1);
    
    return () => {
      // Reset on cleanup
      scene.background = null;
    };
  }, [scene, gl]);

  return null;
};
