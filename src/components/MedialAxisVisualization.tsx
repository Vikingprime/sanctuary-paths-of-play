/**
 * Medial Axis (Skeleton) Visualization Component
 * 
 * Renders the computed skeleton/spine of the maze as debug geometry.
 * Shows both the thinned skeleton (cyan) and optional pre-thinning ridge (dim magenta).
 * Can also show the overlay grid with walkable (green) vs blocked (red) subcells.
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
  /** Whether to show the overlay grid (walkable=green, blocked=red) */
  showOverlayGrid?: boolean;
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
  showOverlayGrid = false,
  height = 0.15,
  pointSize = 0.08,
}: MedialAxisVisualizationProps) {
  // Compute medial axis once when maze changes
  const axisResult = useMemo<MedialAxisResult | null>(() => {
    if (!visible) return null;
    console.log('[MedialAxis] Computing skeleton with scale=5...');
    const result = computeMedialAxis(maze, 5);
    console.log(`[MedialAxis] Found ${result.skeletonPoints.length} skeleton points, ${result.ridgePoints.length} ridge points`);
    console.log(`[MedialAxis] Fine grid: ${result.fineGrid.length} rows x ${result.fineGrid[0]?.length ?? 0} cols, fineCellSize=${result.fineCellSize.toFixed(4)}`);
    return result;
  }, [maze, visible]);

  if (!visible || !axisResult) return null;

  return (
    <group name="medial-axis-debug">
      {/* Overlay Grid - shows walkable (green) vs blocked (red) subcells */}
      {showOverlayGrid && (
        <OverlayGrid
          fineGrid={axisResult.fineGrid}
          fineCellSize={axisResult.fineCellSize}
          height={0.02}
        />
      )}
      
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

interface OverlayGridProps {
  fineGrid: Array<Array<{ walkable: boolean }>>;
  fineCellSize: number;
  height: number;
}

/**
 * Renders the overlay fine grid as colored planes
 * - Green (transparent): walkable subcells
 * - Red (transparent): blocked subcells
 */
function OverlayGrid({ fineGrid, fineCellSize, height }: OverlayGridProps) {
  const { walkableInstanced, blockedInstanced } = useMemo(() => {
    const walkablePositions: Array<{ x: number; z: number }> = [];
    const blockedPositions: Array<{ x: number; z: number }> = [];

    for (let fy = 0; fy < fineGrid.length; fy++) {
      const row = fineGrid[fy];
      for (let fx = 0; fx < row.length; fx++) {
        const cell = row[fx];
        // Convert fine cell to world space (center of fine cell)
        const worldX = (fx + 0.5) * fineCellSize;
        const worldZ = (fy + 0.5) * fineCellSize;

        if (cell.walkable) {
          walkablePositions.push({ x: worldX, z: worldZ });
        } else {
          blockedPositions.push({ x: worldX, z: worldZ });
        }
      }
    }

    // Create plane geometry slightly smaller than cell to show grid lines
    const padding = 0.01;
    const planeSize = fineCellSize - padding * 2;
    const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
    geometry.rotateX(-Math.PI / 2); // Flat on ground

    // Green for walkable
    const walkableMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Red for blocked
    const blockedMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Create instanced meshes
    const walkableMesh = walkablePositions.length > 0 
      ? new THREE.InstancedMesh(geometry.clone(), walkableMaterial, walkablePositions.length)
      : null;
    const blockedMesh = blockedPositions.length > 0
      ? new THREE.InstancedMesh(geometry.clone(), blockedMaterial, blockedPositions.length)
      : null;

    const matrix = new THREE.Matrix4();

    if (walkableMesh) {
      walkablePositions.forEach((pos, i) => {
        matrix.setPosition(pos.x, height, pos.z);
        walkableMesh.setMatrixAt(i, matrix);
      });
      walkableMesh.instanceMatrix.needsUpdate = true;
    }

    if (blockedMesh) {
      blockedPositions.forEach((pos, i) => {
        matrix.setPosition(pos.x, height, pos.z);
        blockedMesh.setMatrixAt(i, matrix);
      });
      blockedMesh.instanceMatrix.needsUpdate = true;
    }

    return { walkableInstanced: walkableMesh, blockedInstanced: blockedMesh };
  }, [fineGrid, fineCellSize, height]);

  return (
    <group name="overlay-grid">
      {walkableInstanced && <primitive object={walkableInstanced} />}
      {blockedInstanced && <primitive object={blockedInstanced} />}
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
