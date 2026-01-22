/**
 * ============================================================================
 * MEDIAL AXIS (SKELETON) VISUALIZATION COMPONENT
 * ============================================================================
 * 
 * Renders the computed skeleton/spine of the maze as debug geometry.
 * 
 * Visualization Layers (all toggleable):
 * - Skeleton: Bright cyan spheres (final 1-pixel-wide centerline)
 * - Ridge: Dim magenta spheres (pre-thinning ridge candidates)
 * - Heatmap: Color-coded overlay showing distance to walls
 * - Distance Numbers: Text labels showing distance values
 * 
 * ============================================================================
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { Maze } from '@/types/game';
import { computeMedialAxis, MedialAxisResult } from '@/game/MedialAxis';

// ============================================================================
// TYPES
// ============================================================================

interface MedialAxisVisualizationProps {
  maze: Maze;
  /** Master visibility toggle */
  visible: boolean;
  /** Show pre-thinning ridge candidates (dim magenta) */
  showRidge?: boolean;
  /** Show distance heatmap overlay (green gradient) */
  showHeatmap?: boolean;
  /** Show distance numbers on each subcell */
  showDistanceNumbers?: boolean;
  /** Height above ground to render skeleton points */
  height?: number;
  /** Size of skeleton point spheres */
  pointSize?: number;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Renders the medial axis skeleton and debug overlays in the 3D scene.
 * 
 * Usage:
 * ```tsx
 * <MedialAxisVisualization
 *   maze={maze}
 *   visible={debugMode}
 *   showHeatmap={true}
 *   showDistanceNumbers={true}
 *   showRidge={false}
 * />
 * ```
 */
export function MedialAxisVisualization({
  maze,
  visible,
  showRidge = false,
  showHeatmap = false,
  showDistanceNumbers = false,
  height = 0.15,
  pointSize = 0.08,
}: MedialAxisVisualizationProps) {
  // Compute medial axis once when maze changes or visibility toggles on
  const axisResult = useMemo<MedialAxisResult | null>(() => {
    if (!visible) return null;
    console.log('[MedialAxis] Computing skeleton with scale=5...');
    const result = computeMedialAxis(maze, 5);
    console.log(`[MedialAxis] Found ${result.skeletonPoints.length} skeleton points, ${result.ridgePoints.length} ridge points, maxDist=${result.maxDistance}`);
    return result;
  }, [maze, visible]);

  if (!visible || !axisResult) return null;

  return (
    <group name="medial-axis-debug">
      {/* Distance Heatmap Overlay - color-coded by distance */}
      {showHeatmap && (
        <HeatmapOverlay
          fineGrid={axisResult.fineGrid}
          fineCellSize={axisResult.fineCellSize}
          maxDistance={axisResult.maxDistance}
          height={0.02}
        />
      )}
      
      {/* Distance Number Labels */}
      {showDistanceNumbers && (
        <DistanceLabels
          fineGrid={axisResult.fineGrid}
          fineCellSize={axisResult.fineCellSize}
          height={0.05}
        />
      )}
      
      {/* Final Skeleton Points - bright cyan spheres */}
      <SkeletonPoints
        points={axisResult.skeletonPoints}
        color="#00ffff"
        height={height}
        size={pointSize}
      />
      
      {/* Ridge Candidates (pre-thinning) - dim magenta, slightly lower */}
      {showRidge && (
        <SkeletonPoints
          points={axisResult.ridgePoints}
          color="#ff00ff"
          opacity={0.4}
          height={height - 0.03}
          size={pointSize * 0.6}
        />
      )}
    </group>
  );
}

// ============================================================================
// HEATMAP OVERLAY (Distance-based color gradient)
// ============================================================================

interface HeatmapOverlayProps {
  fineGrid: Array<Array<{ walkable: boolean; distance: number }>>;
  fineCellSize: number;
  maxDistance: number;
  height: number;
}

/**
 * Renders the fine grid as color-coded planes showing distance to walls.
 * 
 * Color scheme:
 * - Blocked cells: Red (semi-transparent)
 * - Walkable cells: Green gradient (dark = near walls, bright = far from walls)
 */
function HeatmapOverlay({ fineGrid, fineCellSize, maxDistance, height }: HeatmapOverlayProps) {
  const { walkableInstanced, blockedInstanced } = useMemo(() => {
    const walkableData: Array<{ x: number; z: number; color: THREE.Color }> = [];
    const blockedPositions: Array<{ x: number; z: number }> = [];

    for (let fy = 0; fy < fineGrid.length; fy++) {
      const row = fineGrid[fy];
      for (let fx = 0; fx < row.length; fx++) {
        const cell = row[fx];
        const worldX = (fx + 0.5) * fineCellSize;
        const worldZ = (fy + 0.5) * fineCellSize;

        if (cell.walkable) {
          // Compute heatmap color based on normalized distance
          // Distance 1 = dark green, Distance max = bright green
          const normalizedDist = maxDistance > 0 ? cell.distance / maxDistance : 0;
          
          // HSL: Hue=120 (green), Saturation=0.8, Lightness=0.15 to 0.55
          const lightness = 0.15 + normalizedDist * 0.4;
          const color = new THREE.Color().setHSL(0.33, 0.8, lightness);
          
          walkableData.push({ x: worldX, z: worldZ, color });
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

    // Blocked cells - red
    const blockedMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Create instanced mesh for walkable cells with per-instance colors
    let walkableMesh: THREE.InstancedMesh | null = null;
    if (walkableData.length > 0) {
      const walkableMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        vertexColors: false,
      });
      
      walkableMesh = new THREE.InstancedMesh(geometry.clone(), walkableMaterial, walkableData.length);
      
      // Enable instance colors
      const colors = new Float32Array(walkableData.length * 3);
      const matrix = new THREE.Matrix4();
      
      walkableData.forEach((data, i) => {
        matrix.setPosition(data.x, height, data.z);
        walkableMesh!.setMatrixAt(i, matrix);
        
        colors[i * 3] = data.color.r;
        colors[i * 3 + 1] = data.color.g;
        colors[i * 3 + 2] = data.color.b;
      });
      
      walkableMesh.instanceMatrix.needsUpdate = true;
      
      // Add instance color attribute
      walkableMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      walkableMesh.instanceColor.needsUpdate = true;
    }

    // Create instanced mesh for blocked cells
    let blockedMesh: THREE.InstancedMesh | null = null;
    if (blockedPositions.length > 0) {
      blockedMesh = new THREE.InstancedMesh(geometry.clone(), blockedMaterial, blockedPositions.length);
      const matrix = new THREE.Matrix4();
      
      blockedPositions.forEach((pos, i) => {
        matrix.setPosition(pos.x, height, pos.z);
        blockedMesh!.setMatrixAt(i, matrix);
      });
      blockedMesh.instanceMatrix.needsUpdate = true;
    }

    return { walkableInstanced: walkableMesh, blockedInstanced: blockedMesh };
  }, [fineGrid, fineCellSize, maxDistance, height]);

  return (
    <group name="heatmap-overlay">
      {walkableInstanced && <primitive object={walkableInstanced} />}
      {blockedInstanced && <primitive object={blockedInstanced} />}
    </group>
  );
}

// ============================================================================
// DISTANCE LABELS (Text showing distance values)
// ============================================================================

interface DistanceLabelsProps {
  fineGrid: Array<Array<{ walkable: boolean; distance: number }>>;
  fineCellSize: number;
  height: number;
}

/**
 * Renders distance values as 3D text labels on each walkable subcell.
 * Only renders walkable cells with distance > 0.
 */
function DistanceLabels({ fineGrid, fineCellSize, height }: DistanceLabelsProps) {
  // Sample every SCALE cells to reduce Text count from ~2800 to ~112
  const SAMPLE_RATE = 5;
  
  const labelData = useMemo(() => {
    const data: Array<{ x: number; z: number; distance: number }> = [];
    
    for (let fy = 0; fy < fineGrid.length; fy += SAMPLE_RATE) {
      const row = fineGrid[fy];
      for (let fx = 0; fx < row.length; fx += SAMPLE_RATE) {
        const cell = row[fx];
        if (cell.walkable && cell.distance > 0) {
          const worldX = (fx + 0.5) * fineCellSize;
          const worldZ = (fy + 0.5) * fineCellSize;
          data.push({ x: worldX, z: worldZ, distance: cell.distance });
        }
      }
    }
    
    return data;
  }, [fineGrid, fineCellSize]);

  // Calculate appropriate font size based on cell size
  const fontSize = fineCellSize * 0.5;

  return (
    <group name="distance-labels">
      {labelData.map((item, i) => (
        <Text
          key={`${i}-${item.x}-${item.z}`}
          position={[item.x, height, item.z]}
          fontSize={fontSize}
          color="white"
          anchorX="center"
          anchorY="middle"
          rotation={[-Math.PI / 2, 0, 0]} // Face up
          outlineWidth={0.01}
          outlineColor="black"
        >
          {item.distance}
        </Text>
      ))}
    </group>
  );
}

// ============================================================================
// SKELETON POINTS (Instanced spheres)
// ============================================================================

interface SkeletonPointsProps {
  points: Array<{ x: number; z: number }>;
  color: string;
  opacity?: number;
  height: number;
  size: number;
}

/**
 * Renders a set of points as instanced spheres for performance.
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
