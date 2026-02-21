import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { StoryProgress } from '@/types/quest';
import { StoryAct, StoryNode } from '@/types/storyActs';
import { storyActs, isNodeUnlocked, isActComplete, getStoryAct } from '@/data/storyActsData';
import { StoryMaze, getChapterMaze } from '@/data/storyMazes';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, Check, ChevronRight, Clock, Play, Edit } from 'lucide-react';

interface StoryLevelSelectProps {
  onSelect: (storyMaze: StoryMaze) => void;
  onBack: () => void;
  storyProgress: StoryProgress;
  debugMode?: boolean;
}

// Layout constants
const NODE_W = 160;
const NODE_H = 72;
const LAYER_GAP_Y = 100;
const SIBLING_GAP_X = 180;
const PADDING_X = 40;
const PADDING_TOP = 20;

interface LayoutNode {
  node: StoryNode;
  x: number;
  y: number;
  depth: number;
}

interface Edge {
  from: LayoutNode;
  to: LayoutNode;
}

function layoutAct(act: StoryAct): { nodes: LayoutNode[]; edges: Edge[]; width: number; height: number } {
  const nodeMap = new Map<string, StoryNode>();
  act.nodes.forEach(n => nodeMap.set(n.id, n));

  // Build parent map
  const parentMap = new Map<string, string[]>();
  act.nodes.forEach(n => {
    (n.unlocks || []).forEach(childId => {
      const parents = parentMap.get(childId) || [];
      parents.push(n.id);
      parentMap.set(childId, parents);
    });
  });

  // BFS depth (max depth from all parents)
  const depthMap = new Map<string, number>();
  const queue: string[] = [act.startNodeId];
  depthMap.set(act.startNodeId, 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (!node) continue;
    const d = depthMap.get(id)!;
    (node.unlocks || []).forEach(childId => {
      const existing = depthMap.get(childId);
      if (existing === undefined || d + 1 > existing) {
        depthMap.set(childId, d + 1);
      }
      if (!queue.includes(childId)) queue.push(childId);
    });
  }

  const maxDepth = Math.max(...Array.from(depthMap.values()), 0);
  const layers: StoryNode[][] = [];
  for (let d = 0; d <= maxDepth; d++) {
    layers.push(act.nodes.filter(n => depthMap.get(n.id) === d));
  }

  // Determine total width from widest layer
  let totalWidth = 0;
  layers.forEach(l => { totalWidth = Math.max(totalWidth, l.length * SIBLING_GAP_X); });
  totalWidth = Math.max(totalWidth, SIBLING_GAP_X) + PADDING_X * 2;

  const posMap = new Map<string, { x: number; y: number }>();

  // Top-down layout: position each layer
  layers.forEach((layerNodes, depth) => {
    if (depth === 0) {
      // Root node centered
      layerNodes.forEach((node, i) => {
        const count = layerNodes.length;
        posMap.set(node.id, {
          x: totalWidth / 2 + (i - (count - 1) / 2) * SIBLING_GAP_X,
          y: PADDING_TOP + depth * LAYER_GAP_Y + NODE_H / 2,
        });
      });
      return;
    }

    // For each node, compute ideal x = average of parent x positions
    const idealXs: { node: StoryNode; idealX: number }[] = layerNodes.map(node => {
      const parents = parentMap.get(node.id) || [];
      if (parents.length > 0) {
        const parentXs = parents.map(pid => posMap.get(pid)?.x ?? totalWidth / 2);
        return { node, idealX: parentXs.reduce((a, b) => a + b, 0) / parentXs.length };
      }
      return { node, idealX: totalWidth / 2 };
    });

    // Sort by ideal x so left-to-right order matches parent positions
    idealXs.sort((a, b) => a.idealX - b.idealX);

    // Place nodes at their ideal positions, then resolve overlaps
    idealXs.forEach(({ node, idealX }) => {
      posMap.set(node.id, {
        x: idealX,
        y: PADDING_TOP + depth * LAYER_GAP_Y + NODE_H / 2,
      });
    });

    // Resolve overlaps (preserve order)
    const sorted = idealXs.map(ix => ix.node);
    for (let i = 1; i < sorted.length; i++) {
      const prev = posMap.get(sorted[i - 1].id)!;
      const curr = posMap.get(sorted[i].id)!;
      if (curr.x - prev.x < SIBLING_GAP_X) {
        curr.x = prev.x + SIBLING_GAP_X;
      }
    }

    // Center the group around the ideal center of all parents in this layer
    if (sorted.length > 1) {
      const minX = posMap.get(sorted[0].id)!.x;
      const maxX = posMap.get(sorted[sorted.length - 1].id)!.x;
      const currentCenter = (minX + maxX) / 2;
      // Use original ideal center (average of all ideal positions)
      const idealCenter = idealXs.reduce((s, ix) => s + ix.idealX, 0) / idealXs.length;
      const offset = idealCenter - currentCenter;
      sorted.forEach(n => { posMap.get(n.id)!.x += offset; });
    }
  });

  // Ensure all nodes fit within bounds
  const allXs = Array.from(posMap.values()).map(p => p.x);
  const minNodeX = Math.min(...allXs) - NODE_W / 2;
  if (minNodeX < PADDING_X) {
    const shift = PADDING_X - minNodeX;
    posMap.forEach(p => { p.x += shift; });
  }
  const allXs2 = Array.from(posMap.values()).map(p => p.x);
  const maxNodeX = Math.max(...allXs2) + NODE_W / 2 + PADDING_X;
  const finalWidth = Math.max(maxNodeX, totalWidth);

  const layoutNodes = new Map<string, LayoutNode>();
  posMap.forEach((pos, id) => {
    const node = nodeMap.get(id)!;
    layoutNodes.set(id, { node, x: pos.x, y: pos.y, depth: depthMap.get(id)! });
  });

  // Build edges
  const edges: Edge[] = [];
  act.nodes.forEach(n => {
    const from = layoutNodes.get(n.id);
    if (!from) return;
    (n.unlocks || []).forEach(childId => {
      const to = layoutNodes.get(childId);
      if (to) edges.push({ from, to });
    });
  });

  const height = PADDING_TOP + (maxDepth + 1) * LAYER_GAP_Y + 20;

  return {
    nodes: Array.from(layoutNodes.values()),
    edges,
    width: finalWidth,
    height,
  };
}

function edgePath(from: LayoutNode, to: LayoutNode, allNodes: LayoutNode[]): string {
  const x1 = from.x;
  const y1 = from.y + NODE_H / 2 + 2;
  const x2 = to.x;
  const y2 = to.y - NODE_H / 2 - 2;
  const depthSpan = to.depth - from.depth;

  if (depthSpan > 1) {
    // Edge skips layers - route around intermediate nodes
    const midNodes = allNodes.filter(n => n.depth > from.depth && n.depth < to.depth);
    if (midNodes.length > 0) {
      const midXs = midNodes.map(n => n.x);
      const midMinX = Math.min(...midXs) - NODE_W / 2 - 30;
      const midMaxX = Math.max(...midXs) + NODE_W / 2 + 30;

      // Route on whichever side is closer to the from node
      const routeRight = x1 >= (midMinX + midMaxX) / 2;
      const sideX = routeRight ? midMaxX : midMinX;

      // Straight line down, jog out, straight down, jog back in
      const midY1 = y1 + 15;
      const midY2 = y2 - 15;
      return `M ${x1} ${y1} L ${x1} ${midY1} Q ${x1} ${midY1 + 15}, ${sideX} ${midY1 + 15} L ${sideX} ${midY2 - 15} Q ${sideX} ${midY2}, ${x2} ${midY2} L ${x2} ${y2}`;
    }
  }

  // Direct parent-child: straight line if aligned, gentle curve otherwise
  if (Math.abs(x1 - x2) < 5) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const cy = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
}

export const StoryLevelSelect = ({
  onSelect,
  onBack,
  storyProgress,
  debugMode = false,
}: StoryLevelSelectProps) => {
  const navigate = useNavigate();
  const [expandedAct, setExpandedAct] = useState<string | null>(() => {
    const firstIncomplete = storyActs.find(a => !isActComplete(a, storyProgress.completedQuests));
    return firstIncomplete?.id ?? storyActs[0]?.id ?? null;
  });

  const completedNodes = storyProgress.completedQuests;

  const isActUnlocked = (act: StoryAct): boolean => {
    if (!act.unlockCondition) return true;
    const requiredAct = getStoryAct(act.unlockCondition.actId);
    if (!requiredAct) return false;
    return isActComplete(requiredAct, completedNodes);
  };

  const handleNodeClick = (node: StoryNode) => {
    if (!node.implemented || !node.mazeId) return;
    const maze = getChapterMaze(
      node.id === 'find_clues' ? 'chapter_1' :
      node.id === 'cousin_riddle' ? 'chapter_2' : ''
    );
    if (maze) onSelect(maze);
  };

  const renderGraph = (act: StoryAct) => {
    const layout = layoutAct(act);

    return (
      <div className="overflow-x-auto overflow-y-hidden -mx-4 px-4">
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="mx-auto block"
          style={{ minWidth: Math.min(layout.width, 300) }}
        >
          {/* Edges */}
          {layout.edges.map((edge, i) => {
            const fromDone = completedNodes.includes(edge.from.node.id);
            const toDone = completedNodes.includes(edge.to.node.id);
            const toUnlocked = isNodeUnlocked(edge.to.node, completedNodes);
            return (
              <path
                key={i}
                d={edgePath(edge.from, edge.to, layout.nodes)}
                fill="none"
                stroke={
                  toDone
                    ? 'hsl(var(--primary))' 
                    : fromDone && toUnlocked
                      ? 'hsl(var(--primary) / 0.5)'
                      : 'hsl(var(--muted-foreground) / 0.2)'
                }
                strokeWidth={toDone ? 3 : 2}
                strokeDasharray={!fromDone && !toDone ? '6 4' : undefined}
                className="transition-all duration-500"
              />
            );
          })}

          {/* Nodes */}
          {layout.nodes.map(ln => {
            const { node, x, y } = ln;
            const isDone = completedNodes.includes(node.id);
            const isUnlocked = isNodeUnlocked(node, completedNodes);
            const canPlay = isUnlocked && node.implemented && !!node.mazeId;
            const nx = x - NODE_W / 2;
            const ny = y - NODE_H / 2;

            return (
              <g
                key={node.id}
                onClick={() => canPlay && handleNodeClick(node)}
                className={canPlay ? 'cursor-pointer' : !isUnlocked ? 'opacity-40' : ''}
                role="button"
                tabIndex={canPlay ? 0 : -1}
              >
                {/* Card background */}
                <rect
                  x={nx}
                  y={ny}
                  width={NODE_W}
                  height={NODE_H}
                  rx={12}
                  fill={
                    isDone
                      ? 'hsl(142 71% 45% / 0.12)'
                      : isUnlocked
                        ? 'hsl(var(--card))'
                        : 'hsl(var(--muted) / 0.3)'
                  }
                  stroke={
                    isDone
                      ? 'hsl(142 71% 45% / 0.5)'
                      : isUnlocked && canPlay
                        ? 'hsl(var(--primary) / 0.5)'
                        : 'hsl(var(--border) / 0.4)'
                  }
                  strokeWidth={isDone ? 2 : 1.5}
                  className={canPlay && !isDone ? 'hover:stroke-[hsl(var(--primary))]' : ''}
                />

                {/* Emoji circle */}
                <circle
                  cx={nx + 24}
                  cy={y}
                  r={14}
                  fill={
                    isDone
                      ? 'hsl(142 71% 45%)'
                      : isUnlocked
                        ? 'hsl(var(--primary) / 0.15)'
                        : 'hsl(var(--muted))'
                  }
                />
                {isDone ? (
                  <text x={nx + 24} y={y} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="12">✓</text>
                ) : !isUnlocked ? (
                  <text x={nx + 24} y={y} textAnchor="middle" dominantBaseline="central" fill="hsl(var(--muted-foreground))" fontSize="10">🔒</text>
                ) : (
                  <text x={nx + 24} y={y} textAnchor="middle" dominantBaseline="central" fontSize="14">{node.emoji}</text>
                )}

                {/* Title */}
                <text
                  x={nx + 44}
                  y={ny + 22}
                  fill={isUnlocked ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'}
                  fontSize="12"
                  fontWeight="600"
                  fontFamily="var(--font-display), system-ui"
                  className="select-none"
                >
                  {node.title.length > 16 ? node.title.slice(0, 15) + '…' : node.title}
                </text>

                {/* Subtitle / status */}
                <text
                  x={nx + 44}
                  y={ny + 38}
                  fill="hsl(var(--muted-foreground))"
                  fontSize="10"
                  className="select-none"
                >
                  {isDone ? 'Completed' :
                   !isUnlocked ? 'Locked' :
                   !node.implemented ? 'Coming Soon' :
                   node.timed ? '⏱ Timed' : 'Ready'}
                </text>

                {/* Timed badge */}
                {node.timed && isUnlocked && !isDone && (
                  <circle cx={nx + NODE_W - 14} cy={ny + 14} r={8} fill="hsl(var(--primary) / 0.15)" />
                )}

                {/* Play indicator */}
                {canPlay && !isDone && (
                  <polygon
                    points={`${nx + NODE_W - 20},${ny + NODE_H - 24} ${nx + NODE_W - 20},${ny + NODE_H - 12} ${nx + NODE_W - 10},${ny + NODE_H - 18}`}
                    fill="hsl(var(--primary))"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      {/* Back */}
      <Button variant="ghost" onClick={onBack} className="flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" />
        Back
      </Button>

      {/* Title */}
      <div className="text-center space-y-2">
        <div className="text-4xl mb-2">📖</div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
          Story Mode
        </h1>
        <p className="text-muted-foreground text-sm">
          Solve the mystery of the missing wedding ring!
        </p>
      </div>

      {/* Acts */}
      <div className="space-y-4">
        {storyActs.map(act => {
          const unlocked = isActUnlocked(act);
          const completed = isActComplete(act, completedNodes);
          const isExpanded = expandedAct === act.id;
          const completedCount = act.nodes.filter(n => completedNodes.includes(n.id)).length;

          return (
            <div
              key={act.id}
              className={`rounded-xl border-2 overflow-hidden transition-all duration-300 ${
                completed
                  ? 'border-green-500/40 bg-green-500/5'
                  : unlocked
                    ? 'border-primary/30 bg-card'
                    : 'border-border/40 bg-muted/30 opacity-60'
              }`}
            >
              {/* Header */}
              <button
                onClick={() => unlocked && setExpandedAct(isExpanded ? null : act.id)}
                disabled={!unlocked}
                className="w-full text-left p-4 flex items-center gap-4"
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-xl ${
                  completed ? 'bg-green-500 text-white'
                    : unlocked ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {completed ? <Check className="w-6 h-6" /> :
                   !unlocked ? <Lock className="w-5 h-5" /> :
                   act.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Act {act.actNumber}
                  </span>
                  <h2 className={`font-display font-bold text-lg ${unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {act.title}
                  </h2>
                  {unlocked && (
                    <div className="mt-1">
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden max-w-[200px]">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${(completedCount / act.nodes.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{completedCount}/{act.nodes.length}</span>
                    </div>
                  )}
                </div>
                {unlocked && (
                  <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                )}
              </button>

              {/* Graph */}
              {isExpanded && unlocked && (
                <div className="border-t border-border/30 pt-3 pb-4">
                  {renderGraph(act)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress */}
      <div className="text-center text-sm text-muted-foreground">
        📖 {completedNodes.length} / {storyActs.reduce((s, a) => s + a.nodes.length, 0)} levels
      </div>
    </div>
  );
};
