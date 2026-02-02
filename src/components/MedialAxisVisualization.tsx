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
import { Line } from '@react-three/drei';
import { Maze } from '@/types/game';
import { computeMedialAxis, MedialAxisResult, SpurConfig } from '@/game/MedialAxis';
import { MagnetismTurnResult } from '@/game/CorridorMagnetism';
import { buildSmoothedPolylines, buildRawPolylines, buildSmoothedControlPoints, PolylineGraph, Point2D, DistanceField, ClearancePoint, ClearanceState } from '@/game/SkeletonPolyline';
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
  /** Show smoothed polylines instead of pixel dots */
  showPolylines?: boolean;
  /** Show raw (unsmoothed) polylines for comparison */
  showRawPolylines?: boolean;
  /** Show smoothed control points (before Catmull-Rom resampling) */
  showControlPoints?: boolean;
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
  showPolylines = true,
  showRawPolylines = false,
  showControlPoints = false,
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
    console.log('[MedialAxis] Computing skeleton with scale=20, spurConfig=', spurConfig);
    const result = computeMedialAxis(maze, 20, spurConfig ?? undefined);
    console.log(`[MedialAxis] Found ${result.skeletonPoints.length} skeleton points, ${result.ridgePoints.length} ridge points, ${result.prunedSpurPoints.length} pruned, maxDist=${result.maxDistance}`);
    return result;
  }, [maze, visible, spurConfig]);
  
  // Build distance field for wall clearance enforcement
  const distanceField = useMemo<DistanceField | null>(() => {
    if (!visible || !axisResult) return null;
    return {
      fineGrid: axisResult.fineGrid,
      fineWidth: maze.grid[0]?.length * axisResult.scale || 0,
      fineHeight: maze.grid.length * axisResult.scale,
      fineCellSize: axisResult.fineCellSize,
    };
  }, [axisResult, maze, visible]);
  
  // Build smoothed polylines from skeleton (final resampled version with clearance)
  const polylineGraph = useMemo<PolylineGraph | null>(() => {
    if (!visible || !axisResult || !distanceField) return null;
    const fineWidth = maze.grid[0]?.length * axisResult.scale || 0;
    const fineHeight = maze.grid.length * axisResult.scale;
    return buildSmoothedPolylines(
      axisResult.fineGrid,
      fineWidth,
      fineHeight,
      axisResult.fineCellSize,
      undefined,
      distanceField
    );
  }, [axisResult, distanceField, maze, visible]);
  
  // Build raw polylines for debug comparison (original pixel-based)
  const rawPolylineGraph = useMemo<PolylineGraph | null>(() => {
    if (!visible || !axisResult || !showRawPolylines) return null;
    const fineWidth = maze.grid[0]?.length * axisResult.scale || 0;
    const fineHeight = maze.grid.length * axisResult.scale;
    return buildRawPolylines(
      axisResult.fineGrid,
      fineWidth,
      fineHeight,
      axisResult.fineCellSize
    );
  }, [axisResult, maze, visible, showRawPolylines]);
  
  // Build control points (after Chaikin, before Catmull-Rom resampling)
  const controlPointsGraph = useMemo<PolylineGraph | null>(() => {
    if (!visible || !axisResult || !showControlPoints) return null;
    const fineWidth = maze.grid[0]?.length * axisResult.scale || 0;
    const fineHeight = maze.grid.length * axisResult.scale;
    return buildSmoothedControlPoints(
      axisResult.fineGrid,
      fineWidth,
      fineHeight,
      axisResult.fineCellSize
    );
  }, [axisResult, maze, visible, showControlPoints]);
  
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
      
      {/* Smoothed Polylines - lime green line strips (final resampled) */}
      {showPolylines && polylineGraph && (
        <PolylineVisualization
          graph={polylineGraph}
          color="#00ff44"
          height={height + 0.05}
          lineWidth={3}
        />
      )}
      
      {/* Raw Polylines - red, for debug comparison (original pixel-based) */}
      {showRawPolylines && rawPolylineGraph && (
        <PolylineVisualization
          graph={rawPolylineGraph}
          color="#ff4444"
          height={height + 0.03}
          lineWidth={2}
          showJunctions={false}
          showEndpoints={false}
        />
      )}
      
      {/* Control Points - cyan dots (after Chaikin, before Catmull-Rom) */}
      {showControlPoints && controlPointsGraph && (
        <ControlPointsVisualization
          graph={controlPointsGraph}
          color="#00ffff"
          height={height + 0.07}
          size={0.06}
        />
      )}
      
      {/* Final Skeleton Points (pixel dots) - bright cyan spheres */}
      {!showPolylines && (
        <SkeletonPoints
          points={axisResult.skeletonPoints}
          color="#00ffff"
          height={height}
          size={pointSize}
        />
      )}
      
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
// POLYLINE VISUALIZATION (Smoothed line strips with clearance coloring)
// ============================================================================

interface PolylineVisualizationProps {
  graph: PolylineGraph;
  color: string;
  height: number;
  lineWidth?: number;
  showJunctions?: boolean;
  showEndpoints?: boolean;
  /** Enable clearance-based coloring: red=violation, yellow=marginal, green=safe */
  showClearanceColors?: boolean;
}

/** Get color for clearance state */
function getClearanceColor(state: ClearanceState | undefined): string {
  switch (state) {
    case 'violation': return '#ff0000'; // Red
    case 'marginal': return '#ffff00';  // Yellow
    case 'safe': return '#00ff44';      // Green
    default: return '#00ff44';          // Default green
  }
}

/**
 * Renders the smoothed polyline graph as line strips.
 * Each segment is drawn as a continuous line with junction/endpoint markers.
 * When showClearanceColors is enabled, segments are colored based on clearance state.
 */
function PolylineVisualization({
  graph,
  color,
  height,
  lineWidth = 2,
  showJunctions = true,
  showEndpoints = true,
  showClearanceColors = true,
}: PolylineVisualizationProps) {
  // Build line segments - with or without clearance coloring
  const segmentData = useMemo(() => {
    if (!showClearanceColors) {
      // Simple mode: single color per segment
      return graph.segments.map((segment, idx) => ({
        key: `segment-${idx}`,
        lines: [{
          points: segment.points.map((p): [number, number, number] => [p.x, height, p.z]),
          color: color,
        }],
      }));
    }
    
    // Clearance coloring mode: split segment by clearance state
    return graph.segments.map((segment, segIdx) => {
      const lines: Array<{ points: [number, number, number][]; color: string }> = [];
      
      if (segment.points.length < 2) {
        return { key: `segment-${segIdx}`, lines };
      }
      
      // Group consecutive points by clearance state
      let currentLine: [number, number, number][] = [];
      let currentColor = getClearanceColor((segment.points[0] as ClearancePoint).clearanceState);
      
      for (let i = 0; i < segment.points.length; i++) {
        const p = segment.points[i] as ClearancePoint;
        const pointColor = getClearanceColor(p.clearanceState);
        const point3D: [number, number, number] = [p.x, height, p.z];
        
        if (pointColor !== currentColor && currentLine.length > 0) {
          // Color changed - finish current line and start new one
          // Include the current point in both lines for continuity
          currentLine.push(point3D);
          lines.push({ points: [...currentLine], color: currentColor });
          currentLine = [point3D];
          currentColor = pointColor;
        } else {
          currentLine.push(point3D);
        }
      }
      
      // Push final line segment
      if (currentLine.length >= 2) {
        lines.push({ points: currentLine, color: currentColor });
      }
      
      return { key: `segment-${segIdx}`, lines };
    });
  }, [graph.segments, height, color, showClearanceColors]);

  return (
    <group name="polyline-visualization">
      {/* Render each segment's lines */}
      {segmentData.map((segment) => (
        <group key={segment.key}>
          {segment.lines.map((line, lineIdx) => (
            <Line
              key={`${segment.key}-line-${lineIdx}`}
              points={line.points}
              color={line.color}
              lineWidth={lineWidth}
            />
          ))}
        </group>
      ))}
      
      {/* Junction markers - yellow spheres */}
      {showJunctions && graph.junctions.length > 0 && (
        <SkeletonPoints
          points={graph.junctions}
          color="#ffff00"
          height={height + 0.02}
          size={0.12}
        />
      )}
      
      {/* Endpoint markers - magenta spheres */}
      {showEndpoints && graph.endpoints.length > 0 && (
        <SkeletonPoints
          points={graph.endpoints}
          color="#ff00ff"
          height={height + 0.02}
          size={0.1}
        />
      )}
    </group>
  );
}

// ============================================================================
// CONTROL POINTS VISUALIZATION (Dots for Chaikin output)
// ============================================================================

interface ControlPointsVisualizationProps {
  graph: PolylineGraph;
  color: string;
  height: number;
  size?: number;
}

/**
 * Renders the control points (after Chaikin smoothing, before Catmull-Rom) as dots.
 */
function ControlPointsVisualization({
  graph,
  color,
  height,
  size = 0.06,
}: ControlPointsVisualizationProps) {
  // Flatten all segment points into a single array
  const allPoints = useMemo(() => {
    const points: Point2D[] = [];
    graph.segments.forEach(segment => {
      segment.points.forEach(p => points.push(p));
    });
    return points;
  }, [graph.segments]);

  return (
    <SkeletonPoints
      points={allPoints}
      color={color}
      height={height}
      size={size}
    />
  );
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
  const { targetGeometry, sensingGeometry, arrowGeometry, targetMaterials, arrowMaterial, tangentLineMaterial, backMaterial, frontMaterial } = useMemo(() => {
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
      tangentLineMaterial: new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 3, transparent: true, opacity: 0.9 }),
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
      
      {/* Tangent Line: Draw actual line from neighbor1 to neighbor2 through spine point */}
      {showTarget && (
        <group>
          {/* Line connecting the two neighbors (this IS the tangent) */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([
                  debug.neighbor1X, height + 0.15, debug.neighbor1Z,  // Neighbor 1
                  debug.neighbor2X, height + 0.15, debug.neighbor2Z,  // Neighbor 2
                ])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={0x00ffff} linewidth={3} />
          </line>
          {/* Small spheres at neighbor positions */}
          <mesh position={[debug.neighbor1X, height + 0.15, debug.neighbor1Z]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshBasicMaterial color={0xff00ff} />
          </mesh>
          <mesh position={[debug.neighbor2X, height + 0.15, debug.neighbor2Z]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshBasicMaterial color={0xff00ff} />
          </mesh>
        </group>
      )}
    </group>
  );
}
