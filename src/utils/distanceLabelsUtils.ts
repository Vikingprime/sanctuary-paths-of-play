/**
 * ============================================================================
 * DISTANCE LABELS UTILITIES (UNUSED - REFACTORED FOR FUTURE USE)
 * ============================================================================
 * 
 * This module contains logic for rendering distance-to-wall values as 3D text
 * labels. Currently not used in the application but preserved for potential
 * future debugging needs.
 * 
 * ============================================================================
 */

import { MutableRefObject } from 'react';

// Types for distance label data
export interface DistanceLabelData {
  x: number;
  z: number;
  distance: number;
}

export interface FineGridCell {
  walkable: boolean;
  distance: number;
}

/**
 * Generate sampled distance label positions from a fine grid.
 * Samples every Nth cell to reduce the number of labels for performance.
 * 
 * @param fineGrid - The fine grid with walkable/distance data
 * @param fineCellSize - Size of each cell in world units
 * @param sampleRate - Sample every Nth cell (default 5)
 * @returns Array of label data with world positions and distance values
 */
export function generateSampledDistanceLabels(
  fineGrid: FineGridCell[][],
  fineCellSize: number,
  sampleRate: number = 5
): DistanceLabelData[] {
  const data: DistanceLabelData[] = [];
  
  for (let fy = 0; fy < fineGrid.length; fy += sampleRate) {
    const row = fineGrid[fy];
    for (let fx = 0; fx < row.length; fx += sampleRate) {
      const cell = row[fx];
      if (cell.walkable && cell.distance > 0) {
        const worldX = (fx + 0.5) * fineCellSize;
        const worldZ = (fy + 0.5) * fineCellSize;
        data.push({ x: worldX, z: worldZ, distance: cell.distance });
      }
    }
  }
  
  return data;
}

/**
 * Generate all distance label positions from a fine grid.
 * Used for proximity-based filtering where all positions are needed.
 * 
 * @param fineGrid - The fine grid with walkable/distance data
 * @param fineCellSize - Size of each cell in world units
 * @returns Array of label data with world positions and distance values
 */
export function generateAllDistanceLabels(
  fineGrid: FineGridCell[][],
  fineCellSize: number
): DistanceLabelData[] {
  const data: DistanceLabelData[] = [];
  
  for (let fy = 0; fy < fineGrid.length; fy++) {
    const row = fineGrid[fy];
    for (let fx = 0; fx < row.length; fx++) {
      const cell = row[fx];
      if (cell.walkable && cell.distance > 0) {
        const worldX = (fx + 0.5) * fineCellSize;
        const worldZ = (fy + 0.5) * fineCellSize;
        data.push({ x: worldX, z: worldZ, distance: cell.distance });
      }
    }
  }
  
  return data;
}

/**
 * Filter distance labels to only those within a radius of a position.
 * 
 * @param allLabels - All label data to filter
 * @param playerX - Player X position
 * @param playerZ - Player Z position  
 * @param radius - Radius around player to include labels
 * @returns Filtered array of labels within radius
 */
export function filterLabelsByProximity(
  allLabels: DistanceLabelData[],
  playerX: number,
  playerZ: number,
  radius: number
): DistanceLabelData[] {
  const radiusSq = radius * radius;
  return allLabels.filter(label => {
    const dx = label.x - playerX;
    const dz = label.z - playerZ;
    return dx * dx + dz * dz <= radiusSq;
  });
}

/**
 * Calculate appropriate font size for distance labels based on cell size.
 * 
 * @param fineCellSize - Size of each fine grid cell
 * @param scale - Scaling factor (default 0.6 for proximity labels, 0.5 for sampled)
 * @returns Font size in world units
 */
export function calculateLabelFontSize(
  fineCellSize: number,
  scale: number = 0.6
): number {
  return fineCellSize * scale;
}
