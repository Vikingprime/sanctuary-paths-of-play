/**
 * Medial Axis (Skeleton) Visualization Component
 * 
 * Renders the computed skeleton/spine of the maze as debug geometry.
 * Shows both the thinned skeleton (cyan) and optional pre-thinning ridge (dim magenta).
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Maze } from '@/types/game';
import { computeMedialAxis, MedialAxisResult } from '@/game/MedialAxis';

interface MedialAxisVisualizationProps {
  maze: Maze;
  /** Whether to show the visualization */
  visible: boolean;
  /** Whether to also show the pre-thinning ridge (dimmer) */
  showRidge?: boolean;
  /** Height above ground to render points */
  height?: number;
  /** Size of skeleton point spheres */
  pointSize?: number;
}

/**
 * Renders the medial axis skeleton as small spheres in the 3D scene.
 * 
 * - Cyan spheres: Final skeleton (1-cell-wide centerline)
 * - Magenta spheres (if showRidge=true): Pre-thinning ridge points
 */
export function MedialAxisVisualization({
  maze,
  visible,
  showRidge = false,
  height = 0.15,
  pointSize = 0.08,
}: MedialAxisVisualizationProps) {
  // Compute medial axis once when maze changes
  const axisResult = useMemo<MedialAxisResult | null>(() => {
    if (!visible) return null;
    console.log('[MedialAxis] Computing skeleton...');
    const result = computeMedialAxis(maze, 2);
    console.log(`[MedialAxis] Found ${result.skeletonPoints.length} skeleton points, ${result.ridgePoints.length} ridge points`);
    return result;
  }, [maze, visible]);

  if (!visible || !axisResult) return null;

  return (
    <group name="medial-axis-debug">
      {/* Skeleton points - bright cyan spheres */}
      <SkeletonPoints
        points={axisResult.skeletonPoints}
        color="#00ffff"
        height={height}
        size={pointSize}
      />
      
      {/* Ridge points (pre-thinning) - dim magenta, slightly lower */}
      {showRidge && (
        <SkeletonPoints
          points={axisResult.ridgePoints}
          color="#ff00ff"
          opacity={0.3}
          height={height - 0.05}
          size={pointSize * 0.7}
        />
      )}
    </group>
  );
}

interface SkeletonPointsProps {
  points: Array<{ x: number; z: number }>;
  color: string;
  opacity?: number;
  height: number;
  size: number;
}

/**
 * Renders a set of points as instanced spheres for performance
 */
function SkeletonPoints({
  points,
  color,
  opacity = 1,
  height,
  size,
}: SkeletonPointsProps) {
  // Create geometry and material once
  const geometry = useMemo(() => new THREE.SphereGeometry(size, 6, 4), [size]);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
    [color, opacity]
  );

  // Create instance matrix for all points
  const instancedMesh = useMemo(() => {
    if (points.length === 0) return null;

    const mesh = new THREE.InstancedMesh(geometry, material, points.length);
    const matrix = new THREE.Matrix4();

    points.forEach((point, i) => {
      matrix.setPosition(point.x, height, point.z);
      mesh.setMatrixAt(i, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [points, geometry, material, height]);

  if (!instancedMesh) return null;

  return <primitive object={instancedMesh} />;
}
