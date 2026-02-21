import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StoryProgress } from '@/types/quest';
import { StoryAct, StoryNode } from '@/types/storyActs';
import { storyActs, isNodeUnlocked, isActComplete, getStoryAct } from '@/data/storyActsData';
import { StoryMaze, getChapterMaze } from '@/data/storyMazes';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, Check, BookOpen, ChevronRight, Clock, Play, Edit } from 'lucide-react';

interface StoryLevelSelectProps {
  onSelect: (storyMaze: StoryMaze) => void;
  onBack: () => void;
  storyProgress: StoryProgress;
  debugMode?: boolean;
}

export const StoryLevelSelect = ({
  onSelect,
  onBack,
  storyProgress,
  debugMode = false,
}: StoryLevelSelectProps) => {
  const navigate = useNavigate();
  const [expandedAct, setExpandedAct] = useState<string | null>(() => {
    // Auto-expand the current act
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
    // Try to find the story maze and launch it
    const maze = getChapterMaze(
      node.id === 'find_clues' ? 'chapter_1' :
      node.id === 'cousin_riddle' ? 'chapter_2' : ''
    );
    if (maze) {
      onSelect(maze);
    }
  };

  // Group nodes by their "depth" (distance from start) for visual layout
  const getNodeDepth = (act: StoryAct, nodeId: string, visited = new Set<string>()): number => {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);
    const node = act.nodes.find(n => n.id === nodeId);
    if (!node) return 0;
    const reqs = node.requiresAll || node.requiresAny || [];
    if (reqs.length === 0) return 0;
    return 1 + Math.max(...reqs.map(r => getNodeDepth(act, r, visited)));
  };

  const renderNode = (node: StoryNode, isCompleted: boolean, isUnlocked: boolean) => {
    const canPlay = isUnlocked && node.implemented && !!node.mazeId;

    return (
      <button
        key={node.id}
        onClick={() => canPlay && handleNodeClick(node)}
        disabled={!canPlay && !debugMode}
        className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
          isCompleted
            ? 'bg-green-500/10 border-green-500/40'
            : isUnlocked
              ? node.implemented
                ? 'bg-card border-primary/30 hover:border-primary hover:scale-[1.01] cursor-pointer'
                : 'bg-card/60 border-border/50'
              : 'bg-muted/30 border-border/30 opacity-50'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${
            isCompleted
              ? 'bg-green-500 text-white'
              : isUnlocked
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
          }`}>
            {isCompleted ? <Check className="w-4 h-4" /> : 
             !isUnlocked ? <Lock className="w-3 h-3" /> : 
             node.emoji}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-display font-semibold text-sm ${
                isUnlocked ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                {node.title}
              </span>
              {node.timed && (
                <Clock className="w-3 h-3 text-orange-400" />
              )}
              {!node.implemented && isUnlocked && (
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  Coming Soon
                </span>
              )}
            </div>
            <p className={`text-xs mt-0.5 line-clamp-2 ${
              isUnlocked ? 'text-muted-foreground' : 'text-muted-foreground/50'
            }`}>
              {node.description}
            </p>
          </div>

          {/* Action */}
          <div className="flex-shrink-0 flex items-center gap-1">
            {debugMode && node.mazeId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/editor?mazeId=${node.mazeId}`);
                }}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              >
                <Edit className="w-3 h-3" />
              </Button>
            )}
            {canPlay && !isCompleted && (
              <Play className="w-4 h-4 text-primary" />
            )}
            {isCompleted && (
              <span className="text-green-500 text-xs font-semibold">✓</span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const renderActNodes = (act: StoryAct) => {
    // Build depth map
    const depthMap = new Map<string, number>();
    act.nodes.forEach(n => depthMap.set(n.id, getNodeDepth(act, n.id)));
    const maxDepth = Math.max(...Array.from(depthMap.values()));

    // Render nodes grouped by depth
    const layers: StoryNode[][] = [];
    for (let d = 0; d <= maxDepth; d++) {
      layers.push(act.nodes.filter(n => depthMap.get(n.id) === d));
    }

    return (
      <div className="space-y-2">
        {layers.map((layerNodes, depth) => {
          // Check if this layer is a branch point (multiple nodes)
          const isBranch = layerNodes.length > 1;
          const branchLabel = layerNodes[0]?.branchLabel;

          return (
            <div key={depth}>
              {/* Branch indicator */}
              {isBranch && branchLabel && (
                <div className="flex items-center gap-2 mb-2 px-2">
                  <div className="h-px flex-1 bg-border/50" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {branchLabel} — choose your path
                  </span>
                  <div className="h-px flex-1 bg-border/50" />
                </div>
              )}

              {/* Nodes in this layer */}
              <div className={isBranch ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'space-y-2'}>
                {layerNodes.map(node => {
                  const isCompleted = completedNodes.includes(node.id);
                  const isUnlocked = isNodeUnlocked(node, completedNodes);
                  return renderNode(node, isCompleted, isUnlocked);
                })}
              </div>

              {/* Connection line between layers */}
              {depth < maxDepth && (
                <div className="flex justify-center py-1">
                  <div className="w-px h-4 bg-border/40" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      {/* Back button */}
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
        <p className="text-muted-foreground">
          Solve the mystery of the missing wedding ring!
        </p>
      </div>

      {/* Act Cards */}
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
              {/* Act Header */}
              <button
                onClick={() => unlocked && setExpandedAct(isExpanded ? null : act.id)}
                disabled={!unlocked}
                className="w-full text-left p-4 flex items-center gap-4"
              >
                {/* Act icon */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-xl ${
                  completed
                    ? 'bg-green-500 text-white'
                    : unlocked
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {completed ? <Check className="w-6 h-6" /> :
                   !unlocked ? <Lock className="w-5 h-5" /> :
                   act.emoji}
                </div>

                {/* Act info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Act {act.actNumber}
                    </span>
                    {completed && (
                      <span className="text-[10px] bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded-full">
                        Complete
                      </span>
                    )}
                  </div>
                  <h2 className={`font-display font-bold text-lg ${
                    unlocked ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {act.title}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {act.subtitle}
                  </p>
                  {unlocked && (
                    <div className="mt-1.5">
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${(completedCount / act.nodes.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5">
                        {completedCount}/{act.nodes.length} levels
                      </span>
                    </div>
                  )}
                </div>

                {/* Expand arrow */}
                {unlocked && (
                  <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${
                    isExpanded ? 'rotate-90' : ''
                  }`} />
                )}
                {!unlocked && (
                  <p className="text-xs text-muted-foreground/60 italic">
                    Complete Act {act.actNumber - 1} to unlock
                  </p>
                )}
              </button>

              {/* Expanded node list */}
              {isExpanded && unlocked && (
                <div className="px-4 pb-4 border-t border-border/30 pt-3">
                  {renderActNodes(act)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress Summary */}
      <div className="text-center text-sm text-muted-foreground">
        <p>
          📖 {completedNodes.length} / {storyActs.reduce((sum, a) => sum + a.nodes.length, 0)} levels completed
        </p>
      </div>
    </div>
  );
};
