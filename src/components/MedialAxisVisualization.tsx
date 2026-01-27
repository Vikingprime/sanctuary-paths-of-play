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
 * - Magnetism Debug: Target point, vector arrow, junction suppression
 *
 * ============================================================================
 */

import { useMemo, MutableRefObject } from 'react';
import * as THREE from 'three';
import { Maze } from '@/types/game';
import { computeMedialAxis, MedialAxisResult, SpurConfig } from '@/game/MedialAxis';
import { MagnetismTurnResult } from '@/game/CorridorMagnetism';
import { PlayerState } from '@/game/GameLogic';

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
  /** Show pruned spur points (orange, for debugging) */
  showPrunedSpurs?: boolean;
  /** Height above ground to render skeleton points */
  height?: number;
  /** Size of skeleton point spheres */
  pointSize?: number;
  /** Custom spur config for tuning visualization */
  spurConfig?: SpurConfig | null;
  /** Callback to report default spur config (from scale constants) */
  onDefaultSpurConfig?: (config: SpurConfig) => void;
  /** Magnetism debug: show target point marker */
  showMagnetTarget?: boolean;
  /** Magnetism debug: show vector arrow from player to target */
  showMagnetVector?: boolean;
  /** Current magnetism result for debug visualization */
  magnetismDebugRef?: MutableRefObject<MagnetismTurnResult['debug'] | null>;
  /** Player state ref for debug visualization */
  playerStateRef?: MutableRefObject<PlayerState>;
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
 *   showRidge={false}
 * />
 * ```
 */
export function MedialAxisVisualization({
  maze,
  visible,
  showRidge = false,
  showHeatmap = false,
  showPrunedSpurs = false,
  height = 0.15,
  pointSize = 0.08,
  spurConfig,
  onDefaultSpurConfig,
  showMagnetTarget = false,
  showMagnetVector = false,
  magnetismDebugRef,
  playerStateRef,
}: MedialAxisVisualizationProps) {
  // Compute medial axis when maze changes, visibility toggles on, or spurConfig changes
  const axisResult = useMemo<MedialAxisResult | null>(() => {
    if (!visible) return null;
    console.log('[MedialAxis] Computing skeleton with scale=5, spurConfig=', spurConfig);
    const result = computeMedialAxis(maze, 5, spurConfig ?? undefined);
    console.log(`[MedialAxis] Found ${result.skeletonPoints.length} skeleton points, ${result.ridgePoints.length} ridge points, ${result.prunedSpurPoints.length} pruned, maxDist=${result.maxDistance}`);
    return result;
  }, [maze, visible, spurConfig]);
  
  // Report default spur config to parent on first computation
  useMemo(() => {
    if (axisResult && onDefaultSpurConfig) {
      onDefaultSpurConfig(axisResult.defaultSpurConfig);
    }
  }, [axisResult?.defaultSpurConfig.maxSpurLen, axisResult?.defaultSpurConfig.minSpurDistance, axisResult?.defaultSpurConfig.maxBranchLen, onDefaultSpurConfig]);

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
      
      
      
      {/* Final Skeleton Points - bright cyan spheres */}
      <SkeletonPoints
        points={axisResult.skeletonPoints}
        color="#00ffff"
        height={height}
        size={pointSize}
      />
      
      {/* Pruned Spur Points - orange, for debugging */}
      {showPrunedSpurs && axisResult.prunedSpurPoints.length > 0 && (
        <SkeletonPoints
          points={axisResult.prunedSpurPoints}
          color="#ff6600"
          opacity={0.7}
          height={height + 0.02}
          size={pointSize * 0.8}
        />
      )}
      
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
      
      {/* Magnetism Debug Visualization */}
      {(showMagnetTarget || showMagnetVector) && magnetismDebugRef && playerStateRef && (
        <MagnetismDebugOverlay
          magnetismDebugRef={magnetismDebugRef}
          playerStateRef={playerStateRef}
          showTarget={showMagnetTarget}
          showVector={showMagnetVector}
          height={height + 0.1}
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

// ============================================================================
// MAGNETISM DEBUG OVERLAY
// ============================================================================

interface MagnetismDebugOverlayProps {
  magnetismDebugRef: MutableRefObject<MagnetismTurnResult['debug'] | null>;
  playerStateRef: MutableRefObject<PlayerState>;
  showTarget: boolean;
  showVector: boolean;
  height: number;
}

/**
 * Renders magnetism debug visualization:
 * - Target point marker (green = active, red = junction suppressed, gray = inactive)
 * - Vector arrow from player to target
 * - Tangent direction indicator
 */
function MagnetismDebugOverlay({
  magnetismDebugRef,
  playerStateRef,
  showTarget,
  showVector,
  height,
}: MagnetismDebugOverlayProps) {
  // Create reusable geometries and materials
  const { targetGeometry, sensingGeometry, arrowGeometry, targetMaterials, arrowMaterial, tangentMaterial, backMaterial, frontMaterial } = useMemo(() => {
    return {
      targetGeometry: new THREE.SphereGeometry(0.15, 12, 8), // Larger, more visible
      sensingGeometry: new THREE.SphereGeometry(0.08, 8, 6), // Back/front sensing points
      arrowGeometry: new THREE.CylinderGeometry(0.02, 0.04, 1, 6),
      targetMaterials: {
        active: new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.9 }),
        suppressed: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 }),
        inactive: new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 }),
      },
      arrowMaterial: new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.7 }),
      tangentMaterial: new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 }),
      backMaterial: new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8 }), // Orange for back
      frontMaterial: new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 }), // Yellow for front
    };
  }, []);

  // Get current debug state (this updates each frame via ref)
  const debug = magnetismDebugRef.current;
  const player = playerStateRef.current;
  
  if (!debug) return null;
  
  // Determine target marker color
  const targetMaterial = debug.isJunctionSuppressed 
    ? targetMaterials.suppressed 
    : debug.isActive 
      ? targetMaterials.active 
      : targetMaterials.inactive;
  
  // Calculate vector from back sensing point to spine point
  const dx = debug.spineX - debug.backX;
  const dz = debug.spineZ - debug.backZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  
  return (
    <group name="magnetism-debug">
      {/* Back Sensing Point (orange) */}
      {showTarget && (
        <mesh
          geometry={sensingGeometry}
          material={backMaterial}
          position={[debug.backX, height + 0.02, debug.backZ]}
        />
      )}
      
      {/* Front Sensing Point (yellow) */}
      {showTarget && (
        <mesh
          geometry={sensingGeometry}
          material={frontMaterial}
          position={[debug.frontX, height + 0.02, debug.frontZ]}
        />
      )}
      
      {/* Nearest Spine Point Marker (green/red/gray based on state) */}
      {showTarget && (
        <mesh
          geometry={targetGeometry}
          material={targetMaterial}
          position={[debug.spineX, height, debug.spineZ]}
        />
      )}
      
      {/* Vector Arrow from back sensing point to nearest spine point */}
      {showVector && dist > 0.05 && (
        <group position={[debug.backX, height, debug.backZ]}>
          <mesh
            geometry={arrowGeometry}
            material={arrowMaterial}
            position={[(debug.spineX - debug.backX) / 2, 0, (debug.spineZ - debug.backZ) / 2]}
            rotation={[0, 0, Math.PI / 2]}
            scale={[1, dist, 1]}
          >
            <group rotation={[0, -angle, 0]} />
          </mesh>
        </group>
      )}
      
      {/* Tangent Direction Indicator (at spine point) */}
      {showTarget && debug.isActive && (
        <group position={[debug.spineX, height + 0.08, debug.spineZ]}>
          <mesh
            geometry={arrowGeometry}
            material={tangentMaterial}
            rotation={[Math.PI / 2, 0, Math.atan2(debug.tangentX, debug.tangentZ)]}
            scale={[0.6, 0.5, 0.6]}
          />
        </group>
      )}
    </group>
  );
}
